"""Bounded flexible-lead authoring geometry, with no electrical inference."""
from functools import lru_cache
from copy import deepcopy
import json
import math
from pathlib import Path

from .breadboard_topology import get_breadboard_contact

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
def _unit(point):
    length=math.sqrt(_dot(point,point))
    if length<=EPS:raise ValueError('Invalid flexible lead direction')
    return _scale(point,1/length)


def _segment_distance(a,b,c,d):
    u,v,w=_sub(b,a),_sub(d,c),_sub(a,c)
    aa,bb,cc,dd,ee=_dot(u,u),_dot(u,v),_dot(v,v),_dot(u,w),_dot(v,w)
    denominator=aa*cc-bb*bb
    s=max(0,min(1,(bb*ee-cc*dd)/denominator)) if denominator>1e-15 else 0
    t=(bb*s+ee)/cc if cc>1e-15 else 0
    if t<0:t=0;s=max(0,min(1,-dd/aa)) if aa>1e-15 else 0
    elif t>1:t=1;s=max(0,min(1,(bb-dd)/aa)) if aa>1e-15 else 0
    return math.dist(_add(a,_scale(u,s)),_add(c,_scale(v,t)))


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
    if mount['geometryRevision']!=1 or mount['version']!=1 or mount['kind']!='breadboard-flexible':
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
    plane=max(contact['localPosition'][1] for contact in contacts.values())
    low=position[1]-sum(abs(matrix[1][axis])*half[axis] for axis in range(3))
    if low<plane+profile['bodyClearanceMm']*MM_TO_WORLD-EPS:raise ValueError('Flexible body intersects the breadboard clearance')
    if position[1]-plane>profile['maxBodyLiftMm']*MM_TO_WORLD+EPS:raise ValueError('Flexible body lift exceeds mechanical bounds')
    intents={item['pinId']:item['controlPoints'] for item in mount['leads']};leads=[]
    for pin in profile['pins']:
        pin_id=pin['pinId'];controls=intents[pin_id]
        if len(controls)>profile['maxControlsPerLead']:raise ValueError('Too many flexible lead controls')
        exit=_add(position,_transform(matrix,_scale(_point(pin['bodyExitMm']),MM_TO_WORLD)))
        outward=(math.copysign(1,pin['bodyExitMm']['x']),0,0) if profile['strategy']=='axial' else (0,-1,0)
        shoulder=_add(exit,_transform(matrix,_scale(outward,profile['exitStraightMm']*MM_TO_WORLD)))
        contact=tuple(contacts[pin_id]['localPosition']);stub=_add(contact,(0,profile['contactStubMm']*MM_TO_WORLD,0))
        points=[exit,shoulder,*(_point(point) for point in controls),stub,contact]
        try:finite=all(type(value) in (int,float) and math.isfinite(value) for point in points for value in point)
        except OverflowError:finite=False
        if not finite or any(point[1]<plane-EPS for point in points):raise ValueError('Flexible lead intersects the breadboard or is nonfinite')
        lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
        if any(length<EPS for length in lengths):raise ValueError('Flexible lead has duplicate or degenerate controls')
        length=sum(lengths)/MM_TO_WORLD
        if not profile['minLeadLengthMm']<=length<=profile['maxLeadLengthMm']:raise ValueError('Flexible lead length exceeds mechanical bounds')
        if any(_segment_enters_body(a,b,position,matrix,half) for a,b in zip(points[1:],points[2:])):
            raise ValueError('Flexible lead intersects its rigid body')
        trims=[0.]*len(points)
        for index in range(1,len(points)-1):
            incoming=_unit(_sub(points[index],points[index-1]));outgoing=_unit(_sub(points[index+1],points[index]))
            cosine=max(-1,min(1,_dot(incoming,outgoing)))
            if cosine<-1+1e-8:raise ValueError('Flexible lead reverses through itself')
            trims[index]=profile['minBendRadiusMm']*MM_TO_WORLD*math.sqrt(max(0,(1-cosine)/(1+cosine)))
        if any(trims[index]+trims[index+1]>length+EPS for index,length in enumerate(lengths)):
            raise ValueError('Flexible lead cannot fit its minimum bend radius')
        segments=list(zip(points,points[1:]))
        if any(_segment_distance(*segments[first],*segments[second])<package['leadDiameterMm']*MM_TO_WORLD-EPS for first in range(len(segments)) for second in range(first+2,len(segments))):
            raise ValueError('Flexible lead intersects itself')
        leads.append({'pinId':pin_id,'points':points})
    if any(_segment_distance(a,b,c,d)<package['leadDiameterMm']*MM_TO_WORLD-EPS for a,b in zip(leads[0]['points'],leads[0]['points'][1:]) for c,d in zip(leads[1]['points'],leads[1]['points'][1:])):
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
    return [[_add(translation,_transform(yaw,point)) for point in lead['points']] for lead in geometry['leads']]


def lead_hits_body(points,envelope,radius):
    matrix=tuple(tuple(envelope['axes'][column][row] for column in range(3)) for row in range(3))
    half=tuple(value+radius for value in envelope['half'])
    return any(_segment_enters_body(first,second,envelope['center'],matrix,half) for first,second in zip(points,points[1:]))


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
    part=get_physical_part(module['type']);package=part['package']
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
