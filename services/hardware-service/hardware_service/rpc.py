"""RPC boundary: validated domain payloads and stable errors, no raw physical Run."""
import json
from threading import RLock
from google.protobuf.json_format import MessageToDict, ParseDict
from jsonschema import ValidationError
from hardware_service.station.base import HardwareError


def wire(message):
    return MessageToDict(message, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)


class LifecycleRpc:
    def __init__(self, stations, pb):
        self.stations, self.pb = stations, pb
        self.sessions={}
        self.lock=RLock()

    def _station(self, target):
        station = self.stations.get(target.station_id)
        if station is None:
            raise HardwareError('HARDWARE_UNAVAILABLE')
        if station.get_capabilities().mode=='simulation' and target.experiment_id:
            from hardware_service.station.virtual import VirtualHardwareStation
            key=(target.station_id,target.experiment_id)
            with self.lock:
                if key not in self.sessions:
                    if len(self.sessions)>=64: raise HardwareError('RESOURCE_CONFLICT')
                    self.sessions[key]=VirtualHardwareStation(target.station_id)
                station=self.sessions[key]
        if station._experiment_id is not None and target.experiment_id != station._experiment_id:
            raise HardwareError('RESOURCE_CONFLICT')
        return station

    def GetCapabilities(self, request, context):
        import grpc
        station = self.stations.get(request.station_id)
        if station is None:
            context.abort(grpc.StatusCode.NOT_FOUND, 'HARDWARE_UNAVAILABLE')
        return ParseDict(station.get_capabilities().to_dict(), self.pb.StationCapabilities())

    def _execute(self, request, action):
        target = request.target if hasattr(request, 'target') else request
        try:
            station = self._station(target)
            if getattr(action,'_unlocked',False) and station.get_capabilities().mode=='simulation':
                result=action(station,target)
            else:
              with station._lock:
                # Recheck ownership inside the same lock as the operation.
                self._station(target)
                result = action(station, target)
            code = result.get('code', 'OK')
            if station.get_capabilities().mode=='simulation' and station.state=='SAFE_STATE' and action.__name__=='stop_execution':
                with self.lock: self.sessions.pop((target.station_id,target.experiment_id),None)
            if code not in self.pb.ErrorCode.keys():
                code = 'DRIVER_ERROR'
            return self.pb.OperationReply(accepted=result.get('accepted', True),
                code=self.pb.ErrorCode.Value(code), state=station.state,
                result_json=json.dumps(result, allow_nan=False).encode())
        except (HardwareError, ValidationError, ValueError, TypeError) as error:
            code = error.code if isinstance(error, HardwareError) else 'INVALID_CONFIGURATION'
            if code not in self.pb.ErrorCode.keys(): code='DRIVER_ERROR'
            return self.pb.OperationReply(accepted=False, code=self.pb.ErrorCode.Value(code),
                result_json=json.dumps({'accepted':False,'code':code}).encode())
        except Exception:
            return self.pb.OperationReply(accepted=False,code=self.pb.DRIVER_ERROR,
                result_json=b'{"accepted":false,"code":"DRIVER_ERROR"}')

    def EnterSafeState(self, request, context):
        def action(station, target):
            if not target.experiment_id: raise HardwareError('INVALID_CONFIGURATION')
            result=station.enter_safe_state()
            if result.get('accepted'):
                station._experiment_id=target.experiment_id
            return result
        return self._execute(request, action)

    def PrepareExecution(self, request, context):
        def action(station,target):
            plan=wire(request.plan)
            plan.setdefault('clock_config', {})
            if not any((request.plan.clock_config.signal,request.plan.clock_config.period_ns,request.plan.clock_config.cycles)):
                plan['clock_config']={}
            if plan['station_id'] != target.station_id or plan['experiment_id'] != target.experiment_id:
                raise HardwareError('RESOURCE_CONFLICT')
            return station.prepare_execution(plan,wire(request.decision))
        return self._execute(request,action)

    def ConfigureVirtualCircuit(self,request,context):
        def action(station,target):
            if station.get_capabilities().mode != 'simulation':
                raise HardwareError('UNEXECUTABLE')
            return station.apply_circuit(json.loads(request.design_graph_json))
        return self._execute(request,action)

    def ConfigureInstrument(self,request,context):
        def action(station,target):
            methods={'clock':('configure_clock',request.clock),
                     'generator':('configure_generator',request.generator),
                     'trigger':('configure_trigger',request.trigger)}
            if request.instrument not in methods: raise HardwareError('UNEXECUTABLE')
            method,config=methods[request.instrument]
            return getattr(station,method)(wire(config))
        return self._execute(request,action)

    def ArmCapture(self,request,context):
        return self._execute(request,lambda s,t:s.arm_capture(wire(request.configuration)))


def _operation(method):
    def call(self,request,context):
        def action(s,t):
            if method=='start_execution' and s.get_capabilities().mode=='simulation':
                return s.start_execution(experiment_id=t.experiment_id)
            return getattr(s,method)()
        action.__name__=method
        if method=='start_execution': action._unlocked=True
        return self._execute(request,action)
    return call


for rpc_name, method in {'ScanTopology':'scan_topology','ReadRuntimeSafety':'read_runtime_safety',
    'ApplyRouting':'apply_routing','GuardedPowerUp':'guarded_power_up','StartExecution':'start_execution',
    'StopExecution':'stop_execution','ReadCapture':'read_capture','Reset':'reset'}.items():
    setattr(LifecycleRpc,rpc_name,_operation(method))
