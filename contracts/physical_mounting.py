"""Canonical package bindings shared by API validation and the virtual compiler.

The stored pose is board-local and authoritative. World rendering positions and
raycasts have no role in connectivity; only validated pin/contact bonds do.
"""
from functools import lru_cache
import json
import math
from pathlib import Path

from .breadboard_topology import get_breadboard_contact, get_breadboard_topology
from .component_properties import normalize_component_properties

MM_TO_WORLD = .13 / 2.54
MOUNT_TOLERANCE = .00001


def package_lead_collision_radius_mm(package):
    """Conservative capsule radius for the real round, square or stamped lead."""
    section = package.get('shape', {}).get('leadSection')
    if section is None:
        return package['leadDiameterMm'] / 2
    if section['kind'] == 'round':
        return section['widthMm'] / 2
    return math.hypot(max(section['widthMm'], section.get('shoulderWidthMm', 0)), section['thicknessMm']) / 2


@lru_cache(maxsize=1)
def physical_parts():
    path = Path(__file__).resolve().parent / 'design-models' / 'physical-parts.v1.json'
    return tuple(json.loads(path.read_text(encoding='utf-8'))['parts'])


@lru_cache(maxsize=1)
def historical_physical_parts():
    path = Path(__file__).resolve().parent / 'design-models' / 'physical-parts.v1.json'
    return tuple(json.loads(path.read_text(encoding='utf-8')).get('historicalParts', []))


def get_physical_part(module_type, mount=None):
    """A mount pins all four descriptor coordinates; never fall back to a default."""
    if mount is None:
        return next((p for p in physical_parts() if p['editorType'] == module_type), None)
    return next((p for p in (*physical_parts(), *historical_physical_parts())
                 if p['editorType'] == module_type and
                 (p['id'], p['revision'], p['package']['id'], p['package']['revision']) ==
                 (mount.get('partId'), mount.get('partRevision'), mount.get('packageId'), mount.get('packageRevision'))), None)


def get_physical_part_for_module(module):
    """Unmarked free modules retain the oldest descriptor; new free parts pin one."""
    if module.get('mount') is not None:
        return get_physical_part(module['type'], module['mount'])
    if 'physicalDescriptor' in module:
        descriptor = module['physicalDescriptor']
        return get_physical_part(module['type'], descriptor) if isinstance(descriptor, dict) and descriptor.get('version') == 1 else None
    historical = sorted((part for part in historical_physical_parts() if part['editorType'] == module['type']), key=lambda part: part['revision'])
    return historical[0] if historical else get_physical_part(module['type'])


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
    if module.get('mount',{}).get('kind')=='breadboard-flexible':
        from .flexible_mounting import body_envelope
        return body_envelope(module,part,by_id[module['mount']['boardId']])
    position, rotation = _world_pose(module, by_id)
    angle = math.radians(rotation % 360); cos, sin = math.cos(angle), math.sin(angle)
    package = part['package']; body = package['bodyMm']
    low = position['y'] + package['standoffMm']*MM_TO_WORLD
    return {'center': (position['x'],low+body['y']*MM_TO_WORLD/2,position['z']),
            'axes': ((cos,0,-sin),(0,1,0),(sin,0,cos)),
            'half': tuple(body[axis]*MM_TO_WORLD/2 for axis in ('x','y','z'))}


def rigid_world_lead_paths(module, part, by_id):
    """Variable-width external metal paths; no interior feedthrough stations."""
    if module.get('mount', {}).get('kind') == 'breadboard-flexible':
        return []
    from .rigid_leads import rigid_lead_segments_mm
    position, rotation = _world_pose(module, by_id)
    angle = math.radians(rotation % 360)
    cos, sin = math.cos(angle), math.sin(angle)

    def world(point):
        return (position['x']+(point[0]*cos+point[2]*sin)*MM_TO_WORLD,
                position['y']+point[1]*MM_TO_WORLD,
                position['z']+(-point[0]*sin+point[2]*cos)*MM_TO_WORLD)

    return [dict(pinId=pin['id'], segments=[dict(start=world(segment['start']), end=world(segment['end']), radius=segment['radiusMm']*MM_TO_WORLD) for segment in rigid_lead_segments_mm(part['package'], pin)])
            for pin in part['package']['pins']] if part['package'].get('shape') else []


def _lead_segments_bounds(segments):
    return tuple((min(min(segment['start'][axis], segment['end'][axis])-segment['radius'] for segment in segments),
                  max(max(segment['start'][axis], segment['end'][axis])+segment['radius'] for segment in segments)) for axis in range(3))


def _body_bounds(body):
    extents = [sum(abs(body['axes'][column][axis])*body['half'][column] for column in range(3)) for axis in range(3)]
    return tuple((center-extent, center+extent) for center, extent in zip(body['center'], extents))


def _bounds_overlap(first, second):
    return all(a[0] < b[1]-MOUNT_TOLERANCE and b[0] < a[1]-MOUNT_TOLERANCE for a, b in zip(first, second))


def _bodies_overlap(a, b):
    delta = tuple(b['center'][i] - a['center'][i] for i in range(3))
    def cross(first,second):return (first[1]*second[2]-first[2]*second[1],first[2]*second[0]-first[0]*second[2],first[0]*second[1]-first[1]*second[0])
    for raw_axis in (*a['axes'], *b['axes'],*(cross(first,second) for first in a['axes'] for second in b['axes'])):
        length=math.sqrt(sum(value*value for value in raw_axis))
        if length<1e-10:continue
        axis=tuple(value/length for value in raw_axis)
        def radius(rect):
            return sum(half*abs(sum(rect['axes'][i][j]*axis[j] for j in range(3))) for i, half in enumerate(rect['half']))
        if abs(sum(delta[i]*axis[i] for i in range(3))) >= radius(a) + radius(b) - MOUNT_TOLERANCE: return False
    return True


def validate_physical_design(graph):
    """Reject fabricated part revisions, pin bonds, orphan boards and occupancy."""
    # This branch also keeps historical 1.0 structural acceptance intact.
    modules = graph['modules']
    for module in modules:
        normalize_component_properties(module['type'], module.get('properties', {}))
    physical = [(m, get_physical_part_for_module(m)) for m in modules]
    if not any(p or 'mount' in m or 'physicalDescriptor' in m for m, p in physical):
        return
    if graph['schema_version'] not in ('1.1','1.2'):
        raise ValueError('Physical packages and mounting require CircuitGraph 1.1 or 1.2')
    if len(modules) > 2000 or len(graph['connections']) > 10000:
        raise ValueError('Physical design graph exceeds supported limits')
    by_id = {m['id']: m for m in modules}
    if len(by_id) != len(modules) or any('.' in mid for mid in by_id):
        raise ValueError('Duplicate or invalid module id')
    occupied = set()
    for module, part in physical:
        mount = module.get('mount')
        if 'physicalDescriptor' in module:
            if graph['schema_version'] != '1.2' or part is None:
                raise ValueError('Free physical descriptors require CircuitGraph 1.2 and a canonical package')
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
        if mount.get('kind')=='breadboard-flexible':
            if graph['schema_version']!='1.2':raise ValueError('Flexible assemblies require CircuitGraph 1.2')
            from .flexible_mounting import resolve_flexible_geometry
            resolve_flexible_geometry(module,part,board)
            for binding in bindings:
                claim=(board['id'],binding['contactId'])
                if claim in occupied:raise ValueError('Breadboard contact occupancy conflict')
                occupied.add(claim)
            continue
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
    from .flexible_mounting import world_lead_paths,lead_hits_body,lead_paths_intersect,get_mechanical_profile
    flexible_paths=[]
    for module,part in physical:
        if module.get('mount',{}).get('kind')!='breadboard-flexible':continue
        paths=world_lead_paths(module,part,by_id[module['mount']['boardId']])
        radius=package_lead_collision_radius_mm(part['package'])*MM_TO_WORLD
        profile = get_mechanical_profile(part['package']['id'], part['package']['revision'])
        radius += min(profile['minBendRadiusMm'] * MM_TO_WORLD / 512, 1e-5)
        flexible_paths.append((module,paths,radius))
        if any(lead_hits_body(path,body,radius) for other,body in bodies if other['id']!=module['id'] for path in paths):
            raise ValueError('Flexible lead intersects another component body')
    for index,(module,paths,radius) in enumerate(flexible_paths):
        for other,other_paths,other_radius in flexible_paths[index+1:]:
            if module['mount']['version']==other['mount']['version']==1:continue
            if lead_paths_intersect(paths,radius,other_paths,other_radius):raise ValueError('Flexible leads intersect another component lead')
    rigid_paths = []
    for module, part in physical:
        if not part:
            continue
        paths = rigid_world_lead_paths(module, part, by_id)
        if paths:
            segments = [segment for path in paths for segment in path['segments']]
            rigid_paths.append((module, segments, _lead_segments_bounds(segments)))
    body_bounds = [(module, body, _body_bounds(body)) for module, body in bodies]
    flexible_bounds = [(module, paths, radius, _lead_segments_bounds([dict(start=start, end=end, radius=radius) for path in paths for start, end in zip(path, path[1:])])) for module, paths, radius in flexible_paths]
    for module, segments, bounds in rigid_paths:
        if any(lead_hits_body([segment['start'], segment['end']], body, segment['radius']) for other, body, other_bounds in body_bounds if other['id'] != module['id'] and _bounds_overlap(bounds, other_bounds) for segment in segments):
            raise ValueError('Rigid lead intersects another component body')
        for other, other_paths, other_radius, other_bounds in flexible_bounds:
            if other['id'] == module['id'] or not _bounds_overlap(bounds, other_bounds):
                continue
            if any(lead_paths_intersect([[segment['start'], segment['end']]], segment['radius'], other_paths, other_radius) for segment in segments):
                raise ValueError('Rigid lead intersects another component lead')
    for index, (module, segments, bounds) in enumerate(rigid_paths):
        for other, other_segments, other_bounds in rigid_paths[index+1:]:
            if _bounds_overlap(bounds, other_bounds) and any(lead_paths_intersect([[first['start'], first['end']]], first['radius'], [[second['start'], second['end']]], second['radius']) for first in segments for second in other_segments):
                raise ValueError('Rigid leads intersect another component lead')
    # Validate all physical pin endpoints even when a part is connected without mounting.
    for edge in graph['connections']:
        for endpoint in (edge['source'], edge['destination']):
            mid, token = endpoint.split('.')
            module = by_id.get(mid)
            if module is None:
                raise ValueError('Unknown endpoint module')
            part = get_physical_part_for_module(module)
            if part and token not in {p['id'] for p in part['package']['pins']}:
                raise ValueError('Unknown physical package pin')
            if token.startswith('contact:') and get_breadboard_contact(module['type'], token[8:]) is None:
                raise ValueError('Unknown breadboard contact')
