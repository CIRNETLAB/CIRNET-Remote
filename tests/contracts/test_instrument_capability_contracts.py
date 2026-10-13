"""Instrument availability and profile limits have one canonical source."""
from copy import deepcopy
import importlib
import pytest
from jsonschema import ValidationError
from contracts.validation import validate


def capabilities():
    return {'logic_analyzer':{'channels':4,'runtime_reconfiguration_supported':False},
            'oscilloscope':{'channels':0,'runtime_reconfiguration_supported':False},
            'generator':{'channels':2,'runtime_reconfiguration_supported':False}}


def generator(**values):
    return {'channel':1,'waveform':'SINE','frequency_hz':1000,'amplitude_vpp':1,
            'offset_v':0,'enabled':True,**values}


def test_single_instrument_capability_contract_has_no_duplicate_availability():
    value=capabilities()
    assert validate('InstrumentCapabilities',value)==value
    bad=deepcopy(value); bad['generator']['available']=False
    with pytest.raises(ValidationError): validate('InstrumentCapabilities',bad)


def test_profile_limits_are_optional_and_inconsistent_ranges_are_rejected():
    value=capabilities()
    assert 'frequency_max_hz' not in validate('InstrumentCapabilities',value)['generator']
    value['generator'].update(frequency_min_hz=2000,frequency_max_hz=1000)
    with pytest.raises(ValidationError): validate('InstrumentCapabilities',value)


@pytest.mark.parametrize('change',[
    {'channel':3}, {'frequency_hz':50}, {'frequency_hz':20000},
    {'amplitude_vpp':4}, {'offset_v':-2}, {'offset_v':2}, {'waveform':'TRIANGLE'},
])
def test_generator_profile_limits_are_enforced_only_when_declared(change):
    limits={**capabilities()['generator'],'supported_waveforms':['SINE','SQUARE'],
            'frequency_min_hz':100,'frequency_max_hz':10000,'amplitude_max_vpp':3,
            'offset_min_v':-1,'offset_max_v':1}
    module=importlib.import_module('contracts.instrument_validation')
    module.validate_generator(generator(),limits)
    with pytest.raises(ValueError,match='UNEXECUTABLE'): module.validate_generator(generator(**change),limits)


def test_unavailable_generator_rejects_output_without_fabricated_limits():
    module=importlib.import_module('contracts.instrument_validation')
    module.validate_generator(generator(frequency_hz=1e12,amplitude_vpp=1000,offset_v=-500),capabilities()['generator'])
    with pytest.raises(ValueError,match='UNEXECUTABLE'):
        module.validate_generator(generator(),{'channels':0,'runtime_reconfiguration_supported':False})
