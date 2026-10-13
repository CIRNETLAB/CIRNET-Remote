"""Compile infrastructure endpoints only; never student internal logical nets."""
from contracts.validation import validate
from contracts.instrument_validation import ROLE_INSTRUMENT,validate_plan_instruments
from app.services.infrastructure_routing import allocate_routes


class LabExecutionCompiler:
    def compile(self,experiment,assignment,capabilities,resolution=None):
        virtual=capabilities["mode"]=="simulation"
        endpoints=(assignment or {}).get("lab_endpoints",[])
        bindings=[]; allocations=[]; instruments=[]
        resolved={b['endpoint_id']:b['observed_node_id'] for b in (resolution or {}).get('endpoint_bindings',[])}
        if not virtual and not endpoints: raise ValueError("UNEXECUTABLE")
        for endpoint in endpoints:
            if virtual and endpoint['role'] in ('VCC','GND'): continue
            node=endpoint.get('design_port',endpoint.get('fixed_node_id',endpoint.get("node_id"))) if virtual else resolved.get(endpoint['endpoint_id'])
            if not node:
                if not virtual and endpoint.get("required",True): raise ValueError("UNEXECUTABLE")
                continue
            binding={'endpoint_id':endpoint['endpoint_id'],'node_id':node,'role':endpoint['role']}
            bindings.append(binding)
            if endpoint["role"] in ("SCOPE","GENERATOR","LOGIC_ANALYZER"):
                limit=capabilities['instrument_capabilities'][ROLE_INSTRUMENT[endpoint['role']]]['channels']
                channel=endpoint.get("channel",1)
                if not 1<=channel<=limit: raise ValueError("UNEXECUTABLE")
                instruments.append({"endpoint_id":endpoint["endpoint_id"],"instrument":endpoint["role"],"channel":channel})
        if not virtual:
            allocations=allocate_routes(bindings,capabilities['routing_resources'])
        config=experiment["_configuration"]
        profile=capabilities["hardware_profile_version"]
        plan=validate("InstrumentationExecutionPlan",{
            "schema_version":"1.0","station_id":experiment["station_id"],"experiment_id":experiment["experiment_id"],
            "power_policy":{"profile_id":profile,"guarded":True},"endpoint_bindings":bindings,
            "routing_allocations":allocations,"instrument_allocations":instruments,
            "clock_config":config.get("clock_config",{}),"generator_config":config.get("generator_config",[]),
            "capture_config":config.get("capture_config",{"signals":[],"duration_ns":1000000}),
            "test_vectors":config.get("test_vectors",[]),
            "runtime_safety_policy":{"profile_id":profile,"watchdog_required":True}})
        return validate_plan_instruments(plan,capabilities)
