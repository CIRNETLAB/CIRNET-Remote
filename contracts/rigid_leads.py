"""External stamped/rectangular lead stations shared with procedural rendering.

Mirrors the pure ``electrical/rigidPackageLeads.ts`` station contract. Coordinates
are package-local millimetres, with the socket plane at Y=0. The renderer alone
prepends the declared hidden feedthrough; collision never includes that embed.
"""
import math

MM_TO_WORLD = .13/2.54


def fixed_package_lead_path(package, pin):
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
    straight = .4*MM_TO_WORLD
    stub = (anchor[0], anchor[1]+straight, anchor[2])
    shoulder = tuple(value+normal*straight for value, normal in zip(exit, outward))
    points = [exit, shoulder]
    if math.hypot(exit[0]-anchor[0], exit[2]-anchor[2]) > 1e-8:
        points.append((anchor[0], exit[1], anchor[2]))
    points.extend((stub, anchor))
    section = shape['leadSection']
    minimum = (.3 if section['kind'] == 'round' and section['widthMm'] <= .5 else .4)*MM_TO_WORLD
    return build_lead_path(points, minimum, .7*MM_TO_WORLD, (straight, straight))


def rigid_lead_stations_mm(package, pin):
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
        narrow_start = max(tip[1]+.6, end_y-.35)
        narrow_end = max(tip[1]+.35, narrow_start-.65)
        if narrow_start < end_y-1e-9 / (.13/2.54):
            append((tip[0], narrow_start, tip[2]), (0, -1, 0), shoulder)
        append((tip[0], narrow_end, tip[2]), (0, -1, 0), width)
        append(tip, (0, -1, 0), width)
    else:
        append(exit, (0, -1, 0), width)
        dx, dz, height = tip[0]-exit[0], tip[2]-exit[2], exit[1]-tip[1]
        for i in range(1, 25):
            t = i/24
            blend, slope = t*t*(3-2*t), 6*t*(1-t)
            append((exit[0]+dx*blend, exit[1]-height*t, exit[2]+dz*blend), (dx*slope, -height, dz*slope), width)
    return stations


def rigid_lead_segments_mm(package, pin):
    shape = package.get('shape')
    if shape and shape['family'] not in ('dip', 'to92'):
        path = fixed_package_lead_path(package, pin)
        section = shape['leadSection']
        radius = (section['widthMm'] if section['kind'] == 'round' else math.hypot(section['widthMm'], section['thicknessMm']))/2+path['sampleError']/MM_TO_WORLD
        return [dict(start=tuple(value/MM_TO_WORLD for value in start), end=tuple(value/MM_TO_WORLD for value in end), radiusMm=radius) for start, end in zip(path['samples'], path['samples'][1:])]
    stations = rigid_lead_stations_mm(package, pin)
    return [dict(start=first['position'], end=second['position'], radiusMm=max(math.hypot(first['widthMm'], first['thicknessMm']), math.hypot(second['widthMm'], second['thicknessMm']))/2)
            for first, second in zip(stations, stations[1:])]
