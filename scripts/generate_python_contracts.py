"""Delegate Python codegen to installed Contracts tooling; output is external."""
import argparse
from pathlib import Path
from contracts.codegen.generate_python_contracts import *
from contracts.codegen.generate_python_contracts import generate as _generate
try:
    from scripts.contract_exports import external_output, checked_destination
except ModuleNotFoundError:
    from contract_exports import external_output, checked_destination


def generate(output):
    path = Path(output)
    destination = checked_destination(external_output(path.parent), path.name)
    return _generate(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    generate(parser.parse_args().output)
