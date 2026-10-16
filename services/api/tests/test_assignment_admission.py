"""Admission pins the authorized published revision across slow compilation."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from app.config import Settings
from app.services.assignments import AssignmentService
from app.services.auth import AuthService,AuthError
from app.services.experiments import ExperimentManager
from app.services.persistence import Repository
from test_assignment_documents import setup
from test_lab_lifecycle import LabGateway,DeferredJobs,assignment


@pytest.mark.parametrize('change',['unpublish','publish','draft','revoke'])
def test_final_admission_rechecks_the_revision_and_visibility_in_the_insert_transaction(tmp_path,change):
    url='sqlite:///'+(tmp_path/'admission.sqlite').as_posix()
    repo,auth,service,admin,login=setup(url);teacher,student=login('teacher'),login('student')
    service.create(teacher,assignment());service.publish(teacher,'a1',{'base_revision':1,'published':True})
    independent=Repository(url);other_auth=AuthService(independent,Settings());other=AssignmentService(independent,other_auth)
    manager=ExperimentManager(repo,LabGateway(),submit=DeferredJobs(),control_session_active=auth.session_active,
        authorize_session=auth.require_principal_session,assignment_resolver=service.resolve_snapshot,
        authorize_assignment=service.authorize_snapshot)
    entered,release=Event(),Event();original=manager.compiler.compile
    def compile(*args):
        result=original(*args);entered.set();assert release.wait(5);return result
    manager.compiler.compile=compile
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending=executor.submit(manager.create,student.owner_id,{'station_id':'p1','assignment_id':'a1'},
            operation_key='one-create',auth_session_id=student.session_id)
        try:
            assert entered.wait(3)
            if change=='revoke':other_auth.logout(student)
            elif change=='draft':
                edited=assignment();edited['title']='A future draft'
                other.save(teacher,'a1',{'base_revision':2,'definition':edited})
            else:other.publish(teacher,'a1',{'base_revision':2,'published':change=='publish'})
        finally:release.set()
        if change=='draft':
            result=pending.result(timeout=5);stored=repo.get_experiment(result['experiment_id'])
            assert stored['_assignment_reference']=={'assignment_id':'a1','revision':2}
            assert stored['_assignment_snapshot']==assignment()
            assert '_assignment_reference' not in result
        else:
            with pytest.raises((AuthError,ValueError),match='FORBIDDEN|ASSIGNMENT_CHANGED|SESSION_EXPIRED'):pending.result(timeout=5)
            assert repo.list_experiments(student.owner_id)==[]
            with pytest.raises(KeyError):repo.operation(student.owner_id,'create','one-create')
    manager.close();repo.close();independent.close()
