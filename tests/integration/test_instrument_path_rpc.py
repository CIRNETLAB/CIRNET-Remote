"""Compiler → actual loopback RPC → synthetic protected instrument adapter.

The test profile acknowledges control operations only; it produces no analog
measurements and establishes no physical hardware capability.
"""
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
for relative in ('services/api',):
    sys.path.insert(0, str(ROOT / relative))

from app.services.hardware_client import HardwareServiceClient, GatewayError
from app.services.lab_compiler import LabExecutionCompiler
from hardware_service.server import build_server
from hardware_service.station.physical import PhysicalHardwareStation
from tests.support.hardware_drivers import GeneratorTestDriver, generator_configuration


@pytest.mark.parametrize('role', ['GENERATOR', 'SCOPE'])
def test_approved_instrument_path_survives_real_rpc_with_arbitrary_analog_routing_disabled(role):
    class InstrumentPathDriver(GeneratorTestDriver):
        def get_capabilities(self):
            value = super().get_capabilities()
            if role == 'SCOPE':
                value['routing_resources'][0]['roles'].append('SCOPE')
                value['instrument_capabilities']['oscilloscope']['channels'] = 2
            return value

    driver = InstrumentPathDriver(runtime=True)
    station = PhysicalHardwareStation('physical-1', driver=driver)
    server = build_server({'physical-1': station})
    port = server.add_insecure_port('127.0.0.1:0')
    server.start()
    gateway = HardwareServiceClient(f'127.0.0.1:{port}')
    try:
        capabilities = gateway.capabilities('physical-1')
        assert capabilities['physical_analog_routing'] is False
        assert gateway.call('physical-1', 'e1', 'enter_safe_state')['accepted'] is True
        assert gateway.call('physical-1', 'e1', 'scan_topology')['nodes'] == [{'node_id': 'N1'}]
        assert gateway.call('physical-1', 'e1', 'read_runtime_safety')['status'] == 'SAFE'
        configuration = {'capture_config': {'signals': [], 'duration_ns': 100}}
        if role == 'GENERATOR': configuration['generator_config'] = [generator_configuration()]
        plan = LabExecutionCompiler().compile(
            {'station_id': 'physical-1', 'experiment_id': 'e1', '_configuration': configuration},
            {'lab_endpoints': [{'endpoint_id': 'instrument', 'role': role, 'fixed_node_id': 'N1'}]},
            capabilities, {'endpoint_bindings': [{'endpoint_id': 'instrument', 'observed_node_id': 'N1'}]})
        assert gateway.call('physical-1', 'e1', 'prepare_execution', plan=plan,
            decision={'schema_version': '1.0', 'decision': 'RUN_NORMAL', 'reasons': []})['accepted'] is True
        assert driver.prepared_plan['routing_allocations'] == [{'endpoint_id': 'instrument', 'resource_id': 'drive-1'}]
        gateway.call('physical-1', 'e1', 'apply_routing')
        gateway.call('physical-1', 'e1', 'guarded_power_up')
        gateway.call('physical-1', 'e1', 'arm_capture', configuration=plan['capture_config'])
        assert gateway.call('physical-1', 'e1', 'start_execution')['accepted'] is True
        if role == 'GENERATOR':
            update = generator_configuration(frequency_hz=2000)
            assert gateway.call('physical-1', 'e1', 'configure_instrument', instrument='generator', configuration=update)['accepted'] is True
            assert driver.configurations == [update]
            with pytest.raises(GatewayError, match='RESOURCE_CONFLICT'):
                gateway.call('physical-1', 'other-experiment', 'configure_instrument', instrument='generator', configuration=update)
            with pytest.raises(GatewayError, match='UNEXECUTABLE'):
                gateway.call('physical-1', 'e1', 'configure_instrument', instrument='generator', configuration={**update, 'channel': 2})
            driver.generator_path = False
            with pytest.raises(GatewayError, match='UNEXECUTABLE'):
                gateway.call('physical-1', 'e1', 'configure_instrument', instrument='generator', configuration=update)
            assert driver.configurations == [update]
    finally:
        try:
            gateway.call('physical-1', 'e1', 'stop_execution')
        finally:
            gateway.close()
            server.stop(0).wait()
