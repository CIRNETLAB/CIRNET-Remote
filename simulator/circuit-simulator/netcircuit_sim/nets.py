"""Resolve virtual design connectivity from declared nodes and explicit edges only."""
from collections import defaultdict
from contracts.breadboard_topology import get_breadboard_contact


def resolve_design_nets(graph, directions):
    modules = {m['id']: m for m in graph['modules']}
    parent = {}
    registered = {}

    def find(key):
        root = key
        while parent[root] != root:
            root = parent[root]
        while parent[key] != key:
            next_key = parent[key]
            parent[key] = root
            key = next_key
        return root

    def register(value):
        if value in registered:
            return registered[value]
        parts = value.split('.')
        if len(parts) != 2 or parts[0] not in modules:
            raise ValueError('Unknown endpoint')
        mid, token = parts
        if token.startswith('contact:'):
            contact = get_breadboard_contact(modules[mid]['type'], token[8:])
            if contact is None:
                raise ValueError('Unknown breadboard contact')
            key = (mid, 'node', contact['nodeId'])
        elif value in directions:
            key = (mid, 'port', token)
        else:
            raise ValueError('Unsupported terminal')
        parent.setdefault(key, key)
        registered[value] = key
        return key

    for signal in directions:
        register(signal)
    edges = set()
    for edge in graph['connections']:
        source, destination = edge['source'], edge['destination']
        identity = tuple(sorted((source, destination)))
        if source == destination or identity in edges:
            raise ValueError('Duplicate or self connection')
        edges.add(identity)
        a, b = register(source), register(destination)
        # Keep legacy logical edges directed; passive contact attachments are bidirectional.
        if '.contact:' not in source and '.contact:' not in destination:
            if directions.get(source) != 'output' or directions.get(destination) != 'input':
                raise ValueError('Invalid logical direction')
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    groups = defaultdict(list)
    for signal, key in registered.items():
        groups[find(key)].append(signal)
    nets = []
    for group in groups.values():
        drivers = sorted(s for s in group if directions.get(s) == 'output')
        inputs = tuple(sorted(s for s in group if directions.get(s) == 'input'))
        if len(drivers) > 1:
            raise ValueError('Multiple net drivers')
        if drivers and inputs:
            nets.append((drivers[0], inputs))
    return tuple(sorted(nets))
