from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from contracts.boundary.models import SimulationRequest, SimulationResult, SimulationErrorResult

from contracts.execution_profiles import get_execution_part as get_physical_part
from .nets import resolve_connectivity

class AnalogSimulationEngine(ABC):
    available=False
    @abstractmethod
    def simulate(self,request:'SimulationRequest')->'SimulationResult|SimulationErrorResult': ...


def _unavailable(request,code):
    from contracts.boundary.models import SimulationRequest, SimulationErrorResult
    from contracts.signal_domains import classify_graph
    # Historical direct adapter calls raised RuntimeError. Typed callers pass a
    # validated request and receive the canonical error without any samples.
    if not isinstance(request,SimulationRequest):raise RuntimeError(code)
    graph=request.model_dump(exclude_unset=True)['graph']
    return SimulationErrorResult.model_validate({'schema_version':'1.0','status':'UNAVAILABLE',
        'classification':classify_graph(graph),'code':code,'message':code})

class SPICEAdapter(AnalogSimulationEngine):
    """Boundary only; no installed SPICE engine or analog solver."""
    def simulate(self,request:'SimulationRequest')->'SimulationErrorResult':return _unavailable(request,'ANALOG_UNAVAILABLE')

class MixedSignalCoordinator:
    available=False
    def simulate(self,request:'SimulationRequest')->'SimulationErrorResult':return _unavailable(request,'MIXED_SIGNAL_UNAVAILABLE')


@dataclass(frozen=True)
class PhysicalCircuit:
    modules: tuple
    endpoint_nodes: dict
    potentials: dict
    device_states: dict
    gate_references: dict


def _number(value, label, *, positive=False):
    try: finite = type(value) in (int, float) and math.isfinite(value)
    except OverflowError: finite = False
    if not finite or (positive and value <= 0):
        raise ValueError(f'Invalid {label}')
    return value


def compile_physical_circuit(graph):
    """DC references remain local to each explicitly connected source pair.

    This is an ideal, bounded educational subset, not SPICE or an output-current
    model. A powered HC08 output may supply one series resistor/LED branch.
    """
    modules = tuple(m for m in graph['modules'] if get_physical_part(m['type']))
    if not modules: return None
    groups = resolve_connectivity(graph)
    nodes = {endpoint: group[0] for group in groups for endpoint in group}
    potentials, states, references = defaultdict(list), {}, {}
    for module in modules:
        mid = module['id']; part = get_physical_part(module['type']); model = part['simulation']; props = module.get('properties', {})
        if model['model'] == 'resistor-dc':
            _number(props.get('resistanceOhms', model.get('defaultOhms', 330)), 'resistanceOhms', positive=True)
        if model['model'] != 'dc-source': continue
        voltage = _number(props.get('voltage', model.get('defaultVoltage', 5)), 'voltage')
        enabled = props.get('power_on', True)
        if type(enabled) is not bool: raise ValueError('Invalid power_on')
        plus = nodes[f'{mid}.PLUS']; minus = nodes[f'{mid}.MINUS']
        state = 'POWERED' if enabled else 'UNPOWERED'
        if enabled and plus == minus: state = 'FAULT'
        states[mid] = {'state': state, 'model': 'ideal-dc-source', 'voltage': voltage,
                       'reason': 'Source terminals are shorted.' if state == 'FAULT' else 'Explicit floating DC source pair.'}
        if enabled and plus != minus:
            potentials[plus].append((mid, voltage)); potentials[minus].append((mid, 0))
    for module in modules:
        mid = module['id']; part = get_physical_part(module['type']); model = part['simulation']
        if model['model'] != 'hc08-powered': continue
        requirement = model['power']; plus = nodes[f"{mid}.{requirement['positivePinId']}"]; minus = nodes[f"{mid}.{requirement['negativePinId']}"]
        matches = [(ref, high-low, low) for ref, high in potentials.get(plus, ()) for ref2, low in potentials.get(minus, ()) if ref == ref2]
        if plus == minus:
            state, reason = 'FAULT', 'VCC and GND are shorted.'
        elif not matches:
            state, reason = 'UNPOWERED', 'VCC and GND require both terminals of one connected DC source.'
        elif len(matches) != 1:
            state, reason = 'FAULT', 'Multiple DC source constraints are outside this model.'
        else:
            ref, voltage, low = matches[0]
            if voltage == 0:
                state, reason = 'UNPOWERED', 'No supply differential.'
            elif not requirement['minVoltage'] <= voltage <= requirement['maxVoltage']:
                state, reason = 'FAULT', 'Reversed supply or voltage outside the declared HC08 envelope.'
            else:
                state, reason = 'POWERED', 'Ideal digital HC08 with explicit VCC/GND; no output-current or timing accuracy claim.'
                references[mid] = (ref, low, voltage)
        states[mid] = {'state': state, 'model': model['model'], 'reason': reason}
    return PhysicalCircuit(modules, nodes, dict(potentials), states, references)


def physical_input_levels(circuit, source, destination):
    """Map physical drivers to a package's explicitly referenced ideal rails.

    Intermediate analog input levels are deliberately UNKNOWN; this subset does
    not assert transistor thresholds or silently create a common reference.
    """
    if circuit is None: return None
    modules = {module['id']: module for module in circuit.modules}
    source_id, destination_id = source.split('.')[0], destination.split('.')[0]
    src, dst = modules.get(source_id), modules.get(destination_id)
    if src is None or dst is None: return None  # Legacy ideal logic tools preserve their semantics.
    src_model, dst_model = get_physical_part(src['type'])['simulation'], get_physical_part(dst['type'])['simulation']
    if dst_model['model'] != 'hc08-powered': return None
    if destination_id not in circuit.gate_references: return ('X', 'X')
    ground = circuit.endpoint_nodes[f"{destination_id}.{dst_model['power']['negativePinId']}"]
    vcc = circuit.gate_references[destination_id][2]

    def differential(a, b):
        if a == b: return 0
        matches = {high-low for ref, high in circuit.potentials.get(a, ()) for ref2, low in circuit.potentials.get(b, ()) if ref == ref2}
        return next(iter(matches)) if len(matches) == 1 else None

    def level(voltage):
        if voltage is None: return 'X'
        if abs(voltage) < 1e-9: return 0
        if abs(voltage-vcc) < 1e-9: return 1
        return 'X'

    if src_model['model'] == 'dc-source':
        fixed = level(differential(circuit.endpoint_nodes[source], ground))
        return (fixed, fixed)
    if src_model['model'] == 'hc08-powered':
        if source_id not in circuit.gate_references: return ('X', 'X')
        src_ground = circuit.endpoint_nodes[f"{source_id}.{src_model['power']['negativePinId']}"]
        low = differential(src_ground, ground)
        high = None if low is None else low + circuit.gate_references[source_id][2]
        return (level(low), level(high))
    return None


def evaluate_physical_circuit(circuit, values):
    """Evaluate only series DC source/R/LED circuits; report other analog honestly."""
    if circuit is None: return {}, []
    states = {mid: dict(state) for mid, state in circuit.device_states.items()}
    potentials = {node: list(items) for node, items in circuit.potentials.items()}
    resistor_edges, blockers = defaultdict(list), defaultdict(set)
    unknown_nodes = set()
    for module in circuit.modules:
        mid = module['id']; part = get_physical_part(module['type']); model = part['simulation']; props = module.get('properties', {})
        if model['model'] == 'hc08-powered':
            if mid not in circuit.gate_references: continue
            ref, low, voltage = circuit.gate_references[mid]
            for gate in model['gates']:
                signal = f"{mid}.{gate['output']}"; node = circuit.endpoint_nodes[signal]; level = values.get(signal, 'X')
                if level in (0, 1): potentials.setdefault(node, []).append((ref, low + level*voltage))
                else: unknown_nodes.add(node)
        elif model['model'] == 'resistor-dc':
            pins = part['package']['pins']; a, b = (circuit.endpoint_nodes[f"{mid}.{pin['id']}"] for pin in pins)
            resistance = props.get('resistanceOhms', model.get('defaultOhms', 330))
            resistor_edges[a].append((b, resistance, mid)); resistor_edges[b].append((a, resistance, mid))
            states[mid] = {'state': 'PASSIVE', 'model': 'bounded-dc-series', 'resistanceOhms': resistance}
        elif model['status'] == 'unsupported':
            states[mid] = {'state': 'UNSUPPORTED', 'model': model['model'], 'reason': model.get('reason', 'Placement and wiring only; simulation unavailable.')}
            for pin in part['package']['pins']: blockers[circuit.endpoint_nodes[f"{mid}.{pin['id']}"]].add(mid)
        elif model['model'] not in ('dc-source', 'led-dc'):
            states[mid] = {'state': 'PASSIVE', 'model': model['model'], 'reason': 'Only declared conductive contact pairs are modeled.'}

    def trace(start, previous=None):
        node, resistance, visited, traversed = start, 0, set(), set()
        while True:
            if node in visited: return ('unsupported', None, resistance, traversed)
            visited.add(node); traversed.add(node)
            if blockers.get(node): return ('unsupported', None, resistance, traversed)
            options = [edge for edge in resistor_edges[node] if edge[2] != previous]
            sources = potentials.get(node, ())
            if sources:
                unique = set(sources)
                if len(unique) != 1 or options: return ('unsupported', None, resistance, traversed)
                return ('known', next(iter(unique)), resistance, traversed)
            if node in unknown_nodes: return ('unknown', None, resistance, traversed)
            if not options: return ('open', None, resistance, traversed)
            if len(options) != 1 or len(visited) > 8: return ('unsupported', None, resistance, traversed)
            node, ohms, previous = options[0]; resistance += ohms

    leds = [m for m in circuit.modules if get_physical_part(m['type'])['simulation']['model'] == 'led-dc']
    for module in leds:
        mid = module['id']; model = get_physical_part(module['type'])['simulation']
        a_node = circuit.endpoint_nodes[f'{mid}.A']; k_node = circuit.endpoint_nodes[f'{mid}.K']
        a = trace(a_node); k = trace(k_node); resistance = a[2] + k[2]
        other_led_nodes = {circuit.endpoint_nodes[f"{other['id']}.{pin}"] for other in leds if other['id'] != mid for pin in ('A', 'K')}
        result = {'state': 'OFF', 'model': 'bounded-dc-series', 'reason': 'Open circuit or no forward bias.'}
        if 'unsupported' in (a[0], k[0]) or (a[3] | k[3]) & other_led_nodes:
            result.update(state='UNSUPPORTED', reason='Only one LED with a series resistor and one ideal DC reference is supported; branching/other analog needs a solver.')
        elif 'unknown' in (a[0], k[0]):
            result.update(state='UNKNOWN', reason='The powered digital output driving this DC branch is unknown.')
        elif a[0] == k[0] == 'known':
            if a[1][0] != k[1][0]:
                result.update(state='UNSUPPORTED', reason='Independent floating DC references cannot be compared.')
            else:
                voltage = a[1][1] - k[1][1]
                if abs(voltage) > 6:
                    result.update(state='UNSUPPORTED', reason='DC LED subset is limited to 6 V.')
                elif voltage > model.get('forwardVoltage', 2):
                    if resistance <= 0:
                        result.update(state='UNSUPPORTED', reason='The supported LED subset requires a series resistor.')
                    else:
                        current = (voltage-model.get('forwardVoltage', 2))/resistance
                        result.update(state='ON' if current <= model.get('maxCurrentAmps', .02) else 'FAULT',
                                      currentAmps=current, reason='Ideal constant-drop series DC estimate; excludes output impedance, transistor and transient behavior.')
        states[mid] = result
    diagnostics = sorted({state['reason'] for state in states.values() if state['state'] in ('UNSUPPORTED', 'FAULT', 'UNKNOWN', 'UNPOWERED') and 'reason' in state})
    return states, diagnostics
