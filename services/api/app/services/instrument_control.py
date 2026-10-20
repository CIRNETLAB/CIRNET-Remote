"""Owned, durable generator intent; recovery reads never replay output changes."""
from copy import deepcopy
from sqlalchemy.exc import IntegrityError
from contracts.registry import validate_contract
from app.services.hardware_client import GatewayError
from app.services.execution_errors import Cancelled
from app.services.operations import operation_key,request_fingerprint
from app.services.observability import correlation,log_event

KIND='generator'

def control_access(manager,eid,owner,session_id=None,client_id=None):
    record=manager.repo.get_experiment(eid,owner)
    reason='READY';channels=[]
    if (not session_id or not client_id or not manager._control_active(session_id)
            or record.get('_control_session_id')!=session_id or record.get('_control_client_id')!=client_id):reason='CONTROL_CONTEXT_REQUIRED'
    elif manager.closed or record['state']!='RUNNING':reason='NOT_RUNNING'
    else:
        lease=next((value for value in manager.repo.leases() if value['experiment_id']==eid),None)
        if lease is None or lease['quarantined'] or lease['expires_at']<=manager.clock():reason='LEASE_UNAVAILABLE'
        else:
            from contracts.validation import validate
            caps=validate('StationCapabilities',manager.gateway.capabilities(record['station_id']))
            capability=caps['instrument_capabilities']['generator']
            if not caps['available'] or caps['mode']!=record['mode'] or capability['channels']==0:reason='GENERATOR_UNAVAILABLE'
            elif not capability['runtime_reconfiguration_supported']:reason='RUNTIME_CONFIGURATION_UNSUPPORTED'
            else:
                channels=sorted({value['channel'] for value in (record.get('_execution_plan') or {}).get('instrument_allocations',[])
                    if value['instrument']=='GENERATOR' and value['channel'] in (1,2) and value['channel']<=capability['channels']})
                if not channels:reason='NO_ALLOCATED_CHANNEL'
            with manager.lock:
                current=manager.repo.get_experiment(eid,owner)
                if (current['revision']!=record['revision'] or current.get('_reservation_generation')!=record.get('_reservation_generation')
                        or not manager._control_active(session_id) or manager.cancel.get(eid) and manager.cancel[eid].is_set()):
                    reason='NOT_RUNNING';channels=[]
                record=current
    return validate_contract('InstrumentControlAccess',{'schema_version':'1.0','experiment_id':eid,'revision':record['revision'],
        'can_configure_generator':reason=='READY','generator_channels':channels,'reason':reason},profile='transport')

def command_record(manager,eid,owner,key):
    manager.repo.get_experiment(eid,owner)
    value=manager.repo.operation(owner,KIND,operation_key(key),eid)
    log_event('instrument.command_observed',kind='generator',experiment_id=eid,operation_key=key,outcome=value['status'],revision=value['revision'],error_code=value.get('error_code'))
    return validate_contract('InstrumentCommandRecord',{name:child for name,child in value.items() if not name.startswith('_')},profile='transport')

def configure_generator(manager,eid,owner,configuration,key,session_id=None,client_id=None):
    with correlation(kind='generator',experiment_id=eid,operation_key=key):
        return _configure_generator(manager,eid,owner,configuration,key,session_id,client_id)


def _configure_generator(manager,eid,owner,configuration,key,session_id=None,client_id=None):
    configuration=validate_contract('GeneratorConfiguration',deepcopy(configuration),profile='transport')
    key=operation_key(key);fingerprint=request_fingerprint({'experiment_id':eid,'configuration':configuration})
    with manager.operations.guard(owner,KIND,key,eid):
        manager.repo.get_experiment(eid,owner)
        previous=manager.operations.existing(owner,KIND,key,eid,fingerprint)
        if previous:return command_record(manager,eid,owner,key)
        with manager._control_lock(eid):
            access=control_access(manager,eid,owner,session_id,client_id)
            if access['reason']=='CONTROL_CONTEXT_REQUIRED':raise PermissionError('FORBIDDEN')
            if not access['can_configure_generator']:raise ValueError('INVALID_STATE' if access['reason'] in ('NOT_RUNNING','LEASE_UNAVAILABLE') else 'UNEXECUTABLE')
            if configuration['channel'] not in access['generator_channels']:raise ValueError('UNEXECUTABLE')
            # Revalidate units/profile before durable intent. The common command
            # path rechecks all server ownership, state and allocation gates.
            from contracts.instrument_validation import validate_generator
            caps=manager.gateway.capabilities(manager.repo.get_experiment(eid,owner)['station_id'])
            validate_generator(configuration,caps['instrument_capabilities']['generator'])
            record={'schema_version':'1.0','experiment_id':eid,'operation_key':key,'status':'REQUESTED','revision':0,
                'accepted':False,'hardware_applied':False,'error_code':None,'configuration':configuration}
            try:manager.repo.begin_instrument_command(owner,record,fingerprint,session_id,manager.authorize_session)
            except IntegrityError:
                # An independent worker won the unique operation identity. Its
                # requested/unknown outcome is returned, never executed again.
                manager.operations.existing(owner,KIND,key,eid,fingerprint)
                return command_record(manager,eid,owner,key)
            try:
                reply=manager._configure_instrument_reply(eid,owner,{'instrument':'generator','configuration':configuration},
                    control_session_id=session_id,control_client_id=client_id)
                if reply.get('accepted') is not True:raise GatewayError(reply.get('code','PROTOCOL_MISMATCH'))
                applied=reply.get('hardware_applied') is True
                record.update(status='APPLIED' if applied else 'ACCEPTED',accepted=True,hardware_applied=applied,revision=1)
            except Exception as error:
                code=error.code if isinstance(error,GatewayError) else 'CANCELLED' if isinstance(error,Cancelled) else str(error) if isinstance(error,ValueError) else 'FORBIDDEN' if isinstance(error,PermissionError) else 'DRIVER_ERROR'
                uncertain=(isinstance(error,GatewayError) and code in ('TIMEOUT','GATEWAY_TIMEOUT','HARDWARE_UNAVAILABLE','PROTOCOL_MISMATCH')
                    or not isinstance(error,(GatewayError,Cancelled,ValueError,PermissionError)))
                record.update(status='REQUESTED' if uncertain else 'FAILED',error_code='ACKNOWLEDGEMENT_UNKNOWN' if uncertain else code,revision=1)
                manager.repo.save_instrument_command(owner,record)
                if not isinstance(error,(GatewayError,Cancelled,ValueError,PermissionError)):raise
                return record
            manager.repo.save_instrument_command(owner,record)
            return validate_contract('InstrumentCommandRecord',record,profile='transport')
