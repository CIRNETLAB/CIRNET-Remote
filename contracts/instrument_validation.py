"""Shared instrument guards; optional limits come only from the station profile."""
import math
from jsonschema import ValidationError
from contracts.validation import validate

ROLE_INSTRUMENT={'LOGIC_ANALYZER':'logic_analyzer','SCOPE':'oscilloscope','GENERATOR':'generator'}


def validate_generator(configuration,capability):
    try:
        validate('GeneratorConfiguration',configuration)
        validate('GeneratorCapability',capability)
    except ValidationError:
        raise ValueError('UNEXECUTABLE') from None
    if configuration['channel']>capability['channels']: raise ValueError('UNEXECUTABLE')
    for key in ['frequency_hz','amplitude_vpp','offset_v','phase_degrees']:
        if key in configuration and not math.isfinite(configuration[key]): raise ValueError('UNEXECUTABLE')
    if 'supported_waveforms' in capability and configuration['waveform'] not in capability['supported_waveforms']:
        raise ValueError('UNEXECUTABLE')
    checks=[('frequency_min_hz','frequency_hz',False),('frequency_max_hz','frequency_hz',True),
            ('amplitude_max_vpp','amplitude_vpp',True),('offset_min_v','offset_v',False),('offset_max_v','offset_v',True)]
    for limit,parameter,upper in checks:
        if limit in capability and (configuration[parameter]>capability[limit] if upper else configuration[parameter]<capability[limit]):
            raise ValueError('UNEXECUTABLE')
    return configuration


def validate_plan_instruments(plan,capabilities):
    caps=capabilities['instrument_capabilities']
    validate('InstrumentCapabilities',caps)
    bindings={entry['endpoint_id']:entry for entry in plan['endpoint_bindings']}
    channels=set(); instrument_endpoints=set(); generator_channels=set()
    for allocation in plan['instrument_allocations']:
        role=allocation['instrument']; name=ROLE_INSTRUMENT.get(role)
        binding=bindings.get(allocation['endpoint_id']); channel=allocation['channel']
        if (not name or not binding or binding['role']!=role or type(channel) is not int
                or not 1<=channel<=caps[name]['channels'] or (name,channel) in channels
                or allocation['endpoint_id'] in instrument_endpoints):
            raise ValueError('UNEXECUTABLE')
        if capabilities['mode']=='hardware' and role in ('SCOPE','GENERATOR') and not capabilities['physical_analog_routing']:
            raise ValueError('UNEXECUTABLE')
        channels.add((name,channel)); instrument_endpoints.add(allocation['endpoint_id'])
        if role=='GENERATOR': generator_channels.add(channel)
    if {key for key,binding in bindings.items() if binding['role'] in ROLE_INSTRUMENT}!=instrument_endpoints:
        raise ValueError('UNEXECUTABLE')
    configured=set()
    for config in plan['generator_config']:
        validate_generator(config,caps['generator'])
        if config['channel'] in configured or (config['enabled'] and config['channel'] not in generator_channels):
            raise ValueError('UNEXECUTABLE')
        configured.add(config['channel'])
    if len(plan['capture_config']['signals'])>caps['logic_analyzer']['channels']:
        raise ValueError('UNEXECUTABLE')
    return plan
