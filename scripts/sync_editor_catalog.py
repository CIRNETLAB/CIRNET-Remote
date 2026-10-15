"""Validate and generate legacy editor and versioned physical-part boundaries."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate_parts(registry):
    if registry.get('schemaVersion') != 1 or registry.get('units') != 'mm':
        raise ValueError('Unsupported physical part registry version or units')
    ids, types = set(), set()
    for part in registry['parts']:
        if part['id'] in ids or part['editorType'] in types:
            raise ValueError('Duplicate physical part identity or type')
        ids.add(part['id']); types.add(part['editorType'])
        package = part['package']
        footprint = package['footprint']
        if not part['datasheet']['url'] or any(type(value) is not int or value < 1 for value in (part['revision'], package['revision'], footprint['revision'])):
            raise ValueError('Physical part requires a source and revisions')
        if not all(type(package['bodyMm'].get(axis)) in (int, float) and math.isfinite(package['bodyMm'][axis]) and package['bodyMm'][axis] > 0 for axis in ('x', 'y', 'z')):
            raise ValueError('Invalid package body dimensions')
        if not all(type(value) in (int, float) and math.isfinite(value) and value > 0 for value in (package['leadDiameterMm'], footprint['pitchMm'])) or not math.isfinite(package['standoffMm']) or package['standoffMm'] < 0:
            raise ValueError('Invalid footprint or lead dimensions')
        if type(footprint['mountable']) is not bool:
            raise ValueError('Footprint requires explicit mounting support')
        pins = package['pins']
        pin_ids = {pin['id'] for pin in pins}
        if not pins or len(pin_ids) != len(pins) or any(not pin_id or '.' in pin_id for pin_id in pin_ids):
            raise ValueError('Ambiguous physical pin identity')
        positions = set()
        for pin in pins:
            position = pin['positionMm']
            if pin['role'] not in {'input', 'output', 'power', 'ground', 'passive', 'nc'} or not all(type(position.get(axis)) in (int, float) and math.isfinite(position[axis]) for axis in ('x', 'y', 'z')):
                raise ValueError('Invalid physical pin descriptor')
            if footprint['mountable'] and position['y'] != 0:
                raise ValueError('Mountable pin tips must lie in the mounting plane')
            if pin['role'] == 'output' and pin.get('outputType') not in {'push-pull', 'open-collector', 'open-drain'}:
                raise ValueError('Output pin requires its driver type')
            key = tuple(position[axis] for axis in ('x', 'y', 'z'))
            if key in positions:
                raise ValueError('Physical pins overlap')
            positions.add(key)
        for connection in part.get('internalConnections', []):
            if len(connection['pins']) != 2 or not set(connection['pins']) <= pin_ids:
                raise ValueError('Internal connection references unknown pins')
        power = part['simulation'].get('power')
        if power and not {power['positivePinId'], power['negativePinId']} <= pin_ids:
            raise ValueError('Power requirement references unknown pins')
        if power:
            by_id = {pin['id']: pin for pin in pins}
            if by_id[power['positivePinId']]['role'] != 'power' or by_id[power['negativePinId']]['role'] != 'ground' or not 0 < power['minVoltage'] < power['maxVoltage']:
                raise ValueError('Power requirement has invalid roles or envelope')
        if part['simulation']['status'] not in {'supported', 'unsupported'} or (part['simulation']['status'] == 'unsupported' and not part['simulation'].get('reason')):
            raise ValueError('Simulation support must be explicit')
        for gate in part['simulation'].get('gates', []):
            if not set(gate['inputs'] + [gate['output']]) <= pin_ids:
                raise ValueError('Gate references unknown pins')


def generate_catalog(catalog, registry):
    validate_parts(registry)
    result = json.loads(json.dumps(catalog))
    for part in registry['parts']:
        package, editor = part['package'], part['editor']
        scale = .13 / 2.54
        result['components'].append({
            'type': part['editorType'], 'name': part['name'], 'mode': 'physical',
            'family': editor['family'], 'visual': editor['visual'],
            'size': [package['bodyMm'][axis] * scale for axis in ('x', 'y', 'z')],
            'color': editor['color'], 'partNumber': part['partNumber'],
            'partDefinitionId': part['id'], 'partRevision': part['revision'],
            'ports': [{'id': pin['id'], 'direction': pin['role'] if pin['role'] in ('input', 'output') else 'inout'} for pin in package['pins']],
            'defaults': editor['defaults'], 'parameters': editor['parameters'],
        })
    types = [component['type'] for component in result['components']]
    if len(types) != len(set(types)):
        raise ValueError('Duplicate editor type')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = ROOT / 'device-library/editor/components.json'
    catalog = json.loads(source.read_text(encoding='utf-8'))
    registry = json.loads((ROOT / 'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))
    generated = generate_catalog(catalog, registry)
    outputs = [(ROOT / 'apps/web/src/data/editorCatalog.json', generated),
               (ROOT / 'apps/web/src/data/physicalParts.json', registry),
               (ROOT / 'contracts/design-models/physical-parts.v1.json', registry)]
    for target, data in outputs:
        if args.check:
            if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != data:
                raise SystemExit(f'Catalog snapshot is stale: {target.relative_to(ROOT)}')
        else:
            target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Catalog snapshots: OK ({len(generated["components"])} editor types, {len(registry["parts"])} physical parts)')


if __name__ == '__main__':
    main()
