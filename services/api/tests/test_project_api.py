from copy import deepcopy
from fastapi.testclient import TestClient
import pytest
from app.main import create_app
from app.services.persistence import Repository
from test_lab_lifecycle import LabGateway,DeferredJobs
from test_project_repository import graph


@pytest.fixture
def project_app(tmp_path):
    return create_app(repository=Repository('sqlite:///'+(tmp_path/'api.sqlite').as_posix()),gateway=LabGateway(),submit=DeferredJobs())


def headers(client):
    session=client.get('/api/auth/session')
    assert session.status_code==200
    return {'Origin':'http://testserver','X-CSRF-Token':session.json()['csrf_token']}


def test_project_canonical_issue_retains_field_pointer_and_profile(project_app):
    with TestClient(project_app) as client:
        response=client.post('/api/projects',json={'name':17},headers=headers(client))
        assert response.status_code==422
        body=response.json()
        assert body['code']=='REQUEST_VALIDATION_ERROR'
        assert body['issues'][0]['code']=='SCHEMA_TYPE'
        assert body['issues'][0]['path']=='/body/name'
        assert body['issues'][0]['profile']=='structural'
        assert '17' not in body['message'] and '17' not in body['issues'][0]['message']


def test_project_http_roundtrip_conflict_save_as_and_private_owner_scope(project_app):
    with TestClient(project_app) as owner,TestClient(project_app) as stranger:
        headers(stranger)  # A browser explicitly bootstraps before owned-resource reads.
        created=owner.post('/api/projects',json={'name':'Project'},headers=headers(owner))
        assert created.status_code==201,created.text
        project=created.json(); assert created.headers['ETag']=='"1"'
        payload={'name':'Saved circuit','graph':graph()}
        created=owner.post('/api/projects/'+project['project_id']+'/circuits',json=payload,headers=headers(owner))
        assert created.status_code==201,created.text
        document=created.json(); document_id=document['document_id']
        assert document['graph']==payload['graph'] and document_id!=document['graph']['circuit_id']
        assert owner.get('/api/circuits/'+document_id).json()==document
        candidate=deepcopy(payload); candidate['name']='Updated'; candidate['graph']['metadata']['revision-note']='new'
        saved=owner.put('/api/circuits/'+document_id,json={**candidate,'base_revision':1},headers=headers(owner))
        assert saved.status_code==200 and saved.json()['revision']==2
        stale=owner.put('/api/circuits/'+document_id,json={**payload,'base_revision':1},headers=headers(owner))
        assert stale.status_code==409,stale.text
        assert stale.json()['code']=='REVISION_CONFLICT' and stale.json()['current_revision']==2
        assert owner.get('/api/circuits/'+document_id).json()['graph']==candidate['graph']
        copied=owner.post('/api/projects/'+project['project_id']+'/circuits',json=candidate,headers=headers(owner))
        assert copied.status_code==201 and copied.json()['document_id']!=document_id
        assert copied.json()['graph']==candidate['graph']
        assert stranger.get('/api/projects').json()['items']==[]
        assert stranger.get('/api/projects/'+project['project_id']).status_code==403
        assert stranger.get('/api/circuits/'+document_id).status_code==403
        assert stranger.request('DELETE','/api/circuits/'+document_id,json={'base_revision':2},headers=headers(stranger)).status_code==403
        assert owner.get('/api/projects?limit=0').status_code==422


def test_invalid_project_mutations_do_not_create_records_or_lose_existing_graph(project_app):
    with TestClient(project_app) as client:
        assert client.post('/api/projects',json={'name':'Unauthorized'}).status_code==403
        project=client.post('/api/projects',json={'name':'Project'},headers=headers(client)).json()
        created=client.post('/api/projects/'+project['project_id']+'/circuits',json={'name':'Circuit','graph':graph()},headers=headers(client))
        assert created.status_code==201
        document=created.json(); bad=graph(); bad['schema_version']=1.0
        response=client.put('/api/circuits/'+document['document_id'],json={'base_revision':1,'name':'Bad','graph':bad},headers=headers(client))
        assert response.status_code==422
        assert client.get('/api/circuits/'+document['document_id']).json()==document


@pytest.mark.parametrize('version',['1.0','1.1'])
def test_http_storage_preserves_legacy_structural_integer_representation(project_app,version):
    with TestClient(project_app) as client:
        project=client.post('/api/projects',json={'name':'Legacy storage'},headers=headers(client)).json()
        original=graph(); original['schema_version']=version
        original['modules'][0]['position']['x']=10**400
        original['modules'][0]['opaque_extension']={'keep':[None,True,1,2.5]}
        response=client.post('/api/projects/'+project['project_id']+'/circuits',json={'name':'Legacy graph','graph':original},headers=headers(client))
        assert response.status_code==201,response.text
        stored=response.json()
        assert stored['graph']==original and type(stored['graph']['modules'][0]['position']['x']) is int
        assert client.get('/api/circuits/'+stored['document_id']).json()['graph']==original


def test_label_unicode_pose_and_visual_board_association_survive_api_save_reopen_and_revisions(project_app):
    from contracts.label_properties import DEFAULT_LABEL_PROPERTIES
    original = dict(schema_version='1.2', circuit_id='visual-annotation', modules=[
        dict(id='B', type='BREADBOARD', position=dict(x=2,y=0,z=3), rotation=37),
        dict(id='L', type='LABEL', position=dict(x=2.5,y=.348,z=3.2), rotation=127,
             properties={**DEFAULT_LABEL_PROPERTIES,'text':'Điện trở < 1 kΩ\nNguồn 5 V','boardId':'B'}),
    ], connections=[], metadata={'note':'ordinary document history'})
    with TestClient(project_app) as client:
        project = client.post('/api/projects',json={'name':'Notes'},headers=headers(client)).json()
        response = client.post('/api/v2/projects/'+project['project_id']+'/circuits',json={'name':'Annotated','graph':original},headers=headers(client))
        assert response.status_code == 201, response.text
        saved = response.json(); assert saved['graph'] == original
        assert client.get('/api/v2/circuits/'+saved['document_id']).json()['graph'] == original
        edited = deepcopy(original)
        edited['modules'][1]['properties']['text'] = '<script>alert("plain text")</script>\nĐổi nhãn'
        edited['modules'][1]['rotation'] = 217
        response = client.put('/api/v2/circuits/'+saved['document_id'],json={'base_revision':1,'name':'Edited','graph':edited},headers=headers(client))
        assert response.status_code == 200 and response.json()['revision'] == 2, response.text
        assert client.get('/api/v2/circuits/'+saved['document_id']).json()['graph'] == edited
        invalid = deepcopy(edited); invalid['modules'][1]['properties']['fontSizeMm'] = 100
        response = client.put('/api/v2/circuits/'+saved['document_id'],json={'base_revision':2,'name':'Bad','graph':invalid},headers=headers(client))
        assert response.status_code == 422, response.text
        assert client.get('/api/v2/circuits/'+saved['document_id']).json()['graph'] == edited
