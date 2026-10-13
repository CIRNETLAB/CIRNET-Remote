"""Policy affects reported grade, while the same safe executable circuit runs."""
import pytest
from test_lab_lifecycle import assignment,setup_manager
from contracts.validation import validate


@pytest.mark.parametrize('policy,grade',[
    ('STRICT_TOPOLOGY','FAIL'),('FUNCTIONAL_ONLY','PASS'),('TOPOLOGY_AND_FUNCTION','FAIL'),
])
def test_manager_reports_policy_grade_without_changing_run_permission(tmp_path,policy,grade):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    a=assignment(); a.update(assignment_id=policy,assessment_policy=policy)
    a['expected_behavior']['expected_signals'][0]['value']=1
    repo.create_assignment(a)
    e=m.create('student-1',{'station_id':'p1','assignment_id':policy})
    m.run(e['experiment_id'],'student-1'); jobs.run_one()
    record=m.get(e['experiment_id'],'student-1')
    assert record['execution_decision']['decision']=='RUN_NORMAL'
    assert record['topology_verification']['status']=='MISMATCH'
    assert record['functional_verification']['status']=='PASS'
    assert record['assessment']['policy']==policy and record['assessment']['status']==grade
    assert validate('ExperimentRecord',record)==record


def test_assessment_result_serializes_independently_from_safety_and_function():
    value={'schema_version':'1.0','policy':'STRICT_TOPOLOGY','status':'FAIL',
           'topology_evaluated':True,'function_evaluated':False,'issues':['Missing component']}
    assert validate('AssessmentResult',value)==value
