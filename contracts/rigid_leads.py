"""External stamped/rectangular lead stations shared with procedural rendering.

Mirrors the pure ``electrical/rigidPackageLeads.ts`` station contract. Coordinates
are package-local millimetres, with the socket plane at Y=0. The renderer alone
prepends the declared hidden feedthrough; collision never includes that embed.
"""
import math

MM_TO_WORLD = .13/2.54


def fixed_package_lead_path(package, pin, insertion_mm=0):
    """Exact fixed two-pin circular path, in world-unit package coordinates."""
    from .flexible_mounting import build_lead_path
    shape = package.get('shape')
    if not shape or shape['family'] in ('dip', 'to92'):
        raise ValueError('A fixed two-pin lead requires its declared shape')
    definition = next(exit for exit in shape['leadExits'] if exit['pinId'] == pin['id'])
    center_y = package['standoffMm']+package['bodyMm']['y']/2
    exit = tuple((definition['positionMm'][axis]+(center_y if axis == 'y' else 0))*MM_TO_WORLD for axis in ('x', 'y', 'z'))
    length = math.hypot(*(definition['normal'][axis] for axis in ('x', 'y', 'z')))
    outward = tuple(definition['normal'][axis]/length for axis in ('x', 'y', 'z'))
    anchor = tuple(pin['positionMm'][axis]*MM_TO_WORLD for axis in ('x', 'y', 'z'))
    offset = math.hypot(exit[0]-anchor[0], exit[2]-anchor[2])
    radial_offset = outward[1] < -.999 and offset > 1e-8
    straight = (.15 if shape['leadSection']['kind'] == 'stamped' or radial_offset else .4)*MM_TO_WORLD
    section = shape['leadSection']
    minimum = (.3 if section['kind'] == 'round' and section['widthMm'] <= .5 else .4)*MM_TO_WORLD
    minimum = .15*MM_TO_WORLD if section['kind'] == 'stamped' else minimum
    stub = (anchor[0], anchor[1]+straight, anchor[2])
    shoulder = tuple(value+normal*straight for value, normal in zip(exit, outward))
    if radial_offset:
        mid_y = exit[1]-straight-minimum
        points = [exit, (exit[0], mid_y, exit[2]), (anchor[0], mid_y, anchor[2]), anchor]
    else:
        points = [exit, tuple(value+normal*straight*2 for value, normal in zip(exit, outward)) if shape['leadSection']['kind'] == 'stamped' else shoulder]
        if offset > 1e-8:
            points.append((anchor[0], exit[1], anchor[2]))
        points.extend((stub, anchor))
    if insertion_mm > 0:
        points.append((anchor[0], anchor[1]-insertion_mm*MM_TO_WORLD, anchor[2]))
    path = build_lead_path(points, minimum, minimum if section['kind'] == 'stamped' or radial_offset else .7*MM_TO_WORLD, (straight, straight))
    _validate_budget(package, path['length']/MM_TO_WORLD)
    return path


def _validate_budget(package, length_mm):
    mechanics = package.get('boardInsertion')
    if mechanics and length_mm > mechanics['maxExternalLeadMm']+1e-6:
        raise ValueError('The declared metal lead is too short for this board insertion')


def rigid_lead_stations_mm(package, pin, insertion_mm=0):
    shape = package.get('shape')
    if not shape or shape['family'] not in ('dip', 'to92'):
        return []
    definition = next((exit for exit in shape['leadExits'] if exit['pinId'] == pin['id']), None)
    if definition is None:
        raise ValueError('A shaped rigid lead requires its declared body exit')
    center_y = package['standoffMm']+package['bodyMm']['y']/2
    exit = tuple(definition['positionMm'][axis]+(center_y if axis == 'y' else 0) for axis in ('x', 'y', 'z'))
    tip = tuple(pin['positionMm'][axis] for axis in ('x', 'y', 'z'))
    section = shape['leadSection']
    width = section['widthMm']
    stations = []

    def append(position, tangent, station_width):
        stations.append(dict(position=position, tangent=tangent, widthMm=station_width, thicknessMm=section['thicknessMm']))

    if shape['family'] == 'dip':
        shoulder = section.get('shoulderWidthMm', width)
        sign = (1 if definition['normal']['z'] > 0 else -1) if definition['normal']['z'] else (1 if tip[2] >= 0 else -1)
        radius = min(.42, abs(tip[2]-exit[2])*.75, (exit[1]-tip[1])*.3)
        append(exit, (0, 0, sign), shoulder)
        bend_start = (exit[0], exit[1], tip[2]-sign*radius)
        if math.dist(exit, bend_start) > 1e-9 / (.13/2.54):
            append(bend_start, (0, 0, sign), shoulder)
        for i in range(1, 13):
            theta = i/12*math.pi/2
            append((exit[0], exit[1]-radius*(1-math.cos(theta)), bend_start[2]+sign*radius*math.sin(theta)), (0, -math.sin(theta), sign*math.cos(theta)), shoulder)
        end_y = stations[-1]['position'][1]
        narrow_start = max(tip[1]+(1.05 if package.get('boardInsertion') else .6), end_y-.35)
        narrow_end = max(tip[1]+(.8 if package.get('boardInsertion') else .35), narrow_start-.65)
        if narrow_start < end_y-1e-9 / (.13/2.54):
            append((tip[0], narrow_start, tip[2]), (0, -1, 0), shoulder)
        append((tip[0], narrow_end, tip[2]), (0, -1, 0), width)
        append(tip, (0, -1, 0), width)
    else:
        append(exit, (0, -1, 0), width)
        tail_y = tip[1]+(1 if package.get('boardInsertion') else 0)
        dx, dz, height = tip[0]-exit[0], tip[2]-exit[2], exit[1]-tail_y
        for i in range(1, 25):
            t = i/24
            blend, slope = t*t*(3-2*t), 6*t*(1-t)
            append((exit[0]+dx*blend, exit[1]-height*t, exit[2]+dz*blend), (dx*slope, -height, dz*slope), width)
        if package.get('boardInsertion'):
            append(tip, (0, -1, 0), width)
    if insertion_mm > 0:
        append((tip[0], tip[1]-insertion_mm, tip[2]), (0, -1, 0), width)
    _validate_budget(package, sum(math.dist(a['position'], b['position']) for a, b in zip(stations, stations[1:])))
    return stations


def rigid_lead_segments_mm(package, pin, insertion_mm=0):
    shape = package.get('shape')
    if shape and shape['family'] not in ('dip', 'to92'):
        path = fixed_package_lead_path(package, pin, insertion_mm)
        section = shape['leadSection']
        radius = (section['widthMm'] if section['kind'] == 'round' else math.hypot(section['widthMm'], section['thicknessMm']))/2+path['sampleError']/MM_TO_WORLD
        return [dict(start=tuple(value/MM_TO_WORLD for value in start), end=tuple(value/MM_TO_WORLD for value in end), radiusMm=radius) for start, end in zip(path['samples'], path['samples'][1:])]
    stations = rigid_lead_stations_mm(package, pin, insertion_mm)
    return [dict(start=first['position'], end=second['position'], radiusMm=max(math.hypot(first['widthMm'], first['thicknessMm']), math.hypot(second['widthMm'], second['thicknessMm']))/2)
            for first, second in zip(stations, stations[1:])]
