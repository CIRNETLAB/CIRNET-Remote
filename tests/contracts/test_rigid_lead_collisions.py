"""Shaped rigid metal shares physical collision rules with flexible metal."""
from copy import deepcopy
import math
import json
from pathlib import Path

import pytest

from contracts.breadboard_topology import get_breadboard_topology
from contracts.design_validation import validate_design_graph
from contracts.physical_mounting import MM_TO_WORLD, get_physical_part, historical_physical_parts


def descriptor(part):
    return dict(version=1, partId=part['id'], partRevision=part['revision'], packageId=part['package']['id'], packageRevision=part['package']['revision'])


def rigid_dip_graph():
    part = get_physical_part('SN74HC08N')
    contacts = get_breadboard_topology('BREADBOARD')['contacts']
    bindings = []
    for pin in part['package']['pins']:
        expected = [pin['positionMm']['x']*MM_TO_WORLD, .309, pin['positionMm']['z']*MM_TO_WORLD]
        contact = next(contact for contact in contacts if all(abs(a-b) < 1e-9 for a, b in zip(contact['localPosition'], expected)))
        bindings.append(dict(kind='pin-contact', version=1, pinId=pin['id'], contactId=contact['contactId']))
    mount = descriptor(part)
    del mount['version']
    mount.update(kind='breadboard', version=1, boardId='BB', pose=dict(position=dict(x=0, y=.309, z=0), rotation=0), contacts=bindings)
    return dict(schema_version='1.2', circuit_id='rigid-metal', modules=[dict(id='BB', type='BREADBOARD'), dict(id='U', type='SN74HC08N', mount=mount)], connections=[])


def test_shaped_rigid_dip_shoulder_rejects_body_intersection_outside_both_plastic_envelopes():
    graph = rigid_dip_graph()
    validate_design_graph(graph)
    graph['modules'].append(dict(id='R', type='GENERIC_RESISTOR', physicalDescriptor=descriptor(get_physical_part('GENERIC_RESISTOR')), position=dict(x=-.39, y=.3490748031496063, z=.2200787401574803)))
    with pytest.raises(ValueError, match='lead.*body'):
        validate_design_graph(graph)


def test_unshaped_legacy_dip_preserves_its_historical_validation_semantics():
    graph = rigid_dip_graph()
    module = graph['modules'][1]
    original = min((part for part in historical_physical_parts() if part['editorType'] == module['type']), key=lambda part: part['revision'])
    module['mount'].update({key: value for key, value in descriptor(original).items() if key != 'version'})
    graph['modules'].append(dict(id='R', type='GENERIC_RESISTOR', physicalDescriptor=descriptor(get_physical_part('GENERIC_RESISTOR')), position=dict(x=-.39, y=.3490748031496063, z=.2200787401574803)))
    validate_design_graph(graph)


def test_to92_fanout_rejects_a_free_body_below_its_plastic_envelope():
    transistor, resistor = get_physical_part('GENERIC_BJT'), get_physical_part('GENERIC_RESISTOR')
    graph = dict(schema_version='1.2', circuit_id='fanout-metal', modules=[
        dict(id='Q', type='GENERIC_BJT', physicalDescriptor=descriptor(transistor)),
        dict(id='R', type='GENERIC_RESISTOR', physicalDescriptor=descriptor(resistor), position=dict(x=1.905*MM_TO_WORLD, y=-.35*MM_TO_WORLD, z=0)),
    ], connections=[])
    with pytest.raises(ValueError, match='lead.*body'):
        validate_design_graph(graph)
    graph['modules'][1]['position']['x'] += 10*MM_TO_WORLD
    validate_design_graph(graph)


def test_rigid_collision_stations_use_variable_section_width_and_exclude_hidden_embed():
    from contracts.rigid_leads import rigid_lead_stations_mm, rigid_lead_segments_mm
    from contracts.physical_mounting import rigid_world_lead_paths
    part = get_physical_part('SN74HC08N')
    package = part['package']
    stations = rigid_lead_stations_mm(package, package['pins'][0])
    assert stations[0]['position'] == pytest.approx((-7.62, 2.52, 3.175))
    assert stations[-1]['position'] == pytest.approx((-7.62, 0, 3.81))
    assert stations[0]['widthMm'] == 1.4 and stations[-1]['widthMm'] == .46
    segments = rigid_lead_segments_mm(package, package['pins'][0])
    assert segments[0]['radiusMm'] == pytest.approx(math.hypot(1.4, .28)/2)
    assert segments[-1]['radiusMm'] == pytest.approx(math.hypot(.46, .28)/2)
    # The 0.15 mm render-only point would be z=3.025. Collision starts at
    # the actual seal surface z=3.175 and never includes that interior point.
    assert min(station['position'][2] for station in stations) == 3.175
    module = dict(id='U', type='SN74HC08N', physicalDescriptor=descriptor(part), position=dict(x=2, y=3, z=-4), rotation=90)
    paths = rigid_world_lead_paths(module, part, {'U': module})
    assert paths[0]['segments'][0]['start'] == pytest.approx((2+3.175*MM_TO_WORLD, 3+2.52*MM_TO_WORLD, -4+7.62*MM_TO_WORLD))


def test_separate_rigid_bodies_cannot_place_their_fanout_tips_through_each_other():
    part = get_physical_part('GENERIC_BJT')
    graph = dict(schema_version='1.2', circuit_id='rigid-pair', modules=[
        dict(id='Q1', type='GENERIC_BJT', physicalDescriptor=descriptor(part)),
        dict(id='Q2', type='GENERIC_BJT', physicalDescriptor=descriptor(part), position=dict(x=5.08*MM_TO_WORLD, y=0, z=0)),
    ], connections=[])
    with pytest.raises(ValueError, match='Rigid leads.*another component lead'):
        validate_design_graph(graph)
    graph['modules'][1]['position']['x'] = 5.9*MM_TO_WORLD
    validate_design_graph(graph)


def test_rigid_fanout_and_flexible_wire_cannot_intersect_away_from_both_bodies():
    corpus = json.loads((Path(__file__).resolve().parents[2]/'contracts/design-models/fixtures/sealed-package-parity.json').read_text())
    case = next(case for case in corpus['cases'] if case['id'] == 'sealed-generic_led-14')
    graph = deepcopy(case['graph'])
    graph['modules'][0].update(position=dict(x=0, y=0, z=0), rotation=0)
    validate_design_graph(graph)
    tip = case['expectedGeometry'][1]['points'][-1]
    part = get_physical_part('GENERIC_BJT')
    graph['modules'].append(dict(id='Q', type='GENERIC_BJT', physicalDescriptor=descriptor(part), position=dict(x=tip['x']+2.54*MM_TO_WORLD, y=tip['y'], z=tip['z'])))
    with pytest.raises(ValueError, match='Rigid lead.*another component lead'):
        validate_design_graph(graph)


def test_shared_rigid_lead_station_and_collision_fixture_matches_canonical_python():
    from contracts.rigid_leads import fixed_package_lead_path, rigid_lead_stations_mm, rigid_lead_segments_mm
    fixture = json.loads((Path(__file__).resolve().parents[2]/'contracts/design-models/fixtures/rigid-leads-parity.json').read_text())
    for item in fixture['geometry']:
        package = get_physical_part(item['type'], item['descriptor'])['package']
        for expected in item['pins']:
            pin = next(pin for pin in package['pins'] if pin['id'] == expected['pinId'])
            stations = rigid_lead_stations_mm(package, pin)
            assert len(stations) == len(expected['stations'])
            for actual, station in zip(stations, expected['stations']):
                assert actual['position'] == pytest.approx(station['position'], abs=1e-10)
                assert actual['tangent'] == pytest.approx(station['tangent'], abs=1e-10)
                assert actual['widthMm'] == station['widthMm']
                assert actual['thicknessMm'] == station['thicknessMm']
            segments = rigid_lead_segments_mm(package, pin)
            assert len(segments) == len(expected['segments'])
            for actual, segment in zip(segments, expected['segments']):
                assert actual['start'] == pytest.approx(segment['start'], abs=1e-10)
                assert actual['end'] == pytest.approx(segment['end'], abs=1e-10)
                assert actual['radiusMm'] == pytest.approx(segment['radiusMm'], abs=1e-10)
    for item in fixture['fixedGeometry']:
        package = get_physical_part(item['type'], item['descriptor'])['package']
        for expected in item['pins']:
            pin = next(pin for pin in package['pins'] if pin['id'] == expected['pinId'])
            path = fixed_package_lead_path(package, pin)
            assert path['length']/MM_TO_WORLD == pytest.approx(expected['lengthMm'], abs=1e-10)
            assert [radius/MM_TO_WORLD for radius in path['bendRadii']] == pytest.approx(expected['bendRadiiMm'], abs=1e-10)
            assert len(path['samples']) == len(expected['samplesMm'])
            for actual, point in zip(path['samples'], expected['samplesMm']):
                assert tuple(value/MM_TO_WORLD for value in actual) == pytest.approx(point, abs=1e-10)
            assert path['sampleError']/MM_TO_WORLD == pytest.approx(expected['sampleErrorMm'], abs=1e-10)
    for case in fixture['cases']:
        if case['valid']:
            validate_design_graph(case['graph'])
        else:
            with pytest.raises(ValueError, match=case['reason']):
                validate_design_graph(case['graph'])


def test_fixed_two_pin_metal_cannot_intersect_another_body_below_its_own_shell():
    led, resistor = get_physical_part('GENERIC_LED'), get_physical_part('GENERIC_RESISTOR')
    graph = dict(schema_version='1.2', circuit_id='fixed-two-pin', modules=[
        dict(id='L', type='GENERIC_LED', physicalDescriptor=descriptor(led)),
        dict(id='R', type='GENERIC_RESISTOR', physicalDescriptor=descriptor(resistor), position=dict(x=1.27*MM_TO_WORLD, y=-1.1*MM_TO_WORLD, z=0)),
    ], connections=[])
    with pytest.raises(ValueError, match='lead.*body'):
        validate_design_graph(graph)
    graph['modules'][1]['position']['x'] += 10*MM_TO_WORLD
    validate_design_graph(graph)
