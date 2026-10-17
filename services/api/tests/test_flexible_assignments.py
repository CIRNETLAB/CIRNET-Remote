"""Flexible reference authoring keeps immutable revisions and disclosure policy."""
from copy import deepcopy

from fastapi.testclient import TestClient
from test_auth_security import security_application, browser_headers, login
from test_flexible_api import graph


def definition():
    return {'schema_version':'2.0','assignment_id':'flex-reference','title':'Flexible reference',
            'lab_endpoints':[],'assessment_policy':'FUNCTIONAL_ONLY','reference_design_graph':graph(),
            'expected_behavior':{'truth_table':[{'inputs':{'x':0},'outputs':{'y':1}}]}}


def test_assignment_v2_authoring_preserves_flexible_reference_and_published_snapshot(security_application):
    with TestClient(security_application) as teacher,TestClient(security_application) as student:
        login(teacher,'teacher');login(student,'alice')
        original=definition();path='/api/v2/assignment-documents/flex-reference'
        created=teacher.post('/api/v2/assignment-documents',json={'definition':original},headers=browser_headers(teacher))
        assert created.status_code==201,created.text
        assert created.json()['schema_version']=='2.0' and created.json()['definition']==original
        assert teacher.get(path).json()==created.json()
        page=teacher.get('/api/v2/assignment-documents').json()
        assert page['schema_version']=='2.0' and page['items'][0]['assignment_id']=='flex-reference'
        assert 'definition' not in page['items'][0]
        assert teacher.get('/api/assignment-documents').status_code==422
        assert student.get(path).status_code==403
        assert student.get('/api/v2/assignment-documents').status_code==403
        assert student.post('/api/v2/assignment-documents',json={'definition':{**original,'assignment_id':'forbidden'}},headers=browser_headers(student)).status_code==403
        legacy=teacher.get('/api/assignment-documents/flex-reference')
        assert legacy.status_code==422 and legacy.json()['code']=='UNSUPPORTED_DOCUMENT_VERSION'
        assert teacher.get('/api/assignments/flex-reference').status_code==422
        published=teacher.patch(path+'/publication',json={'base_revision':1,'published':True},headers=browser_headers(teacher))
        assert published.status_code==200,published.text
        public=student.get('/api/v2/assignments/flex-reference')
        assert public.status_code==200,public.text
        assert public.json()['title']==original['title'] and public.json()['document_kind']=='student'
        assert not {'reference_design_graph','expected_behavior','definition'}&set(public.json())
        assert student.get('/api/v2/assignments').status_code==200
        changed=deepcopy(original);changed['title']='Draft changes';changed['reference_design_graph']['metadata']={'revision':'draft'}
        saved=teacher.put(path,json={'base_revision':2,'definition':changed},headers=browser_headers(teacher))
        assert saved.status_code==200,saved.text
        assert saved.json()['revision']==3 and saved.json()['published_revision']==2
        assert teacher.get(path).json()['definition']==changed
        assert student.get('/api/v2/assignments/flex-reference').json()['title']==original['title']
        stale=teacher.put(path,json={'base_revision':2,'definition':original},headers=browser_headers(teacher))
        assert stale.status_code==409 and stale.json()['current_revision']==3
        # Assignment admission selects the published immutable definition, even while its author edits.
        response=student.post('/api/v2/experiments',json={'station_id':'p1','assignment_id':'flex-reference'},headers=browser_headers(student))
        assert response.status_code==201,response.text
        stored=security_application.state.repository.get_experiment(response.json()['experiment_id'])
        assert stored['_assignment_reference']=={'assignment_id':'flex-reference','revision':2}
        assert stored['_assignment_snapshot']==original
        # A legacy mutation cannot replace a versioned definition, including publication changes.
        rejected=teacher.patch('/api/assignment-documents/flex-reference/publication',json={'base_revision':3,'published':False},headers=browser_headers(teacher))
        assert rejected.status_code==422 and rejected.json()['code']=='UNSUPPORTED_DOCUMENT_VERSION'
        assert teacher.get(path).json()['revision']==3


def test_assignment_v2_rejects_invalid_flexible_reference_atomically(security_application):
    with TestClient(security_application) as teacher:
        login(teacher,'teacher')
        invalid=definition();invalid['reference_design_graph']['modules'][1]['mount']['contacts'][0]['contactId']='missing'
        response=teacher.post('/api/v2/assignment-documents',json={'definition':invalid},headers=browser_headers(teacher))
        assert response.status_code==422,response.text
        assert teacher.get('/api/v2/assignment-documents/flex-reference').status_code==404
