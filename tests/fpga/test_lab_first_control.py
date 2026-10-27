"""Scaffold contracts plus compiler/RTL behavior checks when tools are present."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest
from jsonschema import Draft202012Validator, ValidationError

ROOT=Path(__file__).resolve().parents[2]
TOP=ROOT/'fpga/experiment-controller/rtl/top.v'
INSTRUMENT=ROOT/'fpga/instrument/rtl/top.v'


def test_control_boundary_names_and_transport_neutral_contract():
    text=TOP.read_text()
    for port in ['command_valid','command_code','safe_condition','scan_done','scan_success',
                 'plan_valid','routing_ready','protection_ready','watchdog_armed','watchdog_expired',
                 'fault_in','drive_enable','routing_enable','topology_scan_enable','experiment_clock']:
        assert port in text, f'missing control boundary: {port}'
    schema=json.loads((ROOT/'contracts/fpga-protocol/control.schema.json').read_text())
    Draft202012Validator.check_schema(schema)
    validator=Draft202012Validator(schema)
    request={'protocol_version':'1.0-scaffold','sequence':1,'operation':'SAFE_STATE'}
    validator.validate(request)
    with pytest.raises(ValidationError): validator.validate({**request,'operation':'AUTO_CORRECT_STUDENT_WIRING'})
    with pytest.raises(ValidationError): validator.validate({**request,'protocol_version':'0.1-dev'})


def test_serial_and_usb_spi_adapters_never_fake_hardware_success():
    from scripts.hardware_artifact import installed_provenance
    assert installed_provenance()['version'] == '0.1.1'
    from hardware_service.fpga_transport import SerialFpgaTransport, UsbSpiFpgaTransport
    for transport in [SerialFpgaTransport(),UsbSpiFpgaTransport()]:
        assert transport.available is False
        with pytest.raises(RuntimeError) as caught: transport.exchange(b'control',timeout_s=1)
        assert caught.value.code=='HARDWARE_UNAVAILABLE'


def test_future_instrument_interfaces_are_explicitly_unavailable():
    assert INSTRUMENT.is_file(),'future instrument interface missing'
    text=INSTRUMENT.read_text()
    for port in ['acquisition_clk','generator_clk','sdram_clk','logic_analyzer_available',
                 'scope_2ch_available','generator_2ch_available','capture_valid','sdram_request']:
        assert port in text
    docs=(ROOT/'fpga/instrument/README.md').read_text()
    for marker in ['EP4CE10','SDRAM Arbiter','Trigger','Timestamp','CDC','TBD_BY_HARDWARE_DESIGN']:
        assert marker in docs


def test_rtl_compiles_with_slang_when_available():
    pytest.importorskip('pyslang',reason='optional slang compiler is unavailable')
    from pyslang.syntax import SyntaxTree
    from pyslang.ast import Compilation
    compilation=Compilation()
    for path in [TOP,INSTRUMENT,ROOT/'fpga/simulation/tb_lab_first_control.v']:
        assert path.is_file()
        compilation.addSyntaxTree(SyntaxTree.fromFile(str(path)))
    errors=[str(d.code) for d in compilation.getAllDiagnostics() if d.isError()]
    assert not errors,errors


def test_iverilog_safety_behavior_when_available(tmp_path):
    compiler,runtime=shutil.which('iverilog'),shutil.which('vvp')
    if not compiler or not runtime: pytest.skip('Icarus/vvp unavailable locally; required in FPGA CI')
    image=tmp_path/'lab-control.vvp'
    built=subprocess.run([compiler,'-g2012','-s','tb_lab_first_control','-o',str(image),str(TOP),str(INSTRUMENT),
                          str(ROOT/'fpga/simulation/tb_lab_first_control.v')],capture_output=True,text=True,timeout=30)
    assert built.returncode==0,built.stdout+built.stderr
    result=subprocess.run([runtime,str(image)],capture_output=True,text=True,timeout=30)
    assert result.returncode==0,result.stdout+result.stderr
    assert 'LAB_FIRST_RTL_PASS' in result.stdout
