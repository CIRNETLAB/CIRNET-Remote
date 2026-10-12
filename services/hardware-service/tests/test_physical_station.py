import copy
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hardware_service.station.base import HardwareUnavailableError
from hardware_service.station.physical import PhysicalHardwareStation


def plan():
    return {'schema_version':'1.0','station_id':'physical-1','experiment_id':'e1',
            'power_policy':{'profile_id':'test-protection','guarded':True},
            'endpoint_bindings':[{'endpoint_id':'x','node_id':'N1','role':'INPUT_SOURCE'}],
            'routing_allocations':[{'endpoint_id':'x','resource_id':'drive-1'}],
            'instrument_allocations':[], 'clock_config':{}, 'generator_config':[],
            'capture_config':{'signals':['y'],'duration_ns':100}, 'test_vectors':[],
            'runtime_safety_policy':{'profile_id':'test-protection','watchdog_required':True}}


class ProtectedTestDriver:
    """Electrical test double; no production hardware claim."""
    def __init__(self, safety='SAFE', unknown=False, fail=None):
        self.calls=[]
        self.safety=safety
        self.unknown=unknown
        self.fail=fail
    def get_capabilities(self):
        return {'available':True,'physical_digital':True,'physical_execution_slots':1,
                'topology_scan_supported':True,'safety_gate_supported':True,
                'guarded_run_supported':True,'hardware_profile_version':'test-protection',
                'routing_resources':[{'resource_id':'drive-1','roles':['INPUT_SOURCE'],'node_ids':['N1']}],
                'breadboards':[{'id':'only-board','model':'test-board'}]}
    def enter_safe_state(self):
        self.calls.append('safe')
        return {'accepted':True,'hardware_applied':True}
    def scan_topology(self):
        self.calls.append('scan')
        return {'schema_version':'1.0','scan_id':'s1','nodes':[{'node_id':'N1'}],
                'connections':[], 'ambiguities':[],
                'components':[{'component_id':'U1','kind':'OPAQUE_PHYSICAL_COMPONENT','identity':'UNKNOWN','node_ids':['N1']}] if self.unknown else []}
    def read_runtime_safety(self):
        self.calls.append('safety')
        return {'schema_version':'1.0','status':self.safety,'issues':[]}
    def prepare_execution(self, value):
        self.calls.append('prepare')
        return {'accepted':True}
    def apply_routing(self, value):
        self.calls.append('routing')
        if self.fail=='routing': raise OSError('private transport details')
        return {'accepted':True}
    def guarded_power_up(self, value):
        self.calls.append('power')
        return {'accepted':True}
    def arm_capture(self, value):
        self.calls.append('arm')
        return {'accepted':True}
    def start_execution(self):
        self.calls.append('start')
        return {'accepted':True}
    def stop_execution(self):
        self.calls.append('stop')
        return {'accepted':True}
    def read_capture(self):
        return {'available':True,'samples':[]}


def station(driver=None, **kwargs):
    return PhysicalHardwareStation('physical-1', driver=driver, **kwargs)


def error_code(action, expected):
    with pytest.raises(RuntimeError) as caught: action()
    assert getattr(caught.value,'code',None)==expected


def prepare(s, decision='RUN_GUARDED'):
    assert hasattr(s,'enter_safe_state'), 'Lab lifecycle missing'
    s.enter_safe_state()
    s.scan_topology()
    s.read_runtime_safety()
    return s.prepare_execution(plan(), {'schema_version':'1.0','decision':decision,'reasons':[]})


def test_unavailable_safe_state_is_truthful_and_no_fixed_breadboard_count():
    s=station()
    assert s.get_capabilities().available is False
    assert not s.get_capabilities().breadboards
    with pytest.raises(HardwareUnavailableError): s.run()
    assert hasattr(s,'enter_safe_state'), 'Lab lifecycle missing'
    result=s.enter_safe_state()
    assert result['hardware_applied'] is False
    assert result['code']=='HARDWARE_UNAVAILABLE'
    assert s.state=='OFFLINE'


def test_start_and_legacy_run_cannot_bypass_safety_with_a_driver():
    d=ProtectedTestDriver()
    s=station(d)
    assert hasattr(s,'start_execution'), 'Lab lifecycle missing'
    error_code(s.start_execution,'INVALID_STATE')
    error_code(s.run,'INVALID_STATE')
    assert 'start' not in d.calls


@pytest.mark.parametrize('safety,code',[('UNSAFE','UNSAFE'),('INDETERMINATE','SAFETY_INDETERMINATE')])
def test_unsafe_or_indeterminate_blocks_power_up(safety,code):
    d=ProtectedTestDriver(safety=safety)
    s=station(d)
    error_code(lambda:prepare(s),code)
    assert 'power' not in d.calls
    assert 'start' not in d.calls


def test_safe_opaque_component_runs_guarded_after_all_prerequisites():
    d=ProtectedTestDriver(unknown=True)
    s=station(d)
    prepare(s)
    s.apply_routing()
    s.guarded_power_up()
    s.arm_capture(plan()['capture_config'])
    assert s.start_execution()['state']=='RUNNING'
    assert d.calls.index('scan') < d.calls.index('prepare') < d.calls.index('routing') < d.calls.index('power') < d.calls.index('start')
    assert len(s.get_capabilities().breadboards)==1


def test_opaque_identity_requires_guarded_decision():
    s=station(ProtectedTestDriver(unknown=True))
    error_code(lambda:prepare(s,'RUN_NORMAL'),'UNEXECUTABLE')


def test_driver_error_causes_fault_and_safe_fallback_without_exposing_exception_text():
    d=ProtectedTestDriver(fail='routing')
    s=station(d)
    prepare(s)
    error_code(s.apply_routing,'DRIVER_ERROR')
    assert s.state=='FAULT'
    assert d.calls[-1]=='safe'
    assert 'start' not in d.calls


def test_mutation_or_reentry_cannot_reuse_an_old_plan():
    d=ProtectedTestDriver()
    s=station(d)
    prepare(s)
    s.enter_safe_state()
    error_code(s.apply_routing,'INVALID_STATE')


def test_stale_scan_or_runtime_fault_cannot_energize():
    now=[0.0]
    d=ProtectedTestDriver()
    s=station(d, clock=lambda:now[0], scan_ttl=5)
    prepare(s)
    s.apply_routing()
    now[0]=10
    error_code(s.guarded_power_up,'SAFETY_INDETERMINATE')
    assert 'power' not in d.calls


def test_stop_and_reset_invalidate_plan_and_return_to_acknowledged_safe_state():
    d=ProtectedTestDriver()
    s=station(d)
    prepare(s)
    s.apply_routing()
    s.guarded_power_up()
    s.arm_capture(plan()['capture_config'])
    s.start_execution()
    assert s.stop_execution()['state']=='SAFE_STATE'
    error_code(s.start_execution,'INVALID_STATE')
    assert s.reset()['state']=='SAFE_STATE'


def test_wrong_station_plan_and_unavailable_route_fail_before_driver_prepare():
    d=ProtectedTestDriver()
    s=station(d)
    s.enter_safe_state() if hasattr(s,'enter_safe_state') else pytest.fail('Lab lifecycle missing')
    s.scan_topology()
    s.read_runtime_safety()
    p=plan()
    p['station_id']='other'
    error_code(lambda:s.prepare_execution(p,{'schema_version':'1.0','decision':'RUN_GUARDED','reasons':[]}),'UNEXECUTABLE')
    p['station_id']='physical-1'
    p['routing_allocations'][0]['resource_id']='missing'
    error_code(lambda:s.prepare_execution(p,{'schema_version':'1.0','decision':'RUN_GUARDED','reasons':[]}),'UNEXECUTABLE')
    assert 'prepare' not in d.calls


def test_missing_infrastructure_allocation_is_not_an_executable_plan():
    d=ProtectedTestDriver()
    s=station(d)
    s.enter_safe_state(); s.scan_topology(); s.read_runtime_safety()
    p=plan(); p['routing_allocations']=[]
    error_code(lambda:s.prepare_execution(p,{'schema_version':'1.0','decision':'RUN_GUARDED','reasons':[]}),'UNEXECUTABLE')
    assert 'prepare' not in d.calls


def test_empty_driver_control_reply_cannot_claim_success():
    class UnacknowledgedDriver(ProtectedTestDriver):
        def apply_routing(self, value): return {}
    s=station(UnacknowledgedDriver())
    prepare(s)
    error_code(s.apply_routing,'DRIVER_ERROR')
    assert s.state=='FAULT'


def test_changed_runtime_safety_blocks_start_after_power_up():
    d=ProtectedTestDriver()
    s=station(d)
    prepare(s); s.apply_routing(); s.guarded_power_up(); s.arm_capture(plan()['capture_config'])
    d.safety='UNSAFE'
    error_code(s.start_execution,'UNSAFE')
    assert 'start' not in d.calls
