"""Bounded flexible-lead authoring geometry, with no electrical inference."""
from functools import lru_cache
from copy import deepcopy
import json
import math
from pathlib import Path

from .breadboard_topology import get_breadboard_contact
from .physical_mounting import package_lead_collision_radius_mm

MM_TO_WORLD=.13/2.54
EPS=1e-5


@lru_cache(maxsize=1)
def mechanical_profiles():
    return tuple(json.loads(Path(__file__).with_name('design-models').joinpath('flexible-mechanics.json').read_text(encoding='utf-8'))['profiles'])


def get_mechanical_profile(package_id,package_revision):
    return next((profile for profile in mechanical_profiles() if (profile['packageId'],profile['packageRevision'])==(package_id,package_revision)),None)


def rotation_matrix(rotation):
    """Fixed Euler YXZ degrees, matching Ry * Rx * Rz in the Web solver."""
    x,y,z=(math.radians(rotation[axis]) for axis in ('x','y','z'))
    a,b=math.cos(x),math.sin(x);c,d=math.cos(y),math.sin(y);e,f=math.cos(z),math.sin(z)
    return ((c*e+d*b*f,d*b*e-c*f,a*d),(a*f,a*e,-b),(c*b*f-d*e,c*b*e+d*f,a*c))


def _point(value):return tuple(value[axis] for axis in ('x','y','z'))
def _add(a,b):return tuple(x+y for x,y in zip(a,b))
def _sub(a,b):return tuple(x-y for x,y in zip(a,b))
def _scale(a,value):return tuple(x*value for x in a)
def _dot(a,b):return sum(x*y for x,y in zip(a,b))
def _transform(matrix,point):return tuple(_dot(row,point) for row in matrix)
def _inverse(matrix,point):return tuple(sum(matrix[j][i]*point[j] for j in range(3)) for i in range(3))
def _cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def _path_unit(point):
    # Path normalization uses the same 1e-10 degeneracy floor as TypeScript.
    return _scale(point,1/math.sqrt(_dot(point,point)))


def normalize_lead_polyline(points):
    """Match Web leadPath: remove only forward collinear subdivisions."""
    if len(points)<2 or any(not all(math.isfinite(value) for value in point) for point in points):
        raise ValueError('A flexible lead requires finite points and two endpoints')
    result=[]
    for point in points:
        if result and math.dist(result[-1],point)<1e-10:raise ValueError('Flexible lead has duplicate or degenerate controls')
        while len(result)>=2:
            a,b=_sub(result[-1],result[-2]),_sub(point,result[-1])
            if _dot(a,b)<=0 or math.sqrt(_dot(_cross(a,b),_cross(a,b)))>1e-10*math.sqrt(_dot(a,a)*_dot(b,b)):break
            result.pop()
        result.append(point)
    return result


def build_lead_path(points,min_radius,preferred_radius=None,endpoint_straights=(0,0)):
    """Tangent circular fillets, mirrored exactly from electrical/leadPath.ts.

    Arc sampling has a bounded chord error. sampleDistances stores true arc
    length, so continuity exclusions do not depend on sampling density.
    """
    preferred_radius=min_radius if preferred_radius is None else preferred_radius
    if not math.isfinite(min_radius) or min_radius<=0 or not math.isfinite(preferred_radius) or preferred_radius<min_radius or any(not math.isfinite(value) or value<0 for value in endpoint_straights):
        raise ValueError('Invalid flexible lead bend radius or straight constraint')
    points=normalize_lead_polyline(points);last=len(points)-1
    lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
    directions=[_path_unit(_sub(b,a)) for a,b in zip(points,points[1:])]
    tangents=[0.]*len(points);angles=[0.]*len(points)
    for index in range(1,last):
        cosine=max(-1,min(1,_dot(directions[index-1],directions[index])))
        if cosine<-1+1e-10:raise ValueError('Flexible lead reverses through itself')
        angles[index]=math.acos(cosine);tangents[index]=math.tan(angles[index]/2)
    minimum=[value*min_radius for value in tangents]
    extra=[value*(preferred_radius-min_radius) for value in tangents];factors=[1.]*len(points)
    for index,length in enumerate(lengths):
        reserved=(endpoint_straights[0] if index==0 else 0)+(endpoint_straights[1] if index==last-1 else 0)
        available=length-reserved;required=minimum[index]+minimum[index+1]
        if required>available+1e-9:raise ValueError('Flexible lead cannot fit its minimum bend radius and endpoint straights')
        wanted=extra[index]+extra[index+1]
        factor=max(0,min(1,(available-required)/wanted)) if wanted>0 else 1
        factors[index]=min(factors[index],factor);factors[index+1]=min(factors[index+1],factor)
    radii=[min_radius+(preferred_radius-min_radius)*factors[index] if tangent>1e-10 else 0 for index,tangent in enumerate(tangents)]
    segments=[];previous=points[0]
    def line(end):
        nonlocal previous
        length=math.dist(previous,end)
        if length>1e-10:segments.append({'kind':'line','start':previous,'end':end,'length':length})
        previous=end
    for index in range(1,last):
        radius=radii[index]
        if radius==0:continue
        corner=points[index];u,v=directions[index-1],directions[index]
        trim=radius*tangents[index];start=_add(corner,_scale(u,-trim));end=_add(corner,_scale(v,trim))
        axis=_path_unit(_cross(u,v));center=_add(start,_scale(_cross(axis,u),radius))
        line(start);segments.append({'kind':'arc','start':start,'end':end,'axis':axis,'center':center,'radius':radius,'angle':angles[index],'length':radius*angles[index]});previous=end
    line(points[last])
    sample_error=min(min_radius/512,1e-5);samples=[points[0]];sample_distances=[0];length=0
    for segment in segments:
        if segment['kind']=='line':
            length+=segment['length'];samples.append(segment['end']);sample_distances.append(length);continue
        offset=_sub(segment['start'],segment['center']);perpendicular=_cross(segment['axis'],offset)
        step=2*math.acos(max(-1,min(1,1-sample_error/segment['radius'])))
        count=max(1,math.ceil(segment['angle']/step))
        for index in range(1,count+1):
            angle=segment['angle']*index/count
            samples.append(segment['end'] if index==count else _add(segment['center'],_add(_scale(offset,math.cos(angle)),_scale(perpendicular,math.sin(angle)))))
            sample_distances.append(length+segment['length']*index/count)
        length+=segment['length']
    return {'points':points,'segments':segments,'samples':samples,'sampleDistances':sample_distances,'sampleError':sample_error,'bendRadii':radii[1:-1],'length':length}


def _segment_approach(a,b,c,d):
    u,v,w=_sub(b,a),_sub(d,c),_sub(a,c)
    aa,bb,cc,dd,ee=_dot(u,u),_dot(u,v),_dot(v,v),_dot(u,w),_dot(v,w)
    denominator=aa*cc-bb*bb
    s=max(0,min(1,(bb*ee-cc*dd)/denominator)) if denominator>1e-15 else 0
    t=(bb*s+ee)/cc if cc>1e-15 else 0
    if t<0:t=0;s=max(0,min(1,-dd/aa)) if aa>1e-15 else 0
    elif t>1:t=1;s=max(0,min(1,(bb-dd)/aa)) if aa>1e-15 else 0
    return math.dist(_add(a,_scale(u,s)),_add(c,_scale(v,t))),s,t


def _segment_distance(a,b,c,d):
    return _segment_approach(a,b,c,d)[0]


def lead_path_intersects_itself(path,diameter):
    """Exclude only local portions of one continuous tube from self collision."""
    segments=list(zip(path['samples'],path['samples'][1:]))
    distances=path['sampleDistances'];local_length=math.pi*diameter+2*path['sampleError']
    for first in range(len(segments)):
        for second in range(first+2,len(segments)):
            if distances[second+1]-distances[first]<=local_length:continue
            distance,s,t=_segment_approach(*segments[first],*segments[second])
            first_distance=distances[first]+s*(distances[first+1]-distances[first])
            second_distance=distances[second]+t*(distances[second+1]-distances[second])
            # Continuity belongs to the closest points; neighbouring ends can
            # conceal a crossing much farther along two long straight runs.
            if second_distance-first_distance>local_length and distance<diameter+2*path['sampleError']-EPS:return True
    return False


def _segment_enters_body(a,b,position,matrix,half):
    start=_inverse(matrix,_sub(a,position));end=_inverse(matrix,_sub(b,position))
    lower,upper=0.,1.
    for axis in range(3):
        bound=max(0,half[axis]-EPS);delta=end[axis]-start[axis]
        if abs(delta)<1e-14:
            if not -bound<start[axis]<bound:return False
            continue
        first,second=sorted(((-bound-start[axis])/delta,(bound-start[axis])/delta))
        lower=max(lower,first);upper=min(upper,second)
        if lower>=upper:return False
    return lower<upper and upper>EPS and lower<1-EPS


def resolve_flexible_geometry(module,part,board):
    """Reconstruct bounded paths from immutable package exits and saved intent."""
    mount=module['mount'];package=part['package']
    profile=get_mechanical_profile(package['id'],package['revision'])
    if profile is None or (mount['mechanicalProfileId'],mount['mechanicalProfileRevision'])!=(profile['id'],profile['revision']):
        raise ValueError('Unknown mechanical authoring profile revision')
    if (mount['version'],mount['geometryRevision']) not in ((1,1),(2,2)) or mount['kind']!='breadboard-flexible':
        raise ValueError('Unsupported flexible placement version')
    pins={pin['id'] for pin in package['pins']}
    if len(pins)!=2 or {pin['pinId'] for pin in profile['pins']}!=pins:
        raise ValueError('Flexible placement requires a declared two-lead strategy')
    if len(mount['contacts'])!=2 or {item['pinId'] for item in mount['contacts']}!=pins or len(mount['leads'])!=2 or {item['pinId'] for item in mount['leads']}!=pins:
        raise ValueError('Flexible placement must bind each stable pin exactly once')
    position=_point(mount['bodyPose']['position']);rotation=mount['bodyPose']['rotation']
    try:finite=all(type(value) in (int,float) and math.isfinite(value) for value in (*position,*rotation.values()))
    except OverflowError:finite=False
    if not finite:raise ValueError('Flexible body pose must be finite')
    matrix=rotation_matrix(rotation);half=tuple(package['bodyMm'][axis]*MM_TO_WORLD/2 for axis in ('x','y','z'))
    contacts={item['pinId']:get_breadboard_contact(board['type'],item['contactId']) for item in mount['contacts']}
    if any(contact is None for contact in contacts.values()):raise ValueError('Unknown mounting breadboard contact')
    if len({item['contactId'] for item in mount['contacts']})!=2:raise ValueError('Flexible pins require distinct physical holes')
    plane=max(contact['localPosition'][1] for contact in contacts.values())
    low=position[1]-sum(abs(matrix[1][axis])*half[axis] for axis in range(3))
    if low<plane+profile['bodyClearanceMm']*MM_TO_WORLD-EPS:raise ValueError('Flexible body intersects the breadboard clearance')
    if position[1]-plane>profile['maxBodyLiftMm']*MM_TO_WORLD+EPS:raise ValueError('Flexible body lift exceeds mechanical bounds')
    intents={item['pinId']:item['controlPoints'] for item in mount['leads']};leads=[]
    span=math.dist(*(contact['localPosition'] for contact in contacts.values()))
    preferred=profile['minBendRadiusMm']*MM_TO_WORLD if mount['version']==1 else max(profile['minBendRadiusMm']*MM_TO_WORLD,span/2) if mount['routing']['template']=='axial-standing' else profile.get('preferredBendRadiusMm',profile['minBendRadiusMm'])*MM_TO_WORLD
    for pin in profile['pins']:
        pin_id=pin['pinId'];controls=intents[pin_id]
        if len(controls)>profile['maxControlsPerLead']:raise ValueError('Too many flexible lead controls')
        exit=_add(position,_transform(matrix,_scale(_point(pin['bodyExitMm']),MM_TO_WORLD)))
        outward=(math.copysign(1,pin['bodyExitMm']['x']),0,0) if profile['strategy']=='axial' else (0,-1,0)
        shoulder=_add(exit,_transform(matrix,_scale(outward,profile['exitStraightMm']*MM_TO_WORLD)))
        contact=tuple(contacts[pin_id]['localPosition']);stub=_add(contact,(0,profile['contactStubMm']*MM_TO_WORLD,0))
        raw=[exit,shoulder,*(_point(point) for point in controls),stub,contact]
        try:finite=all(type(value) in (int,float) and math.isfinite(value) for point in raw for value in point)
        except OverflowError:finite=False
        if not finite or any(point[1]<plane-EPS for point in raw):raise ValueError('Flexible lead intersects the breadboard or is nonfinite')
        path=build_lead_path(raw,profile['minBendRadiusMm']*MM_TO_WORLD,preferred,(0,0) if mount['version']==1 else (profile['exitStraightMm']*MM_TO_WORLD,profile['contactStubMm']*MM_TO_WORLD))
        points=path['points'];samples=path['samples'];length=path['length']/MM_TO_WORLD
        if not profile['minLeadLengthMm']<=length<=profile['maxLeadLengthMm']:raise ValueError('Flexible lead length exceeds mechanical bounds')
        if any(_segment_enters_body(a,b,position,matrix,half) for a,b in zip(samples,samples[1:])):
            raise ValueError('Flexible lead intersects its rigid body')
        segments=list(zip(samples,samples[1:]));diameter=2*package_lead_collision_radius_mm(package)*MM_TO_WORLD
        if mount['version']==2:
            radius=diameter/2+path['sampleError'];expanded=tuple(value+radius for value in half)
            # First outward straight and final normal socket insertion are the
            # intentional joins. The remainder clears the complete wire tube.
            if any(_segment_enters_body(a,b,position,matrix,expanded) for a,b in segments[1:]):raise ValueError('Flexible lead tube intersects its rigid body')
            if any(point[1]-radius<plane-EPS for point in samples[:-1]):raise ValueError('Flexible lead tube intersects the breadboard')
        if lead_path_intersects_itself(path,diameter):
            raise ValueError('Flexible lead intersects itself')
        leads.append({'pinId':pin_id,'points':points,'path':path})
    if any(_segment_distance(a,b,c,d)<2*package_lead_collision_radius_mm(package)*MM_TO_WORLD+leads[0]['path']['sampleError']+leads[1]['path']['sampleError']-EPS for a,b in zip(leads[0]['path']['samples'],leads[0]['path']['samples'][1:]) for c,d in zip(leads[1]['path']['samples'],leads[1]['path']['samples'][1:])):
        raise ValueError('Flexible leads intersect each other')
    return {'position':position,'matrix':matrix,'half':half,'leads':leads,'profile':profile}


def body_envelope(module,part,board):
    """Full 3D oriented body box in world space, including board yaw."""
    geometry=resolve_flexible_geometry(module,part,board)
    yaw=rotation_matrix({'x':0,'y':board.get('rotation',0),'z':0})
    matrix=tuple(tuple(sum(yaw[i][k]*geometry['matrix'][k][j] for k in range(3)) for j in range(3)) for i in range(3))
    center=_add(_point({axis:board.get('position',{}).get(axis,0) for axis in ('x','y','z')}),_transform(yaw,geometry['position']))
    return {'center':center,'axes':tuple(tuple(matrix[j][i] for j in range(3)) for i in range(3)),'half':geometry['half']}


def world_lead_paths(module,part,board):
    geometry=resolve_flexible_geometry(module,part,board)
    yaw=rotation_matrix({'x':0,'y':board.get('rotation',0),'z':0})
    translation=tuple(board.get('position',{}).get(axis,0) for axis in ('x','y','z'))
    return [[_add(translation,_transform(yaw,point)) for point in lead['path']['samples']] for lead in geometry['leads']]


def lead_hits_body(points,envelope,radius):
    matrix=tuple(tuple(envelope['axes'][column][row] for column in range(3)) for row in range(3))
    half=tuple(value+radius for value in envelope['half'])
    return any(_segment_enters_body(first,second,envelope['center'],matrix,half) for first,second in zip(points,points[1:]))


def lead_paths_intersect(first_paths,first_radius,second_paths,second_radius):
    """Sampled capsules include arc chord error in their supplied radii."""
    return any(_segment_distance(a,b,c,d)<first_radius+second_radius-EPS for first in first_paths for second in second_paths for a,b in zip(first,first[1:]) for c,d in zip(second,second[1:]))


def migrate_legacy_mount(graph,module_id):
    """Explicit rebuild command; reading/saving never calls this migration.

    Identity, contacts, properties and connections are retained. Legacy visual
    lead settings remain stored, but the new flexible shape intent becomes the
    sole geometry authority after this explicitly requested rebuild.
    """
    from .design_validation import validate_design_graph
    from .physical_mounting import get_physical_part
    from .registry import validate_contract
    validate_design_graph(graph)
    result=deepcopy(graph)
    module=next((item for item in result['modules'] if item['id']==module_id),None)
    if module is None or module.get('mount',{}).get('kind')!='breadboard':raise ValueError('Migration requires a legacy rigid mounted component')
    # This compatibility conversion retains the selected historical package.
    # The editor's separate explicit rebuild adopts the current default preset.
    part=get_physical_part(module['type'],module['mount']);package=part['package']
    profile=get_mechanical_profile(package['id'],package['revision'])
    if profile is None:raise ValueError('This package has no flexible authoring profile')
    properties=module.get('properties',{})
    validate_contract('LeadSettings',properties,profile='editor')
    old=module['mount'];position=deepcopy(old['pose']['position'])
    position['y']+=(package['standoffMm']+package['bodyMm']['y']/2+properties.get('bodyLiftMm',0))*MM_TO_WORLD
    rotation={'x':0,'y':old['pose']['rotation'],'z':0};matrix=rotation_matrix(rotation)
    board=next(item for item in result['modules'] if item['id']==old['boardId'])
    contacts={item['pinId']:get_breadboard_contact(board['type'],item['contactId']) for item in old['contacts']}
    leads=[]
    for pin in profile['pins']:
        exit=_add(_point(position),_transform(matrix,_scale(_point(pin['bodyExitMm']),MM_TO_WORLD)))
        contact=contacts[pin['pinId']]['localPosition']
        control=(contact[0],exit[1]-profile['exitStraightMm']*MM_TO_WORLD if profile['strategy']=='radial' else exit[1],contact[2])
        outward=(math.copysign(1,pin['bodyExitMm']['x']),0,0) if profile['strategy']=='axial' else (0,-1,0)
        shoulder=_add(exit,_transform(matrix,_scale(outward,profile['exitStraightMm']*MM_TO_WORLD)))
        stub=_add(tuple(contact),(0,profile['contactStubMm']*MM_TO_WORLD,0))
        controls=[] if math.dist(control,shoulder)<EPS or math.dist(control,stub)<EPS else [dict(zip(('x','y','z'),control))]
        leads.append({'pinId':pin['pinId'],'controlPoints':controls})
    module['mount']={key:deepcopy(old[key]) for key in ('boardId','partId','partRevision','packageId','packageRevision','contacts')}
    module['mount'].update(kind='breadboard-flexible',version=1,mechanicalProfileId=profile['id'],mechanicalProfileRevision=profile['revision'],geometryRevision=1,
        bodyPose={'position':position,'rotation':rotation},leads=leads)
    result['schema_version']='1.2';validate_design_graph(result)
    return result
