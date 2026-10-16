"""Conservative version anchors fail closed on changed supported public wires."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

from contracts.public_compatibility import CompatibilityError,check_compatibility,snapshot

ROOT=Path(__file__).resolve().parents[2]


def sources():
    return (json.loads((ROOT/'contracts/api/openapi.json').read_text(encoding='utf-8')),
            json.loads((ROOT/'contracts/capture/layout.json').read_text(encoding='utf-8')))


def test_current_public_operations_schemas_and_ncap_versions_match_supported_unpublished_baseline():
    api,layout=sources()
    baseline=json.loads((ROOT/'contracts/compatibility/2026-10-16/public-wire-baseline.json').read_text(encoding='utf-8'))
    check_compatibility(api,layout,baseline)


@pytest.mark.parametrize('mutation',[
    lambda api:api['paths']['/api/experiments']['post'].update(operationId='silentlyRenamedCreate'),
    lambda api:api['paths']['/api/experiments']['post']['responses'].update({'202':api['paths']['/api/experiments']['post']['responses'].pop('201')}),
    lambda api:api['components']['schemas']['ExperimentCreate']['required'].append('new_required_field'),
    lambda api:api['components']['schemas']['ErrorEnvelope']['properties']['code'].update(type='integer'),
    lambda api:api['components']['schemas']['CaptureMetadata']['properties']['schema_version'].update(const='2.0'),
    lambda api:api['paths']['/api/captures/{capture_id}/payload']['get']['responses']['200']['content'].update({'application/octet-stream':{'schema':{'type':'string','format':'binary'}}}),
    lambda api:api['paths']['/api/experiments']['post'].update(security=[]),
])
def test_breaking_api_mutations_cannot_silently_change_an_existing_wire(mutation):
    api,layout=sources();baseline=snapshot(api,layout);mutation(api)
    with pytest.raises(CompatibilityError):check_compatibility(api,layout,baseline)


@pytest.mark.parametrize('group,key,value',[
    ('prefix','byte_length',10),('prefix','magic_hex','4e434151'),('prefix','byte_order','big'),
    ('digital_v1','version',2),('digital_v1','record_bytes',12),('digital_v1','struct_format','>HQB'),
    ('digital_v1','max_events',100001),('sampled_v2','version',3),('sampled_v2','layout','channel_planar'),
])
def test_existing_ncap_layout_or_bounds_cannot_change_under_the_same_format(group,key,value):
    api,layout=sources();baseline=snapshot(api,layout);layout[group][key]=value
    with pytest.raises(CompatibilityError):check_compatibility(api,layout,baseline)


def test_additions_and_editorial_documentation_do_not_change_existing_wire_anchors():
    api,layout=sources();baseline=snapshot(api,layout)
    api['info']['description']='Clarified documentation.'
    api['paths']['/api/experiments']['post']['description']='Updated operation prose.'
    api['components']['schemas']['ExperimentCreate']['description']='Updated schema prose.'
    api['components']['schemas']['FutureSeparateContract']={'type':'boolean'}
    api['paths']['/api/future-version']={'get':{'operationId':'futureSeparateVersion','responses':{'200':{'description':'New API','content':{'application/json':{'schema':{'type':'boolean'}}}}}}}
    check_compatibility(api,layout,baseline)


def test_schema_property_names_are_data_and_unsupported_operation_shapes_fail_closed():
    api,layout=sources()
    api['components']['schemas']['AnnotationNamesAreProperties']={'type':'object','properties':{'description':{'type':'string'}},'required':['description']}
    baseline=snapshot(api,layout)
    api['components']['schemas']['AnnotationNamesAreProperties']['properties']['description']['type']='integer'
    with pytest.raises(CompatibilityError):check_compatibility(api,layout,baseline)
    api,layout=sources();api['paths']['/api/experiments']['post']['callbacks']={'future':{}}
    with pytest.raises(CompatibilityError):snapshot(api,layout)


def test_global_security_and_inherited_operation_security_are_compatibility_anchors():
    api,layout=sources()
    del api['paths']['/api/experiments']['post']['security']
    baseline=snapshot(api,layout)
    api['security']=[{'ServerSession':[]}]
    with pytest.raises(CompatibilityError):check_compatibility(api,layout,baseline)
    assert snapshot(api,layout)['api']['operations']['createExperiment']['security']==api['security']


def test_root_schema_dialect_cannot_change_existing_schema_meaning():
    api,layout=sources();baseline=snapshot(api,layout)
    api['jsonSchemaDialect']='http://json-schema.org/draft-07/schema#'
    with pytest.raises(CompatibilityError):check_compatibility(api,layout,baseline)
