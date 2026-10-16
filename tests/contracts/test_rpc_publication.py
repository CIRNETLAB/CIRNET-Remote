"""Repeated unchanged generation does not rewrite files imported by consumers."""
import importlib.util
from pathlib import Path

def test_repeated_rpc_generation_does_not_replace_unchanged_bindings(tmp_path,monkeypatch):
    source=Path(__file__).resolve().parents[2]/'scripts/generate_hardware_rpc.py'
    spec=importlib.util.spec_from_file_location('rpc_publication',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    output=tmp_path/'generated';module.generate(output)
    before={path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in output.iterdir()}
    replace=Path.replace
    def guarded(path,target):
        if Path(target).parent==output:raise PermissionError('an unchanged consumer binding must not be replaced')
        return replace(path,target)
    monkeypatch.setattr(Path,'replace',guarded)
    module.generate(output)
    assert {path.name:(path.read_bytes(),path.stat().st_mtime_ns) for path in output.iterdir()}==before
