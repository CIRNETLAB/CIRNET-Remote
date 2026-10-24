"""Compatibility command reading prebuilt output from the installed Contracts wheel."""
import argparse
from pathlib import Path
from contracts.codegen.generate_contracts import publish_artifacts, capture_layout_outputs
try:
    from scripts.contract_exports import export as generate
except ModuleNotFoundError:
    from contract_exports import export as generate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output-root', type=Path)
    args = parser.parse_args()
    generate(check=args.check, output_root=args.output_root)


if __name__ == '__main__':
    main()
