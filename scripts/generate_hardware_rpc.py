"""Delegate RPC codegen to installed Contracts tooling; default only checks imports."""
import argparse
from pathlib import Path
from contracts.codegen.generate_hardware_rpc import generate as _generate, protoc
try:
    from scripts.contract_exports import external_output
except ModuleNotFoundError:
    from contract_exports import external_output


def generate(output):
    return _generate(external_output(output))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.output:
        generate(args.output)
    else:
        from contracts.generated import rpc_v2_pb2, rpc_v2_pb2_grpc
        print('RPC bindings supplied by the pinned Contracts wheel.')
