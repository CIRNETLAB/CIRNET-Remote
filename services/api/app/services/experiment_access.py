"""Apply assignment disclosure policy to every public experiment snapshot.

Stored evidence and verification algorithms remain complete. Redaction affects
HTTP, operation recovery and realtime identically through the manager's one
public projection, rather than trusting individual route/UI consumers.
"""
from copy import deepcopy
from sqlalchemy import select


class ExperimentAccessProjection:
    def __init__(self,repository): self.repo=repository

    def __call__(self,record,owner):
        assignment_id=record.get('assignment_id')
        if not assignment_id: return record
        try: policy=self.repo.assignment_policy(assignment_id)
        except KeyError: policy=None
        with self.repo.lock,self.repo.engine.connect() as db:
            users=self.repo.auth_users
            user=db.execute(select(users.c.role,users.c.active).where(users.c.principal_id==owner)).mappings().first()
        privileged=bool(user and user['active'] and (user['role']=='ADMIN'
            or user['role']=='INSTRUCTOR' and policy and policy['owner_id']==owner))
        if privileged or policy and policy['feedback_policy']=='detailed': return record
        value=deepcopy(record)
        value['topology_resolution']=None
        note='Detailed assignment feedback is restricted by the instructor.'
        for field,observed in (
            ('topology_verification',{'observed_signals','unknown_components'}),
            ('functional_verification',{'observed_signals','observed_truth_table'}),
            ('assessment',{'policy','topology_evaluated','function_evaluated'})):
            evidence=value.get(field)
            if evidence is not None:
                value[field]={key:child for key,child in evidence.items() if key in {'schema_version','status'}|observed}
                value[field]['issues']=[note]
        return value
