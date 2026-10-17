from copy import deepcopy
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.persistence import Repository
from test_lab_lifecycle import LabGateway,DeferredJobs
from test_project_api import headers


def graph():
    data=json.loads((Path(__file__).resolve().parents[3]/'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))
    return deepcopy(data['cases'][0]['graph'])


def test_flexible_document_uses_explicit_v2_storage_and_roundtrips_without_retagging(tmp_path):
    application=create_app(repository=Repository('sqlite:///'+(tmp_path/'flex.sqlite').as_posix()),gateway=LabGateway(),submit=DeferredJobs())
    with TestClient(application) as client:
        project=client.post('/api/projects',json={'name':'Flexible'},headers=headers(client)).json()
        payload={'name':'R assembly','graph':graph()}
        response=client.post('/api/v2/projects/'+project['project_id']+'/circuits',json=payload,headers=headers(client))
        assert response.status_code==201,response.text
        saved=response.json();assert saved['graph']==payload['graph'] and saved['schema_version']=='2.0'
        identity=saved['document_id']
        assert client.get('/api/v2/circuits/'+identity).json()==saved
        legacy=client.get('/api/circuits/'+identity)
        assert legacy.status_code==422 and legacy.json()['code']=='UNSUPPORTED_DOCUMENT_VERSION'
        updated=deepcopy(payload);updated['graph']['modules'][1]['mount']['bodyPose']['position']['y']+=.1
        result=client.put('/api/v2/circuits/'+identity,json={**updated,'base_revision':1},headers=headers(client))
        assert result.status_code==200 and result.json()['revision']==2
        assert result.json()['graph']==updated['graph']
        invalid=deepcopy(updated);invalid['graph']['modules'][1]['mount']['contacts'][0]['contactId']='invalid'
        assert client.put('/api/v2/circuits/'+identity,json={**invalid,'base_revision':2},headers=headers(client)).status_code==422
        assert client.get('/api/v2/circuits/'+identity).json()['revision']==2
        conflict=client.put('/api/v2/circuits/'+identity,json={**updated,'base_revision':1},headers=headers(client))
        assert conflict.status_code==409 and conflict.json()['current_revision']==2
        assert client.post('/api/circuits/validate',json=graph(),headers=headers(client)).json()['code']=='UNSUPPORTED_SCHEMA_VERSION'
        assert client.post('/api/v2/circuits/validate',json=graph(),headers=headers(client)).json()['valid'] is True
