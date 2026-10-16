from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import pytest
from sqlalchemy import select,update
from app.config import Settings
from app.services.auth import AuthService,AuthError
from app.services.persistence import Repository
from app.services.projects import RevisionConflict

PASSWORD='a sufficiently long test password'

def definition(identity='assignment',title='Original'):
    return {'schema_version':'1.0','assignment_id':identity,'title':title,'lab_endpoints':[{'endpoint_id':'UNRESOLVED','role':'INPUT_SOURCE'}],
            'assessment_policy':'FUNCTIONAL_ONLY','reference_design_graph':{'schema_version':'1.0','circuit_id':'reference','modules':[],'connections':[],'metadata':{'private-answer':'keep'}},
            'expected_behavior':{'truth_table':[{'inputs':{'A':0},'outputs':{'Y':1}}]}}

def setup(url='sqlite://'):
    from app.services.assignments import AssignmentService
    repo=Repository(url);auth=AuthService(repo,Settings());guest,_=auth.ensure_session(None)
    auth.bootstrap_admin('admin',PASSWORD);admin,_=auth.login(guest,'admin',PASSWORD)
    for name,role in [('teacher','INSTRUCTOR'),('other','INSTRUCTOR'),('student','STUDENT')]:
        auth.create_user(name,PASSWORD,role=role,actor=admin)
    def login(name):
        context,_=auth.ensure_session(None);return auth.login(context,name,PASSWORD)[0]
    return repo,auth,AssignmentService(repo,auth),admin,login

def test_editing_a_published_assignment_keeps_student_and_execution_content_stable_until_publication():
    repo,auth,service,admin,login=setup();teacher,student=login('teacher'),login('student')
    created=service.create(teacher,definition());assert created['revision']==1 and created['published_revision'] is None
    with pytest.raises(AuthError):service.legacy_view(student,'assignment')
    published=service.publish(teacher,'assignment',{'base_revision':1,'published':True})
    assert published['revision']==published['published_revision']==2
    changed=definition(title='Unpublished revision')
    saved=service.save(teacher,'assignment',{'base_revision':2,'definition':changed})
    assert saved['revision']==3 and saved['published_revision']==2
    public=service.legacy_view(student,'assignment')
    assert public['title']=='Original' and 'expected_behavior' not in public and 'reference_design_graph' not in public
    assert public['lab_endpoints']==[{'endpoint_id':'UNRESOLVED','role':'INPUT_SOURCE'}]
    assert 'revision' not in public and public['document_kind']=='student'
    assert service.resolve_snapshot(student.owner_id,'assignment')['definition']==definition()
    assert service.resolve_snapshot(teacher.owner_id,'assignment')=={'definition':changed,'revision':3}
    service.publish(teacher,'assignment',{'base_revision':3,'published':True,'feedback_policy':'detailed'})
    assert service.legacy_view(student,'assignment')['title']=='Unpublished revision'
    with repo.engine.connect() as db:
        assert db.execute(select(repo.assignment_revisions.c.revision)).scalars().all()==[1,2,3,4]

def test_authoring_is_private_for_students_other_instructors_and_stale_role_contexts():
    repo,auth,service,admin,login=setup();teacher,other,student=login('teacher'),login('other'),login('student')
    service.create(teacher,definition())
    for actor in (other,student):
        with pytest.raises(AuthError,match='FORBIDDEN'):service.get_document(actor,'assignment')
        with pytest.raises(AuthError,match='FORBIDDEN'):service.save(actor,'assignment',{'base_revision':1,'definition':definition()})
    assert service.get_document(admin,'assignment')['owner_id']==teacher.owner_id
    service.publish(admin,'assignment',{'base_revision':1,'published':True})
    with repo.engine.connect() as db:
        actions=set(db.execute(select(repo.audit.c.action).where(repo.audit.c.actor_id==admin.owner_id)).scalars())
        assert {'ASSIGNMENT_ADMIN_READ','ASSIGNMENT_ADMIN_PUBLICATION'}<=actions
    auth.update_user(teacher.owner_id,{'role':'STUDENT'},actor=admin)
    with pytest.raises(AuthError,match='SESSION_EXPIRED'):service.save(teacher,'assignment',{'base_revision':2,'definition':definition()})

def test_two_independent_authoring_writers_have_one_cas_winner(tmp_path):
    from app.services.assignments import AssignmentService
    url='sqlite:///'+(tmp_path/'assignment-cas.sqlite').as_posix()
    repo,auth,service,admin,login=setup(url);teacher=login('teacher');service.create(teacher,definition())
    other_repo=Repository(url);other=AssignmentService(other_repo,AuthService(other_repo,Settings()));barrier=Barrier(2)
    def save(pair):
        writer,title=pair;barrier.wait(5)
        try:return writer.save(teacher,'assignment',{'base_revision':1,'definition':definition(title=title)})
        except RevisionConflict as error:return error
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(save,[(service,'First'),(other,'Second')]))
    assert sum(isinstance(value,dict) for value in results)==1
    assert [value.current_revision for value in results if isinstance(value,RevisionConflict)]==[2]
    assert service.get_document(teacher,'assignment')['revision']==2

def test_snapshot_final_authorization_rejects_privatization_and_changed_selected_revision():
    repo,auth,service,admin,login=setup();teacher,student=login('teacher'),login('student')
    service.create(teacher,definition());service.publish(teacher,'assignment',{'base_revision':1,'published':True})
    snapshot=service.resolve_snapshot(student.owner_id,'assignment')
    with repo.engine.begin() as db:
        current=auth.require_principal_session(db,student.session_id,student.owner_id)
        assert service.authorize_snapshot(db,current,'assignment',snapshot['revision'],snapshot['definition'])=={'assignment_id':'assignment','revision':2}
    service.publish(teacher,'assignment',{'base_revision':2,'published':False})
    with repo.engine.begin() as db:
        current=auth.require_principal_session(db,student.session_id,student.owner_id)
        with pytest.raises(AuthError,match='FORBIDDEN'):service.authorize_snapshot(db,current,'assignment',2,definition())
    service.publish(teacher,'assignment',{'base_revision':3,'published':True})
    with repo.engine.begin() as db:
        current=auth.require_principal_session(db,student.session_id,student.owner_id)
        with pytest.raises(ValueError,match='ASSIGNMENT_CHANGED'):service.authorize_snapshot(db,current,'assignment',2,definition())

def test_authoring_rejects_identity_changes_and_preserves_a_maximum_revision():
    repo,auth,service,admin,login=setup();teacher=login('teacher');service.create(teacher,definition())
    with pytest.raises(ValueError,match='ASSIGNMENT_ID_MISMATCH'):service.save(teacher,'assignment',{'base_revision':1,'definition':definition('different')})
    maximum=9007199254740991
    with repo.engine.begin() as db:
        row=dict(db.execute(select(repo.assignment_revisions)).mappings().one())
        from sqlalchemy import insert
        db.execute(insert(repo.assignment_revisions).values(**{**row,'revision':maximum}))
        db.execute(update(repo.assignment_documents).values(revision=maximum))
    for operation in (lambda:service.save(teacher,'assignment',{'base_revision':maximum,'definition':definition()}),
                      lambda:service.publish(teacher,'assignment',{'base_revision':maximum,'published':True})):
        with pytest.raises(ValueError,match='REVISION_LIMIT_REACHED'):operation()

def test_authoring_pages_are_bounded_and_never_list_foreign_private_documents():
    repo,auth,service,admin,login=setup();teacher,other=login('teacher'),login('other')
    for number in range(3):service.create(teacher,definition('assignment'+str(number)))
    service.create(other,definition('foreign'))
    first=service.list_documents(teacher,limit=2)
    second=service.list_documents(teacher,limit=2,cursor=first['next_cursor'])
    assert len(first['items'])==2 and len(second['items'])==1 and second['next_cursor'] is None
    assert all('definition' not in item for item in first['items'])
    assert {item['assignment_id'] for item in first['items']+second['items']}=={'assignment0','assignment1','assignment2'}
    with pytest.raises(ValueError,match='INVALID_CURSOR'):service.list_documents(other,cursor=first['next_cursor'])
