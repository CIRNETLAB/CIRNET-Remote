"""Single API-worker FIFO scheduler and owner-scoped Lab-First orchestration."""
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event, RLock
import time
import uuid
from jsonschema import ValidationError
from contracts.validation import validate
from app.services.circuit_validator import validate_circuit_graph
from app.services.execution_policy import ExecutionPolicy
from app.services.verification import SafetyVerificationService, TopologyVerificationService, FunctionalVerificationService, result
from app.services.lab_compiler import LabExecutionCompiler
from app.services.captures import CaptureService
from app.services.hardware_client import GatewayError

TERMINAL={'COMPLETE','FAULT'}


class Cancelled(Exception): pass


class ExperimentManager:
    def __init__(self,repository,gateway,*,submit=None,clock=time.time,lease_seconds=120,emit=None):
        self.repo,self.gateway=repository,gateway
        self.clock,self.lease_seconds=clock,lease_seconds
        self.emit=emit or (lambda owner,event:None)
        self.lock=RLock(); self.queues=defaultdict(deque); self.cancel={}; self.rate={}
        self.executor=ThreadPoolExecutor(max_workers=4) if submit is None else None
        self.submit=submit or self.executor.submit
        self.closed=False
        self.policy=ExecutionPolicy(); self.compiler=LabExecutionCompiler()
        self.safety=SafetyVerificationService(); self.topology=TopologyVerificationService()
        self.functional=FunctionalVerificationService(); self.captures=CaptureService()
        self._recover()

    def _recover(self):
        for lease in self.repo.leases():
            eid=lease['experiment_id']; e=self.repo.get_experiment(eid)
            try:
                reply=self.gateway.call(e['station_id'],eid,'stop_execution')
                safe=reply.get('accepted') is True and (e['mode']=='simulation' or reply.get('hardware_applied') is True)
            except Exception: safe=False
            if safe: self.repo.release(eid)
            else: self.repo.quarantine(eid)
            self._transition(eid,'FAULT',error_code='RESTART_RECOVERY',lease_expires_at=None)
        for e in self.repo.list_experiments():
            if e['state']=='QUEUED': self.queues[e['station_id']].append(e['experiment_id'])

    def _public(self,e):
        return deepcopy({k:v for k,v in e.items() if not k.startswith('_')})

    def get(self,eid,owner):
        e=self.repo.get_experiment(eid,owner)
        e['queue_position']=(list(self.queues[e['station_id']]).index(eid)+1) if eid in self.queues[e['station_id']] else None
        return self._public(e)

    def list(self,owner):
        return [self.get(e['experiment_id'],owner) for e in self.repo.list_experiments(owner)]

    def queue(self,station_id):
        with self.lock: return list(self.queues[station_id])

    def create(self,owner,payload):
        allowed={'station_id','assignment_id','circuit_graph','capture_config','test_vectors','clock_config','generator_config'}
        if not isinstance(payload,dict) or set(payload)-allowed or not isinstance(payload.get('station_id'),str) or not payload['station_id']:
            raise ValueError('INVALID_CONFIGURATION')
        caps=validate('StationCapabilities',self.gateway.capabilities(payload['station_id']))
        assignment=self.repo.get_assignment(payload['assignment_id']) if payload.get('assignment_id') else None
        graph=payload.get('circuit_graph')
        if caps['mode']=='simulation':
            valid,code,_=validate_circuit_graph(graph)
            if not valid: raise ValueError(code)
        elif assignment is None: raise ValueError('ASSIGNMENT_REQUIRED')
        eid=uuid.uuid4().hex
        e={'schema_version':'1.0','experiment_id':eid,'circuit_id':graph.get('circuit_id',eid) if isinstance(graph,dict) else eid,
           'station_id':caps['station_id'],'assignment_id':assignment['assignment_id'] if assignment else None,
           'mode':caps['mode'],'state':'CREATED','state_history':['CREATED'],'execution_decision':None,
           'safety_verification':None,'topology_verification':None,'functional_verification':result('NOT_EVALUATED'),
           'capture':None,'error_code':None,'queue_position':None,'lease_expires_at':None,
           '_circuit_graph':deepcopy(graph),'_configuration':{k:deepcopy(v) for k,v in payload.items() if k not in {'station_id','assignment_id','circuit_graph'}},
           '_capabilities':caps}
        # Validate requested clock/vector/capture fields at admission, before storing.
        if caps['mode']=='simulation': self.compiler.compile(e,assignment,caps)
        else:
            config_probe=deepcopy(e); config_probe['_capabilities']={**caps,'mode':'simulation'}
            self.compiler.compile(config_probe,assignment,{**caps,'mode':'simulation'})
        self.repo.create_experiment(owner,e)
        return self.get(eid,owner)

    def _transition(self,eid,state,**values):
        with self.lock:
            e=self.repo.get_experiment(eid)
            if e['state']!=state: e['state_history'].append(state)
            e.update(state=state,**values)
            self.repo.save_experiment(e)
            self.emit(self.repo.owner(eid),{'type':'experiment.updated','experiment':self._public(e)})
            return e

    def run(self,eid,owner):
        with self.lock:
            if self.closed: raise ValueError('UNAVAILABLE')
            e=self.repo.get_experiment(eid,owner)
            if e['state'] not in {'CREATED'}:
                if e['state'] not in TERMINAL: return self.get(eid,owner)
                raise ValueError('INVALID_STATE')
            if self.clock()-self.rate.get(owner,float('-inf'))<1:
                raise ValueError('RATE_LIMITED')
            if any(x['state'] not in TERMINAL|{'CREATED'} for x in self.repo.list_experiments(owner)):
                raise ValueError('RESOURCE_CONFLICT')
            if len(self.queues[e['station_id']])>=50: raise ValueError('QUEUE_FULL')
            self.rate[owner]=self.clock(); self.cancel[eid]=Event()
            self.queues[e['station_id']].append(eid)
            self._transition(eid,'QUEUED'); self._dispatch(e['station_id'])
            return self.get(eid,owner)

    def _dispatch(self,station_id):
        if self.closed: return
        queue=self.queues[station_id]
        while queue:
            e=self.repo.get_experiment(queue[0]); caps=e['_capabilities']
            # Physical v1 has a single shared fabric; future partitions need distinct station IDs.
            capacity=4 if e['mode']=='simulation' else 1
            occupied={l['slot'] for l in self.repo.leases() if l['station_id']==station_id}
            slot=next((n for n in range(capacity) if n not in occupied),None)
            if slot is None: return
            eid=queue[0]; expiry=self.clock()+self.lease_seconds
            if not self.repo.reserve(station_id,slot,eid,expiry): return
            self.cancel.setdefault(eid,Event())
            queue.popleft(); self._transition(eid,'RESERVED',lease_expires_at=expiry)
            self.submit(self._execute,eid)

    def _check_cancel(self,eid):
        if self.cancel.get(eid) and self.cancel[eid].is_set(): raise Cancelled()

    def _call(self,eid,method,**kwargs):
        self._check_cancel(eid)
        e=self.repo.get_experiment(eid)
        reply=self.gateway.call(e['station_id'],eid,method,**kwargs)
        if reply.get('accepted') is False: raise GatewayError(reply.get('code','DRIVER_ERROR'))
        return reply

    def _execute(self,eid):
        touched=False
        try:
            self._check_cancel(eid)
            e=self.repo.get_experiment(eid); assignment=self.repo.get_assignment(e['assignment_id']) if e['assignment_id'] else None
            caps=validate('StationCapabilities',self.gateway.capabilities(e['station_id']))
            supported=caps['available'] and (caps['virtual_digital'] if e['mode']=='simulation' else caps['physical_digital'] and caps['physical_execution_slots']>=1)
            if not supported:
                self._transition(eid,'COMPLETE',execution_decision={'schema_version':'1.0','decision':'BLOCK_UNEXECUTABLE','reasons':['Station unavailable or capability unsupported']})
                return
            self._transition(eid,'SAFE_STATE'); touched=True; self._call(eid,'enter_safe_state')
            if e['mode']=='hardware':
                self._transition(eid,'TOPOLOGY_SCAN'); graph=self._call(eid,'scan_topology')
                self._transition(eid,'SAFETY_CHECK'); safety=self.safety.verify(self._call(eid,'read_runtime_safety'))
                topology=self.topology.verify(assignment,graph)
                unknown=any(c['identity']=='UNKNOWN' or c['kind']=='OPAQUE_PHYSICAL_COMPONENT' for c in graph['components'])
            else:
                safety=result('SAFE',['Virtual execution; no electrical energization'])
                topology=result('UNKNOWN',['Physical topology scan not applicable'])
                unknown=False
                self._call(eid,'apply_circuit',circuit_graph=e['_circuit_graph'])
            try: plan=self.compiler.compile(e,assignment,caps); executable=True
            except (ValueError,ValidationError): plan=None; executable=False
            decision=self.policy.decide(safety,executable,unknown)
            self._transition(eid,'EXECUTION_DECISION',safety_verification=safety,topology_verification=topology,execution_decision=decision)
            if decision['decision'].startswith('BLOCK_'):
                self._transition(eid,'COMPLETE'); return
            self._transition(eid,'ROUTE_PREPARE'); self._call(eid,'prepare_execution',plan=plan,decision=decision)
            self._call(eid,'apply_routing')
            self._transition(eid,'GUARDED_POWER_UP'); self._call(eid,'guarded_power_up')
            self._call(eid,'arm_capture',configuration=plan['capture_config'])
            self._transition(eid,'RUNNING'); self._call(eid,'start_execution')
            self._transition(eid,'CAPTURING'); capture=self.captures.normalize(self._call(eid,'read_capture'),e['mode'])
            self._transition(eid,'FUNCTIONAL_VERIFY',capture=capture)
            functional=self.functional.verify(assignment,capture)
            self._transition(eid,'COMPLETE',functional_verification=functional)
        except Cancelled:
            self._transition(eid,'COMPLETE')
        except Exception as error:
            self._transition(eid,'FAULT',error_code=error.code if isinstance(error,GatewayError) else 'DRIVER_ERROR')
        finally:
            e=self.repo.get_experiment(eid)
            safe=not touched
            if touched:
                try:
                    reply=self.gateway.call(e['station_id'],eid,'stop_execution')
                    safe=reply.get('accepted') is True and (e['mode']=='simulation' or reply.get('hardware_applied') is True)
                except Exception: safe=False
            with self.lock:
                if safe: self.repo.release(eid)
                else:
                    self.repo.quarantine(eid)
                    self._transition(eid,'FAULT',error_code='SAFE_STATE_FAILED')
                self.cancel.pop(eid,None)
                self._transition(eid,self.repo.get_experiment(eid)['state'],lease_expires_at=None)
                self._dispatch(e['station_id'])

    def stop(self,eid,owner,code='STOPPED'):
        with self.lock:
            e=self.repo.get_experiment(eid,owner)
            if e['state'] in TERMINAL: return self.get(eid,owner)
            if eid in self.queues[e['station_id']]:
                self.queues[e['station_id']].remove(eid)
                self.cancel.pop(eid,None)
                self._transition(eid,'COMPLETE',error_code=code)
            elif eid in self.cancel:
                self.cancel[eid].set()
                self._transition(eid,'STOPPING',error_code=code)
                # Interrupt actual hardware immediately; slot is released by worker only after acknowledged cleanup.
                try: self.gateway.call(e['station_id'],eid,'stop_execution')
                except Exception: pass
            else: self._transition(eid,'COMPLETE',error_code=code)
            return self.get(eid,owner)

    def disconnect(self,owner):
        for e in self.repo.list_experiments(owner):
            if e['state'] not in TERMINAL|{'CREATED'}: self.stop(e['experiment_id'],owner,'DISCONNECTED')

    def expire_leases(self):
        for lease in self.repo.leases():
            if not lease['quarantined'] and lease['expires_at']<=self.clock():
                eid=lease['experiment_id']; self.stop(eid,self.repo.owner(eid),'TIMEOUT')

    def close(self):
        if self.closed: return
        self.closed=True
        for owner in {self.repo.owner(e['experiment_id']) for e in self.repo.list_experiments()}:
            self.disconnect(owner)
        if self.executor: self.executor.shutdown(wait=True,cancel_futures=False)
