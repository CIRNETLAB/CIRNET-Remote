"""Source dimensions are separate from virtual formed-lead and insertion choices."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from contracts.physical_mounting import get_physical_part

ROOT = Path(__file__).resolve().parents[2]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def test_all_prechange_parts_and_mechanical_profiles_remain_content_exact():
    baseline = json.loads((ROOT/'contracts/design-models/fixtures/contact-models-2026-10-18-baseline.json').read_text(encoding='utf-8'))
    registry = json.loads((ROOT/'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))
    parts = {(part['id'], part['revision']): part for part in [*registry['parts'], *registry['historicalParts']]}
    for item in baseline['parts']:
        original = parts[item['id'], item['revision']]
        assert digest(original) == item['sha256'], (item['id'], item['revision'])
        pinned = dict(partId=original['id'], partRevision=original['revision'], packageId=original['package']['id'], packageRevision=original['package']['revision'])
        assert get_physical_part(original['editorType'], pinned) == original
    mechanics = json.loads((ROOT/'contracts/design-models/flexible-mechanics.json').read_text(encoding='utf-8'))
    profiles = {(profile['id'], profile['revision']): profile for profile in mechanics['profiles']}
    for item in baseline['profiles']:
        assert digest(profiles[item['id'], item['revision']]) == item['sha256']


def test_new_switch_shapes_have_explicit_case_actuator_and_preserved_contact_identity():
    tactile = get_physical_part('PUSH_BUTTON_B3F1000')
    assert tactile['package']['bodyMm'] == dict(x=6, y=4.3, z=6)
    assert tactile['package']['shape']['caseHeightMm'] == 3.4
    assert tactile['package']['shape']['buttonDiameterMm'] == 3.5
    assert tactile['package']['shape']['leadSection'] == dict(kind='stamped', widthMm=.7, thicknessMm=.3, shoulderWidthMm=.7)
    dip = get_physical_part('DIP_SWITCH_A6D4100')
    assert dip['id'] == 'CAD-A6D4-RAISED-ADAPTED' and dip['identityKind'] == 'configurable-generic'
    assert dip['package']['bodyMm'] == dict(x=12.2, y=4.4, z=6.6)
    assert dip['package']['shape']['caseHeightMm'] == 3.4
    assert [connection['pins'] for connection in dip['internalConnections']] == [['1', '8'], ['2', '7'], ['3', '6'], ['4', '5']]
    slide = get_physical_part('SLIDE_SWITCH_SS12D10')
    assert slide['package']['bodyMm'] == dict(x=12.7, y=10.4, z=6.8)
    assert slide['package']['shape']['caseHeightMm'] == 6.4
    assert slide['package']['footprint']['id'] == 'SS12D10_BREADBOARD_ADAPTED_V1'
    assert [pin['positionMm']['x'] for pin in slide['package']['pins']] == [-5.08, 0, 5.08]
    assert slide['internalConnections'] == [dict(pins=['2', '3'], when=dict(property='state', equals=False)), dict(pins=['2', '1'], when=dict(property='state', equals=True))]


def test_new_contact_display_buzzer_presets_declare_deck_clearance_and_finite_cad_lead_budget():
    delta = .021/(.13/2.54)
    for kind, clearance in [('PUSH_BUTTON_B3F1000', .5), ('SLIDE_SWITCH_SS12D10', .5), ('DIP_SWITCH_A6D4100', .6), ('SEGMENT_SC5611EWA', .8), ('SEGMENT_DC5611EWA', .8), ('SEGMENT_CC5612EWA', .8), ('GENERIC_BUZZER', .8), ('BUZZER_PS1240', .8)]:
        package = get_physical_part(kind)['package']
        assert abs(package['standoffMm']-delta-clearance) < 1e-12
        assert package['boardInsertion'] == dict(version=1, mechanicalProfileId='BREADBOARD_MECHANICS_V1', maxExternalLeadMm=8)
    resistor = get_physical_part('GENERIC_RESISTOR')
    assert resistor['package']['bodyMm'] == dict(x=4.9, y=1.75, z=1.75)
    assert resistor['editor']['color'] == '#4A90E2'
    assert resistor['package']['boardInsertion']['maxExternalLeadMm'] == 35
    assert get_physical_part('SN74HC08N')['package']['boardInsertion']['maxExternalLeadMm'] == 6


def test_display_diffuser_dimensions_fit_all_envelopes_and_keep_real_pin_counts():
    for kind, digits, count in [('SEGMENT_SC5611EWA', 1, 10), ('SEGMENT_DC5611EWA', 2, 18), ('SEGMENT_CC5612EWA', 4, 12)]:
        package = get_physical_part(kind)['package']; shape = package['shape']
        assert package['digits'] == digits and len(package['pins']) == count
        assert shape['digitHeightMm'] == 14.22 and shape['strokeWidthMm'] == 1.5
        assert shape['decimalPointDiameterMm'] == 1.5 and shape['slantDegrees'] == 8
        assert (digits-1)*shape['digitPitchMm'] + shape['digitWidthMm'] + shape['decimalPointDiameterMm'] < package['bodyMm']['x']-2*shape['faceInsetMm']


def test_capacitor_definitions_are_separate_visible_types_with_distinct_pin_identity():
    ceramic = get_physical_part('GENERIC_CAPACITOR')
    electro = get_physical_part('GENERIC_CAPACITOR_ELECTROLYTIC')
    assert ceramic['name'] == 'Ceramic Capacitor' and electro['name'] == 'Electrolytic Capacitor'
    assert not ceramic['editor'].get('hidden') and not electro['editor'].get('hidden')
    assert [pin['id'] for pin in ceramic['package']['pins']] == ['A', 'B']
    assert [pin['id'] for pin in electro['package']['pins']] == ['PLUS', 'MINUS']
    assert not any(parameter['key'] == 'capacitorType' for part in (ceramic, electro) for parameter in part['editor']['parameters'])
