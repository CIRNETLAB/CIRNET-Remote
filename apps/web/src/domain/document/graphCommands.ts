import type { CircuitGraph,CircuitModule,FlexibleMount, Point3, WireIdentity, WireVisual } from '../../types/circuit'
import type { MemoryImage } from '../../types/memory'
import { getDefinition, validateProperties } from '../../data/editorCatalog'
import { assertConnectionAllowed } from '../../electrical/nets'
import { copyWireVisual, validateWireVisual } from '../../wires/wireVisual'
import { moduleWorldPose } from '../../electrical/modulePose'
import { solveMounting } from '../../electrical/mounting'
import { getPartForType, getPartForModule, physicalDescriptorForPart } from '../../data/partCatalog'
import {getMechanicalProfile,isFlexibleMount,solveFlexibleMount} from '../../electrical/flexibleGeometry'
import {parseEndpoint,formatEndpoint} from '../../electrical/endpoints'
import {parseCircuitFile} from './circuitFile'
import {withCircuitModules} from './graphVersion'
import {buildFlexibleTransformCandidate} from '../../electrical/flexibleTransforms'
import { createMemoryImage, parseMemoryImage } from './memoryImage'
import { normalizeComponentProperties } from '../../data/componentProperties'
import { normalizeLabelProperties } from '../../data/labelProperties'
import { isLeadEditableType } from '../../data/leadProperties'
import { buildDeleteCandidate, buildMoveSelectionCandidate, buildPasteCandidate, type MoveCandidate, type PasteOptions } from '../../editor/batchCommands'
import { captureSelectionClipboard, type SelectionClipboard } from '../../editor/selectionClipboard'
import { emptyEditorSelection, type EditorSelection } from '../../editor/selection'

import { authoredDocument,currentGraph,commitGraph,releaseMomentaryModule,type EditorDocumentState } from './editorDocument'

const copyData=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T
function checkedCommit(state:EditorDocumentState,graph:CircuitGraph){commitGraph(state,parseCircuitFile(JSON.stringify(graph)))}
function componentProperties(type:string,values?:Record<string,unknown>){
  const definition=getDefinition(type)
  if(!definition)throw Error('Placement metadata is unavailable for this type.')
  const properties=normalizeComponentProperties(type,{...definition.defaults,...values})
  validateProperties(type,properties);return properties
}

export function placeFlexibleModule(state:EditorDocumentState,type:string,mount:FlexibleMount,properties?:Record<string,unknown>):string{
  const graph=currentGraph(state);if(!graph)throw Error('Create a circuit first.')
  const ids=new Set(graph.modules.map(m=>m.id));let serial=1;while(ids.has(`${type}_${serial}`))serial++
  const id=`${type}_${serial}`,module:CircuitModule={id,type,mount:copyData(mount),properties:componentProperties(type,properties)}
  checkedCommit(state,{...graph,schema_version:'1.2',modules:[...graph.modules,module]});return id
}
export function updateFlexibleMount(state:EditorDocumentState,id:string,mount:FlexibleMount):void{
  const graph=currentGraph(state),module=graph?.modules.find(m=>m.id===id)
  if(!graph||!module||!isFlexibleMount(module.mount))throw Error('Select a flexible mounted component.')
  checkedCommit(state,withCircuitModules(graph,graph.modules.map(m=>m.id===id?{...m,mount:copyData(mount)}:m)))
}
/** Explicit rebuild adopts the current preset; re-anchor retains its pinned package.
 * Both regenerate the automatic pose and exterior lead paths from exact contacts. */
export function previewComponentGeometry(state:EditorDocumentState,id:string,pinId?:string,contactId?:string):CircuitModule{
  const graph=currentGraph(state),module=graph?.modules.find(m=>m.id===id),part=module&&(pinId!==undefined?getPartForModule(module):getPartForType(module.type))
  if(!graph||!module||!part)throw Error('Select a physical component to rebuild.')
  if(pinId!==undefined&&(!isFlexibleMount(module.mount)||part.package.pins.length!==2||!part.package.pins.some(pin=>pin.id===pinId)||!contactId))throw Error('Choose a stable component pin and an existing contact.')
  const candidate=copyData(module)
  if(!module.mount){
    candidate.physicalDescriptor=physicalDescriptorForPart(part)
  }else if(part.package.pins.length===2&&getMechanicalProfile(module.type)){
    const contacts=part.package.pins.map(pin=>{
      const binding=module.mount!.contacts.find(binding=>binding.pinId===pin.id)
      if(!binding)throw Error('The component does not bind every stable pin.')
      return pin.id===pinId?contactId!:binding.contactId
    })
    const solution=solveFlexibleMount(module.type,module.mount.boardId,contacts[0],contacts[1],graph.modules,{activeId:id,...(pinId!==undefined?{descriptor:module.mount}:{})})
    if(!solution.valid||!solution.mount)throw Error(solution.reason)
    candidate.mount=copyData(solution.mount)
  }else{
    if(module.mount.kind!=='breadboard')throw Error('This component has no compatible rebuild strategy.')
    candidate.mount={...copyData(module.mount),partId:part.id,partRevision:part.revision,packageId:part.package.id,packageRevision:part.package.revision}
  }
  const validated=parseCircuitFile(JSON.stringify(withCircuitModules(graph,graph.modules.map(m=>m.id===id?candidate:m))))
  return validated.modules.find(m=>m.id===id)!
}
/** Commit only the previewed geometry; all unrelated source data remain authoritative. */
export function rebuildComponentGeometry(state:EditorDocumentState,id:string,preview:CircuitModule):void{
  const graph=currentGraph(state),module=graph?.modules.find(m=>m.id===id)
  if(!graph||!module||preview.id!==id||preview.type!==module.type||!getPartForModule(preview))throw Error('The geometry preview is no longer applicable.')
  let candidate:CircuitModule
  if(module.mount){
    if(!preview.mount||JSON.stringify(module.mount.contacts)!==JSON.stringify(preview.mount.contacts))throw Error('The component contacts changed; rebuild the preview again.')
    candidate={...module,mount:copyData(preview.mount)}
  }else{
    if(preview.mount||JSON.stringify(module.position)!==JSON.stringify(preview.position)||module.rotation!==preview.rotation||!preview.physicalDescriptor)throw Error('The component position changed; rebuild the preview again.')
    candidate={...module,physicalDescriptor:copyData(preview.physicalDescriptor)}
  }
  checkedCommit(state,withCircuitModules(graph,graph.modules.map(m=>m.id===id?candidate:m)))
}
export function changeComponentDesign(state:EditorDocumentState,id:string,nextType:string,patch:Record<string,unknown>,pinMap?:Record<string,string>):void{
  const graph=currentGraph(state),module=graph?.modules.find(m=>m.id===id)
  if(!graph||!module)throw Error('Select a component.')
  if(nextType===module.type){updateModuleProperties(state,id,patch);return}
  const previous=getPartForType(module.type,module.mount),next=getPartForType(nextType)
  if(!previous||!next)throw Error('An explicit compatible component design is required.')
  const oldPins=previous.package.pins.map(p=>p.id),newPins=next.package.pins.map(p=>p.id)
  const mapping=pinMap??(oldPins.length===newPins.length&&oldPins.every(p=>newPins.includes(p))?Object.fromEntries(oldPins.map(p=>[p,p])):null)
  if(!mapping||Object.keys(mapping).length!==oldPins.length||!oldPins.every(p=>Object.hasOwn(mapping,p))||new Set(Object.values(mapping)).size!==newPins.length||!Object.values(mapping).every(p=>newPins.includes(p)))throw Error('Changing Type requires a bijective stable pin mapping.')
  const properties=componentProperties(nextType,{...module.properties,...patch}),changed:CircuitModule={...module,type:nextType,properties,...(!module.mount ? { physicalDescriptor: physicalDescriptorForPart(next) } : {})}
  if(module.mount){
    const contacts=module.mount.contacts.map(binding=>({...binding,pinId:mapping[binding.pinId]}))
    if(isFlexibleMount(module.mount)){
      if(next.package.id===previous.package.id){
        const profile=getMechanicalProfile(nextType);if(!profile)throw Error('This design has no compatible mechanical profile.')
        changed.mount={...copyData(module.mount),partId:next.id,partRevision:next.revision,packageId:next.package.id,packageRevision:next.package.revision,
          mechanicalProfileId:profile.id,mechanicalProfileRevision:profile.revision,contacts,leads:module.mount.leads.map(lead=>({...copyData(lead),pinId:mapping[lead.pinId]}))}
      }else{
        const ordered=newPins.map(pin=>contacts.find(binding=>binding.pinId===pin)!.contactId)
        const solution=solveFlexibleMount(nextType,module.mount.boardId,ordered[0],ordered[1],graph.modules,{activeId:id})
        if(!solution.valid||!solution.mount)throw Error(solution.reason)
        changed.mount=solution.mount
      }
    }else changed.mount={...copyData(module.mount),partId:next.id,partRevision:next.revision,packageId:next.package.id,packageRevision:next.package.revision,contacts}
  }
  const remap=(value:string)=>{const endpoint=parseEndpoint(value);return endpoint?.kind==='port'&&endpoint.moduleId===id?formatEndpoint({...endpoint,portId:mapping[endpoint.portId]??endpoint.portId}):value}
  const connections=graph.connections.map(wire=>({...wire,source:remap(wire.source),destination:remap(wire.destination)}))
  checkedCommit(state,withCircuitModules(graph,graph.modules.map(m=>m.id===id?changed:m),connections))
}
export function convertModuleToFlexible(state:EditorDocumentState,id:string):void{
  const graph=currentGraph(state),module=graph?.modules.find(m=>m.id===id)
  if(!graph||!module?.mount||isFlexibleMount(module.mount))throw Error('Select a rigid two-pin mounted component to convert.')
  const pins=getPartForType(module.type)?.package.pins
  if(!pins||pins.length!==2)throw Error('This component has no two-lead conversion strategy.')
  const contacts=pins.map(pin=>module.mount!.contacts.find(binding=>binding.pinId===pin.id)!.contactId)
  const solution=solveFlexibleMount(module.type,module.mount.boardId,contacts[0],contacts[1],graph.modules,{activeId:id})
  if(!solution.valid||!solution.mount)throw Error(solution.reason)
  checkedCommit(state,{...graph,schema_version:'1.2',modules:graph.modules.map(m=>m.id===id?{...m,mount:solution.mount!}:m)})
}

export function captureSelection(state:EditorDocumentState, selection: EditorSelection): SelectionClipboard | null {
  const graph=authoredDocument(state)?.graph
  return graph ? captureSelectionClipboard(graph, selection) : null
}
export function deleteSelection(state:EditorDocumentState, selection: EditorSelection): EditorSelection {
  const graph=currentGraph(state)
  if (graph) commitGraph(state, buildDeleteCandidate(graph, selection))
  return emptyEditorSelection()
}
export function pasteSelection(state:EditorDocumentState, snapshot: SelectionClipboard, options?: PasteOptions) {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const candidate = buildPasteCandidate(graph, snapshot, options)
  commitGraph(state, candidate.graph)
  return candidate
}
export function moveSelection(state: EditorDocumentState, selection: EditorSelection, delta: Point3): MoveCandidate {
  const graph = currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const candidate = buildMoveSelectionCandidate(graph, selection, delta)
  commitGraph(state, candidate.graph)
  return candidate
}
export function placeModule(state:EditorDocumentState, type: string, position: Required<NonNullable<CircuitModule['position']>>, rotation = 0, initialProperties?: Record<string, unknown>): string {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const definition = getDefinition(type)
  if (!definition) throw new Error('Placement metadata is unavailable for this type.')
  if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
  if (!Number.isFinite(rotation)) throw new Error('Rotation must be finite.')
  const ids = new Set(graph.modules.map((module) => module.id))
  let serial = 1
  while (ids.has(`${type}_${serial}`)) serial++
  const id = `${type}_${serial}`
  const properties = { ...structuredClone(definition.defaults), ...normalizeComponentProperties(type, initialProperties) }
  validateProperties(type, properties)
  if (definition.memoryContract) properties.memory = createMemoryImage()
  const physical = getPartForType(type), candidate = physical ? solveMounting(type, position, rotation, graph.modules, id) : null
  if (candidate && !candidate.valid) throw new Error(candidate.reason)
  const module: CircuitModule = { id, type, ...(candidate ? { mount: candidate.mount } : { position: { ...position }, rotation: ((rotation % 360) + 360) % 360, ...(physical ? { physicalDescriptor: physicalDescriptorForPart(physical) } : {}) }), properties }
  const next=withCircuitModules(graph,[...graph.modules,module])
  if(physical&&next.schema_version==='1.0')next.schema_version='1.1'
  commitGraph(state,next)
  return id
}
export function moveModule(state:EditorDocumentState, id: string, position: Required<NonNullable<CircuitModule['position']>>) {
  const graph=currentGraph(state)
  if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
  if (!graph?.modules.some((module) => module.id === id)) return
  const module = graph.modules.find(m => m.id === id)!, world = moduleWorldPose(module, graph.modules)
  if(isFlexibleMount(module.mount)){
    const candidate=buildFlexibleTransformCandidate(graph,id,position)
    checkedCommit(state,withCircuitModules(graph,graph.modules.map(m=>m.id===id?candidate:m)));return
  }
  const descriptor = getPartForModule(module)
  const candidate = descriptor ? solveMounting(module.type, position, world.rotation ?? 0, graph.modules, id, physicalDescriptorForPart(descriptor)) : null
  if (candidate && !candidate.valid) throw new Error(candidate.reason)
  const { mount: _mount, ...free } = module
  const next = candidate ? { ...free, position: undefined, rotation: undefined, mount: candidate.mount } : { ...free, position: { ...position }, rotation: world.rotation, ...(descriptor && module.mount ? { physicalDescriptor: physicalDescriptorForPart(descriptor) } : {}) }
  commitGraph(state, withCircuitModules(graph,graph.modules.map(item => item.id === id ? next : item)))
}
export function rotateModule(state:EditorDocumentState, id: string, degrees = 90) {
  const graph=currentGraph(state)
  if (!Number.isFinite(degrees)) throw new Error('Rotation must be finite.')
  if (!graph?.modules.some((module) => module.id === id)) return
  const module = graph.modules.find(m => m.id === id)!, world = moduleWorldPose(module, graph.modules)
  if(isFlexibleMount(module.mount)){
    const candidate=buildFlexibleTransformCandidate(graph,id,undefined,degrees)
    checkedCommit(state,withCircuitModules(graph,graph.modules.map(m=>m.id===id?candidate:m)));return
  }
  const rotation = (((world.rotation ?? 0) % 360 + degrees % 360) % 360 + 360) % 360
  if (module.mount) {
    const candidate = solveMounting(module.type, world.position as Required<NonNullable<CircuitModule['position']>>, rotation, graph.modules, id, module.mount)
    if (!candidate?.valid) throw new Error(candidate?.reason ?? 'This rotation does not fit the footprint.')
    commitGraph(state,withCircuitModules(graph,graph.modules.map(item => item.id === id ? { ...module, mount: candidate.mount } : item)))
  } else commitGraph(state,withCircuitModules(graph,graph.modules.map(item => item.id === id ? { ...item, rotation } : item)))
}
export function detachModule(state:EditorDocumentState, id: string) {
  const graph=currentGraph(state)
  const module = graph?.modules.find(m => m.id === id)
  if (!graph || !module?.mount) return
  if(isFlexibleMount(module.mount))throw Error('Flexible assemblies belong to their breadboard; move or delete the assembly instead.')
  const { mount: _mount, ...free } = moduleWorldPose(module, graph.modules)
  const descriptor = getPartForModule(module)
  commitGraph(state,withCircuitModules(graph,graph.modules.map(item => item.id === id ? { ...free, ...(descriptor ? { physicalDescriptor: physicalDescriptorForPart(descriptor) } : {}) } : item)))
}
export function removeModule(state:EditorDocumentState, id: string) {
  const graph=currentGraph(state)
  if (!graph?.modules.some((module) => module.id === id)) return
  deleteSelection(state, { moduleIds: [id], wires: [] })
}
export function connectPorts(state:EditorDocumentState, first: string, second: string) {
  connectEndpoints(state, first, second)
}
export function connectEndpoints(state:EditorDocumentState, first: string, second: string, visual?: WireVisual) {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const { source, destination, reversed } = assertConnectionAllowed(graph, first, second)
  if (visual) validateWireVisual(visual, graph.modules)
  const copy = visual ? copyWireVisual(visual) : undefined
  if (copy && reversed) copy.controlPoints.reverse()
  commitGraph(state, { ...graph, connections: [...graph.connections, { source, destination, ...(copy ? { metadata: { wireVisual: copy } } : {}) }] })
}
export function updateWireVisual(state:EditorDocumentState, wire: WireIdentity, visual: WireVisual) {
  const graph=currentGraph(state)
  if (!graph) return
  if (!graph.connections.some(c => c.source === wire.source && c.destination === wire.destination)) return
  validateWireVisual(visual, graph.modules)
  const copy = copyWireVisual(visual)
  commitGraph(state, { ...graph, connections: graph.connections.map(c => c.source === wire.source && c.destination === wire.destination ? { ...c, metadata: { ...c.metadata, wireVisual: copy } } : c) })
}
export function disconnectPorts(state:EditorDocumentState, source: string, destination: string) {
  const graph=currentGraph(state)
  if (!graph?.connections.some(wire => wire.source === source && wire.destination === destination)) return
  deleteSelection(state, { moduleIds: [], wires: [{ source, destination }] })
}
export function updateModuleProperties(state:EditorDocumentState, id: string, patch: Record<string, unknown>) {
  const graph=currentGraph(state)
  const module = graph?.modules.find((module) => module.id === id)
  if (!module || !graph) return
  if (module.type === 'LABEL') {
    const properties = { ...normalizeLabelProperties({ ...module.properties, ...patch }) }
    checkedCommit(state,withCircuitModules(graph,graph.modules.map(item=>item.id===id?{...item,properties}:item)))
    return
  }
  const definition = getDefinition(module.type)
  const normalizedPatch = normalizeComponentProperties(module.type, patch)
  if (Object.keys(normalizedPatch).some((key) => !definition?.parameters.some((parameter) => parameter.key === key) && !(isLeadEditableType(module.type) && ['leadForm', 'leadLengthMm', 'bodyLiftMm'].includes(key)))) throw new Error('Unsupported component parameter.')
  const properties = normalizeComponentProperties(module.type, { ...definition?.defaults, ...normalizeComponentProperties(module.type, module.properties), ...normalizedPatch })
  validateProperties(module.type, properties)
  // An explicit authored input edit supersedes this captured pointer scope.
  // Validate first so an invalid patch cannot release or change the document.
  if(Object.hasOwn(normalizedPatch,'pressed'))releaseMomentaryModule(state,state.activeId,id)
  const current=currentGraph(state)!
  commitGraph(state,withCircuitModules(current,current.modules.map((item) => item.id === id ? { ...item, properties } : item)))
}
export function setMemoryImage(state:EditorDocumentState, id: string, image: MemoryImage) {
  const graph=currentGraph(state)
  const module = graph?.modules.find((module) => module.id === id)
  if (!graph || !module || !getDefinition(module.type)?.memoryContract) throw new Error('Select a supported memory component.')
  const copy = parseMemoryImage(JSON.stringify(image))
  commitGraph(state,withCircuitModules(graph,graph.modules.map((item) => item.id === id ? { ...item, properties: { ...item.properties, memory: copy } } : item)))
}
