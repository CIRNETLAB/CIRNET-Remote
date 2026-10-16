"""Document application boundary; validation preserves every canonical graph value."""
import json
from contracts.registry import validate_contract
from app.services.project_repository import ProjectRepository,RevisionConflict

MAX_DOCUMENT_BYTES=2_000_000

class ProjectService(ProjectRepository):
    def _request(self,name,payload):
        value=validate_contract(name,payload,profile='structural')
        if 'name' in value and not value['name'].strip(): raise ValueError('INVALID_NAME')
        if 'graph' in value:
            try: raw=json.dumps(value['graph'],ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
            except (ValueError,TypeError,UnicodeError): raise ValueError('INVALID_GRAPH_JSON') from None
            if len(raw)>MAX_DOCUMENT_BYTES: raise ValueError('DOCUMENT_TOO_LARGE')
        return value

    def create_project(self,owner,payload,*,auth_session_id=None): return self.create_project_record(owner,self._request('ProjectCreate',payload),auth_session_id=auth_session_id)
    def update_project(self,owner,project_id,payload,*,auth_session_id=None): return self.update_project_record(owner,project_id,self._request('ProjectUpdate',payload),auth_session_id=auth_session_id)
    def delete_project(self,owner,project_id,base_revision,*,auth_session_id=None):
        value=self._request('ProjectDelete',{'base_revision':base_revision})
        return self.delete_project_record(owner,project_id,value['base_revision'],auth_session_id=auth_session_id)
    def create_circuit(self,owner,project_id,payload,*,auth_session_id=None): return self.create_circuit_record(owner,project_id,self._request('CircuitCreate',payload),auth_session_id=auth_session_id)
    def save_circuit(self,owner,document_id,payload,*,auth_session_id=None): return self.save_circuit_record(owner,document_id,self._request('CircuitSave',payload),auth_session_id=auth_session_id)
    def delete_circuit(self,owner,document_id,base_revision,*,auth_session_id=None):
        value=self._request('CircuitDelete',{'base_revision':base_revision})
        return self.delete_circuit_record(owner,document_id,value['base_revision'],auth_session_id=auth_session_id)
    def resolve_snapshot(self,owner,document_id,revision):
        validate_contract('CircuitDelete',{'base_revision':revision},profile='structural')
        return self.get_circuit(owner,document_id,revision=revision)
