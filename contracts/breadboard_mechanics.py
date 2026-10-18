"""Versioned virtual board CAD profile; electrical anchors remain unchanged."""
import json
import math
from pathlib import Path
from .breadboard_topology import get_breadboard_topology, get_breadboard_contact

MM_TO_WORLD = .13 / 2.54
PROFILE = json.loads(Path(__file__).with_name('design-models').joinpath('breadboard-mechanics.json').read_text(encoding='utf-8'))


def board_contact_mechanics(module_type, contact_id):
    topology = get_breadboard_topology(module_type)
    contact = get_breadboard_contact(module_type, contact_id)
    if module_type not in PROFILE['moduleTypes'] or topology is None or contact is None:
        raise ValueError('Unknown breadboard mechanical contact')
    x, y, z = contact['localPosition']
    surface = topology['deckHeight']
    return dict(profile=PROFILE, contact=(x, y, z), surface=(x, surface, z),
                tip=(x, surface-PROFILE['insertionDepthMm']*MM_TO_WORLD, z),
                floor=(x, surface-PROFILE['cavityDepthMm']*MM_TO_WORLD, z),
                insulationEnd=(x, surface+PROFILE['insulationClearanceMm']*MM_TO_WORLD, z))


def conductor_fits_contact_cavity(module_type, contact_id, start, end, radius):
    mechanics = board_contact_mechanics(module_type, contact_id)
    if not math.isfinite(radius) or radius <= 0 or not all(math.isfinite(v) for p in (start, end) for v in p):
        return False
    if math.hypot(start[0]-end[0], start[2]-end[2]) > 1e-7:
        return False
    x, surface, z = mechanics['surface']
    throat = PROFILE['throatHalfWidthWorld']
    if any(abs(p[0]-x)+radius > throat+1e-7 or abs(p[2]-z)+radius > throat+1e-7 for p in (start, end)):
        return False
    return min(start[1], end[1]) >= mechanics['floor'][1]-1e-7


def validate_board_conductor_segment(module_type, contact_id, start, end, radius):
    mechanics = board_contact_mechanics(module_type, contact_id)
    length = math.dist(start, end)
    vertical_radius = radius*math.sqrt(max(0, 1-((end[1]-start[1])/length)**2)) if length > 1e-12 else radius
    if min(start[1], end[1])-vertical_radius >= mechanics['surface'][1]-1e-7:
        return
    if not conductor_fits_contact_cavity(module_type, contact_id, start, end, radius):
        raise ValueError('Conductor intersects breadboard plastic outside its contact cavity')
