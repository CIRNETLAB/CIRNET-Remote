"""Remote owns source/Contracts/Hardware agreement, not standalone RTL tests."""
import json
from pathlib import Path

import pytest

from scripts.check_fpga_consumer import check
from scripts.hardware_artifact import installed_provenance

ROOT = Path(__file__).resolve().parents[2]


def test_selected_fpga_source_and_installed_contracts_keep_independent_versions():
    result = check()
    lock = json.loads((ROOT / 'integration/fpga-version.json').read_text(encoding='utf-8'))
    assert result['version'] == lock['source']['version'] == '0.1.0'
    assert result['contractsVersion'] == lock['contracts']['version'] == '1.0.1'
    assert result['logicalProtocolVersion'] == lock['logicalProtocolVersion'] == '1.0-scaffold'
    assert result['registerMapVersion'] == lock['registerMapVersion'] == '1.0-reserved'
    assert result['physicalAvailable'] is lock['physicalAvailable'] is False
    assert result['b12'] == 'illustrative-target-rejected'


def test_selected_scaffold_never_enables_installed_hardware_transport():
    check()
    assert installed_provenance()['version'] == '0.1.1'
    from hardware_service.fpga_transport import SerialFpgaTransport, UsbSpiFpgaTransport
    from hardware_service.station.physical import PhysicalHardwareStation
    from contracts.validation import validate
    station = PhysicalHardwareStation('unavailable-board')
    capabilities = station.get_capabilities().to_dict()
    validate('StationCapabilities', capabilities)
    assert capabilities['available'] is False and capabilities['physical_execution_slots'] == 0
    assert capabilities['hardware_rpc_version'] == '2.0' and capabilities['fpga_protocol_version'] == 'UNAVAILABLE'
    assert all(value['channels'] == 0 for value in capabilities['instrument_capabilities'].values())
    for transport in (SerialFpgaTransport(), UsbSpiFpgaTransport()):
        assert transport.available is False
        with pytest.raises(RuntimeError) as caught: transport.exchange(b'control', timeout_s=1)
        assert caught.value.code == 'HARDWARE_UNAVAILABLE'
    assert station.get_capabilities().to_dict() == capabilities
