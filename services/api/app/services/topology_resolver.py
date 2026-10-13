"""Bounded, deterministic component/pin incidence resolution; no wire repair."""
from collections import defaultdict
from contracts.validation import validate

# Only labels with implemented digital models are automatically supported.
# An instructor profile can explicitly describe another known layout.
SUPPORTED = {'74HC08', '74HC04', '74HC32', '74HC86', 'AND', 'NOT', 'OR', 'XOR',
             'SWITCH', 'INPUT', 'LED', 'PROBE', 'CLOCK'}
MAX_COMPONENTS = 32
MAX_MAPPINGS = 64
MAX_SEARCH_STEPS = 4096


class ElectricalNets:
    def __init__(self, graph):
        self.parent = {n['node_id']: n['node_id'] for n in graph['nodes']}
        for connection in graph['connections']:
            nodes = connection['node_ids']
            for node in nodes[1:]:
                a, b = self.find(nodes[0]), self.find(node)
                self.parent[max(a, b)] = min(a, b)
        self.nodes = defaultdict(set)
        self.pins = defaultdict(set)
        self.pin_nodes = {}
        for node in self.parent:
            self.nodes[self.find(node)].add(node)
        for component in graph['components']:
            for pin in component.get('pins', []):
                key = (component['component_id'], pin['pin_id'])
                self.pins[self.find(pin['node_id'])].add(key)
                self.pin_nodes[key] = pin['node_id']

    def find(self, node):
        while self.parent[node] != node:
            self.parent[node] = self.parent[self.parent[node]]
            node = self.parent[node]
        return node

    def signatures(self, rename=None):
        rename = rename or {}
        return {frozenset((rename.get(c, c), p) for c, p in pins)
                for pins in self.pins.values() if pins}


def known(component):
    return component['identity'] != 'UNKNOWN' and component['kind'] != 'OPAQUE_PHYSICAL_COMPONENT'


class TopologyResolver:
    def resolve(self, assignment, observed, capabilities=None):
        assignment = assignment or {}
        observed = validate('DetectedTopologyGraph', observed)
        reference = assignment.get('reference_topology_graph')
        reference = validate('DetectedTopologyGraph', reference) if reference else None
        result = {'schema_version': '1.0', 'status': 'UNRESOLVED', 'component_matches': [],
                  'endpoint_bindings': [], 'issues': []}
        observed_nets = ElectricalNets(observed)
        reference_nets = ElectricalNets(reference) if reference else None
        profiles = {p['component_type']: {pin['pin_id']: pin['role'] for pin in p['pins']}
                    for p in assignment.get('instructor_pin_profiles', [])}
        mode = assignment.get('component_resolution_mode', 'HYBRID')
        mode_supported = not capabilities or mode in capabilities.get('component_resolution_modes', [])
        mappings, limited = [], False
        if reference and mode_supported:
            references = sorted(reference['components'], key=lambda c: c['component_id'])
            candidates = {}
            for ref in references:
                profile = profiles.get(ref['identity'])
                pins = {p['pin_id'] for p in ref.get('pins', [])}
                supported = known(ref) and pins and (ref['identity'].upper() in SUPPORTED or profile)
                if mode == 'INSTRUCTOR_PROFILE' and not profile: supported = False
                options = []
                if supported:
                    for actual in sorted(observed['components'], key=lambda c: c['component_id']):
                        actual_pins = {p['pin_id'] for p in actual.get('pins', [])}
                        if not known(actual) or actual['identity'] != ref['identity'] or actual_pins != pins: continue
                        if ref.get('package') and actual.get('package') and ref['package'] != actual['package']: continue
                        if profile:
                            if not pins <= profile.keys(): continue
                            if any(p.get('inferred_role') and profile[p['pin_id']] != p['inferred_role'] for p in actual.get('pins', [])): continue
                        options.append(actual['component_id'])
                if options: candidates[ref['component_id']] = options
                else: result['issues'].append('No supported pin evidence match for ' + ref['component_id'])
            keys = sorted(candidates, key=lambda k: (len(candidates[k]), k))
            steps = 0
            pin_ids = {c['component_id']: [p['pin_id'] for p in c.get('pins', [])] for c in references}

            def incidence_compatible(mapping):
                # Equal topology must preserve both joins and separations among
                # already mapped pins. Net sizes also reject impossible local
                # anchors before identical-part permutations are materialized.
                net_pairs, reverse_pairs = {}, {}
                for ref_id, actual_id in mapping.items():
                    for pin in pin_ids[ref_id]:
                        ref_root = reference_nets.find(reference_nets.pin_nodes[(ref_id, pin)])
                        actual_root = observed_nets.find(observed_nets.pin_nodes[(actual_id, pin)])
                        if len(reference_nets.pins[ref_root]) != len(observed_nets.pins[actual_root]):
                            return False
                        if ref_root in net_pairs and net_pairs[ref_root] != actual_root:
                            return False
                        if actual_root in reverse_pairs and reverse_pairs[actual_root] != ref_root:
                            return False
                        net_pairs[ref_root] = actual_root
                        reverse_pairs[actual_root] = ref_root
                return True

            def search(index, mapping, used, equivalent=False):
                nonlocal steps, limited
                steps += 1
                if steps > MAX_SEARCH_STEPS:
                    limited = True; return
                if index == len(keys):
                    if len(mappings) >= MAX_MAPPINGS:
                        limited = True
                    else:
                        mappings.append(dict(mapping))
                    return
                key = keys[index]
                for actual in candidates[key]:
                    if actual in used: continue
                    mapping[key] = actual
                    if not equivalent or incidence_compatible(mapping):
                        search(index + 1, mapping, used | {actual}, equivalent)
                    del mapping[key]
                    if limited: return
            if len(references) > MAX_COMPONENTS or len(observed['components']) > MAX_COMPONENTS:
                limited = True
            elif keys:
                complete_evidence = len(keys) == len(references) == len(observed['components'])
                if complete_evidence:
                    search(0, {}, set(), equivalent=True)
                if not mappings and not limited:
                    # A unique identity/pin anchor still resolves endpoints in
                    # a wrongly wired circuit. Correctness never gates Run.
                    search(0, {}, set())
            if limited:
                mappings = []; result['issues'].append('Resolution search budget exceeded; mapping remains ambiguous')
        elif reference:
            result['issues'].append('Requested component resolution mode is unsupported')
        ambiguous = limited or len(mappings) > 1
        # Keep only matches common to every candidate; never pick an arbitrary one.
        common = dict(mappings[0]) if mappings else {}
        for mapping in mappings[1:]:
            common = {key: value for key, value in common.items() if mapping.get(key) == value}
        identities = {c['component_id']: c['identity'] for c in (reference or {}).get('components', [])}
        result['component_matches'] = [{'reference_component_id': key, 'observed_component_id': value,
                                        'identity': identities[key]} for key, value in sorted(common.items())]
        for endpoint in assignment.get('lab_endpoints', []):
            node = endpoint.get('fixed_node_id', endpoint.get('node_id'))
            source = 'FIXED_NODE'
            if node is not None and node not in observed_nets.parent: node = None
            if 'reference_node_id' in endpoint and reference_nets:
                source = 'REFERENCE_TOPOLOGY'
                ref_node = endpoint['reference_node_id']
                if ref_node in reference_nets.parent:
                    ref_pins = reference_nets.pins[reference_nets.find(ref_node)]
                    actual_nodes = {observed_nets.pin_nodes[(common[c], p)] for c, p in ref_pins
                                    if c in common and (common[c], p) in observed_nets.pin_nodes}
                    # Split/wrong nets do not get silently merged by infrastructure.
                    # A reference terminal itself identifies its component pin anchor.
                    direct = {(c, p) for c, p in ref_pins if reference_nets.pin_nodes[(c, p)] == ref_node}
                    if direct:
                        actual_nodes = {observed_nets.pin_nodes[(common[c], p)] for c, p in direct
                                        if c in common and (common[c], p) in observed_nets.pin_nodes}
                    if actual_nodes and len({observed_nets.find(n) for n in actual_nodes}) == 1:
                        routable = {n for resource in (capabilities or {}).get('routing_resources', [])
                                    if endpoint['role'] in resource['roles'] for n in resource['node_ids']}
                        # A station terminal elsewhere on the same observed net
                        # reaches the pin without changing any student wiring.
                        net_nodes = observed_nets.nodes[observed_nets.find(min(actual_nodes))]
                        node = min(net_nodes & routable or actual_nodes)
            if node is not None:
                result['endpoint_bindings'].append({'endpoint_id': endpoint['endpoint_id'],
                                                    'observed_node_id': node, 'source': source})
            else: result['issues'].append('Endpoint unresolved: ' + endpoint['endpoint_id'])
        required = {e['endpoint_id'] for e in assignment.get('lab_endpoints', []) if e.get('required', True)}
        bound = {e['endpoint_id'] for e in result['endpoint_bindings']}
        if ambiguous:
            result['status'] = 'AMBIGUOUS'; result['issues'].append('Multiple equally supported component mappings')
        elif required <= bound and bound:
            result['status'] = 'RESOLVED'
        elif bound or common: result['status'] = 'PARTIAL'
        return validate('TopologyResolutionResult', result)
