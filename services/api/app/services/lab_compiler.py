"""Compile infrastructure endpoints only; never student internal logical nets."""
from contracts.validation import validate


def allocate_routes(bindings, resources):
    """Deterministic bipartite matching; each augmenting walk visits a resource once."""
    candidates = {binding['endpoint_id']: sorted(
        resource['resource_id'] for resource in resources
        if binding['role'] in resource['roles'] and binding['node_id'] in resource['node_ids'])
        for binding in bindings}
    assigned = {}

    def assign(endpoint_id, visited):
        for resource_id in candidates[endpoint_id]:
            if resource_id in visited:
                continue
            visited.add(resource_id)
            previous = assigned.get(resource_id)
            if previous is None or assign(previous, visited):
                assigned[resource_id] = endpoint_id
                return True
        return False

    for endpoint_id in sorted(candidates, key=lambda key: (len(candidates[key]), key)):
        if not assign(endpoint_id, set()):
            raise ValueError('UNEXECUTABLE')
    by_endpoint = {endpoint: resource for resource, endpoint in assigned.items()}
    return [{'endpoint_id': binding['endpoint_id'], 'resource_id': by_endpoint[binding['endpoint_id']]}
            for binding in bindings]


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
            if virtual: continue
            if endpoint["role"] in ("SCOPE","GENERATOR","LOGIC_ANALYZER"):
                limit=capabilities[{"SCOPE":"oscilloscope_channels","GENERATOR":"generator_channels","LOGIC_ANALYZER":"logic_analyzer_channels"}[endpoint["role"]]]
                channel=endpoint.get("channel",1)
                if not 1<=channel<=limit: raise ValueError("UNEXECUTABLE")
                instruments.append({"endpoint_id":endpoint["endpoint_id"],"instrument":endpoint["role"],"channel":channel})
        if not virtual:
            allocations=allocate_routes(bindings,capabilities['routing_resources'])
        config=experiment["_configuration"]
        if any(g.get("enabled") for g in config.get("generator_config",[])) and not capabilities.get("instruments",{}).get("generator",{}).get("available",False):
            raise ValueError("UNEXECUTABLE")
        profile=capabilities["hardware_profile_version"]
        return validate("InstrumentationExecutionPlan",{
            "schema_version":"1.0","station_id":experiment["station_id"],"experiment_id":experiment["experiment_id"],
            "power_policy":{"profile_id":profile,"guarded":True},"endpoint_bindings":bindings,
            "routing_allocations":allocations,"instrument_allocations":instruments,
            "clock_config":config.get("clock_config",{}),"generator_config":config.get("generator_config",[]),
            "capture_config":config.get("capture_config",{"signals":[],"duration_ns":1000000}),
            "test_vectors":config.get("test_vectors",[]),
            "runtime_safety_policy":{"profile_id":profile,"watchdog_required":True}})
