"""Check supported API/NCAP anchors. This command never rewrites its baseline."""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from contracts.public_compatibility import CompatibilityError,check_compatibility


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--openapi',type=Path,default=ROOT/'contracts/api/openapi.json')
    parser.add_argument('--layout',type=Path,default=ROOT/'contracts/capture/layout.json')
    parser.add_argument('--baseline',type=Path,default=ROOT/'contracts/compatibility/2026-10-16/public-wire-baseline.json')
    options=parser.parse_args()
    try:
        values=[json.loads(path.read_text(encoding='utf-8')) for path in (options.openapi,options.layout,options.baseline)]
        check_compatibility(*values)
    except (CompatibilityError,ValueError,OSError) as error:
        print('Public compatibility check failed: '+str(error),file=sys.stderr)
        return 1
    print('Supported unpublished API/NCAP compatibility anchors pass.')
    return 0


if __name__=='__main__':raise SystemExit(main())
