"""Validate/copy the canonical editor breadboard topology into the web boundary."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = ROOT / 'contracts/design-models/breadboards.json'
    data = json.loads(source.read_text(encoding='utf-8'))
    aliases = set()
    for profile in data['profiles']:
        ids = set()
        for kind in profile['moduleTypes']:
            if kind in aliases:
                raise ValueError('Duplicate topology module type')
            aliases.add(kind)
        for contact in profile['contacts']:
            if contact['contactId'] in ids or '.' in contact['contactId']:
                raise ValueError('Ambiguous contact ID')
            ids.add(contact['contactId'])
            if not contact['nodeId'] or len(contact['localPosition']) != 3 or not all(type(v) in (int, float) and math.isfinite(v) for v in contact['localPosition']):
                raise ValueError('Invalid contact descriptor')
        for node in {c['nodeId'] for c in profile['contacts'] if c['nodeId'].startswith('terminal:')}:
            if sum(c['nodeId'] == node for c in profile['contacts']) != 5:
                raise ValueError('Terminal node must contain five holes')
    target = ROOT / 'apps/web/src/data/breadboardTopologies.json'
    if args.check:
        if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != data:
            raise SystemExit('Breadboard topology snapshot is stale')
    else:
        target.write_text(source.read_text(encoding='utf-8'), encoding='utf-8')
    print('Breadboard topology snapshot: OK')


if __name__ == '__main__':
    main()
