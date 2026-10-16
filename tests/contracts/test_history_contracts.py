import json
from pathlib import Path
import pytest
from jsonschema import ValidationError
from contracts.registry import validate_contract
from contracts.semantic_profiles import validation_issues

CASES=json.loads((Path(__file__).resolve().parents[2]/'contracts/fixtures/history-conformance.json').read_text(encoding='utf-8'))['cases']

@pytest.mark.parametrize('name',['ExperimentHistoryPage','ExperimentActiveSnapshot'])
@pytest.mark.parametrize('case',CASES,ids=lambda case:case['id'])
def test_shared_history_conformance(name,case):
    if case['valid']:assert validate_contract(name,case['value'],profile='transport')==case['value']
    else:
        with pytest.raises(ValidationError) as failure:validate_contract(name,case['value'],profile='transport')
        assert any(issue['code']==case['code'] and issue['path']==case['path'] for issue in validation_issues(failure.value))
