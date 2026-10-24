"""Read the installed breadboard projection without writing retained source."""
import argparse
from pathlib import Path
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
           select=lambda path: path.endswith('/breadboardTopologies.json'))


if __name__ == '__main__':
    main()
