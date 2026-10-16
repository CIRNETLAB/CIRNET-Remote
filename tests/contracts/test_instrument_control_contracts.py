from copy import deepcopy
import pytest
from jsonschema import ValidationError
from contracts.registry import validate_contract

BASE={'schema_version':'1.0','experiment_id':'e1','operation_key':'key','status':'APPLIED','revision':1,
      'accepted':True,'hardware_applied':True,'error_code':None,
      'configuration':{'channel':1,'waveform':'SINE','frequency_hz':1,'amplitude_vpp':1,'offset_v':0,'enabled':True}}

@pytest.mark.parametrize('change',[{'hardware_applied':False},{'accepted':False},{'error_code':'FAILURE'},
    {'status':'ACCEPTED'},{'status':'REQUESTED'},{'status':'FAILED'}])
def test_acknowledgement_contract_rejects_false_application_evidence(change):
    with pytest.raises(ValidationError):validate_contract('InstrumentCommandRecord',{**deepcopy(BASE),**change},profile='transport')

@pytest.mark.parametrize('change',[{'generator_channels':[]},{'reason':'NOT_RUNNING'},{'can_configure_generator':False}])
def test_access_contract_requires_ready_owned_allocated_context(change):
    value={'schema_version':'1.0','experiment_id':'e1','revision':1,'can_configure_generator':True,'generator_channels':[1],'reason':'READY'}
    with pytest.raises(ValidationError):validate_contract('InstrumentControlAccess',{**value,**change},profile='transport')


def test_shared_python_browser_instrument_control_corpus():
    import json
    from pathlib import Path
    from contracts.semantic_profiles import validation_issues
    cases=json.loads((Path(__file__).resolve().parents[2]/'contracts/fixtures/instrument-control-conformance.json').read_text(encoding='utf-8'))['cases']
    for case in cases:
        if case['valid']:assert validate_contract(case['contract'],case['value'],profile='transport')==case['value']
        else:
            with pytest.raises(ValidationError) as error:validate_contract(case['contract'],case['value'],profile='transport')
            assert any(issue['code']==case['code'] and issue['path']==case['path'] for issue in validation_issues(error.value))
