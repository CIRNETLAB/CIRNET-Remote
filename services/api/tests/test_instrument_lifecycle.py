"""Live controls share owner, lease, state and cancellation synchronization."""
from copy import deepcopy
from threading import Event, Thread
import pytest
from test_lab_lifecycle import setup_manager,create


def configuration(**change):
    return {'channel':1,'waveform':'SINE','frequency_hz':1000,'amplitude_vpp':1,'offset_v':0,'enabled':True,**change}


def live(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    original=g.capabilities
    def caps(station_id):
        value=deepcopy(original(station_id))
        value['instrument_capabilities']={'logic_analyzer':{'channels':2,'runtime_reconfiguration_supported':False},
            'oscilloscope':{'channels':0,'runtime_reconfiguration_supported':False},
            'generator':{'channels':2,'runtime_reconfiguration_supported':True,'frequency_max_hz':2000}}
        for key in ['logic_analyzer_channels','oscilloscope_channels','generator_channels']: value.pop(key,None)
        return value
    g.capabilities=caps
    e=create(m); eid=e['experiment_id']; repo.reserve('p1',0,eid,10)
    m.cancel[eid]=Event(); m._transition(eid,'RUNNING',lease_expires_at=10)
    record=repo.get_experiment(eid); record['_execution_plan']={'instrument_allocations':[{'instrument':'GENERATOR','channel':1}]}; repo.save_experiment(record)
    return m,repo,g,now,eid


def test_live_generator_checks_owner_state_lease_and_profile_before_gateway(tmp_path):
    m,repo,g,now,eid=live(tmp_path)
    payload={'instrument':'generator','configuration':configuration()}
    with pytest.raises(PermissionError): m.configure_instrument(eid,'student-2',payload)
    assert m.configure_instrument(eid,'student-1',payload)['accepted'] is True
    calls=len(g.calls)
    with pytest.raises(ValueError,match='UNEXECUTABLE'):
        m.configure_instrument(eid,'student-1',{**payload,'configuration':configuration(frequency_hz=3000)})
    assert len(g.calls)==calls
    m._transition(eid,'CAPTURING')
    with pytest.raises(ValueError,match='INVALID_STATE'): m.configure_instrument(eid,'student-1',payload)
    m._transition(eid,'RUNNING'); now[0]=11
    with pytest.raises(ValueError,match='INVALID_STATE'): m.configure_instrument(eid,'student-1',payload)


@pytest.mark.parametrize('reason',['runtime_flag','no_channels','cancelled','released','quarantine','unallocated'])
def test_live_generator_cannot_bypass_unsupported_or_revoked_lifecycle(tmp_path,reason):
    m,repo,g,now,eid=live(tmp_path)
    original=g.capabilities
    def caps(station_id):
        value=original(station_id)
        if reason=='runtime_flag': value['instrument_capabilities']['generator']['runtime_reconfiguration_supported']=False
        if reason=='no_channels': value['instrument_capabilities']['generator']['channels']=0
        return value
    g.capabilities=caps
    if reason=='cancelled': m.cancel[eid].set()
    if reason=='released': repo.release(eid)
    if reason=='quarantine': repo.quarantine(eid)
    if reason=='unallocated':
        record=repo.get_experiment(eid); record['_execution_plan']['instrument_allocations']=[]; repo.save_experiment(record)
    with pytest.raises(ValueError): m.configure_instrument(eid,'student-1',{'instrument':'generator','configuration':configuration()})
    assert not g.calls


def test_stop_and_live_configuration_are_serialized_until_acknowledgement(tmp_path):
    m,repo,g,now,eid=live(tmp_path); entered,finish,stopped=Event(),Event(),Event()
    original=g.call; errors=[]
    def call(station_id,experiment_id,method,**kwargs):
        if method=='configure_instrument':
            entered.set(); assert finish.wait(3)
        return original(station_id,experiment_id,method,**kwargs)
    g.call=call
    def configure():
        try: m.configure_instrument(eid,'student-1',{'instrument':'generator','configuration':configuration()})
        except Exception as error: errors.append(error)
    def stop():
        try: m.stop(eid,'student-1'); stopped.set()
        except Exception as error: errors.append(error)
    control=Thread(target=configure); control.start()
    try:
        assert entered.wait(1)
        stopping=Thread(target=stop); stopping.start()
        assert not stopped.wait(.05)
    finally:
        finish.set(); control.join(3)
        if 'stopping' in locals(): stopping.join(3)
    assert not errors and stopped.is_set()
    assert g.calls.index('configure_instrument')<g.calls.index('stop_execution')


@pytest.mark.parametrize('role',['SCOPE','GENERATOR','LOGIC_ANALYZER'])
def test_virtual_compiler_rejects_instrument_channels_beyond_actual_capability(role):
    from app.services.lab_compiler import LabExecutionCompiler
    from test_lab_lifecycle import LabGateway
    caps=LabGateway().capabilities('v1'); caps.update(mode='simulation',virtual_digital=True)
    a={'lab_endpoints':[{'endpoint_id':'probe','role':role,'design_port':'X.OUT','channel':3}]}
    with pytest.raises(ValueError,match='UNEXECUTABLE'):
        LabExecutionCompiler().compile({'station_id':'v1','experiment_id':'e','_configuration':{}},a,caps)
