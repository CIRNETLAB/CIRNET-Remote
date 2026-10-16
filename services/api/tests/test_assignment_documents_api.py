from fastapi.testclient import TestClient
from test_auth_security import security_application,browser_headers,login
from test_assignment_documents import definition

def test_authoring_http_cas_and_publication_keep_frozen_student_view_private(security_application):
    with TestClient(security_application) as teacher,TestClient(security_application) as student:
        login(teacher,'teacher');login(student,'alice')
        original=definition('authoring-http')
        created=teacher.post('/api/assignment-documents',json={'definition':original},headers=browser_headers(teacher))
        assert created.status_code==201,created.text
        document=created.json();assert document['revision']==1 and document['published_revision'] is None
        path='/api/assignment-documents/authoring-http'
        assert student.get(path).status_code==403
        assert student.get('/api/assignment-documents').status_code==403
        assert student.get('/api/assignments/authoring-http').status_code==403
        published=teacher.patch(path+'/publication',json={'base_revision':1,'published':True},headers=browser_headers(teacher))
        assert published.status_code==200,published.text
        assert published.json()['revision']==published.json()['published_revision']==2
        public=student.get('/api/assignments/authoring-http').json()
        assert public['document_kind']=='student' and public['title']=='Original'
        assert not {'definition','reference_design_graph','expected_behavior','revision','owner_id'}&set(public)
        changed=definition('authoring-http','Future draft')
        saved=teacher.put(path,json={'base_revision':2,'definition':changed},headers=browser_headers(teacher))
        assert saved.status_code==200,saved.text
        assert saved.json()['revision']==3 and saved.json()['published_revision']==2
        assert student.get('/api/assignments/authoring-http').json()['title']=='Original'
        stale=teacher.put(path,json={'base_revision':2,'definition':original},headers=browser_headers(teacher))
        assert stale.status_code==409 and stale.json()['current_revision']==3
        assert teacher.get(path).json()['definition']==changed
        published=teacher.patch(path+'/publication',json={'base_revision':3,'published':True,'feedback_policy':'detailed'},headers=browser_headers(teacher))
        assert published.status_code==200 and published.json()['published_revision']==4
        public=student.get('/api/assignments/authoring-http').json()
        assert public['title']=='Future draft' and 'expected_behavior' not in public
        unpublished=teacher.patch(path+'/publication',json={'base_revision':4,'published':False},headers=browser_headers(teacher))
        assert unpublished.status_code==200 and unpublished.json()['published_revision'] is None
        assert student.get('/api/assignments/authoring-http').status_code==403
        legacy=teacher.patch('/api/assignments/authoring-http/publication',json={'published':True},headers=browser_headers(teacher))
        assert legacy.status_code==200 and legacy.json()['document_kind']=='instructor' and 'revision' not in legacy.json()
        assert teacher.get(path).json()['revision']==6

def test_authoring_http_rejects_students_csrf_missing_and_nested_definition_semantics(security_application):
    with TestClient(security_application) as teacher,TestClient(security_application) as student:
        login(teacher,'teacher');login(student,'alice')
        body={'definition':definition('invalid-authoring')}
        assert student.post('/api/assignment-documents',json=body,headers=browser_headers(student)).status_code==403
        assert teacher.post('/api/assignment-documents',json=body,headers={'Origin':'http://testserver'}).status_code==403
        body['definition']['lab_endpoints'].append(dict(body['definition']['lab_endpoints'][0]))
        invalid=teacher.post('/api/assignment-documents',json=body,headers=browser_headers(teacher))
        assert invalid.status_code==422,invalid.text
        assert teacher.get('/api/assignment-documents/invalid-authoring').status_code==404
