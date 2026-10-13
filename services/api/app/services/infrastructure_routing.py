"""Pure resource matching over already proven observed electrical node aliases."""


def allocate_routes(bindings, resources, node_options=None):
    node_options = node_options or {}
    candidates = {binding['endpoint_id']: sorted(
        resource['resource_id'] for resource in resources
        if binding['role'] in resource['roles'] and
        set(resource['node_ids']) & node_options.get(binding['endpoint_id'], {binding['node_id']}))
        for binding in bindings}
    assigned = {}

    def assign(endpoint_id, visited):
        for resource_id in candidates[endpoint_id]:
            if resource_id in visited: continue
            visited.add(resource_id)
            previous = assigned.get(resource_id)
            if previous is None or assign(previous, visited):
                assigned[resource_id] = endpoint_id
                return True
        return False

    for endpoint_id in sorted(candidates, key=lambda key: (len(candidates[key]), key)):
        if not assign(endpoint_id, set()): raise ValueError('UNEXECUTABLE')
    by_endpoint = {endpoint: resource for resource, endpoint in assigned.items()}
    return [{'endpoint_id': binding['endpoint_id'], 'resource_id': by_endpoint[binding['endpoint_id']]}
            for binding in bindings]
