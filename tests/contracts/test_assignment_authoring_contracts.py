from copy import deepcopy
import pytest
from jsonschema import ValidationError
from contracts.registry import validate_contract

def definition():
    return {'schema_version':'1.0','assignment_id':'a','title':'Assignment','lab_endpoints':[{'endpoint_id':'source','role':'INPUT_SOURCE'}],'assessment_policy':'FUNCTIONAL_ONLY'}

@pytest.mark.parametrize('name',['AssignmentAuthoringCreate','AssignmentAuthoringSave','AssignmentAuthoringDocument'])
def test_authoring_wrappers_apply_shared_definition_semantics_with_prefixed_paths(name):
    value=definition();value['lab_endpoints'].append(deepcopy(value['lab_endpoints'][0]))
    payload={'definition':value}
    if name=='AssignmentAuthoringSave':payload['base_revision']=1
    if name=='AssignmentAuthoringDocument':payload.update(schema_version='1.0',assignment_id='a',title='Assignment',owner_id='owner',revision=1,published=False,published_revision=None,feedback_policy='observed_only',created_at=1,updated_at=1)
    with pytest.raises(ValidationError) as caught:validate_contract(name,payload)
    assert caught.value.issues[0]['code']=='DUPLICATE_ID'
    assert caught.value.issues[0]['path']=='/definition/lab_endpoints/1/endpoint_id'

def test_authoring_selection_and_definition_identities_remain_coherent():
    value={'schema_version':'1.0','assignment_id':'a','title':'Assignment','owner_id':'owner','revision':2,'published':True,'published_revision':3,'feedback_policy':'observed_only','created_at':1,'updated_at':1,'definition':definition()}
    with pytest.raises(ValidationError,match='published revision'):validate_contract('AssignmentAuthoringDocument',value)
    value['published_revision']=2;value['definition']['assignment_id']='other'
    with pytest.raises(ValidationError,match='identity'):validate_contract('AssignmentAuthoringDocument',value)
