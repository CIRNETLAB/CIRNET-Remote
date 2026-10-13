import importlib
from pathlib import Path
import sys
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def engine():
    assert (Path(__file__).resolve().parents[1]/'netcircuit_sim/engine.py').exists(), 'discrete-event engine missing'
    return importlib.import_module('netcircuit_sim.engine')


def graph(gate='AND'):
    return {'schema_version':'1.0','circuit_id':'and1',
            'modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':False}},
                       {'id':'Y','type':'DIGITAL_SWITCH','properties':{'state':True}},
                       {'id':'G','type':gate,'properties':{'delay_ns':8}}, {'id':'L','type':'LED'}],
            'connections':[{'source':'X.OUT','destination':'G.A'},
                           {'source':'Y.OUT','destination':'G.B'}, {'source':'G.Y','destination':'L.IN'}]}


def run(value=None,vectors=None,signals=None,duration=40,**extra):
    e=engine(); plan=e.VirtualCompiler().compile(value or graph())
    return e.run_plan(plan,{'signals':signals or ['L.IN'],'duration_ns':duration,**extra},vectors or [])


def test_and_experiment_propagates_after_model_delay_and_captures_real_events():
    capture=run(vectors=[{'time_ns':20,'inputs':{'X.OUT':1}}])
    assert capture['available'] is True
    assert capture['samples']==[{'signal':'L.IN','time_ns':0,'value':'X'},
                                {'signal':'L.IN','time_ns':8,'value':0},
                                {'signal':'L.IN','time_ns':28,'value':1}]


def test_same_timestamp_vectors_use_final_values_deterministically_without_order_glitches():
    first=[{'time_ns':20,'inputs':{'X.OUT':1}},{'time_ns':20,'inputs':{'Y.OUT':0}}]
    second=list(reversed(first))
    assert run(vectors=first)==run(vectors=second)
    assert run(vectors=first)['samples']==[{'signal':'L.IN','time_ns':0,'value':'X'}, {'signal':'L.IN','time_ns':8,'value':0}]


@pytest.mark.parametrize('gate,expected',[('OR',1),('XOR',1)])
def test_registry_evaluates_or_xor(gate,expected):
    assert run(graph(gate))['samples'][-1]['value']==expected


def test_not_and_unconnected_input_remain_truthful_four_state_values():
    value={'schema_version':'1.0','circuit_id':'not','modules':[{'id':'N','type':'NOT'},{'id':'P','type':'LED'}],
           'connections':[{'source':'N.Y','destination':'P.IN'}]}
    assert run(value,signals=['P.IN'])['samples']==[{'signal':'P.IN','time_ns':0,'value':'X'}]


def test_clock_is_an_event_source_not_fixed_timestep():
    value={'schema_version':'1.0','circuit_id':'clock','modules':[{'id':'C','type':'CLOCK','properties':{'frequency_hz':100000000}}], 'connections':[]}
    assert run(value,signals=['C.OUT'],duration=20)['samples']==[
        {'signal':'C.OUT','time_ns':0,'value':0},{'signal':'C.OUT','time_ns':5,'value':1},
        {'signal':'C.OUT','time_ns':10,'value':0},{'signal':'C.OUT','time_ns':15,'value':1},{'signal':'C.OUT','time_ns':20,'value':0}]


def test_74hc08_has_four_independent_logical_gates():
    value=graph('74HC08')
    value['connections'][0]['destination']='G.A1'; value['connections'][1]['destination']='G.B1'; value['connections'][2]['source']='G.Y1'
    assert run(value)['samples'][-1]['value']==0


def test_invalid_graph_unknown_model_and_extra_input_driver_are_unexecutable():
    e=engine()
    for value in [{'schema_version':'wrong'},graph('NO_MODEL')]:
        with pytest.raises(e.SimulationError): e.VirtualCompiler().compile(value)
    value=graph(); value['connections'].append({'source':'Y.OUT','destination':'G.A'})
    with pytest.raises(e.SimulationError): e.VirtualCompiler().compile(value)


def test_event_and_capture_limits_prevent_unbounded_execution():
    e=engine()
    with pytest.raises(e.SimulationError,match='EVENT_LIMIT'):
        run(vectors=[{'time_ns':i,'inputs':{'X.OUT':i%2}} for i in range(100)],max_events=5,duration=100)


def test_stop_and_reset_invalidate_pending_events():
    e=engine(); simulator=e.DigitalSimulator(e.VirtualCompiler().compile(graph()))
    simulator.stop()
    assert simulator.run({'signals':['L.IN'],'duration_ns':40})['state']=='STOPPED'
    simulator.reset()
    assert simulator.run({'signals':['L.IN'],'duration_ns':40})['samples'][-1]['value']==0


def test_analog_boundary_is_explicitly_unavailable():
    assert (Path(__file__).resolve().parents[1]/'netcircuit_sim/analog.py').exists(), 'analog boundary missing'
    analog=importlib.import_module('netcircuit_sim.analog')
    assert analog.SPICEAdapter().available is False
    with pytest.raises(RuntimeError,match='UNAVAILABLE'): analog.SPICEAdapter().simulate({})


def test_editor_breadboard_pose_is_visual_and_never_an_electrical_net():
    value=graph(); value['modules'].append({'id':'BB','type':'BREADBOARD','position':{'x':5,'y':0,'z':2}})
    assert run(value)['samples'][-1]['value']==0


def test_invalid_source_state_returns_simulation_error():
    e=engine(); value=graph(); value['modules'][0]['properties']['state']='false'
    with pytest.raises(e.SimulationError): e.VirtualCompiler().compile(value)


def test_clock_budget_fails_instead_of_returning_a_silently_truncated_capture():
    e=engine()
    value={'schema_version':'1.0','circuit_id':'clock-cap','modules':[
        {'id':'C','type':'CLOCK','properties':{'frequency_hz':1000000}},
        {'id':'B','type':'DIGITAL_SWITCH','properties':{'state':False}},{'id':'G','type':'AND'}],
        'connections':[{'source':'C.OUT','destination':'G.A'},{'source':'B.OUT','destination':'G.B'}]}
    with pytest.raises(e.SimulationError,match='EVENT_LIMIT'):
        e.run_plan(e.VirtualCompiler().compile(value),{'signals':['G.Y'],'duration_ns':200000000,'max_events':1000000},
                   [{'time_ns':150000000,'inputs':{'B.OUT':1}}])


def test_tiny_positive_clock_frequency_has_a_stable_unexecutable_error():
    e=engine()
    value={'schema_version':'1.0','circuit_id':'tiny','modules':[{'id':'C','type':'CLOCK','properties':{'frequency_hz':1e-320}}], 'connections':[]}
    with pytest.raises(e.SimulationError,match='UNEXECUTABLE'): e.VirtualCompiler().compile(value)


def test_unimplemented_trigger_cannot_be_reported_as_successful_acquisition():
    e=engine()
    with pytest.raises(e.SimulationError,match='NOT_IMPLEMENTED'):
        run(trigger={'signal':'does_not_exist','edge':'RISING'})
