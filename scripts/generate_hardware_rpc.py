"""Deterministic generate-at-build hardware RPC v2 bindings (not committed)."""
import argparse
from pathlib import Path
from grpc_tools import protoc

ROOT = Path(__file__).resolve().parents[1]


def generate(output: Path) -> None:
    source = ROOT / 'contracts/hardware/v2'
    output.mkdir(parents=True, exist_ok=True)
    code = protoc.main(['protoc', f'-I{source}', f'--python_out={output}',
                        f'--grpc_python_out={output}', str(source / 'rpc_v2.proto')])
    if code:
        raise RuntimeError(f'Protobuf compilation failed ({code})')
    path = output / 'rpc_v2_pb2_grpc.py'
    text = path.read_text(encoding='utf-8').replace('import rpc_v2_pb2 as', 'from . import rpc_v2_pb2 as')
    path.write_text(text, encoding='utf-8', newline='\n')
    (output / '__init__.py').write_text('', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'services/hardware-service/hardware_service/generated')
    generate(parser.parse_args().output)
