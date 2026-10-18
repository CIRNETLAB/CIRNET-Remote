"""Physical registry validation prevents malformed source reaching either runtime."""
import copy
import importlib.util
import hashlib
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sync_editor_catalog', ROOT / 'scripts/sync_editor_catalog.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def registry():
    return json.loads((ROOT / 'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))


def test_generator_rejects_impossible_body_geometry_and_nonplanar_mounting_pins():
    bad_body = registry()
    bad_body['parts'][0]['package']['bodyMm']['x'] = 0
    bad_pin = registry()
    bad_pin['parts'][0]['package']['pins'][0]['positionMm']['y'] = 1
    for bad in [bad_body, bad_pin]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generator_rejects_missing_output_kind_and_incorrect_supply_role():
    bad_output = registry()
    del bad_output['parts'][0]['package']['pins'][2]['outputType']
    bad_power = registry()
    bad_power['parts'][0]['package']['pins'][13]['role'] = 'passive'
    for bad in [bad_output, bad_power]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generator_rejects_duplicate_pin_and_unknown_internal_connection():
    duplicate = registry()
    duplicate['parts'][0]['package']['pins'][0]['id'] = '2'
    unknown = registry()
    unknown['parts'][0]['internalConnections'] = [{'pins': ['1', 'missing']}]
    for bad in [duplicate, unknown]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generated_physical_snapshots_have_exact_canonical_provenance():
    canonical = registry()
    sync.validate_parts(canonical)
    for snapshot in ['apps/web/src/data/physicalParts.json', 'contracts/design-models/physical-parts.v1.json']:
        assert json.loads((ROOT / snapshot).read_text(encoding='utf-8')) == canonical


def test_mechanical_authoring_snapshot_has_exact_canonical_provenance():
    canonical = json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text(encoding='utf-8'))
    assert json.loads((ROOT / 'apps/web/src/data/flexibleMechanics.json').read_text(encoding='utf-8')) == canonical


def test_generation_adds_physical_pin_ports_without_mutating_legacy_metadata():
    legacy = json.loads((ROOT / 'device-library/editor/components.json').read_text(encoding='utf-8'))
    before = copy.deepcopy(legacy)
    catalog = sync.generate_catalog(legacy, registry())
    assert legacy == before
    assert catalog['components'][:len(legacy['components'])] == legacy['components']
    hc08 = next(item for item in catalog['components'] if item['type'] == 'SN74HC08N')
    assert [pin['id'] for pin in hc08['ports']] == [str(i) for i in range(1, 15)]
    assert hc08['ports'][6] == {'id': '7', 'direction': 'inout', 'domain':'GROUND'}
    assert hc08['mode'] == 'physical'


def test_generic_design_parts_keep_reference_package_pin_identities_and_typed_properties():
    catalog = registry()
    parts = {part['editorType']: part for part in catalog['parts']}
    all_parts = [*catalog['parts'], *catalog['historicalParts']]
    pairs = {
        'GENERIC_RESISTOR': 'RESISTOR_AXIAL', 'GENERIC_CAPACITOR': 'CAPACITOR_CERAMIC',
        'GENERIC_CAPACITOR_ELECTROLYTIC': 'CAPACITOR_ELECTROLYTIC', 'GENERIC_DIODE': 'DIODE_1N4148',
        'GENERIC_ZENER_DIODE': 'ZENER_1N4733A', 'GENERIC_LED': 'LED_LTL307EE',
        'GENERIC_BUZZER': 'BUZZER_PS1240', 'GENERIC_BJT': 'TRANSISTOR_2N3904',
    }
    for generic, legacy in pairs.items():
        assert generic in parts
        # Revision 1 was a reference-package copy; compact defaults explicitly
        # pin a new package while the original generic remains resolvable.
        historical = next(part for part in all_parts if part['editorType'] == generic and part['revision'] == 1)
        original_reference = next(part for part in all_parts if part['editorType'] == legacy and part['package']['id'] == historical['package']['id'] and part['package']['revision'] == historical['package']['revision'])
        assert historical['package'] == original_reference['package']
        assert [pin['id'] for pin in parts[generic]['package']['pins']] == [pin['id'] for pin in parts[legacy]['package']['pins']]
        assert parts[generic]['identityKind'] == 'configurable-generic'
        assert 'manufacturer' not in parts[generic] and 'partNumber' not in parts[generic]
        assert parts[legacy]['editor']['addType'] == generic
    assert parts['GENERIC_CAPACITOR']['editor']['defaults']['capacitorType'] == 'CERAMIC'
    assert parts['GENERIC_CAPACITOR_ELECTROLYTIC']['editor']['defaults']['capacitorType'] == 'ELECTROLYTIC'
    original_electrolytic=next(part for part in all_parts if part['editorType']=='GENERIC_CAPACITOR_ELECTROLYTIC' and part['revision']==1)
    assert original_electrolytic['editor']['hidden'] is True
    assert parts['GENERIC_CAPACITOR_ELECTROLYTIC']['editor'].get('hidden',False) is False
    assert parts['GENERIC_LED']['editor']['defaults']['color'] == '#ce3935'
    for kind in ['GENERIC_DIODE', 'GENERIC_ZENER_DIODE', 'GENERIC_CAPACITOR', 'GENERIC_BUZZER', 'GENERIC_BJT']:
        assert parts[kind]['simulation']['status'] == 'unsupported'
    sync.validate_parts(registry())


def test_generator_validates_enum_string_and_color_defaults_without_numeric_coercion():
    valid = registry()
    editor = valid['parts'][0]['editor']
    editor['parameters'] = [
        {'key': 'type', 'label': 'Type', 'kind': 'enum', 'options': [{'value': 'A', 'label': 'A'}, {'value': 'B', 'label': 'B'}]},
        {'key': 'color', 'label': 'Color', 'kind': 'color', 'pattern': '^#[0-9a-fA-F]{6}$'},
        {'key': 'label', 'label': 'Label', 'kind': 'string', 'maxLength': 20},
    ]
    editor['defaults'] = {'type': 'A', 'color': '#ff0000', 'label': 'draft'}
    sync.validate_parts(valid)
    for key, value in [('type', 'C'), ('type', 1), ('color', 'red'), ('label', True), ('label', 'x' * 21)]:
        invalid = copy.deepcopy(valid)
        invalid['parts'][0]['editor']['defaults'][key] = value
        with pytest.raises(ValueError):
            sync.validate_parts(invalid)


def test_sealed_current_packages_have_exact_envelopes_sections_and_centered_exits():
    parts = {part['editorType']: part for part in registry()['parts']}
    expected = {
        'GENERIC_RESISTOR': (4.9, 1.75, 1.75, .8, 'resistor', .5),
        'GENERIC_DIODE': (4.5, 2.3, 2.3, .8, 'diode', .6),
        'GENERIC_ZENER_DIODE': (3.5, 1.6, 1.6, .8, 'zener', .5),
        'GENERIC_CAPACITOR': (5, 5, 2.2, 1.2, 'ceramic', .6),
        'GENERIC_CAPACITOR_ELECTROLYTIC': (6.3, 11, 6.3, 1.2, 'electrolytic', .6),
        'GENERIC_LED': (5.8, 8.7, 5.8, 1.5, 'led', .5),
        'GENERIC_BJT': (4.6, 5.1, 3.9, 2.5, 'to92', .44),
        'SN74HC08N': (19, 3.04, 6.35, 1, 'dip', .46),
    }
    mechanics = json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text())['profiles']
    for kind, (x, y, z, standoff, family, width) in expected.items():
        pkg = parts[kind]['package']
        assert pkg['bodyMm'] == dict(x=x, y=y, z=z), kind
        assert pkg['standoffMm'] == standoff
        shape = pkg['shape']
        assert shape['version'] == 1 and shape['family'] == family
        assert shape['embeddedDepthMm'] == .15
        assert shape['leadSection']['widthMm'] == width
        assert {p['pinId'] for p in shape['leadExits']} == {p['id'] for p in pkg['pins']}
        if family in {'resistor', 'diode', 'zener'}:
            assert [p['positionMm'] for p in shape['leadExits']] == [dict(x=-x/2, y=0, z=0), dict(x=x/2, y=0, z=0)]
        elif family != 'dip':
            assert all(exit['positionMm']['y'] == -y/2 for exit in shape['leadExits'])
        if len(pkg['pins']) == 2:
            profile = next(profile for profile in mechanics if (profile['packageId'], profile['packageRevision']) == (pkg['id'], pkg['revision']))
            assert [pin['bodyExitMm'] for pin in profile['pins']] == [pin['positionMm'] for pin in shape['leadExits']]
            if width == .6:
                assert profile['minBendRadiusMm'] >= .4
                assert .6 <= profile['preferredBendRadiusMm'] <= .8
    led = parts['GENERIC_LED']['package']['shape']
    assert [led[key] for key in ('lensDiameterMm', 'flangeDiameterMm', 'flangeHeightMm', 'domeRadiusMm')] == [5, 5.8, 1, 2.49]
    assert led['leadSection'] == dict(kind='rectangular', widthMm=.5, thicknessMm=.5)
    assert parts['GENERIC_BJT']['package']['shape']['leadSection'] == dict(kind='rectangular', widthMm=.44, thicknessMm=.42)


def test_all_previously_current_descriptors_remain_frozen_and_resolvable():
    # The prior task's fixtures pin every old generic default; retain those exact
    # physical descriptors, including the compact revision created by that task.
    catalog = registry()
    all_parts = [*catalog['parts'], *catalog['historicalParts']]
    frozen = json.loads((ROOT / 'contracts/design-models/fixtures/sealed-package-legacy.json').read_text())
    digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    for saved in frozen['parts']:
        previous = next(part for part in all_parts if (part['id'], part['revision']) == (saved['id'], saved['revision']))
        assert digest(previous) == saved['sha256']
    profiles = json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text())['profiles']
    for saved in frozen['profiles']:
        previous = next(profile for profile in profiles if (profile['id'], profile['revision']) == (saved['id'], saved['revision']))
        assert digest(previous) == saved['sha256']
    for kind, revision, package_id in [('GENERIC_RESISTOR', 2, 'GENERIC-AXIAL-R50-762'), ('GENERIC_ZENER_DIODE', 2, 'GENERIC-AXIAL-Z42-762'), ('GENERIC_CAPACITOR_ELECTROLYTIC', 2, 'GENERIC-RADIAL-D63-H11-254')]:
        previous = next(part for part in all_parts if part['editorType'] == kind and part['revision'] == revision)
        assert previous['package']['id'] == package_id
        assert previous['package']['revision'] == 1
        assert 'shape' not in previous['package']
    exact = next(part for part in all_parts if (part['id'],part['revision'],part['package']['id'],part['package']['revision']) == ('VISHAY-1N4148',1,'DO35-1016',1))
    assert exact['editorType'] == 'DIODE_1N4148' and exact['package']['bodyMm'] == dict(x=3.9, y=1.9, z=1.9)
    current = next(part for part in catalog['parts'] if part['editorType'] == 'DIODE_1N4148')
    assert current['revision'] > exact['revision'] and current['package']['id'] != exact['package']['id']
    assert current['package']['bodyMm'] == exact['package']['bodyMm']
    assert current['package']['boardInsertion']['mechanicalProfileId'] == 'BREADBOARD_MECHANICS_V1'


@pytest.mark.parametrize('mutation', ['unknown_family', 'unknown_pin', 'nonunit_normal', 'oversized_exit', 'invalid_section', 'oversized_embed'])
def test_generator_rejects_invalid_sealed_shape_specs(mutation):
    invalid = registry()
    package = next(part['package'] for part in invalid['parts'] if part['editorType'] == 'GENERIC_RESISTOR')
    shape = package['shape']
    if mutation == 'unknown_family': shape['family'] = 'guessed-hardware'
    if mutation == 'unknown_pin': shape['leadExits'][0]['pinId'] = 'missing'
    if mutation == 'nonunit_normal': shape['leadExits'][0]['normal']['x'] = 2
    if mutation == 'oversized_exit': shape['leadExits'][0]['positionMm']['x'] = -99
    if mutation == 'invalid_section': shape['leadSection']['thicknessMm'] = 0
    if mutation == 'oversized_embed': shape['embeddedDepthMm'] = 20
    with pytest.raises(ValueError):
        sync.validate_parts(invalid)


def test_generator_rejects_shape_profile_exit_drift_and_degenerate_new_wire_bends():
    mechanics = json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text())
    catalog=registry()
    sync.validate_mechanics(catalog, mechanics)
    frozen_catalog=copy.deepcopy(catalog)
    for kind in ['GENERIC_CAPACITOR','GENERIC_DIODE']:
        frozen=next(part for part in catalog['historicalParts'] if part['editorType']==kind and part['package'].get('shape'))
        index=next(i for i,part in enumerate(frozen_catalog['parts']) if part['editorType']==kind)
        frozen_catalog['parts'][index]=copy.deepcopy(frozen)
    drift = copy.deepcopy(mechanics)
    next(profile for profile in drift['profiles'] if profile['id'] == 'flex-sealed-ceramic')['pins'][0]['bodyExitMm']['y'] += .1
    with pytest.raises(ValueError, match='shape exits'):
        sync.validate_mechanics(frozen_catalog, drift)
    tiny = copy.deepcopy(mechanics)
    next(profile for profile in tiny['profiles'] if profile['id'] == 'flex-sealed-diode')['minBendRadiusMm'] = .3
    with pytest.raises(ValueError, match='bend radius'):
        sync.validate_mechanics(frozen_catalog, tiny)
    for kind,mutation,message in [('GENERIC_CAPACITOR','exit','shape exits'),('GENERIC_DIODE','radius','bend radius')]:
        package=next(part['package'] for part in catalog['parts'] if part['editorType']==kind)
        invalid=copy.deepcopy(mechanics)
        profile=next(profile for profile in invalid['profiles'] if (profile['packageId'],profile['packageRevision'])==(package['id'],package['revision']))
        if mutation=='exit':profile['pins'][0]['bodyExitMm']['y']+=.1
        else:profile['minBendRadiusMm']=.3
        with pytest.raises(ValueError,match=message):sync.validate_mechanics(catalog,invalid)
