"""Resolve explicit jumpers, mount bonds and declared conductive internals.

Resistors, LEDs and other modeled elements retain separate terminal nodes.
Coordinates and mesh proximity never participate in this electrical resolver.
"""
from collections import defaultdict
from contracts.breadboard_topology import get_breadboard_contact
from contracts.physical_mounting import get_physical_part, validate_physical_design


LEGACY_PORTS = {
    'DIGITAL_SWITCH': ('OUT',), 'DIGITAL_INPUT': ('OUT',), 'INPUT': ('OUT',),
    'CLOCK': ('OUT',), 'LED': ('IN',), 'PROBE': ('IN',), 'OUTPUT': ('IN',),
    'AND': ('A', 'B', 'Y'), 'OR': ('A', 'B', 'Y'), 'XOR': ('A', 'B', 'Y'), 'NOT': ('A', 'Y'),
    '74HC08': tuple(f'{name}{i}' for i in range(1, 5) for name in ('A', 'B', 'Y')),
}


def resolve_connectivity(graph, directions=None):
    """Return stable endpoint groups, including passive package pins and contacts."""
    validate_physical_design(graph)
    modules = {m['id']: m for m in graph['modules']}
    parent, registered = {}, {}
    known = set(directions or ())
    for module in graph['modules']:
        part = get_physical_part(module['type'])
        pins = (p['id'] for p in part['package']['pins']) if part else LEGACY_PORTS.get(module['type'], ())
        known.update(f"{module['id']}.{pin}" for pin in pins)

    def find(key):
        root = key
        while parent[root] != root: root = parent[root]
        while parent[key] != key:
            next_key = parent[key]; parent[key] = root; key = next_key
        return root

    def register(value):
        if value in registered: return registered[value]
        parts = value.split('.')
        if len(parts) != 2 or parts[0] not in modules: raise ValueError('Unknown endpoint')
        mid, token = parts
        if token.startswith('contact:'):
            contact = get_breadboard_contact(modules[mid]['type'], token[8:])
            if contact is None: raise ValueError('Unknown breadboard contact')
            key = (mid, 'node', contact['nodeId'])
        elif value in known:
            key = (mid, 'pin', token)
        else:
            raise ValueError('Unsupported terminal')
        parent.setdefault(key, key); registered[value] = key
        return key

    def bond(a, b):
        ra, rb = find(register(a)), find(register(b))
        if ra != rb: parent[max(ra, rb)] = min(ra, rb)

    for signal in sorted(known): register(signal)
    for module in graph['modules']:
        mount = module.get('mount')
        if mount:
            for binding in mount['contacts']:
                bond(f"{module['id']}.{binding['pinId']}", f"{mount['boardId']}.contact:{binding['contactId']}")
        part = get_physical_part(module['type'])
        for internal in part.get('internalConnections', ()) if part else ():
            when = internal.get('when')
            props = {**part.get('editor', {}).get('defaults', {}), **module.get('properties', {})}
            if when:
                actual, expected = props.get(when['property']), when['equals']
                # JavaScript's strict equality distinguishes boolean contacts from 0/1.
                same_type = not (isinstance(actual, bool) or isinstance(expected, bool)) or type(actual) is type(expected)
                if not same_type or actual != expected: continue
            pins = internal['pins']
            for pin in pins[1:]: bond(f"{module['id']}.{pins[0]}", f"{module['id']}.{pin}")
    edges = set()
    for edge in graph['connections']:
        source, destination = edge['source'], edge['destination']
        identity = tuple(sorted((source, destination)))
        if source == destination or identity in edges: raise ValueError('Duplicate or self connection')
        edges.add(identity)
        # Preserve directed legacy logical UX while physical terminals are bidirectional.
        physical = any(get_physical_part(modules[s.split('.')[0]]['type']) for s in (source, destination) if s.split('.')[0] in modules)
        if directions is not None and not physical and '.contact:' not in source and '.contact:' not in destination:
            if directions.get(source) != 'output' or directions.get(destination) != 'input': raise ValueError('Invalid logical direction')
        bond(source, destination)
    groups = defaultdict(list)
    for signal, key in registered.items(): groups[find(key)].append(signal)
    return tuple(sorted(tuple(sorted(group)) for group in groups.values()))


def resolve_design_nets(graph, directions):
    nets = []
    modules = {m['id']: m for m in graph['modules']}
    for group in resolve_connectivity(graph, directions):
        drivers = sorted(s for s in group if directions.get(s) == 'output')
        inputs = tuple(sorted(s for s in group if directions.get(s) == 'input'))
        if len(drivers) > 1:
            # An explicit bond between floating source negatives establishes a
            # common reference. It must not be mistaken for digital contention.
            shared_negative = all(signal.endswith('.MINUS') and (part := get_physical_part(modules[signal.split('.')[0]]['type'])) and part['simulation']['model'] == 'dc-source' for signal in drivers)
            if not shared_negative: raise ValueError('Multiple net drivers')
        if drivers and inputs: nets.append((drivers[0], inputs))
    return tuple(sorted(nets))
