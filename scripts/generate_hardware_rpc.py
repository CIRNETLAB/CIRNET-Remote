"""Deterministic generate-at-build hardware RPC v2 bindings (not committed)."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
from grpc_tools import protoc

ROOT = Path(__file__).resolve().parents[1]


def generate(output: Path) -> None:
    source = ROOT / 'contracts/hardware/v2'
    output.mkdir(parents=True, exist_ok=True)
    output=output.resolve()
    with TemporaryDirectory(prefix='.codegen-',dir=output) as temporary:
        staging=Path(temporary).resolve()
        if not staging.is_relative_to(output): raise RuntimeError('Invalid codegen staging path')
        code = protoc.main(['protoc', f'-I{source}', f'--python_out={staging}',
                            f'--grpc_python_out={staging}', str(source / 'rpc_v2.proto')])
        if code:
            raise RuntimeError(f'Protobuf compilation failed ({code})')
        path = staging / 'rpc_v2_pb2_grpc.py'
        text = path.read_text(encoding='utf-8').replace('import rpc_v2_pb2 as', 'from . import rpc_v2_pb2 as')
        path.write_text(text, encoding='utf-8', newline='\n')
        (staging / '__init__.py').write_text('', encoding='utf-8')
        for name in ('rpc_v2_pb2.py','rpc_v2_pb2_grpc.py','__init__.py'):
            candidate,target=staging/name,output/name
            # Consumers may be importing these deterministic bindings while a
            # test/build requests generation again. Avoid replacing identical
            # files (and unnecessary Windows sharing/antivirus contention).
            if target.is_file() and candidate.read_bytes()==target.read_bytes(): continue
            candidate.replace(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'contracts/generated')
    generate(parser.parse_args().output)
