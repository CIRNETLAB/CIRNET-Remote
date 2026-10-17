import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, provide } from 'vue'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { getPartForType } from '../src/data/partCatalog'
import { createPackageThumbnailCache, packageThumbnailCacheKey } from '../src/three/PackageThumbnails'
import { parseCircuitFile } from '../src/domain/document/circuitFile'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick() }
const leadSettings={leadForm:'offset-s',leadLengthMm:2,bodyLiftMm:3}
function setup(){
  const pinia=createPinia();setActivePinia(pinia)
  const circuit=useCircuitStore(),workspace=useWorkspaceStore(),ui=useUiStore()
  circuit.importGraph({schema_version:'1.1',circuit_id:'legacy-leads',modules:[{id:'R',type:'RESISTOR_AXIAL',position:{x:0,y:0,z:0},properties:{resistanceOhms:330,powerWatts:.25,tolerancePercent:1,...leadSettings,extension:{retain:true}}},{id:'C',type:'CAPACITOR_CERAMIC',position:{x:1,y:0,z:0}}],connections:[]})
  workspace.selectModule('R');ui.openWindow('component-info');circuit.past=[]
  return{pinia,circuit,workspace,ui}
}

test('legacy lead properties still reach the production thumbnail while the obsolete lead editor stays absent',async()=>{
  const {pinia,circuit,workspace,ui}=setup(),before=circuit.exportGraph(),defaults=JSON.stringify(getPartForType('RESISTOR_AXIAL')!.editor.defaults)
  const previews:Record<string,unknown>[]=[]
  const cache=createPackageThumbnailCache({createRenderer:()=>({render(model){previews.push(JSON.parse(model.userData.signature)[1]);return'data:image/png;base64,preview'},dispose(){}})})
  const info=await loadSfc('components/windows/ComponentInfoWindow.vue'),wrapper=defineComponent({setup(){provide(packageThumbnailCacheKey,cache);return()=>h(info)}}),view=mountSfc(wrapper,pinia)
  try{
    await flush()
    for(let attempt=0;!previews.length&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,0))
    assert.ok(previews.some(properties=>properties.bodyLiftMm===3&&properties.leadLengthMm===2&&properties.leadForm==='offset-s'),'the renderer keeps historical saved appearance')
    for(const label of ['Edit leads','Update lead shape','Extra lead length','Body lift'])assert.equal(view.all().find(node=>node.props['aria-label']===label),undefined)
    assert.equal(view.find('select','aria-label','Lead form'),undefined)
    workspace.selectModule('C');await nextTick();workspace.selectModule('R');await nextTick()
    ui.closeWindow('component-info');await nextTick();ui.openWindow('component-info',{activate:false});await nextTick()
    assert.equal(circuit.exportGraph(),before);assert.equal(circuit.past.length,0)
    assert.deepEqual(parseCircuitFile(circuit.exportGraph()).modules[0].properties,parseCircuitFile(before).modules[0].properties)
    assert.equal(JSON.parse(circuit.exportGraph()).schema_version,'1.1')
    assert.equal(JSON.stringify(getPartForType('RESISTOR_AXIAL')!.editor.defaults),defaults)
  }finally{view.app.unmount();cache.dispose?.()}
})

test('canonical property edits and Add preserve legacy lead metadata without an appearance-edit transaction',async()=>{
  const {pinia,circuit,workspace}=setup(),before=circuit.exportGraph(),view=mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'),pinia)
  try{
    await flush()
    dispatch(view.find('input','aria-label','Resistance'),'onInput','1.5');dispatch(view.find('select','aria-label','Resistance unit'),'onChange','kΩ')
    assert.equal(circuit.exportGraph(),before,'uncommitted design text remains outside graph truth')
    dispatch(view.find('button','aria-label','Update component properties'),'onClick');await nextTick()
    const properties=circuit.graph!.modules[0].properties!
    assert.equal(properties.resistanceOhms,1500);for(const [key,value]of Object.entries(leadSettings))assert.equal(properties[key],value)
    assert.deepEqual(properties.extension,{retain:true});assert.equal(circuit.past.length,1)
    circuit.undo();assert.equal(circuit.exportGraph(),before);circuit.redo();await nextTick()
    const saved=circuit.exportGraph(),history=circuit.past.length
    const add=view.all().find(node=>node.tag==='button'&&String(node.props['aria-label']).startsWith('Add '))!
    dispatch(add,'onClick');await nextTick()
    assert.equal(workspace.placementType,'GENERIC_RESISTOR');assert.equal(workspace.placementProperties?.resistanceOhms,1500)
    assert.equal(circuit.exportGraph(),saved);assert.equal(circuit.past.length,history,'Add arms a separate draft without rewriting the legacy instance')
    assert.equal(JSON.parse(saved).schema_version,'1.1')
  }finally{view.app.unmount()}
})
