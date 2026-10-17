"""Single API-worker FIFO scheduler and owner-scoped Lab-First orchestration."""
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event, RLock
import time
import uuid
from jsonschema import ValidationError
from contracts.validation import validate
from contracts.runtime_config import simulation_worker_count
from contracts.instrument_validation import validate_generator
from app.services.circuit_validator import validate_supported_circuit_graph as validate_circuit_graph
from app.services.execution_policy import ExecutionPolicy
from app.services.assessment import AssessmentService
from app.services.verification import SafetyVerificationService, TopologyVerificationService, FunctionalVerificationService, result
from app.services.lab_compiler import LabExecutionCompiler
from app.services.topology_resolver import TopologyResolver
from app.services.captures import CaptureService
from app.services.hardware_client import GatewayError
from app.services.operations import OperationIdentity
from app.services.execution_errors import Cancelled
from app.services.observability import correlation,current_correlation,log_event

TERMINAL={'COMPLETE','FAULT'}


class ExperimentManager:
    def __init__(self,repository,gateway,*,submit=None,clock=time.time,lease_seconds=120,emit=None,capture_store=None,simulation_workers=None,
                 control_session_active=None,public_projection=None,document_resolver=None,authorize_session=None,
                 assignment_resolver=None,authorize_assignment=None,capture_retention_seconds=2592000):
        self.repo,self.gateway=repository,gateway
        self.clock,self.lease_seconds=clock,lease_seconds
        self.emit=emit or (lambda owner,event:None)
        self.control_session_active=control_session_active
        self.public_projection=public_projection
        self.document_resolver=document_resolver
        self.authorize_session=authorize_session
        self.assignment_resolver=assignment_resolver
        self.authorize_assignment=authorize_assignment
        self.capture_retention_seconds=capture_retention_seconds
        self.lock=RLock(); self.queues=defaultdict(deque); self.cancel={}; self.rate={}
        self.operations=OperationIdentity(self)
        self.simulation_workers=simulation_worker_count(simulation_workers)
        self.executor=ThreadPoolExecutor(max_workers=self.simulation_workers+4) if submit is None else None
        self.submit=submit or self.executor.submit
        self.closed=False
        self.policy=ExecutionPolicy(); self.compiler=LabExecutionCompiler()
        self.assessment=AssessmentService()
        self.safety=SafetyVerificationService(); self.topology=TopologyVerificationService()
        self.resolver=TopologyResolver()
        self.functional=FunctionalVerificationService(); self.captures=CaptureService(store=capture_store)
        self.admission_sequence=0
        self._recover()

    def _recover(self):
        # Electrical cleanup must precede capture I/O: an unwritable storage
        # directory or malformed historical payload cannot leave a live lease.
        for lease in self.repo.leases():
            eid=lease['experiment_id']; e=self.repo.get_experiment(eid)
            try:
                reply=self.gateway.call(e['station_id'],eid,'stop_execution')
                safe=reply.get('accepted') is True and (e['mode']=='simulation' or reply.get('hardware_applied') is True)
            except Exception: safe=False
            # Lease disposition, recovered payload and its durable audit must
            # commit together. Failed persistence retains a retryable lease.
            self._transition(eid,'FAULT',error_code='RESTART_RECOVERY',lease_expires_at=None,
                             recovery_safe=safe)
            log_event('experiment.recovered',experiment_id=eid,station_id=e['station_id'],reason='RESTART_RECOVERY',outcome='RECOVERED' if safe else 'QUARANTINED')
        # Upgrade local unpublished R7 records without retaining samples in SQL.
        # Storage errors abort startup only after cleanup; valid old data stays
        # in SQL for a retry. Impossible old evidence is reported explicitly.
        for record in self.repo.list_experiments():
            if record.get('capture') and 'samples' in record['capture']:
                try:
                    record['capture']=self.captures.persist(record['capture'],record['mode'])
                except (ValueError,ValidationError):
                    record['capture']=None
                    record['functional_verification']=result('NO_RESPONSE',['Malformed legacy capture: CAPTURE_CORRUPT'])
                    record['error_code']=record.get('error_code') or 'CAPTURE_CORRUPT'
                record['revision']=record.get('revision',0)+1
                self.repo.save_experiment(record)
        experiments=self.repo.list_experiments()
        self.admission_sequence=max((e.get('_queue_sequence',0) for e in experiments),default=0)
        for e in sorted(experiments,key=lambda e:e.get('_queue_sequence',0)):
            if e['state']=='QUEUED':
                if '_assignment_snapshot' not in e:
                    try: snapshot=self.repo.get_assignment(e['assignment_id']) if e['assignment_id'] else None
                    except KeyError:
                        self._transition(e['experiment_id'],'COMPLETE',queue_position=None,error_code='ASSIGNMENT_NOT_FOUND',
                            execution_decision={'schema_version':'1.0','decision':'BLOCK_UNEXECUTABLE','reasons':['Legacy assignment is missing']})
                        continue
                    e.update(_assignment_snapshot=deepcopy(snapshot),_snapshot_provenance='legacy_recovery',revision=e.get('revision',0)+1)
                    self.repo.save_experiment(e)
                self.queues[e['station_id']].append(e['experiment_id'])
        # Resume persisted FIFO work without waiting for another student's Run.
        with self.lock:
            for station_id in tuple(self.queues): self._dispatch(station_id)

    def _public(self,e,owner):
        value=deepcopy({k:v for k,v in e.items() if not k.startswith('_') and k!='capture'})
        capture=e.get('capture')
        # Recovery can emit before legacy samples have been externalized.
        value['capture']=None if capture and 'samples' in capture else deepcopy(capture)
        value.setdefault('revision',0)
        value.setdefault('assessment',None)
        return self.public_projection(value,owner) if self.public_projection else value

    def get(self,eid,owner):
        with self.lock:
            e=self.repo.get_experiment(eid,owner)
            e['queue_position']=(list(self.queues[e['station_id']]).index(eid)+1) if eid in self.queues[e['station_id']] else None
            return self._public(e,owner)

    def list(self,owner):
        return [self.get(e['experiment_id'],owner) for e in self.repo.list_experiments(owner)]

    def _page(self,owner,*,limit=50,cursor=None,active=False):
        records,next_cursor=self.repo.experiment_page(owner,limit=limit,cursor=cursor,active=active)
        with self.lock:
            positions={eid:index+1 for queue in self.queues.values() for index,eid in enumerate(queue)}
            items=[self._public({**record,'queue_position':positions.get(record['experiment_id'])},owner) for record in records]
        return {'schema_version':'1.0','items':items,'next_cursor':next_cursor}

    def history(self,owner,*,limit=50,cursor=None):return self._page(owner,limit=limit,cursor=cursor)

    def active_snapshot(self,owner,*,cursor=None):return self._page(owner,limit=100,cursor=cursor,active=True)

    def queue(self,station_id):
        with self.lock: return list(self.queues[station_id])

    def _refresh_queue_positions(self,station_id):
        for position,eid in enumerate(self.queues[station_id],1):
            e=self.repo.get_experiment(eid)
            if e.get('queue_position')!=position:
                self._transition(eid,e['state'],queue_position=position)

    def create(self,owner,payload,*,operation_key=None,auth_session_id=None):
        return self.operations.create(owner,payload,operation_key,auth_session_id=auth_session_id) if operation_key is not None else self._create(owner,payload,auth_session_id=auth_session_id)

    def operation(self,owner,key,kind='create',experiment_id=None):
        return self.operations.get(owner,key,kind,experiment_id)

    def _create(self,owner,payload,*,operation=None,auth_session_id=None):
        allowed={'station_id','assignment_id','circuit_graph','capture_config','test_vectors','clock_config','generator_config','circuit_document_id','circuit_revision'}
        if not isinstance(payload,dict) or set(payload)-allowed or not isinstance(payload.get('station_id'),str) or not payload['station_id']:
            raise ValueError('INVALID_CONFIGURATION')
        caps=validate('StationCapabilities',self.gateway.capabilities(payload['station_id']))
        assignment_reference=None
        assignment=None
        if payload.get('assignment_id'):
            if self.assignment_resolver is not None:
                selected=self.assignment_resolver(owner,payload['assignment_id'])
                assignment=deepcopy(selected['definition'])
                assignment_reference={'assignment_id':payload['assignment_id'],'revision':selected['revision']}
            else: assignment=self.repo.get_assignment(payload['assignment_id'])
        graph=payload.get('circuit_graph')
        document_reference=None
        if 'circuit_document_id' in payload or 'circuit_revision' in payload:
            document_id,revision=payload.get('circuit_document_id'),payload.get('circuit_revision')
            if (not isinstance(document_id,str) or not document_id or type(revision) not in (int,float)
                    or not 1<=revision<=9007199254740991 or revision!=int(revision)
                    or 'circuit_graph' in payload or self.document_resolver is None):
                raise ValueError('INVALID_CONFIGURATION')
            snapshot=self.document_resolver(owner,document_id,int(revision))
            graph=deepcopy(snapshot['graph'])
            document_reference={'document_id':document_id,'revision':int(revision)}
        if caps['mode']=='simulation':
            valid,code,_=validate_circuit_graph(graph)
            if not valid: raise ValueError(code)
        elif assignment is None: raise ValueError('ASSIGNMENT_REQUIRED')
        eid=uuid.uuid4().hex
        e={'schema_version':'1.0','experiment_id':eid,'circuit_id':graph.get('circuit_id',eid) if isinstance(graph,dict) else eid,
           'station_id':caps['station_id'],'assignment_id':assignment['assignment_id'] if assignment else None,
           'mode':caps['mode'],'state':'CREATED','state_history':['CREATED'],'execution_decision':None,
           'revision':0,
           'safety_verification':None,'topology_verification':None,'topology_resolution':None,'functional_verification':result('NOT_EVALUATED'),
           'capture':None,'assessment':None,'error_code':None,'queue_position':None,'lease_expires_at':None,
           '_circuit_graph':deepcopy(graph),'_configuration':{k:deepcopy(v) for k,v in payload.items() if k not in {'station_id','assignment_id','circuit_graph','circuit_document_id','circuit_revision'}},
           '_assignment_snapshot':deepcopy(assignment),'_snapshot_provenance':'created',
           '_capabilities':caps,'_creation_request_id':current_correlation().get('request_id')}
        if document_reference is not None: e['_document_reference']=document_reference
        if assignment_reference is not None: e['_assignment_reference']=assignment_reference
        # Validate requested clock/vector/capture fields at admission, before storing.
        if caps['mode']=='simulation': self.compiler.compile(e,assignment,caps)
        else:
            config_probe=deepcopy(e); config_probe['_capabilities']={**caps,'mode':'simulation'}
            self.compiler.compile(config_probe,assignment,{**caps,'mode':'simulation'})
        if operation is not None: e['_operation']=operation
        # Slow capability/validation work stays outside the write transaction.
        # The session fence below linearizes final admission with claim/revoke
        # across independent connections; a process-local lock is insufficient.
        with self.repo.lock:
            if auth_session_id is not None and not self._control_active(auth_session_id):
                raise ValueError('SESSION_EXPIRED')
            if document_reference:
                self.document_resolver(owner,document_reference['document_id'],document_reference['revision'])
            self.repo.create_experiment(owner,e,auth_session_id=auth_session_id,authorize_session=self.authorize_session,
                authorize_assignment=self.authorize_assignment)
        log_event('experiment.created',experiment_id=eid,station_id=e['station_id'],state='CREATED',revision=0)
        return self.get(eid,owner)

    def document_reference(self,eid,owner):
        e=self.repo.get_experiment(eid,owner)
        graph=e.get('_circuit_graph'); reference=e.get('_document_reference')
        value={'schema_version':'1.0','experiment_id':eid,'snapshot_id':eid,
               'source':'SAVED_DOCUMENT' if reference else 'INLINE_GRAPH' if isinstance(graph,dict) else 'ASSIGNMENT_CONTEXT',
               'execution_mode':e['mode'],'circuit_id':e['circuit_id'],
               'graph_schema_version':graph.get('schema_version') if isinstance(graph,dict) else None,
               'assignment_id':e['assignment_id']}
        if reference: value.update(reference)
        return value

    def _transition(self,eid,state,*,recovery_safe=None,**values):
        with self.lock:
            e=self.repo.get_experiment(eid)
            previous=e['state']
            if e['state']!=state: e['state_history'].append(state)
            e.update(state=state,**values)
            e['revision']=e.get('revision',0)+1
            if recovery_safe is None:self.repo.save_experiment(e)
            else:self.repo.recover_experiment(e,safe=recovery_safe)
            log_event('experiment.transition',request_id=current_correlation().get('request_id') or e.get('_run_request_id'),
                      causation_request_id=e.get('_run_request_id'),
                      experiment_id=eid,station_id=e['station_id'],previous_state=previous,state=state,revision=e['revision'],
                      error_code=e.get('error_code'),capture_id=(e.get('capture') or {}).get('capture_id'))
            owner=self.repo.owner(eid)
            self.emit(owner,{'type':'experiment.updated','experiment':self.get(eid,owner)})
            return e

    def run(self,eid,owner,*,operation_key=None,control_session_id=None,control_client_id=None):
        invoke=lambda:self._run(eid,owner,control_session_id,control_client_id)
        if operation_key is not None:
            return self.operations.mutate('run',eid,owner,operation_key,invoke)
        return invoke()

    def _run(self,eid,owner,control_session_id=None,control_client_id=None):
        with self.lock:
            if self.closed: raise ValueError('UNAVAILABLE')
            if control_session_id is not None and not self._control_active(control_session_id):
                raise ValueError('SESSION_EXPIRED')
            e=self.repo.get_experiment(eid,owner)
            if e['state'] not in {'CREATED'}:
                if e['state'] not in TERMINAL: return self.get(eid,owner)
                raise ValueError('INVALID_STATE')
            if self.clock()-self.rate.get(owner,float('-inf'))<1:
                raise ValueError('RATE_LIMITED')
            if any(x['state'] not in TERMINAL|{'CREATED'} for x in self.repo.list_experiments(owner)):
                raise ValueError('RESOURCE_CONFLICT')
            if len(self.queues[e['station_id']])>=50: raise ValueError('QUEUE_FULL')
            assignment_snapshot=e['_assignment_snapshot'] if '_assignment_snapshot' in e else self.repo.get_assignment(e['assignment_id']) if e['assignment_id'] else None
            self.rate[owner]=self.clock(); self.cancel[eid]=Event()
            self.queues[e['station_id']].append(eid)
            self.admission_sequence+=1
            self._transition(eid,'QUEUED',_queue_sequence=self.admission_sequence,queue_position=len(self.queues[e['station_id']]),
                             _run_request_id=current_correlation().get('request_id'),_run_operation_key=current_correlation().get('operation_key'),
                             _control_session_id=control_session_id,_control_client_id=control_client_id,
                             _assignment_snapshot=deepcopy(assignment_snapshot),
                             _snapshot_provenance=e.get('_snapshot_provenance','legacy_admission'))
            self._dispatch(e['station_id'])
            return self.get(eid,owner)

    def _dispatch(self,station_id):
        if self.closed: return
        queue=self.queues[station_id]
        while queue:
            e=self.repo.get_experiment(queue[0]); eid=e['experiment_id']
            leases=[l for l in self.repo.leases() if l['station_id']==station_id]
            # A quarantined fabric cannot be partitioned into an assumed safe slot.
            if any(l['quarantined'] for l in leases): return
            try:
                caps=validate('StationCapabilities',self.gateway.capabilities(station_id))
                supported=caps['available'] and caps['mode']==e['mode'] and (caps['virtual_digital'] if e['mode']=='simulation' else caps['physical_digital'])
                capacity=self.simulation_workers if e['mode']=='simulation' else caps['physical_execution_slots']
            except (GatewayError,ValueError,ValidationError): supported=False; capacity=0
            if not supported or capacity==0:
                queue.popleft()
                self._transition(eid,'COMPLETE',queue_position=None,execution_decision={'schema_version':'1.0',
                    'decision':'BLOCK_UNEXECUTABLE','reasons':['Station unavailable or execution capacity is zero']})
                self._refresh_queue_positions(station_id)
                continue
            occupied={l['slot'] for l in leases}
            if len(occupied)>=capacity: return
            slot=next((n for n in range(capacity) if n not in occupied),None)
            if slot is None: return
            eid=queue[0]; expiry=self.clock()+self.lease_seconds
            if not self.repo.reserve(station_id,slot,eid,expiry): return
            self.cancel.setdefault(eid,Event())
            queue.popleft(); self._transition(eid,'RESERVED',lease_expires_at=expiry,queue_position=None)
            self._refresh_queue_positions(station_id)
            self.submit(self._execute,eid)

    def _control_active(self,session_id):
        if self.control_session_active is None: return True
        try: return self.control_session_active(session_id)
        except Exception: return False

    def _check_cancel(self,eid):
        if self.cancel.get(eid) and self.cancel[eid].is_set(): raise Cancelled()
        if self.control_session_active is not None:
            session_id=self.repo.get_experiment(eid).get('_control_session_id')
            if session_id and not self._control_active(session_id):
                self.stop(eid,self.repo.owner(eid),'SESSION_EXPIRED')
                raise Cancelled()

    def _call(self,eid,method,**kwargs):
        self._check_cancel(eid)
        e=self.repo.get_experiment(eid)
        reply=self.gateway.call(e['station_id'],eid,method,**kwargs)
        if reply.get('accepted') is False: raise GatewayError(reply.get('code','DRIVER_ERROR'))
        return reply

    def _execute(self,eid):
        record=self.repo.get_experiment(eid)
        with correlation(inherit=False,request_id=record.get('_run_request_id'),experiment_id=eid,
                         operation_key=record.get('_run_operation_key'),kind='run'):
            log_event('experiment.worker_started')
            return self._execute_in_context(eid)

    def _execute_in_context(self,eid):
        touched=False
        try:
            self._check_cancel(eid)
            e=self.repo.get_experiment(eid)
            assignment=deepcopy(e['_assignment_snapshot']) if '_assignment_snapshot' in e else self.repo.get_assignment(e['assignment_id']) if e['assignment_id'] else None
            caps=validate('StationCapabilities',self.gateway.capabilities(e['station_id']))
            supported=caps['available'] and (caps['virtual_digital'] if e['mode']=='simulation' else caps['physical_digital'] and caps['physical_execution_slots']>=1)
            if not supported:
                self._transition(eid,'COMPLETE',execution_decision={'schema_version':'1.0','decision':'BLOCK_UNEXECUTABLE','reasons':['Station unavailable or capability unsupported']})
                return
            self._transition(eid,'SAFE_STATE'); touched=True; self._call(eid,'enter_safe_state')
            if e['mode']=='hardware':
                self._transition(eid,'TOPOLOGY_SCAN'); graph=self._call(eid,'scan_topology')
                self._transition(eid,'SAFETY_CHECK'); safety=self.safety.verify(self._call(eid,'read_runtime_safety'))
                resolution=self.resolver.resolve(assignment,graph,caps)
                topology=self.topology.verify(assignment,graph,resolution)
                unknown=any(c['identity']=='UNKNOWN' or c['kind']=='OPAQUE_PHYSICAL_COMPONENT' for c in graph['components'])
                self._transition(eid,'SAFETY_CHECK',safety_verification=safety,topology_verification=topology,topology_resolution=resolution)
            else:
                safety=result('SAFE',['Virtual execution; no electrical energization'])
                topology=result('UNKNOWN',['Physical topology scan not applicable'])
                unknown=False
                resolution=None
                self._transition(eid,'SAFETY_CHECK',safety_verification=safety,topology_verification=topology)
                self._call(eid,'apply_circuit',circuit_graph=e['_circuit_graph'])
            try: plan=self.compiler.compile(e,assignment,caps,resolution); executable=True
            except (ValueError,ValidationError): plan=None; executable=False
            decision=self.policy.decide(safety,executable,unknown)
            self._transition(eid,'EXECUTION_DECISION',safety_verification=safety,topology_verification=topology,execution_decision=decision)
            if decision['decision'].startswith('BLOCK_'):
                self._transition(eid,'COMPLETE'); return
            self._transition(eid,'ROUTE_PREPARE',_execution_plan=plan); self._call(eid,'prepare_execution',plan=plan,decision=decision)
            self._call(eid,'apply_routing')
            self._transition(eid,'GUARDED_POWER_UP'); self._call(eid,'guarded_power_up')
            self._call(eid,'arm_capture',configuration=plan['capture_config'])
            self._transition(eid,'RUNNING'); self._call(eid,'start_execution')
            self._transition(eid,'CAPTURING'); raw_capture=self._call(eid,'read_capture')
            try:capture=self.captures.persist(raw_capture,e['mode'])
            except OSError:raise GatewayError('CAPTURE_STORAGE_UNAVAILABLE') from None
            self._transition(eid,'FUNCTIONAL_VERIFY',capture=capture)
            try:data=self.captures.load(capture) if capture['available'] else {'available':False,'samples':[]}
            except OSError:raise GatewayError('CAPTURE_STORAGE_UNAVAILABLE') from None
            functional=self.functional.verify(assignment,data,e['_configuration'].get('test_vectors',[]))
            grade=validate('AssessmentResult',self.assessment.evaluate(assignment,topology,functional))
            self._transition(eid,'COMPLETE',functional_verification=functional,assessment=grade)
        except Cancelled:
            self._transition(eid,'COMPLETE')
        except Exception as error:
            code=error.code if isinstance(error,GatewayError) else str(error) if isinstance(error,ValueError) and str(error) in ('CAPTURE_QUOTA_EXCEEDED','CAPTURE_KEY_CONFLICT','CAPTURE_PAYLOAD_LIMIT') else 'DRIVER_ERROR'
            # Stop can invalidate the current RPC generation; actual safety/driver
            # faults must still be reported even when cancellation is concurrent.
            if self.cancel.get(eid) and self.cancel[eid].is_set() and isinstance(error,GatewayError) and code in ('INVALID_STATE','RESOURCE_CONFLICT'):
                self._transition(eid,'COMPLETE')
            else:
                updates={}
                if code in ('UNSAFE','SAFETY_INDETERMINATE'):
                    updates['safety_verification']=result('UNSAFE' if code=='UNSAFE' else 'INDETERMINATE',[code])
                    updates['execution_decision']={'schema_version':'1.0','decision':'BLOCK_SAFETY','reasons':[code]}
                elif code in ('UNEXECUTABLE','HARDWARE_UNAVAILABLE','PROTOCOL_MISMATCH'):
                    updates['execution_decision']={'schema_version':'1.0','decision':'BLOCK_UNEXECUTABLE','reasons':[code]}
                self._transition(eid,'FAULT',error_code=code,**updates)
        finally:
            e=self.repo.get_experiment(eid)
            terminal_state=e['state']
            safe=not touched
            if touched:
                try:
                    self._transition(eid,'STOPPING')
                    reply=self.gateway.call(e['station_id'],eid,'stop_execution')
                    safe=reply.get('accepted') is True and (e['mode']=='simulation' or reply.get('hardware_applied') is True)
                except Exception: safe=False
            with self.lock:
                if safe:
                    if touched: self._transition(eid,'SAFE_STATE')
                    self._transition(eid,'RELEASE')
                    self.repo.release(eid)
                else:
                    self.repo.quarantine(eid)
                    terminal_state='FAULT'
                    self._transition(eid,'FAULT',error_code='SAFE_STATE_FAILED',
                        safety_verification=result('INDETERMINATE',['Safe cleanup unacknowledged']),
                        execution_decision={'schema_version':'1.0','decision':'BLOCK_SAFETY','reasons':['SAFE_STATE_FAILED']})
                self.cancel.pop(eid,None)
                self._transition(eid,terminal_state,lease_expires_at=None)
                self._dispatch(e['station_id'])

    def stop(self,eid,owner,code='STOPPED',*,operation_key=None):
        if operation_key is not None:
            return self.operations.mutate('stop',eid,owner,operation_key,lambda:self._stop(eid,owner,code))
        return self._stop(eid,owner,code)

    def _stop(self,eid,owner,code='STOPPED'):
        with self.lock:
            e=self.repo.get_experiment(eid,owner)
            if e['state'] in TERMINAL: return self.get(eid,owner)
            if eid in self.queues[e['station_id']]:
                self.queues[e['station_id']].remove(eid)
                self.cancel.pop(eid,None)
                self._transition(eid,'COMPLETE',error_code=code,queue_position=None)
                self._refresh_queue_positions(e['station_id'])
            elif eid in self.cancel:
                if self.cancel[eid].is_set(): return self.get(eid,owner)
                self.cancel[eid].set()
                self._transition(eid,'STOPPING',error_code=code)
                # Interrupt actual hardware immediately; slot is released by worker only after acknowledged cleanup.
                try: self.gateway.call(e['station_id'],eid,'stop_execution')
                except Exception: pass
            else: self._transition(eid,'COMPLETE',error_code=code)
            return self.get(eid,owner)

    def configure_instrument(self,eid,owner,payload,*,control_session_id=None,control_client_id=None):
        reply=self._configure_instrument_reply(eid,owner,payload,control_session_id=control_session_id,control_client_id=control_client_id)
        return {'accepted':reply.get('accepted') is True,'code':reply.get('code','OK')}

    def instrument_access(self,eid,owner,*,control_session_id=None,control_client_id=None):
        from app.services.instrument_control import control_access
        with self.lock:return control_access(self,eid,owner,control_session_id,control_client_id)

    def configure_generator_command(self,eid,owner,configuration,key,*,control_session_id=None,control_client_id=None):
        from app.services.instrument_control import configure_generator
        return configure_generator(self,eid,owner,configuration,key,control_session_id,control_client_id)

    def generator_command(self,eid,owner,key):
        from app.services.instrument_control import command_record
        return command_record(self,eid,owner,key)

    def _configure_instrument_reply(self,eid,owner,payload,*,control_session_id=None,control_client_id=None):
        # Short bounded control RPC shares the same lock as Stop/lease release.
        # StartExecution remains outside this lock so Stop can interrupt it.
        with self.lock:
            e=self.repo.get_experiment(eid,owner)
            if control_session_id is not None and not self._control_active(control_session_id):
                raise ValueError('SESSION_EXPIRED')
            if control_session_id is not None and (e.get('_control_session_id')!=control_session_id
                    or e.get('_control_client_id')!=control_client_id):
                raise PermissionError('FORBIDDEN')
            if not isinstance(payload,dict) or set(payload)!={'instrument','configuration'}:
                raise ValueError('INVALID_CONFIGURATION')
            if payload['instrument'] not in ('generator','clock','trigger'): raise ValueError('INVALID_CONFIGURATION')
            lease=next((l for l in self.repo.leases() if l['experiment_id']==eid),None)
            if (self.closed or e['state']!='RUNNING' or lease is None or lease['quarantined']
                    or lease['expires_at']<=self.clock() or self.cancel.get(eid,Event()).is_set()):
                raise ValueError('INVALID_STATE')
            if payload['instrument']!='generator': raise ValueError('NOT_IMPLEMENTED')
            caps=validate('StationCapabilities',self.gateway.capabilities(e['station_id']))
            capability=caps['instrument_capabilities']['generator']
            if not caps['available'] or caps['mode']!=e['mode']: raise ValueError('UNEXECUTABLE')
            if not capability['runtime_reconfiguration_supported']: raise ValueError('NOT_IMPLEMENTED')
            config=validate_generator(payload['configuration'],capability)
            if not any(a['instrument']=='GENERATOR' and a['channel']==config['channel']
                       for a in (e.get('_execution_plan') or {}).get('instrument_allocations',[])):
                raise ValueError('UNEXECUTABLE')
            reply=self._call(eid,'configure_instrument',**payload)
            return reply

    def _capture_record(self,capture_id,owner):
        return self.repo.capture_reference(capture_id,owner)

    def capture_payload(self,capture_id,owner,*,auth_session_id=None):
        with self.captures.guard(capture_id):
            reference=self._capture_record(capture_id,owner);metadata=reference['metadata']
            if not metadata['available']: raise ValueError('CAPTURE_UNAVAILABLE')
            try:payload=self.captures.store.get(metadata)
            except OSError:raise GatewayError('CAPTURE_STORAGE_UNAVAILABLE') from None
            # Claim/revoke/retirement may happen while bytes are read and hashed.
            # Recheck disclosure before returning; no control lock spans I/O.
            if auth_session_id is not None and not self._control_active(auth_session_id):raise ValueError('SESSION_EXPIRED')
            if not self._capture_record(capture_id,owner)['metadata']['available']:raise ValueError('CAPTURE_UNAVAILABLE')
            log_event('capture.read',capture_id=capture_id,experiment_id=reference['experiment_id'])
            return payload

    def _capture_retired(self,eid):
        record=self.repo.get_experiment(eid);owner=self.repo.owner(eid)
        self.emit(owner,{'type':'experiment.updated','experiment':self._public(record,owner)})

    def delete_capture(self,capture_id,owner,*,auth_session_id=None):
        from app.services.capture_maintenance import cleanup_payload
        with self.captures.guard(capture_id):
            try:
                return cleanup_payload(self.repo,self.captures.store,capture_id,owner,auth_session_id=auth_session_id,
                    authorize_session=self.authorize_session,on_retired=self._capture_retired)
            except ValueError as error:
                if str(error)=='CAPTURE_ACTIVE':raise ValueError('INVALID_STATE') from None
                raise

    def expire_captures(self,*,limit=100,now=None,dry_run=False):
        from app.services.capture_maintenance import expire_payloads
        return expire_payloads(self.repo,self.captures.store,retention_seconds=self.capture_retention_seconds,limit=limit,now=now,
            dry_run=dry_run,on_retired=self._capture_retired)

    def disconnect(self,owner):
        for e in self.repo.list_experiments(owner):
            if e['state'] not in TERMINAL|{'CREATED'}: self.stop(e['experiment_id'],owner,'DISCONNECTED')

    def disconnect_control(self,session_id,client_id=None,code='DISCONNECTED'):
        # Principal access is durable. Only the originating session/tab can
        # maintain this control lifetime; unrelated viewers have no influence.
        for e in self.repo.list_experiments():
            if (e.get('_control_session_id')==session_id
                    and (client_id is None or e.get('_control_client_id')==client_id)
                    and e['state'] not in TERMINAL|{'CREATED'}):
                self.stop(e['experiment_id'],self.repo.owner(e['experiment_id']),code)

    def expire_control_sessions(self,is_active):
        sessions={e.get('_control_session_id') for e in self.repo.list_experiments()
                  if e['state'] not in TERMINAL|{'CREATED'} and e.get('_control_session_id')}
        for session_id in sessions:
            try: active=is_active(session_id)
            except Exception: active=False
            if not active: self.disconnect_control(session_id,code='SESSION_EXPIRED')

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
