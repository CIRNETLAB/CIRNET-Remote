"""Installed catalog helper compatibility; Remote projections remain frozen."""
import argparse
from pathlib import Path
from contracts.codegen.sync_editor_catalog import *
try:
    from scripts.contract_exports import export
except ModuleNotFoundError:
    from contract_exports import export


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output-root', type=Path)
    args = parser.parse_args()
    export(check=args.check, output_root=args.output_root,
           select=lambda path: '/src/data/' in path or path.endswith(('physical-parts.v1.json', 'signal-port-catalog.json')))


if __name__ == '__main__':
    main()
