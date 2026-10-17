import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createSceneManager} from '../src/three/SceneManager'
import fixtures from '../../../contracts/design-models/fixtures/flexible-mounting-parity.json'
import type {CircuitGraph} from '../src/types/circuit'
import legacy from '../../../contracts/design-models/fixtures/component-mechanics-legacy.json'
import * as document from '../src/domain/document/editorDocument'
import {previewComponentGeometry} from '../src/domain/document/graphCommands'
import {Box3,Vector3} from 'three'

test('selected historical flexible assemblies expose only endpoint handles, with no old body-pose hit targets',()=>{
 const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame:()=>1,cancelFrame(){}})
 try{
  manager.resize(1000,700);const graph=structuredClone(fixtures.cases.find(f=>f.valid)!.graph) as CircuitGraph
  manager.syncGraph(graph);const module=graph.modules.find(m=>m.mount)!;manager.highlight(module.id)
  const center=manager.models.get(module.id)!.position.clone();manager.camera.position.copy(center).add({x:0,y:3,z:3});manager.camera.lookAt(center);manager.camera.updateMatrixWorld()
  manager.flexibleHandlePosition('pin-0')
  const handles=manager.scene.getObjectByName('flexible-edit-handles')!
  assert.deepEqual(handles.children.map(marker=>marker.userData.flexibleHandle),['pin-0','pin-1'])
  for(const marker of handles.children){const point=manager.project(marker.position);assert.match(manager.pickFlexibleHandle(point.x,point.y)?.handle??'',/^pin-[01]$/)}
 }finally{manager.dispose()}
})

test('historical descriptor preview, cancellation and undo reconstruct body dimensions together with its leads',()=>{
 const graph=structuredClone(legacy) as CircuitGraph,state=document.createEditorDocumentState();document.importGraph(state,'legacy',graph)
 const preview=previewComponentGeometry(state,'R'),next={...graph,schema_version:'1.2' as const,modules:graph.modules.map(module=>module.id==='R'?preview:module)}
 const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame:()=>1,cancelFrame(){}})
 const bodySize=()=>new Box3().setFromObject(manager.models.get('R')!.getObjectByName('flexible-rigid-body')!).getSize(new Vector3()).toArray()
 try{
  manager.syncGraph(graph);const original=manager.models.get('R'),before=bodySize()
  manager.syncGraph(next);const compact=manager.models.get('R');assert.notEqual(compact,original,'a changed package reconstructs the body rather than recoloring old dimensions');const after=bodySize();assert.notDeepEqual(after,before)
  manager.syncGraph(graph);assert.notEqual(manager.models.get('R'),compact);assert.deepEqual(bodySize(),before,'cancel/Undo restores the original descriptor dimensions')
  manager.syncGraph(next);assert.deepEqual(bodySize(),after,'apply/Redo restores the previewed descriptor dimensions')
 }finally{manager.dispose()}
})
