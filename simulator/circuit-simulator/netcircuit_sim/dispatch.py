"""Typed local dispatch; unavailable solvers never return invented captures."""
from jsonschema import ValidationError
from contracts.boundary.models import SimulationRequest, SimulationRequestV2, SimulationResult, SimulationErrorResult
from contracts.signal_domains import classify_graph, validate_domain_connections
from .engine import VirtualCompiler, SimulationError, run_plan
from .analog import SPICEAdapter, MixedSignalCoordinator


class SimulationDispatcher:
    def compile(self,graph):
        """Admit only models implemented by the existing digital/DC executor."""
        try:
            classification=classify_graph(graph)
            if classification['kind']=='ANALOG':raise SimulationError('ANALOG_UNAVAILABLE')
            if classification['kind']=='MIXED':raise SimulationError('MIXED_SIGNAL_UNAVAILABLE')
            if classification['kind']=='UNKNOWN' or classification['unsupported_components']:raise SimulationError('UNEXECUTABLE')
            validate_domain_connections(graph)
            return VirtualCompiler().compile(graph)
        except ValidationError as error:
            raise SimulationError(getattr(error,'issues',[{'code':'UNEXECUTABLE'}])[0]['code']) from None

    def simulate(self,request:SimulationRequest|SimulationRequestV2|dict)->SimulationResult|SimulationErrorResult:
        payload=request.model_dump(exclude_unset=True) if isinstance(request,(SimulationRequest,SimulationRequestV2)) else request
        boundary=SimulationRequestV2 if isinstance(payload,dict) and payload.get('schema_version')=='2.0' else SimulationRequest
        request=boundary.model_validate(payload)
        data=request.model_dump(exclude_unset=True)
        try:classification=classify_graph(data['graph'])
        except ValidationError as error:
            return SimulationErrorResult.model_validate({'schema_version':'1.0','status':'REJECTED',
                'classification':{'schema_version':'1.0','kind':'UNKNOWN','domains':[],'unsupported_components':[]},
                'code':getattr(error,'issues',[{'code':'UNEXECUTABLE'}])[0]['code'],'message':error.message})
        if classification['kind']=='ANALOG':return SPICEAdapter().simulate(request)
        if classification['kind']=='MIXED':return MixedSignalCoordinator().simulate(request)
        try:
            plan=self.compile(data['graph'])
            capture=run_plan(plan,data['capture_config'],data.get('test_vectors'),data.get('clock_config'),data.get('inputs'))
            return SimulationResult.model_validate({'schema_version':'1.0','status':'COMPLETE',
                'classification':classification,'capture':capture})
        except SimulationError as error:
            return SimulationErrorResult.model_validate({'schema_version':'1.0','status':'REJECTED',
                'classification':classification,'code':str(error),'message':str(error)})
