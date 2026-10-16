"""The manifest is the offline, packaged authority for contract identities."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

ROOT = Path(__file__).resolve().parents[2]


def test_manifest_covers_every_canonical_schema_and_def():
    from contracts.registry import entries, check_manifest
    check_manifest()
    names = {entry['id'] for entry in entries()}
    lab = json.loads((ROOT / 'contracts/physical-lab/lab.schema.json').read_text())
    assert set(lab['$defs']) <= names
    assert {'CircuitGraph', 'CircuitModule', 'MountBinding', 'MemoryImage', 'WireVisual'} <= names
    private = next(entry for entry in entries() if entry['id'] == 'InstrumentationExecutionPlan')
    assert private['visibility'] == 'internal'


@pytest.mark.parametrize('folder',['capture','design-models','future-versioned-family'])
def test_manifest_cannot_silently_miss_a_new_canonical_schema_family(tmp_path,monkeypatch,folder):
    import contracts.registry as registry
    original=deepcopy(registry.entries())
    root=tmp_path/'contracts';schema=root/folder/'new.schema.json';schema.parent.mkdir(parents=True)
    schema.write_text('{"type":"object"}',encoding='utf-8')
    monkeypatch.setattr(registry,'ROOT',root)
    monkeypatch.setattr(registry,'entries',lambda:original)
    with pytest.raises(ValueError,match='Unmanifested schemas'):
        registry.check_manifest()


def test_offline_registry_resolves_external_mount_conditionals_without_cwd(tmp_path, monkeypatch):
    from contracts.registry import validate_contract
    monkeypatch.chdir(tmp_path)
    mount = {'kind':'breadboard', 'version':1, 'boardId':'B', 'partId':'P', 'partRevision':1,
             'packageId':'K', 'packageRevision':1, 'pose':{'position':{'x':0,'y':0,'z':0},'rotation':0},
             'contacts':[{'kind':'pin-contact','version':1,'pinId':'1','contactId':'A:01'}]}
    value = {'schema_version':'1.1','circuit_id':'c','modules':[{'id':'M','type':'P','mount':mount}], 'connections':[]}
    assert validate_contract('CircuitGraph', value) == value
    value['modules'][0]['position'] = {'x':0}
    with pytest.raises(ValidationError):
        validate_contract('CircuitGraph', value)


def test_structural_profile_preserves_legacy_numbers_and_extensions():
    from contracts.registry import validate_contract
    value = {'schema_version':'1.0','circuit_id':'c','modules':[{'id':'M','type':'UNKNOWN','position':{'x':10**400},'future':{'v':False}}], 'connections':[]}
    original = deepcopy(value)
    assert validate_contract('CircuitGraph', value) == original
    assert value == original


@pytest.mark.parametrize('value', [1.0, 1.1, True, None])
def test_version_is_never_coerced(value):
    from contracts.registry import validate_contract
    with pytest.raises(ValidationError):
        validate_contract('CircuitGraph', {'schema_version':value,'circuit_id':'c','modules':[],'connections':[]})


def test_unknown_reference_and_unknown_keyword_fail_toolchain():
    from contracts.registry import check_schema
    with pytest.raises(ValueError, match='keyword'):
        check_schema({'type':'object','misspelledProperties':{}})
    with pytest.raises(ValueError, match='reference'):
        check_schema({'$ref':'https://netcircuit.local/not-installed.schema.json'})


def test_boolean_combinator_schema_uses_real_dialect():
    from contracts.registry import structural_validator
    schema = {'allOf':[True, {'oneOf':[{'type':'integer'}, {'const':'x'}]}], 'not':{'const':False}}
    validate = structural_validator(schema)
    validate.validate(0)
    validate.validate('x')
    for invalid in [False, None, '0']:
        with pytest.raises(ValidationError):
            validate.validate(invalid)


def test_generation_preserves_reserved_property_names_and_annotation_values(monkeypatch):
    import contracts.registry as registry
    uri='https://netcircuit.local/test/extension'
    entry={'id':'Extension','kind':'schema','uri':uri,'path':'ignored','pointer':'','visibility':'public'}
    schema={'type':'object','properties':{'$id':{'type':'string'},'title':{'type':'string'}},
            'default':{'$id':'literal','$defs':{'plain':'metadata'}},'additionalProperties':False}
    monkeypatch.setattr(registry,'entries',lambda:[entry])
    monkeypatch.setattr(registry,'load_schema',lambda requested:deepcopy(schema))
    output=registry.schema_bundle(public_only=True)['$defs']['Extension']
    assert output==schema


def test_manifest_rejects_unknown_kinds_and_missing_ownership(monkeypatch):
    import contracts.registry as registry
    original=deepcopy(registry.entries())
    original[0]['kind']='schemma'
    monkeypatch.setattr(registry,'entries',lambda:original)
    with pytest.raises(ValueError,match='kind'):
        registry.check_manifest()
    original[0]['kind']='schema'
    del original[0]['producer']
    with pytest.raises(ValueError,match='producer'):
        registry.check_manifest()


def test_manifest_uri_cannot_alias_different_sources(monkeypatch):
    import contracts.registry as registry
    original=deepcopy(registry.entries())
    memory=next(entry for entry in original if entry['id']=='MemoryImage')
    memory['uri']=original[0]['uri']
    monkeypatch.setattr(registry,'entries',lambda:original)
    with pytest.raises(ValueError,match='URI'):
        registry.check_manifest()


def test_schema_check_resolves_nested_relative_identity():
    from contracts.registry import check_schema
    check_schema({'type':'object','properties':{'value':{'$id':'child.json','$defs':{'text':{'type':'string'}},'$ref':'#/$defs/text'}}},
                 base_uri='https://netcircuit.local/nested/root.json')


def test_generation_relocates_reused_property_subschemas_without_copying(monkeypatch):
    import contracts.registry as registry
    uri='https://netcircuit.local/test/nested'
    sources={'Base':{'type':'object','properties':{'x/y':{'type':'integer','minimum':1}}},
             'View':{'type':'object','properties':{'value':{'$ref':uri+'#/$defs/Base/properties/x~1y'}}}}
    metadata=[{'id':name,'kind':'schema','uri':uri,'pointer':'/$defs/'+name,'visibility':'public'} for name in sources]
    monkeypatch.setattr(registry,'entries',lambda:metadata)
    def load(requested):
        value={'$defs':sources}
        for part in requested.split('#',1)[1].strip('/').split('/'):
            value=value[part.replace('~1','/').replace('~0','~')]
        return deepcopy(value)
    monkeypatch.setattr(registry,'load_schema',load)
    bundle=registry.schema_bundle(public_only=True)
    assert bundle['$defs']['View']['properties']['value']=={'$ref':'#/$defs/Base/properties/x~1y'}
    assert registry.schema_bundle(public_only=True,ref_prefix='#/components/schemas/')['$defs']['View']['properties']['value']['$ref']=='#/components/schemas/Base/properties/x~1y'


def test_generation_cannot_escape_internal_descendant_via_public_parent(monkeypatch):
    import contracts.registry as registry
    uri='https://netcircuit.local/test/private-child'
    metadata=[{'id':'Base','kind':'schema','uri':uri,'pointer':'','visibility':'public'},
              {'id':'Hidden','kind':'schema','uri':uri,'pointer':'/properties/private','visibility':'internal'}]
    schema={'type':'object','properties':{'private':{'type':'integer'},'view':{'$ref':'#/properties/private'}}}
    monkeypatch.setattr(registry,'entries',lambda:metadata)
    monkeypatch.setattr(registry,'load_schema',lambda requested:deepcopy(schema))
    with pytest.raises(ValueError,match='private'):
        registry.schema_bundle(public_only=True)
