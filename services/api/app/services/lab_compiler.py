"""Compile infrastructure endpoints only; never student internal logical nets."""
from contracts.validation import validate

class LabExecutionCompiler:
    def compile(self,experiment,assignment,capabilities):
        virtual=capabilities["mode"]=="simulation"
        endpoints=(assignment or {}).get("lab_endpoints",[])
        bindings=[]; allocations=[]; instruments=[]; used=set()
        if not virtual and not endpoints: raise ValueError("UNEXECUTABLE")
        for endpoint in endpoints:
            node=endpoint.get("node_id")
            if not node:
                if not virtual and endpoint.get("required",True): raise ValueError("UNEXECUTABLE")
                continue
            binding={key:endpoint[key] for key in ("endpoint_id","node_id","role")}
            bindings.append(binding)
            if virtual: continue
            resource=next((r for r in capabilities["routing_resources"] if r["resource_id"] not in used and
                           endpoint["role"] in r["roles"] and node in r["node_ids"]),None)
            if resource is None: raise ValueError("UNEXECUTABLE")
            used.add(resource["resource_id"])
            allocations.append({"endpoint_id":endpoint["endpoint_id"],"resource_id":resource["resource_id"]})
            if endpoint["role"] in ("SCOPE","GENERATOR","LOGIC_ANALYZER"):
                limit=capabilities[{"SCOPE":"oscilloscope_channels","GENERATOR":"generator_channels","LOGIC_ANALYZER":"logic_analyzer_channels"}[endpoint["role"]]]
                channel=endpoint.get("channel",1)
                if not 1<=channel<=limit: raise ValueError("UNEXECUTABLE")
                instruments.append({"endpoint_id":endpoint["endpoint_id"],"instrument":endpoint["role"],"channel":channel})
        config=experiment["_configuration"]
        if any(g.get("enabled") for g in config.get("generator_config",[])) and not capabilities.get("instruments",{}).get("generator",{}).get("available",False):
            raise ValueError("UNEXECUTABLE")
        profile=capabilities["hardware_profile_version"]
        return validate("InstrumentationExecutionPlan",{
            "schema_version":"1.0","station_id":experiment["station_id"],"experiment_id":experiment["experiment_id"],
            "power_policy":{"profile_id":profile,"guarded":True},"endpoint_bindings":bindings,
            "routing_allocations":allocations,"instrument_allocations":instruments,
            "clock_config":config.get("clock_config",{}),"generator_config":config.get("generator_config",[]),
            "capture_config":config.get("capture_config",{"signals":[],"duration_ns":1000}),
            "test_vectors":config.get("test_vectors",[]),
            "runtime_safety_policy":{"profile_id":profile,"watchdog_required":True}})
