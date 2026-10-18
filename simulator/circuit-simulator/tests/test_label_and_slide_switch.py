from copy import deepcopy

import pytest

from contracts.label_properties import DEFAULT_LABEL_PROPERTIES
from contracts.signal_domains import classify_graph
from netcircuit_sim.dispatch import SimulationDispatcher
from netcircuit_sim.engine import VirtualCompiler
from netcircuit_sim.nets import resolve_connectivity


def graph():
    return dict(schema_version='1.2', circuit_id='visual-label', modules=[
        dict(id='D', type='DIGITAL_SWITCH', properties=dict(state=True)),
        dict(id='O', type='LED'),
    ], connections=[dict(source='D.OUT', destination='O.IN')])


def test_adding_label_keeps_compiled_nets_dispatch_and_measured_event_samples_identical():
    original = graph(); with_label = deepcopy(original)
    with_label['modules'].append(dict(id='L', type='LABEL', position=dict(x=1,y=.5,z=2), rotation=90,
                                    properties={**DEFAULT_LABEL_PROPERTIES, 'text': 'Điện trở < 1 kΩ'}))
    assert resolve_connectivity(with_label) == resolve_connectivity(original)
    assert VirtualCompiler().compile(with_label) == VirtualCompiler().compile(original)
    assert classify_graph(with_label) == classify_graph(original)
    request = dict(schema_version='2.0', capture_config=dict(signals=['O.IN'],duration_ns=20))
    dispatcher = SimulationDispatcher()
    baseline = dispatcher.simulate({**request, 'graph': original}).model_dump(exclude_unset=True)
    annotated = dispatcher.simulate({**request, 'graph': with_label}).model_dump(exclude_unset=True)
    assert annotated == baseline and annotated['status'] == 'COMPLETE'
    assert annotated['capture']['samples'][-1]['value'] == 1


@pytest.mark.parametrize('modules', [
    [dict(id='U', type='NO_MODEL', signal_domains=dict(version='1.0', ports=dict(OUT='DIGITAL')))],
    [dict(id='C', type='CAPACITOR_CERAMIC')],
    [dict(id='C', type='CAPACITOR_CERAMIC'), dict(id='D', type='DIGITAL_SWITCH')],
    [dict(id='G', type='SN7400N')],
])
def test_label_cannot_grant_execution_to_unknown_components_or_unavailable_solvers(modules):
    original = dict(schema_version='1.2', circuit_id='unsupported-note', modules=modules, connections=[])
    annotated = deepcopy(original)
    annotated['modules'].append(dict(id='L', type='LABEL', properties=deepcopy(DEFAULT_LABEL_PROPERTIES)))
    assert classify_graph(annotated) == classify_graph(original)
    request = dict(schema_version='2.0', capture_config=dict(signals=[], duration_ns=20))
    dispatcher = SimulationDispatcher()
    before = dispatcher.simulate({**request, 'graph': original}).model_dump(exclude_unset=True)
    after = dispatcher.simulate({**request, 'graph': annotated}).model_dump(exclude_unset=True)
    assert before == after
    assert after['status'] in ('UNAVAILABLE', 'REJECTED') and 'capture' not in after


@pytest.mark.parametrize('state,connected,isolated', [(False,'3','1'), (True,'1','3')])
def test_slide_switch_uses_existing_two_position_spdt_contact_model_without_logic_sources(state,connected,isolated):
    value = dict(schema_version='1.2',circuit_id='slide',modules=[dict(id='S',type='SLIDE_SWITCH_SS12D10',properties=dict(state=state))],connections=[])
    groups = resolve_connectivity(value)
    assert tuple(sorted(['S.2','S.'+connected])) in groups
    assert ('S.'+isolated,) in groups
    assert not any('S.1' in group and 'S.3' in group for group in groups)
    plan = VirtualCompiler().compile(value)
    assert plan.initial_sources == {} and plan.devices == () and plan.clocks == ()
