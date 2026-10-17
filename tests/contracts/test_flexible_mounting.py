"""Flexible assemblies are versioned design data, never inferred electrical nets."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from contracts.design_validation import validate_design_graph
from contracts.physical_mounting import get_physical_part
from contracts.registry import validate_contract


def test_short_270_degree_return_does_not_hide_crossing_long_straight_runs():
    import contracts.flexible_mounting as flexible
    path=flexible.build_lead_path([(-3.,0.,0.),(0.,0.,0.),(0.,.6,0.),(-.6,.6,0.),(-.6,-3.,0.)],.3)
    # The long straight runs cross at (-.6,0,0); their short endpoint gap
    # must not cause an exemption for their much farther crossing points.
    assert flexible.lead_path_intersects_itself(path,.5)
    ordinary=flexible.build_lead_path([(0.,0.,0.),(0.,3.,0.),(4.,3.,0.),(4.,0.,0.)],.3,2)
    assert not flexible.lead_path_intersects_itself(ordinary,.5)


def flexible_graph():
    part=get_physical_part('RESISTOR_AXIAL');package=part['package']
    return {'schema_version':'1.2','circuit_id':'flexible','modules':[
        {'id':'BB','type':'BREADBOARD','position':{'x':4,'y':0,'z':-3},'rotation':37},
        {'id':'R','type':'RESISTOR_AXIAL','properties':{'resistanceOhms':330,'opaque':{'retain':True}},
         'mount':{'kind':'breadboard-flexible','version':1,'boardId':'BB',
             'partId':part['id'],'partRevision':part['revision'],'packageId':package['id'],'packageRevision':package['revision'],
             'mechanicalProfileId':'flex-axial-resistor','mechanicalProfileRevision':1,'geometryRevision':1,
             'bodyPose':{'position':{'x':-2.6,'y':.565,'z':-.715},'rotation':{'x':0,'y':0,'z':0}},
             'contacts':[{'kind':'pin-contact','version':1,'pinId':pin,'contactId':contact} for pin,contact in [('A','terminal:A:10'),('B','terminal:A:14')]],
             'leads':[{'pinId':pin,'controlPoints':[]} for pin in ('A','B')]}}
    ],'connections':[]}


def test_new_graph_schema_accepts_flexible_assembly_without_rigid_footprint():
    graph=flexible_graph();original=deepcopy(graph)
    validate_design_graph(graph)
    assert graph==original
    assert validate_contract('AnySupportedCircuitGraph',graph)==graph
    with pytest.raises(ValidationError):validate_contract('CircuitGraph',graph)


@pytest.mark.parametrize('change',[
    lambda g:g['modules'][1]['mount'].update(version=2),
    lambda g:g['modules'][1]['mount'].update(geometryRevision=2),
    lambda g:g['modules'][1]['mount'].update(mechanicalProfileRevision=2),
    lambda g:g['modules'][1]['mount'].update(boardId='missing'),
    lambda g:g['modules'][1]['mount']['contacts'][0].update(pinId='K'),
    lambda g:g['modules'][1]['mount']['contacts'][0].update(contactId='terminal:A:99'),
    lambda g:g['modules'][1]['mount']['contacts'][1].update(contactId='terminal:A:10'),
    lambda g:g['modules'][1]['mount']['bodyPose']['position'].update(y=.31),
    lambda g:g['modules'][1]['mount']['bodyPose']['position'].update(y=100),
    lambda g:g['modules'][1]['mount']['bodyPose']['rotation'].update(x=float('nan')),
    lambda g:g['modules'][1].update(position={'x':0}),
    lambda g:g['modules'][1]['mount']['leads'][0].update(controlPoints=[{'x':0,'y':1,'z':0}]*9),
])
def test_invalid_flexible_assembly_is_rejected_atomically(change):
    graph=flexible_graph();change(graph);original=deepcopy(graph)
    with pytest.raises((ValidationError,ValueError)):validate_design_graph(graph)
    # NaN is deliberately not equality-comparable.
    assert graph['modules'][1]['mount']['contacts']==original['modules'][1]['mount']['contacts']


def test_different_holes_on_one_strip_are_not_an_occupancy_conflict():
    graph=flexible_graph()
    mount=graph['modules'][1]['mount']
    mount['contacts'][1]['contactId']='terminal:B:10'
    mount['bodyPose']={'position':{'x':-2.86,'y':.7,'z':-.65},'rotation':{'x':0,'y':0,'z':90}}
    mount['leads'][1]['controlPoints']=[{'x':-2.61,'y':.887,'z':-.65},{'x':-2.61,'y':.45,'z':-.585}]
    validate_design_graph(graph)


def test_body_pose_does_not_change_connectivity_and_reanchor_changes_one_binding():
    from netcircuit_sim.nets import resolve_connectivity
    graph=flexible_graph();groups=resolve_connectivity(graph)
    graph['modules'][1]['mount']['bodyPose']['position']['y']+=.1
    assert resolve_connectivity(graph)==groups
    graph['modules'][1]['mount']['contacts'][1]['contactId']='terminal:A:15'
    changed=resolve_connectivity(graph)
    assert next(group for group in groups if 'R.A' in group)==next(group for group in changed if 'R.A' in group)
    assert next(group for group in groups if 'R.B' in group)!=next(group for group in changed if 'R.B' in group)


def test_legacy_mount_requires_an_explicit_copying_migration_and_preserves_identity():
    import contracts.flexible_mounting as flexible
    assert hasattr(flexible,'migrate_legacy_mount'),'An explicit legacy mounting migration is required.'
    legacy=flexible_graph();legacy['schema_version']='1.1';module=legacy['modules'][1]
    mount=module['mount'];module['mount']={key:deepcopy(mount[key]) for key in ('boardId','partId','partRevision','packageId','packageRevision','contacts')}
    module['mount'].update(kind='breadboard',version=1,pose={'position':{'x':-2.6,'y':.309,'z':-.715},'rotation':0})
    module['properties'].update(leadForm='offset-s',leadLengthMm=2,bodyLiftMm=1)
    original=deepcopy(legacy);validate_design_graph(legacy)
    migrated=flexible.migrate_legacy_mount(legacy,'R')
    validate_design_graph(migrated)
    assert legacy==original and migrated['schema_version']=='1.2'
    assert migrated['circuit_id']==legacy['circuit_id'] and migrated['connections']==legacy['connections']
    assert migrated['modules'][1]['mount']['contacts']==legacy['modules'][1]['mount']['contacts']
    assert migrated['modules'][1]['properties']==legacy['modules'][1]['properties']
    assert migrated['modules'][1]['id']==legacy['modules'][1]['id']


def test_legacy_rigid_conversion_resolves_the_pinned_descriptor_after_default_revision_changes():
    from contracts.flexible_mounting import migrate_legacy_mount
    legacy=flexible_graph();legacy['schema_version']='1.1';module=legacy['modules'][1];old=module['mount']
    module['type']='GENERIC_RESISTOR'
    module['mount']={key:deepcopy(old[key]) for key in ('boardId','partId','partRevision','packageId','packageRevision','contacts')}
    module['mount'].update(kind='breadboard',version=1,partId='GENERIC-RESISTOR-AXIAL',pose={'position':{'x':-2.6,'y':.309,'z':-.715},'rotation':0})
    original=deepcopy(legacy);migrated=migrate_legacy_mount(legacy,'R')
    assert legacy==original
    assert migrated['modules'][1]['mount']['partRevision']==1
    assert migrated['modules'][1]['mount']['packageId']=='MRS25-1016'


def test_versioned_typed_simulation_accepts_graph_12_without_widening_legacy_request():
    from netcircuit_sim.dispatch import SimulationDispatcher
    request={'schema_version':'2.0','graph':{'schema_version':'1.2','circuit_id':'typed-flex','modules':[{'id':'S','type':'DIGITAL_SWITCH','properties':{'state':True}}],'connections':[]},
        'capture_config':{'signals':['S.OUT'],'duration_ns':10}}
    result=SimulationDispatcher().simulate(request).model_dump(exclude_unset=True)
    assert result['status']=='COMPLETE' and result['capture']['samples']==[{'signal':'S.OUT','time_ns':0,'value':1}]
    with pytest.raises(ValidationError):validate_contract('SimulationRequest',request)


def obstacle_graph(x=-2.92):
    graph=flexible_graph();graph['modules'][0].update(position={'x':0,'y':0,'z':0},rotation=0)
    graph['modules'].append({'id':'D','type':'DIODE_1N4148','position':{'x':x,'y':.2646062992125984,'z':-.715},'rotation':0})
    return graph


def test_flexible_lead_cannot_pass_through_another_body_even_when_bodies_are_separate():
    with pytest.raises(ValueError,match='another component body'):validate_design_graph(obstacle_graph())


def test_flexible_lead_may_touch_expanded_obstacle_boundary_without_penetrating():
    radius=get_physical_part('RESISTOR_AXIAL')['package']['leadDiameterMm']*.13/2.54/2
    half=get_physical_part('DIODE_1N4148')['package']['bodyMm']['x']*.13/2.54/2
    validate_design_graph(obstacle_graph(-2.86-radius-half))


def test_shared_flexible_parity_corpus_covers_graph_and_local_geometry():
    corpus=json.loads((Path(__file__).resolve().parents[2]/'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))
    for case in corpus['cases']:
        if case['valid']:validate_design_graph(case['graph'])
        else:
            with pytest.raises((ValueError,ValidationError),match='.*'):validate_design_graph(case['graph'])


def test_version_two_shared_curves_have_identical_numeric_lengths_points_and_radii():
    from contracts.flexible_mounting import resolve_flexible_geometry,MM_TO_WORLD
    corpus=json.loads((Path(__file__).resolve().parents[2]/'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))
    for case in corpus['cases']:
        if 'expectedGeometry' not in case:continue
        module=next(module for module in case['graph']['modules'] if 'mount' in module)
        board=next(item for item in case['graph']['modules'] if item['id']==module['mount']['boardId'])
        geometry=resolve_flexible_geometry(module,get_physical_part(module['type'],module['mount']),board)
        for expected in case['expectedGeometry']:
            lead=next(lead for lead in geometry['leads'] if lead['pinId']==expected['pinId'])
            assert lead['path']['length']/MM_TO_WORLD==pytest.approx(expected['lengthMm'],abs=1e-10),case['id']
            assert [radius/MM_TO_WORLD for radius in lead['path']['bendRadii']]==pytest.approx(expected['bendRadiiMm'],abs=1e-10),case['id']
            for actual,point in zip(lead['points'],expected['points']):assert actual==pytest.approx(tuple(point[axis] for axis in ('x','y','z')),abs=1e-12),case['id']


def test_new_geometry_rejects_separate_component_lead_crossing_away_from_both_bodies():
    from contracts.flexible_mounting import resolve_flexible_geometry
    corpus=json.loads((Path(__file__).resolve().parents[2]/'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))
    graph=next(case['graph'] for case in corpus['cases'] if case['id']=='automatic-v2-invalid-component-lead')
    board=graph['modules'][0]
    for module in graph['modules'][1:]:resolve_flexible_geometry(module,get_physical_part(module['type'],module['mount']),board)
    with pytest.raises(ValueError,match='another component lead'):validate_design_graph(graph)


@pytest.mark.parametrize('module_type,column,x',[('LED_LTL307EE',11,-2.795),('CAPACITOR_ELECTROLYTIC',12,-2.73)])
def test_explicit_radial_migration_does_not_create_a_duplicate_straight_control(module_type,column,x):
    from contracts.flexible_mounting import migrate_legacy_mount
    part=get_physical_part(module_type);package=part['package']
    graph={'schema_version':'1.1','circuit_id':'radial-legacy','modules':[{'id':'BB','type':'BREADBOARD'},
        {'id':'C','type':module_type,'mount':{'kind':'breadboard','version':1,'boardId':'BB','partId':part['id'],'partRevision':part['revision'],
            'packageId':package['id'],'packageRevision':package['revision'],'pose':{'position':{'x':x,'y':.309,'z':-.715},'rotation':0},
            'contacts':[{'kind':'pin-contact','version':1,'pinId':pin['id'],'contactId':f'terminal:A:{value:02}'} for pin,value in zip(package['pins'],(10,column))]}}], 'connections':[]}
    migrated=migrate_legacy_mount(graph,'C')
    validate_design_graph(migrated)
    assert migrated['modules'][1]['mount']['contacts']==graph['modules'][1]['mount']['contacts']


def test_upright_led_clearance_2_2_mm_acceptance_does_not_depend_on_straight_subdivision():
    from contracts.breadboard_topology import get_breadboard_contact
    from contracts.flexible_mounting import get_mechanical_profile,resolve_flexible_geometry,MM_TO_WORLD
    part=get_physical_part('GENERIC_LED');package=part['package'];profile=get_mechanical_profile(package['id'],package['revision'])
    board={'id':'BB','type':'BREADBOARD'}
    a,b=(get_breadboard_contact('BREADBOARD',f'terminal:C:{column}')['localPosition'] for column in (10,11))
    pose={'position':dict(zip(('x','y','z'),((a[0]+b[0])/2,a[1]+(package['bodyMm']['y']/2+2.2)*MM_TO_WORLD,a[2]))),'rotation':{'x':0,'y':0,'z':0}}
    mount={'kind':'breadboard-flexible','version':1,'boardId':'BB','partId':part['id'],'partRevision':part['revision'],'packageId':package['id'],'packageRevision':package['revision'],
           'mechanicalProfileId':profile['id'],'mechanicalProfileRevision':profile['revision'],'geometryRevision':1,'bodyPose':pose,
           'contacts':[{'kind':'pin-contact','version':1,'pinId':pin['id'],'contactId':f'terminal:C:{column}'} for pin,column in zip(package['pins'],(10,11))],
           'leads':[{'pinId':pin['id'],'controlPoints':[]} for pin in package['pins']]}
    module={'id':'L','type':'GENERIC_LED','mount':mount}
    original=resolve_flexible_geometry(module,part,board)
    for lead,pin in zip(mount['leads'],profile['pins']):
        lead['controlPoints']=[{'x':pose['position']['x']+pin['bodyExitMm']['x']*MM_TO_WORLD,'y':pose['position']['y']+(pin['bodyExitMm']['y']-offset)*MM_TO_WORLD,'z':a[2]} for offset in (.6,1,1.5)]
    subdivided=resolve_flexible_geometry(module,part,board)
    assert [lead['points'] for lead in subdivided['leads']]==[lead['points'] for lead in original['leads']]
