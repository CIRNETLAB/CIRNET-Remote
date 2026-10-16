"""Typed dispatch preserves digital/DC behavior and reports unavailable engines."""
import importlib
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[3]


def dispatcher():
    assert (ROOT/'simulator/circuit-simulator/netcircuit_sim/dispatch.py').exists(),'Typed simulation dispatcher is missing.'
    return importlib.import_module('netcircuit_sim.dispatch').SimulationDispatcher()


def request(*modules):
    return {'schema_version':'1.0','graph':{'schema_version':'1.1','circuit_id':'dispatch','modules':list(modules),'connections':[]},
            'capture_config':{'signals':[],'duration_ns':20}}


def test_typed_digital_dispatch_uses_actual_event_samples_and_preserves_document():
    value=request({'id':'D','type':'DIGITAL_SWITCH','properties':{'state':True}})
    result=dispatcher().simulate(value).model_dump(exclude_unset=True)
    assert result['status']=='COMPLETE' and result['classification']['kind']=='DIGITAL'
    assert result['capture']['samples']==[{'signal':'D.OUT','time_ns':0,'value':1}]
    assert value['graph']['schema_version']=='1.1' and 'signal_domains' not in value['graph']['modules'][0]


@pytest.mark.parametrize('modules,kind,code',[
    ([{'id':'C','type':'CAPACITOR_CERAMIC'}],'ANALOG','ANALOG_UNAVAILABLE'),
    ([{'id':'C','type':'CAPACITOR_CERAMIC'},{'id':'D','type':'DIGITAL_SWITCH'}],'MIXED','MIXED_SIGNAL_UNAVAILABLE'),
    ([{'id':'U','type':'NO_MODEL','signal_domains':{'version':'1.0','ports':{'OUT':'DIGITAL'}}}],'UNKNOWN','UNEXECUTABLE'),
])
def test_unavailable_engines_return_typed_errors_without_fabricated_samples(modules,kind,code):
    result=dispatcher().simulate(request(*modules)).model_dump(exclude_unset=True)
    assert result['status'] in ('UNAVAILABLE','REJECTED') and result['classification']['kind']==kind
    assert result['code']==code and 'capture' not in result and 'samples' not in result


def test_bounded_dc_capture_keeps_its_existing_local_reference_model():
    value=request({'id':'PS','type':'DC_SUPPLY','properties':{'voltage':5}},
        {'id':'R','type':'RESISTOR_AXIAL','properties':{'resistanceOhms':330}},{'id':'L','type':'LED_LTL307EE'})
    value['graph']['connections']=[{'source':'PS.PLUS','destination':'R.A'},
        {'source':'R.B','destination':'L.A'},{'source':'L.K','destination':'PS.MINUS'}]
    result=dispatcher().simulate(value).model_dump(exclude_unset=True)
    assert result['status']=='COMPLETE' and result['classification']['kind']=='DC_DIGITAL'
    assert result['capture']['device_states']['L']['state']=='ON'
    assert result['capture']['device_states']['L']['currentAmps']==pytest.approx((5-2)/330)


def test_future_namespace_has_a_typed_execution_rejection_without_rewriting_saved_metadata():
    value=request({'id':'D','type':'DIGITAL_SWITCH','signal_domains':{'version':'2.0','private-future-field':True}})
    result=dispatcher().simulate(value).model_dump(exclude_unset=True)
    assert result['status']=='REJECTED' and result['code']=='UNSUPPORTED_SIGNAL_DOMAIN_VERSION'
    assert value['graph']['modules'][0]['signal_domains']=={'version':'2.0','private-future-field':True}
