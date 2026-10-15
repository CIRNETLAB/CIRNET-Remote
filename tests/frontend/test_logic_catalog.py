"""Manufacturer pin maps are authoring contracts, independent of execution support."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('sync_editor_catalog', ROOT / 'scripts/sync_editor_catalog.py')
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


def registry():
    return json.loads((ROOT / 'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))


def test_all_requested_logic_codes_have_independent_verified_pinout_fixtures():
    fixtures = json.loads((ROOT / 'tests/fixtures/logic-pinouts.json').read_text(encoding='utf-8'))
    wanted = '7400 7401 7402 7403 7404 7405 7408 7409 7410 7411 7412 7413 7414 7415 7420 7421 7427 7430 7432 7437 7438 7440 7486 74136 74266 CD4001 CD4011 CD4012 CD4013 CD4030 CD4069 CD4070 CD4071 CD4072 CD4077 CD4081 CD4093'.split()
    assert list(fixtures) == wanted
    by_code = {part['logic']['code']: part for part in registry()['parts'] if part.get('logic', {}).get('code') in wanted}
    assert set(by_code) == set(wanted)
    for code, expected in fixtures.items():
        part = by_code[code]
        pins = part['package']['pins']
        assert part['editorType'] == expected['editorType'], code
        assert part['logic']['family'] == expected['family'], code
        assert [pin['name'] for pin in pins] == expected['pins'], code
        assert [pin['number'] for pin in pins] == [str(i) for i in range(1, 15)], code
        assert {pin['number']: pin['outputType'] for pin in pins if pin['role'] == 'output'} == expected['outputs'], code
        assert [pin['number'] for pin in pins if pin['role'] == 'nc'] == expected['nc'], code
        assert pins[6]['role'] == 'ground' and pins[13]['role'] == 'power', code
        for pin in pins:
            if pin['number'] not in {'7', '14', *expected['outputs'], *expected['nc']}:
                assert pin['role'] == 'input', (code, pin['number'])
        assert part['package']['footprint']['mountable'], code
        assert part['provenance']['sources'][0]['url'].startswith('https://'), code
        assert part['provenance']['pinoutView'] == 'top', code
        assert code in part['aliases'], code


def test_flip_flop_controls_and_schmitt_pins_are_descriptor_semantics():
    by_code = {part['logic']['code']: part for part in registry()['parts'] if part.get('logic')}
    ff = by_code['CD4013']
    pins = {pin['number']: pin for pin in ff['package']['pins']}
    assert ff['editor']['family'] == 'logic'
    for pin in ['3', '11']:
        assert pins[pin]['signal'] == 'clock' and pins[pin]['edge'] == 'rising'
    for pin in ['4', '10']:
        assert pins[pin]['signal'] == 'reset' and pins[pin]['polarity'] == 'active-high'
    for pin in ['6', '8']:
        assert pins[pin]['signal'] == 'set' and pins[pin]['polarity'] == 'active-high'
    for pin in ['2', '12']:
        assert pins[pin]['polarity'] == 'active-low'
    for code in ['7413', '7414', 'CD4093']:
        inputs = [pin for pin in by_code[code]['package']['pins'] if pin['role'] == 'input']
        assert inputs and all(pin.get('inputCharacteristics') == 'schmitt-trigger' for pin in inputs)


def test_editor_descriptor_generates_without_manufacturer_or_execution_data():
    source = registry()
    minimal = copy.deepcopy(source)
    for part in minimal['parts']:
        for key in ['simulation', 'manufacturer', 'partNumber', 'datasheet', 'provenance', 'notes']:
            part.pop(key, None)
    generated = sync.generate_editor_parts(minimal)
    snapshot = json.loads((ROOT / 'apps/web/src/data/editorParts.json').read_text(encoding='utf-8'))
    assert generated == snapshot
    assert len(generated['parts']) == len(source['parts'])
    for part in generated['parts']:
        assert not {'simulation', 'manufacturer', 'partNumber', 'datasheet', 'provenance'} & part.keys()
        assert part['package']['pins']
    legacy = json.loads((ROOT / 'device-library/editor/components.json').read_text(encoding='utf-8'))
    assert sync.generate_catalog(legacy, minimal)['components']


def test_generic_configurable_rc_retains_legacy_mount_identity_and_declares_properties():
    by_type = {part['editorType']: part for part in registry()['parts']}
    expected = {
        'RESISTOR_AXIAL': ('VISHAY-MRS25-330R', 'MRS25-1016', {'resistanceOhms': 330, 'powerWatts': .25, 'tolerancePercent': 1}),
        'CAPACITOR_CERAMIC': ('VISHAY-K104K15X7RF53H5', 'K15-H5-508', {'capacitanceFarads': 1e-7, 'voltageRatingVolts': 50}),
        'CAPACITOR_ELECTROLYTIC': ('NICHICON-UVR1E331MPD', 'UVR-D10-508', {'capacitanceFarads': 47e-6, 'voltageRatingVolts': 25}),
    }
    for type_, (id_, package, defaults) in expected.items():
        part = by_type[type_]
        assert (part['id'], part['revision'], part['package']['id'], part['package']['revision'], part['package']['footprint']['revision']) == (id_, 1, package, 1, 1)
        assert part['provenance']['kind'] == 'configurable-generic'
        assert part['editor']['defaults'] == defaults
        assert {parameter['key'] for parameter in part['editor']['parameters']} == defaults.keys()
        assert 'generic' in part['name'].lower()


def test_generator_rejects_ambiguous_signal_semantics_and_bad_default_values():
    bad_signal = registry()
    bad_signal['parts'][0]['package']['pins'][0]['signal'] = 'clock'
    bad_defaults = registry()
    resistor = next(part for part in bad_defaults['parts'] if part['editorType'] == 'RESISTOR_AXIAL')
    resistor['editor']['defaults']['powerWatts'] = float('nan')
    for invalid in [bad_signal, bad_defaults]:
        with pytest.raises(ValueError):
            sync.generate_editor_parts(invalid)
