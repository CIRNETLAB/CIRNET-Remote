from tests.support.release_inputs import sdk_resource
from tests.support.release_inputs import device_resource, interface_root
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def test_editor_snapshot_matches_canonical_metadata_and_has_unambiguous_ports():
    canonical = json.loads((device_resource('editor/components.json')).read_text(encoding='utf-8'))
    snapshot = json.loads((sdk_resource('data/editorCatalog.json')).read_text(encoding='utf-8'))
    # Legacy definitions remain byte-for-byte semantic inputs; physical entries
    # are generated from the separate, versioned part registry.
    assert canonical['components'] == snapshot['components'][:len(canonical['components'])]
    subprocess.run([sys.executable, str(ROOT / 'scripts/sync_editor_catalog.py'), '--check'], cwd=ROOT, check=True)
    components = snapshot['components']
    assert len({item['type'] for item in components}) == len(components)
    for item in components:
        assert len({port['id'] for port in item['ports']}) == len(item['ports'])
        assert all('.' not in port['id'] and port['direction'] in {'input', 'output', 'inout'} for port in item['ports'])
        if item.get('visualOnly'):
            assert not item['ports']
        if item['family'] == 'arithmetic':
            assert not item.get('partNumber')


def test_logic_editor_reference_uses_confirmed_device_library_identity():
    catalog = json.loads((device_resource('editor/components.json')).read_text(encoding='utf-8'))
    logic = next(item for item in catalog['components'] if item['type'] == '74HC08')
    device = json.loads((device_resource('') / logic['metadataRef']).read_text(encoding='utf-8'))
    assert device['id'] == logic['type']
    assert len(logic['ports']) == 12
    assert not any('pin' in port for port in logic['ports'])


def test_standardized_component_display_names():
    catalog = json.loads((device_resource('editor/components.json')).read_text(encoding='utf-8'))
    by_type = {item['type']: item for item in catalog['components']}
    assert by_type['BREADBOARD_100']['name'] == 'Power Breadboard'
    assert by_type['POWER_SUPPLY']['name'] == 'Power Supply'

