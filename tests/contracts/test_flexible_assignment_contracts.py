import json
from pathlib import Path
import pytest
from jsonschema import ValidationError
from contracts.registry import validate_contract

CASES=json.loads((Path(__file__).resolve().parents[2]/'contracts/fixtures/assignment-v2-conformance.json').read_text(encoding='utf-8'))['cases']

@pytest.mark.parametrize('case',CASES,ids=lambda case:case['id'])
def test_shared_assignment_v2_contract_cases(case):
    if case['valid']:
        assert validate_contract(case['contract'],case['value'])==case['value']
    else:
        with pytest.raises(ValidationError) as caught:validate_contract(case['contract'],case['value'])
        if 'code' in case:
            assert caught.value.issues[0]['code']==case['code']
            assert caught.value.issues[0]['path']==case['path']
