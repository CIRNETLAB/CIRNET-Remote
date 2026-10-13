import sys
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'services/hardware-service'))
sys.path.insert(0,str(ROOT/'simulator/circuit-simulator'))
from hardware_service.station.virtual import VirtualHardwareStation


def test_virtual_station_executes_and_capture_and_reset_are_real():
    s=VirtualHardwareStation('v1')
    assert s.get_capabilities().virtual_digital is True, 'virtual simulator integration missing'
    graph={'schema_version':'1.0','circuit_id':'input-led',
           'modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':True}},{'id':'L','type':'LED'}],
           'connections':[{'source':'X.OUT','destination':'L.IN'}]}
    s.apply_circuit(graph)
    p={'schema_version':'1.0','station_id':'v1','experiment_id':'e1','power_policy':{'profile_id':'virtual-1.0','guarded':True},
       'endpoint_bindings':[],'routing_allocations':[],'instrument_allocations':[],'clock_config':{},'generator_config':[],
       'capture_config':{'signals':['L.IN'],'duration_ns':20},'test_vectors':[],
       'runtime_safety_policy':{'profile_id':'virtual-1.0','watchdog_required':True}}
    s.prepare_execution(p,{'schema_version':'1.0','decision':'RUN_NORMAL','reasons':[]})
    s.arm_capture(p['capture_config'])
    assert s.start_execution()['accepted'] is True
    assert s.read_capture()['samples']==[{'signal':'L.IN','time_ns':0,'value':1}]
    s.stop_execution()
    assert s.state=='SAFE_STATE'
    s.reset()
    assert s.read_capture()['available'] is False


def test_invalid_virtual_graph_returns_stable_error_without_running():
    s=VirtualHardwareStation('v1')
    with pytest.raises(RuntimeError) as caught:
        s.apply_circuit({'schema_version':'1.0','circuit_id':'bad','modules':[{'id':'G','type':'NO_MODEL'}],'connections':[]})
    assert getattr(caught.value,'code',None)=='UNEXECUTABLE'


def test_virtual_trigger_configuration_is_truthfully_unavailable():
    s=VirtualHardwareStation('v1')
    reply=s.configure_trigger({'signal':'L.IN','edge':'RISING'})
    assert reply['accepted'] is False and reply['code']=='NOT_IMPLEMENTED'
