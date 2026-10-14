import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def compiled(tmp_path):
    script = ROOT / 'scripts/generate_hardware_rpc.py'
    assert script.is_file(), 'versioned deterministic RPC codegen missing'
    result = subprocess.run([sys.executable, str(script), '--output', str(tmp_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    spec = importlib.util.spec_from_file_location('lab_rpc_v2_test_pb2', tmp_path / 'rpc_v2_pb2.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_codegen_module():
    """Load the repository codegen script without depending on sys.path."""
    path = ROOT / 'scripts/generate_hardware_rpc.py'
    spec = importlib.util.spec_from_file_location('netcircuit_generate_hardware_rpc', path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_v2_compiles_and_exposes_lifecycle_without_direct_raw_graph_run(tmp_path):
    module = compiled(tmp_path)
    descriptor = module.DESCRIPTOR
    assert descriptor.package == 'netcircuit.hardware.v2'
    methods = descriptor.services_by_name['HardwareService'].methods_by_name
    required = {'GetCapabilities','EnterSafeState','ScanTopology','ReadRuntimeSafety',
                'PrepareExecution','ApplyRouting','GuardedPowerUp','ConfigureInstrument',
                'ArmCapture','StartExecution','StopExecution','ReadCapture','Reset'}
    assert required <= set(methods.keys())
    assert 'Run' not in methods
    request = methods['StartExecution'].input_type
    assert set(request.fields_by_name) == {'station_id', 'experiment_id'}
    assert methods['PrepareExecution'].input_type.fields_by_name['plan'].message_type.name == 'InstrumentationExecutionPlan'


def test_v2_capabilities_match_domain_and_errors_are_stable(tmp_path):
    module = compiled(tmp_path)
    schema = json.loads((ROOT / 'contracts/physical-lab/lab.schema.json').read_text())
    required = schema['$defs']['StationCapabilities']['required']
    assert set(required) <= set(module.StationCapabilities.DESCRIPTOR.fields_by_name.keys())
    errors = module.ErrorCode.keys()
    assert {'HARDWARE_UNAVAILABLE','INVALID_STATE','UNSAFE','SAFETY_INDETERMINATE',
            'UNEXECUTABLE','RESOURCE_CONFLICT','PROTOCOL_MISMATCH','TIMEOUT','DRIVER_ERROR'} <= set(errors)


def test_codegen_is_repeatable(tmp_path):
    compiled(tmp_path)
    first = (tmp_path / 'rpc_v2_pb2.py').read_bytes()
    compiled(tmp_path)
    assert (tmp_path / 'rpc_v2_pb2.py').read_bytes() == first


def test_failed_codegen_preserves_previous_bindings(tmp_path,monkeypatch):
    codegen = load_codegen_module()
    generate, protoc = codegen.generate, codegen.protoc
    path=tmp_path/'rpc_v2_pb2.py'; path.write_text('previous-valid-bindings')
    def failed(args):
        directory=Path(next(a.split('=',1)[1] for a in args if a.startswith('--python_out=')))
        (directory/'rpc_v2_pb2.py').write_text('partial-corrupt-bindings')
        return 1
    monkeypatch.setattr(protoc,'main',failed)
    import pytest
    with pytest.raises(RuntimeError): generate(tmp_path)
    assert path.read_text()=='previous-valid-bindings'
