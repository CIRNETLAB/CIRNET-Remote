"""Check API/NCAP anchors from the selected artifact without rewriting baselines."""
import argparse
from importlib.resources import files
import json
from pathlib import Path
import sys
from contracts.public_compatibility import CompatibilityError, check_compatibility


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--openapi', type=Path)
    parser.add_argument('--layout', type=Path)
    parser.add_argument('--baseline', type=Path)
    options = parser.parse_args()
    resource = files('contracts')
    inputs = (options.openapi or resource.joinpath('api/openapi.json'),
              options.layout or resource.joinpath('capture/layout.json'),
              options.baseline or resource.joinpath('compatibility/2026-10-16/public-wire-baseline.json'))
    try:
        check_compatibility(*(json.loads(path.read_text(encoding='utf-8')) for path in inputs))
    except (CompatibilityError, ValueError, OSError) as error:
        print('Public compatibility check failed: ' + str(error), file=sys.stderr)
        return 1
    print('Selected artifact preserves supported unpublished API/NCAP anchors.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
