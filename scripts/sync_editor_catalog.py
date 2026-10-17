"""Validate and generate legacy editor and versioned physical-part boundaries."""
import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIGNAL_DOMAINS={'DIGITAL','ANALOG','POWER','GROUND','CLOCK','MIXED'}
DIGITAL_TYPES={'DIGITAL_SWITCH','DIGITAL_INPUT','INPUT','CLOCK','LED','PROBE','OUTPUT','74HC08','AND','OR','XOR','NOT'}
DC_MODELS={'dc-source','hc08-powered','resistor-dc','led-dc','contact-switch'}


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
        if any(type(value) is not int or value < 1 for value in (part['revision'], package['revision'], footprint['revision'])):
            raise ValueError('Physical part requires positive revisions')
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
            if pin.get('domain') not in SIGNAL_DOMAINS:
                raise ValueError('Physical pin requires an explicit signal domain')
            if pin['role'] in {'power','ground'} and pin['domain'] != {'power':'POWER','ground':'GROUND'}[pin['role']]:
                raise ValueError('Supply pin signal domain must match its declared role')
            if pin['role'] not in {'input', 'output', 'power', 'ground', 'passive', 'nc'} or not all(type(position.get(axis)) in (int, float) and math.isfinite(position[axis]) for axis in ('x', 'y', 'z')):
                raise ValueError('Invalid physical pin descriptor')
            if footprint['mountable'] and position['y'] != 0:
                raise ValueError('Mountable pin tips must lie in the mounting plane')
            if pin['role'] == 'output' and pin.get('outputType') not in {'push-pull', 'open-collector', 'open-drain'}:
                raise ValueError('Output pin requires its driver type')
            if pin.get('signal') not in {None, 'data', 'clock', 'set', 'reset', 'enable'}:
                raise ValueError('Unknown pin signal semantic')
            if pin.get('polarity') not in {None, 'active-high', 'active-low'} or pin.get('inputCharacteristics') not in {None, 'standard', 'schmitt-trigger'}:
                raise ValueError('Invalid pin polarity or input characteristic')
            if pin.get('signal') == 'clock' and (pin['role'] != 'input' or pin.get('edge') not in {'rising', 'falling'}):
                raise ValueError('Clock input requires an explicit edge')
            if pin.get('signal') in {'set', 'reset', 'enable'} and (pin['role'] != 'input' or not pin.get('polarity')):
                raise ValueError('Control input requires explicit polarity')
            if pin.get('edge') and pin.get('signal') != 'clock':
                raise ValueError('Only clock inputs declare an edge')
            if pin.get('inputCharacteristics') and pin['role'] != 'input':
                raise ValueError('Only inputs declare input characteristics')
            key = tuple(position[axis] for axis in ('x', 'y', 'z'))
            if key in positions:
                raise ValueError('Physical pins overlap')
            positions.add(key)
        for connection in part.get('internalConnections', []):
            if len(connection['pins']) != 2 or not set(connection['pins']) <= pin_ids:
                raise ValueError('Internal connection references unknown pins')
        for parameter in part['editor']['parameters']:
            value = part['editor']['defaults'].get(parameter['key'])
            if parameter['kind'] == 'boolean':
                if type(value) is not bool:
                    raise ValueError('Boolean property default is required')
            elif parameter['kind'] in {'enum', 'string', 'color'}:
                options = parameter.get('options', [])
                if options and (any(type(option.get('value')) is not str or type(option.get('label')) is not str for option in options) or len({option['value'] for option in options}) != len(options)):
                    raise ValueError('Property options require unique string values and labels')
                if type(value) is not str or len(value) > parameter.get('maxLength', 256) or (parameter['kind'] == 'enum' and (not options or value not in {option['value'] for option in options})):
                    raise ValueError('String property default must match its declared options and bounds')
                pattern = parameter.get('pattern', '^#[0-9a-fA-F]{6}$' if parameter['kind'] == 'color' else None)
                if pattern and re.fullmatch(pattern, value) is None:
                    raise ValueError('String property default must match its declared pattern')
            elif parameter['kind'] not in {'number', 'integer'}:
                raise ValueError('Unknown property kind')
            elif type(value) not in (int, float) or not math.isfinite(value) or (parameter['kind'] == 'integer' and int(value) != value) or value < parameter.get('min', -math.inf) or value > parameter.get('max', math.inf) or (parameter.get('exclusiveMin') and value <= parameter.get('min', -math.inf)):
                raise ValueError('Property default must be finite and within its declared range')
        simulation = part.get('simulation')
        if simulation is None:
            continue
        power = simulation.get('power')
        if power and not {power['positivePinId'], power['negativePinId']} <= pin_ids:
            raise ValueError('Power requirement references unknown pins')
        if power:
            by_id = {pin['id']: pin for pin in pins}
            if by_id[power['positivePinId']]['role'] != 'power' or by_id[power['negativePinId']]['role'] != 'ground' or not 0 < power['minVoltage'] < power['maxVoltage']:
                raise ValueError('Power requirement has invalid roles or envelope')
        if simulation['status'] not in {'supported', 'unsupported'} or (simulation['status'] == 'unsupported' and not simulation.get('reason')):
            raise ValueError('Simulation support must be explicit')
        for gate in simulation.get('gates', []):
            if not set(gate['inputs'] + [gate['output']]) <= pin_ids:
                raise ValueError('Gate references unknown pins')


def generate_editor_parts(registry):
    """An authoring descriptor needs neither a datasheet nor an execution engine."""
    validate_parts(registry)
    keys = {'id', 'revision', 'editorType', 'name', 'shortName', 'function', 'package', 'editor', 'internalConnections', 'aliases', 'logic', 'identityKind'}
    return {'schemaVersion': registry['schemaVersion'], 'units': registry['units'],
            'parts': [{key: value for key, value in part.items() if key in keys} for part in registry['parts']]}


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
            'color': editor['color'],
            'partDefinitionId': part['id'], 'partRevision': part['revision'],
            'ports': [{'id': pin['id'], 'direction': pin['role'] if pin['role'] in ('input', 'output') else 'inout', 'domain':pin['domain']} for pin in package['pins']],
            'defaults': editor['defaults'], 'parameters': editor['parameters'],
        })
    types = [component['type'] for component in result['components']]
    if len(types) != len(set(types)):
        raise ValueError('Duplicate editor type')
    return result


def generate_domain_catalog(catalog,registry):
    """Shared authoring domains and existing local model selection, never hardware capability."""
    generated=generate_catalog(catalog,registry)
    parts={part['editorType']:part for part in registry['parts']}
    result=[]
    definitions=[*generated['components'],*({'type':kind,'ports':ports} for kind,ports in catalog.get('legacyPorts',{}).items())]
    for component in definitions:
        ports=component['ports']
        if any(port.get('domain') not in SIGNAL_DOMAINS for port in ports):
            raise ValueError('Editor port requires an explicit signal domain')
        part=parts.get(component['type']); model=part.get('simulation',{}) if part else {}
        execution='DC_DIGITAL' if model.get('status')=='supported' and model.get('model') in DC_MODELS else 'DIGITAL' if component['type'] in DIGITAL_TYPES else 'VISUAL' if component.get('visualOnly') else 'UNAVAILABLE'
        result.append({'type':component['type'],'ports':ports,'execution':execution})
    if len({item['type'] for item in result})!=len(result):raise ValueError('Duplicate signal-domain catalog type')
    return {'version':'1.0','components':result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = ROOT / 'device-library/editor/components.json'
    catalog = json.loads(source.read_text(encoding='utf-8'))
    registry = json.loads((ROOT / 'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))
    generated = generate_catalog(catalog, registry)
    domains=generate_domain_catalog(catalog,registry)
    mechanics=json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text(encoding='utf-8'))
    outputs = [(ROOT / 'apps/web/src/data/editorCatalog.json', generated),
               (ROOT / 'apps/web/src/data/editorParts.json', generate_editor_parts(registry)),
               (ROOT / 'apps/web/src/data/physicalParts.json', registry),
               (ROOT / 'contracts/design-models/physical-parts.v1.json', registry),
               (ROOT / 'contracts/design-models/signal-port-catalog.json', domains),
               (ROOT / 'apps/web/src/data/signalPortCatalog.json', domains),
               (ROOT / 'apps/web/src/data/flexibleMechanics.json', mechanics)]
    for target, data in outputs:
        if args.check:
            if not target.exists() or json.loads(target.read_text(encoding='utf-8')) != data:
                raise SystemExit(f'Catalog snapshot is stale: {target.relative_to(ROOT)}')
        else:
            target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Catalog snapshots: OK ({len(generated["components"])} editor types, {len(registry["parts"])} physical parts)')


if __name__ == '__main__':
    main()
