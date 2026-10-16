"""Bounded sealed-payload retention; database retirement precedes slow cleanup."""
import time
from app.services.hardware_client import GatewayError
from app.services.observability import log_event

def cleanup_payload(repository,store,capture_id,owner,*,reason='DELETED',auth_session_id=None,authorize_session=None,on_retired=None):
    retired=repository.retire_capture(capture_id,owner,reason=reason,auth_session_id=auth_session_id,authorize_session=authorize_session)
    if retired['changed']:log_event('capture.retired',capture_id=capture_id,experiment_id=retired['experiment_id'],reason=reason,outcome='RETIRED')
    if retired['changed'] and on_retired:on_retired(retired['experiment_id'])
    reference=repository.capture_reference(capture_id,owner)
    if reference['cleanup_pending']:
        try:store.delete(retired['metadata'])
        except OSError:
            log_event('capture.cleanup_failed',capture_id=capture_id,experiment_id=retired['experiment_id'],error_code='CAPTURE_STORAGE_UNAVAILABLE')
            raise GatewayError('CAPTURE_STORAGE_UNAVAILABLE') from None
        repository.finish_capture_cleanup(capture_id)
        log_event('capture.cleaned',capture_id=capture_id,experiment_id=retired['experiment_id'],outcome='CLEANED')
    return retired['metadata']

def expire_payloads(repository,store,*,retention_seconds=2592000,limit=100,now=None,dry_run=False,on_retired=None):
    if type(retention_seconds) is not int or retention_seconds<0:raise ValueError('INVALID_CAPTURE_RETENTION')
    cutoff=(time.time() if now is None else now)-retention_seconds if retention_seconds else None
    references=repository.expired_captures(cutoff,limit=limit)
    report={'scanned':len(references),'deleted':0,'failed':0,'dry_run':dry_run}
    if dry_run:
        log_event('capture.retention_dry_run',scanned=report['scanned'],limit=limit)
        return report
    for reference in references:
        try:
            cleanup_payload(repository,store,reference['capture_id'],reference['owner_id'],reason='RETENTION',on_retired=on_retired)
            report['deleted']+=1
        except (GatewayError,PermissionError,ValueError,KeyError):report['failed']+=1
    log_event('capture.retention_completed',scanned=report['scanned'],deleted=report['deleted'],failed=report['failed'],limit=limit)
    return report
