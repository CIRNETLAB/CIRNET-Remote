"""Canonical package bindings shared by API validation and the virtual compiler.

The stored pose is board-local and authoritative. World rendering positions and
raycasts have no role in connectivity; only validated pin/contact bonds do.
"""
from functools import lru_cache
import json
import math
from pathlib import Path

from .breadboard_topology import get_breadboard_contact, get_breadboard_topology

MM_TO_WORLD = .13 / 2.54
MOUNT_TOLERANCE = .00001


@lru_cache(maxsize=1)
def physical_parts():
    path = Path(__file__).resolve().parent / 'design-models' / 'physical-parts.v1.json'
    return tuple(json.loads(path.read_text(encoding='utf-8'))['parts'])


def get_physical_part(module_type):
    return next((p for p in physical_parts() if p['editorType'] == module_type), None)


def _world_pose(module, by_id):
    mount = module.get('mount')
    if not mount:
        return ({axis: module.get('position', {}).get(axis, 0) for axis in ('x', 'y', 'z')}, module.get('rotation', 0))
    board_position, board_rotation = _world_pose(by_id[mount['boardId']], by_id)
    local = mount['pose']['position']; angle = math.radians(board_rotation % 360)
    cos, sin = math.cos(angle), math.sin(angle)
    return ({'x': board_position['x'] + local['x']*cos + local['z']*sin,
             'y': board_position['y'] + local['y'],
             'z': board_position['z'] - local['x']*sin + local['z']*cos}, board_rotation + mount['pose']['rotation'])


def _body_envelope(module, part, by_id):
    position, rotation = _world_pose(module, by_id)
    angle = math.radians(rotation % 360); cos, sin = math.cos(angle), math.sin(angle)
    package = part['package']; body = package['bodyMm']
    low = position['y'] + package['standoffMm']*MM_TO_WORLD
    return {'center': (position['x'], position['z']), 'axes': ((cos, -sin), (sin, cos)),
            'half': (body['x']*MM_TO_WORLD/2, body['z']*MM_TO_WORLD/2), 'low': low, 'high': low + body['y']*MM_TO_WORLD}


def _bodies_overlap(a, b):
    if a['high'] <= b['low'] + MOUNT_TOLERANCE or b['high'] <= a['low'] + MOUNT_TOLERANCE: return False
    delta = tuple(b['center'][i] - a['center'][i] for i in (0, 1))
    for axis in (*a['axes'], *b['axes']):
        def radius(rect):
            return sum(half*abs(sum(rect['axes'][i][j]*axis[j] for j in (0, 1))) for i, half in enumerate(rect['half']))
        if abs(sum(delta[i]*axis[i] for i in (0, 1))) >= radius(a) + radius(b) - MOUNT_TOLERANCE: return False
    return True


def validate_physical_design(graph):
    """Reject fabricated part revisions, pin bonds, orphan boards and occupancy."""
    # This branch also keeps historical 1.0 structural acceptance intact.
    modules = graph['modules']
    physical = [(m, get_physical_part(m['type'])) for m in modules]
    if not any(p or 'mount' in m for m, p in physical):
        return
    if graph['schema_version'] != '1.1':
        raise ValueError('Physical packages and mounting require CircuitGraph 1.1')
    if len(modules) > 2000 or len(graph['connections']) > 10000:
        raise ValueError('Physical design graph exceeds supported limits')
    by_id = {m['id']: m for m in modules}
    if len(by_id) != len(modules) or any('.' in mid for mid in by_id):
        raise ValueError('Duplicate or invalid module id')
    occupied = set()
    for module, part in physical:
        mount = module.get('mount')
        if mount is None:
            continue
        if part is None:
            raise ValueError('Mount requires a canonical physical part')
        package = part['package']
        footprint = package['footprint']
        if not footprint['mountable']:
            raise ValueError('Package does not have a breadboard mounting footprint')
        if (mount['partId'], mount['partRevision'], mount['packageId'], mount['packageRevision']) != (part['id'], part['revision'], package['id'], package['revision']):
            raise ValueError('Part/package revision mismatch')
        board = by_id.get(mount['boardId'])
        if board is None or get_breadboard_topology(board['type']) is None or 'mount' in board:
            raise ValueError('Unknown mounting breadboard')
        if 'position' in module or 'rotation' in module:
            raise ValueError('Mounted world pose must be derived from the authoritative relative pose')
        pins = {p['id']: p for p in package['pins']}
        bindings = mount['contacts']
        if len(bindings) != len(pins) or {b['pinId'] for b in bindings} != set(pins):
            raise ValueError('Mount must bind each package pin exactly once')
        pose = mount['pose']; position = pose['position']; rotation = pose['rotation']
        try:
            finite_pose = all(type(n) in (int, float) and math.isfinite(n) for n in (*position.values(), rotation))
        except OverflowError:
            finite_pose = False
        if not finite_pose:
            raise ValueError('Mount pose must be finite')
        angle = math.radians(rotation % 360); cos, sin = math.cos(angle), math.sin(angle)
        if footprint.get('bridgeCenterGap') and (min(rotation % 360, abs(rotation % 360 - 180), 360 - rotation % 360) > MOUNT_TOLERANCE or abs(position['z']) > MOUNT_TOLERANCE):
            raise ValueError('DIP footprint must align with and bridge the breadboard center gap')
        rows = set()
        for binding in bindings:
            contact = get_breadboard_contact(board['type'], binding['contactId'])
            if contact is None:
                raise ValueError('Unknown mounting breadboard contact')
            claim = (board['id'], binding['contactId'])
            if claim in occupied:
                raise ValueError('Breadboard contact occupancy conflict')
            occupied.add(claim)
            pin = pins[binding['pinId']]['positionMm']
            expected = (
                position['x'] + (pin['x'] * cos + pin['z'] * sin) * MM_TO_WORLD,
                position['y'] + pin['y'] * MM_TO_WORLD,
                position['z'] + (-pin['x'] * sin + pin['z'] * cos) * MM_TO_WORLD,
            )
            if math.dist(expected, contact['localPosition']) >= MOUNT_TOLERANCE:
                raise ValueError('Pin/contact binding does not match package footprint pose')
            rows.add(contact['nodeId'].split(':')[1] if contact['nodeId'].startswith('terminal:') else 'rail')
        if footprint.get('bridgeCenterGap') and rows != {'AE', 'FJ'}:
            raise ValueError('DIP footprint must bridge the breadboard center gap')
    try:
        bodies = [(module, _body_envelope(module, part, by_id)) for module, part in physical if part]
    except OverflowError:
        raise ValueError('Physical world pose is outside supported numerical bounds') from None
    for index, (module, body) in enumerate(bodies):
        for other, other_body in bodies[index+1:]:
            if ('mount' in module or 'mount' in other) and _bodies_overlap(body, other_body):
                raise ValueError('Physical component bodies overlap')
    # Validate all physical pin endpoints even when a part is connected without mounting.
    for edge in graph['connections']:
        for endpoint in (edge['source'], edge['destination']):
            mid, token = endpoint.split('.')
            module = by_id.get(mid)
            if module is None:
                raise ValueError('Unknown endpoint module')
            part = get_physical_part(module['type'])
            if part and token not in {p['id'] for p in part['package']['pins']}:
                raise ValueError('Unknown physical package pin')
            if token.startswith('contact:') and get_breadboard_contact(module['type'], token[8:]) is None:
                raise ValueError('Unknown breadboard contact')
