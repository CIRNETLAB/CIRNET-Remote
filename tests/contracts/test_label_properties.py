"""Labels are validated visual annotations, never electrical components."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from contracts.component_properties import normalize_component_properties
from contracts.design_validation import validate_design_graph
from contracts.registry import validate_contract
from contracts.signal_domains import classify_graph

ROOT = Path(__file__).resolve().parents[2]
DEFAULTS = dict(version=1, text='Hello', fontSizeMm=3, textColor='#20252A', backgroundColor='#FAFAF7', paddingMm=1)


def label_graph(properties=None):
    return dict(schema_version='1.2', circuit_id='notes', modules=[
        dict(id='B', type='BREADBOARD', position=dict(x=0, y=0, z=0)),
        dict(id='L', type='LABEL', position=dict(x=1, y=.35, z=0), rotation=90,
             properties={**DEFAULTS, 'boardId': 'B', **(properties or {})}),
    ], connections=[])


def test_label_contract_preserves_plain_unicode_text_and_has_no_electrical_domain():
    value = label_graph(dict(text='Điện trở < 1 kΩ\nhttps://example.test/ chỉ là chữ'))
    original = deepcopy(value)
    assert validate_contract('LabelPropertiesV1', value['modules'][1]['properties']) == value['modules'][1]['properties']
    validate_design_graph(value)
    assert value == original
    assert classify_graph(value) == dict(schema_version='1.0', kind='DIGITAL', domains=[], unsupported_components=[])
    source = json.loads((ROOT/'device-library/editor/components.json').read_text(encoding='utf-8'))
    definition = next(item for item in source['components'] if item['type'] == 'LABEL')
    assert definition['ports'] == [] and definition['visualOnly'] is True


@pytest.mark.parametrize('board_type', ['BREADBOARD', 'BREADBOARD_830', 'BREADBOARD_630', 'BREADBOARD_100'])
def test_label_board_association_accepts_every_canonical_board_type_and_historical_alias(board_type):
    value = label_graph()
    value['modules'][0]['type'] = board_type
    validate_design_graph(value)


@pytest.mark.parametrize('patch', [
    dict(version=2), dict(text='a'*257), dict(text='1\n2\n3\n4\n5'), dict(text='hello\x00'),
    dict(text='hello\rworld'), dict(fontSizeMm=1.99), dict(fontSizeMm=6.01),
    dict(fontSizeMm=True), dict(textColor='red'), dict(backgroundColor='#fff'),
    dict(paddingMm=1.01), dict(boardId=''), dict(widthMm=100), dict(html='<b>bad</b>'),
])
def test_label_properties_reject_invalid_shape_bounds_and_executable_fields(patch):
    with pytest.raises((ValueError, ValidationError)):
        validate_contract('LabelPropertiesV1', {**DEFAULTS, **patch})


def test_unicode_length_counts_codepoints_and_normalizer_uses_independent_defaults():
    properties = normalize_component_properties('LABEL', dict(text='😀'*256))
    assert properties == {**DEFAULTS, 'text': '😀'*256}
    with pytest.raises(ValueError):
        normalize_component_properties('LABEL', dict(text='😀'*257))
    assert normalize_component_properties('LABEL', {}) == DEFAULTS


@pytest.mark.parametrize('change', ['mount', 'physicalDescriptor', 'missing-board', 'wrong-board', 'electrical-edge'])
def test_label_association_is_visual_only_and_cannot_claim_mount_or_fake_ports(change):
    value = label_graph()
    label = value['modules'][1]
    if change in ('mount', 'physicalDescriptor'):
        label[change] = {}
    elif change == 'missing-board':
        label['properties']['boardId'] = 'missing'
    elif change == 'wrong-board':
        label['properties']['boardId'] = 'L'
    else:
        value['connections'] = [dict(source='L.OUT', destination='B.contact:terminal:a:1')]
    with pytest.raises((ValueError, ValidationError)):
        validate_design_graph(value)


def test_label_properties_are_enforced_by_generated_graph_boundary_too():
    for version in ['1.0', '1.1', '1.2']:
        value = label_graph(dict(fontSizeMm=100)); value['schema_version'] = version
        with pytest.raises((ValueError, ValidationError)):
            validate_contract('AnySupportedCircuitGraph', value)
