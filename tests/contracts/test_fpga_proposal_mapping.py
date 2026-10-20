"""Repository schema compatibility does not certify the proposed FPGA board."""
import json
from pathlib import Path
import pytest
from jsonschema import ValidationError
from contracts.validation import validate

ROOT=Path(__file__).resolve().parents[2]


def plan():
    return {'schema_version':'1.0','station_id':'unavailable-board','experiment_id':'fixture',
        'power_policy':{'profile_id':'fixture-only','guarded':True},'endpoint_bindings':[],
        'routing_allocations':[],'instrument_allocations':[],'clock_config':{},'generator_config':[],
        'capture_config':{'signals':[],'duration_ns':100},'test_vectors':[],
        'runtime_safety_policy':{'profile_id':'fixture-only','watchdog_required':True}}


def test_current_mapping_is_explicit_about_independent_open_hardware_gates():
    path=ROOT/'docs/architecture/fpga-contract-conformance.md'
    assert path.is_file(),'Current Contracts need a separate mapping; do not rewrite the historical proposal.'
    text=path.read_text(encoding='utf-8')
    for marker in ('PhysicalExecutionPlan','InstrumentationExecutionPlan','FpgaExecutionImage',
        'OPEN-ABI','OPEN-FRESHNESS','OPEN-HARDWARE','NCAP v1','sampled-v2','1.0-scaffold'):
        assert marker in text


def test_proposal_names_do_not_become_implicit_runtime_contract_aliases():
    manifest=json.loads((ROOT/'contracts/manifest.json').read_text(encoding='utf-8'))
    records={value['id']:value for value in manifest['contracts']}
    assert records['InstrumentationExecutionPlan']['version']=='1.0'
    assert records['InstrumentationExecutionPlan']['visibility']=='internal'
    assert records['FpgaControlScaffold']['version']=='1.0-scaffold'
    assert records['FpgaControlScaffold']['visibility']=='internal'
    assert records['AnalogCaptureDescriptor']['version']=='2.0'
    assert 'PhysicalExecutionPlan' not in records and 'FpgaExecutionImage' not in records
    assert validate('InstrumentationExecutionPlan',plan())==plan()


@pytest.mark.parametrize('private_control',['register_address','mux_address','sdram_address','usb_command','spi_command','fpga_image'])
def test_execution_plan_cannot_smuggle_board_transport_or_raw_memory(private_control):
    with pytest.raises(ValidationError):validate('InstrumentationExecutionPlan',{**plan(),private_control:0})


def test_scaffold_and_sampled_helpers_do_not_enable_an_absent_physical_producer():
    from hardware_service.station.physical import PhysicalHardwareStation
    from hardware_service.fpga_transport import SerialFpgaTransport,UsbSpiFpgaTransport
    station=PhysicalHardwareStation('unavailable-board')
    before=station.get_capabilities().to_dict();validate('StationCapabilities',before)
    assert before['available'] is False and before['physical_execution_slots']==0
    assert before['hardware_rpc_version']=='2.0' and before['fpga_protocol_version']=='UNAVAILABLE'
    assert all(value['channels']==0 for value in before['instrument_capabilities'].values())
    for transport in (SerialFpgaTransport(),UsbSpiFpgaTransport()):
        with pytest.raises(RuntimeError) as caught:transport.exchange(b'fixture',timeout_s=1)
        assert caught.value.code=='HARDWARE_UNAVAILABLE'
    from contracts.capture_codec import decode_sampled
    corpus=json.loads((ROOT/'contracts/fixtures/capture/conformance.json').read_text(encoding='utf-8'))
    fixture=next(value for value in corpus['cases'] if value['valid'] and value['version']==2)
    decoded=decode_sampled(bytes.fromhex(fixture['payload_hex']),fixture['descriptor'])
    assert decoded['descriptor']['header']['source']=='simulation'
    assert decoded['descriptor']['header']['provenance']=='synthetic_fixture'
    assert station.get_capabilities().to_dict()==before
