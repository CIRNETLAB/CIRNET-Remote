"""Native capability truth and generator controls use the same guarded plan."""
from copy import deepcopy
from pathlib import Path
import sys

import pytest
from google.protobuf.json_format import MessageToDict, ParseDict

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/hardware-service'))
from contracts.validation import validate
from hardware_service.models import StationCapabilities
from hardware_service.rpc import LifecycleRpc
from hardware_service.station.physical import PhysicalHardwareStation
from hardware_service.station.virtual import VirtualHardwareStation
from test_physical_station import ProtectedTestDriver, plan as source_plan, error_code


def generator_configuration(**values):
    return {'channel': 1, 'waveform': 'SINE', 'frequency_hz': 1000,
            'amplitude_vpp': 1, 'offset_v': 0, 'enabled': True, **values}


class GeneratorTestDriver(ProtectedTestDriver):
    """Synthetic profile limits and safe acknowledgements, with no hardware claim."""
    def __init__(self, *, runtime=False):
        super().__init__()
        self.runtime = runtime
        self.configurations = []
        self.prepared_plan = None

    def get_capabilities(self):
        value = super().get_capabilities()
        value['physical_analog_routing'] = True  # Synthetic routed-generator profile only.
        value['routing_resources'][0]['roles'].append('GENERATOR')
        value['instrument_capabilities'] = {
            'logic_analyzer': {'channels': 1, 'runtime_reconfiguration_supported': False},
            'oscilloscope': {'channels': 0, 'runtime_reconfiguration_supported': False},
            'generator': {'channels': 2, 'runtime_reconfiguration_supported': self.runtime,
                          'supported_waveforms': ['SINE', 'SQUARE'], 'frequency_min_hz': 100,
                          'frequency_max_hz': 10000, 'amplitude_max_vpp': 3,
                          'offset_min_v': -1, 'offset_max_v': 1},
        }
        return value

    def prepare_execution(self, value):
        self.prepared_plan = deepcopy(value)
        return super().prepare_execution(value)

    def configure_generator(self, value):
        self.calls.append('generator')
        self.configurations.append(deepcopy(value))
        return {'accepted': True}


def generator_plan():
    value = source_plan()
    value['endpoint_bindings'][0]['role'] = 'GENERATOR'
    value['instrument_allocations'] = [{'endpoint_id': 'x', 'instrument': 'GENERATOR', 'channel': 1}]
    value['generator_config'] = [generator_configuration()]
    return value


def scanned_station(driver):
    station = PhysicalHardwareStation('physical-1', driver=driver)
    station.enter_safe_state()
    station.scan_topology()
    station.read_runtime_safety()
    return station


def prepare_generator(station, value=None):
    return station.prepare_execution(value or generator_plan(),
        {'schema_version': '1.0', 'decision': 'RUN_NORMAL', 'reasons': []})


def start_generator(station):
    prepare_generator(station)
    station.apply_routing()
    station.guarded_power_up()
    station.arm_capture(generator_plan()['capture_config'])
    station.start_execution()


def test_native_capabilities_export_only_structured_instrument_truth():
    empty = StationCapabilities('offline', 'hardware', False).to_dict()
    validate('StationCapabilities', empty)
    assert set(empty['instrument_capabilities']) == {'logic_analyzer', 'oscilloscope', 'generator'}
    assert all(capability == {'channels': 0, 'runtime_reconfiguration_supported': False}
               for capability in empty['instrument_capabilities'].values())
    virtual = VirtualHardwareStation('v1').get_capabilities().to_dict()
    validate('StationCapabilities', virtual)
    assert virtual['instrument_capabilities']['logic_analyzer']['channels'] == 4
    assert virtual['instrument_capabilities']['generator']['channels'] == 0
    assert not {'instruments', 'logic_analyzer_channels', 'oscilloscope_channels', 'generator_channels'} & set(virtual)


def test_generator_profile_preserves_optional_rpc_limit_presence():
    from contracts.generated import rpc_v2_pb2 as pb
    base = {'channels': 2, 'runtime_reconfiguration_supported': False}
    message = ParseDict(base, pb.GeneratorCapability())
    decoded = MessageToDict(message, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)
    assert not {'frequency_min_hz', 'frequency_max_hz', 'amplitude_max_vpp', 'offset_min_v', 'offset_max_v', 'status'} & set(decoded)
    limited = ParseDict({**base, 'offset_min_v': 0, 'frequency_max_hz': 10000}, pb.GeneratorCapability())
    decoded = MessageToDict(limited, preserving_proto_field_name=True, always_print_fields_with_no_presence=True)
    assert decoded['offset_min_v'] == 0 and decoded['frequency_max_hz'] == 10000
    assert 'offset_max_v' not in decoded


def test_baseline_generator_configuration_is_accepted_in_plan_before_power_up():
    driver = GeneratorTestDriver()
    station = scanned_station(driver)
    assert prepare_generator(station)['accepted'] is True
    assert driver.prepared_plan['generator_config'] == [generator_configuration()]
    assert 'power' not in driver.calls and 'generator' not in driver.calls


@pytest.mark.parametrize('change', [
    {'channel': 0}, {'channel': 3}, {'frequency_hz': 99}, {'frequency_hz': 10001},
    {'amplitude_vpp': 4}, {'offset_v': -2}, {'offset_v': 2}, {'waveform': 'TRIANGLE'},
])
def test_raw_rpc_plan_cannot_bypass_generator_profile_validation(change):
    from contracts.generated import rpc_v2_pb2 as pb
    driver = GeneratorTestDriver()
    station = scanned_station(driver)
    value = generator_plan()
    value['generator_config'][0].update(change)
    request = pb.PrepareExecutionRequest(target=pb.Target(station_id='physical-1', experiment_id='e1'),
        plan=ParseDict(value, pb.InstrumentationExecutionPlan()),
        decision=pb.ExecutionDecision(schema_version='1.0', decision='RUN_NORMAL'))
    reply = LifecycleRpc({'physical-1': station}, pb).PrepareExecution(request, None)
    assert reply.accepted is False and reply.code == pb.UNEXECUTABLE
    assert 'prepare' not in driver.calls


def test_raw_plan_rejects_duplicate_instrument_channel_allocation():
    driver = GeneratorTestDriver()
    station = scanned_station(driver)
    value = generator_plan()
    value['instrument_allocations'].append(deepcopy(value['instrument_allocations'][0]))
    error_code(lambda: prepare_generator(station, value), 'UNEXECUTABLE')
    assert 'prepare' not in driver.calls


def test_runtime_supported_generator_reconfigures_only_running_owned_channel():
    driver = GeneratorTestDriver(runtime=True)
    station = scanned_station(driver)
    error_code(lambda: station.configure_generator(generator_configuration()), 'INVALID_STATE')
    start_generator(station)
    assert station.configure_generator(generator_configuration(frequency_hz=2000))['accepted'] is True
    assert driver.configurations == [generator_configuration(frequency_hz=2000)]
    error_code(lambda: station.configure_generator(generator_configuration(channel=2)), 'UNEXECUTABLE')
    assert len(driver.configurations) == 1


def test_runtime_disabled_generator_cannot_reconfigure_running_plan():
    driver = GeneratorTestDriver(runtime=False)
    station = scanned_station(driver)
    start_generator(station)
    error_code(lambda: station.configure_generator(generator_configuration()), 'NOT_IMPLEMENTED')
    assert not driver.configurations


def test_runtime_generator_requires_fresh_safe_evidence_before_driver_control():
    driver = GeneratorTestDriver(runtime=True)
    station = scanned_station(driver)
    start_generator(station)
    driver.safety = 'UNSAFE'
    error_code(lambda: station.configure_generator(generator_configuration()), 'UNSAFE')
    assert not driver.configurations and station.state == 'FAULT'


def test_live_clock_and_trigger_are_explicitly_unavailable():
    driver = GeneratorTestDriver(runtime=True)
    station = scanned_station(driver)
    start_generator(station)
    error_code(lambda: station.configure_clock({'signal': 'x', 'period_ns': 2, 'cycles': 1}), 'NOT_IMPLEMENTED')
    error_code(lambda: station.configure_trigger({'signal': 'x', 'edge': 'RISING'}), 'NOT_IMPLEMENTED')


def test_virtual_plan_cannot_allocate_unavailable_scope_channel():
    station = VirtualHardwareStation('v1')
    station.apply_circuit({'schema_version': '1.0', 'circuit_id': 'input',
        'modules': [{'id': 'X', 'type': 'DIGITAL_SWITCH'}], 'connections': []})
    value = source_plan()
    value.update(station_id='v1', endpoint_bindings=[{'endpoint_id': 'scope', 'node_id': 'X.OUT', 'role': 'SCOPE'}],
                 routing_allocations=[], instrument_allocations=[{'endpoint_id': 'scope', 'instrument': 'SCOPE', 'channel': 1}])
    error_code(lambda: station.prepare_execution(value,
        {'schema_version': '1.0', 'decision': 'RUN_NORMAL', 'reasons': []}), 'UNEXECUTABLE')
