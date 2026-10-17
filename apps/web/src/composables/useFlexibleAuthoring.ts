import {onUnmounted,ref,watch,type Ref} from 'vue'
import {FlexiblePlacementController} from '../editor/FlexiblePlacementController'
import {PointerGestureSession} from '../editor/PointerGestureSession'
import {isFlexibleMount,supportsFlexiblePlacement} from '../electrical/flexibleGeometry'
import {getPartForType} from '../data/partCatalog'
import {useCircuitStore} from '../stores/circuit'
import {useWorkspaceStore} from '../stores/workspace'
import {useAuthStore} from '../stores/auth'
import type {createSceneManager,FlexibleHandle} from '../three/SceneManager'
import type {CircuitModule,FlexibleMount} from '../types/circuit'

type Manager=ReturnType<typeof createSceneManager>
/** Pointer adapter owns previews/capture, while controller owns draft state and solver owns geometry. */
export function useFlexibleAuthoring(canvas:Ref<HTMLCanvasElement|undefined>,manager:()=>Manager|undefined){
 const circuit=useCircuitStore(),workspace=useWorkspaceStore(),auth=useAuthStore(),controller=new FlexiblePlacementController(),session=new PointerGestureSession()
 const hint=ref('');let frame:number|null=null,pending:{x:number;y:number}|null=null,last:{boardId:string;contactId:string}|null=null,lastPreview:CircuitModule|null=null
 let right:{pointer:number;x:number;y:number;dragged:boolean}|null=null
 let edit:{pointer:number;draft:string|null;module:CircuitModule;handle:FlexibleHandle['handle'];x:number;y:number;mount:FlexibleMount|null;dragged:boolean}|null=null
 const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T
 const active=()=>!!workspace.placementType&&supportsFlexiblePlacement(workspace.placementType)
 const xy=(event:{clientX:number;clientY:number})=>{const rect=canvas.value!.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top}}
 const refreshHint=()=>{hint.value=controller.hint}
 function show(x:number,y:number){
  if(!active())return
  const hit=manager()?.pickEndpoint(x,y)
  manager()?.hoverEndpoint(hit?.kind==='contact'?hit.endpoint:null)
  if(hit?.kind==='contact'&&hit.contactId){last={boardId:hit.id,contactId:hit.contactId};const solution=controller.hover(hit.id,hit.contactId,circuit.graph?.modules??[])
   if(solution?.valid&&solution.mount){lastPreview={id:'PLACE',type:controller.type,mount:solution.mount,properties:workspace.placementProperties??undefined};manager()?.setFlexiblePreview(lastPreview,circuit.graph?.modules??[])}
  }else{last=null;controller.reason=controller.first?'Choose the second hole on the same breadboard.':'Choose an existing breadboard hole.'}
  if(controller.reason&&lastPreview)manager()?.setFlexiblePreview(lastPreview,circuit.graph?.modules??[],false)
  refreshHint()
 }
 function cancel(){
  if(frame!==null){cancelAnimationFrame(frame);frame=null}pending=null;right=null;last=null
  const pointer=session.cancel();edit=null
  if(pointer!==null&&canvas.value?.hasPointerCapture(pointer))canvas.value.releasePointerCapture(pointer)
  controller.cancel();lastPreview=null;hint.value='';manager()?.lockPointer(false);manager()?.setFlexiblePreview(null);manager()?.hoverEndpoint(null)
  if(circuit.graph)manager()?.syncGraph(circuit.graph)
 }
 function cancelEdit(){
  if(frame!==null){cancelAnimationFrame(frame);frame=null}pending=null;right=null
  const pointer=session.cancel(),wasEditing=!!edit;edit=null
  if(pointer!==null&&canvas.value?.hasPointerCapture(pointer))canvas.value.releasePointerCapture(pointer)
  manager()?.lockPointer(false);if(wasEditing)manager()?.syncGraph(circuit.graph)
  if(active())refreshHint();else hint.value=''
 }
 function arm(){cancel();if(active()){controller.arm(workspace.placementType!,workspace.placementEpoch);refreshHint()}}
 function choose(x:number,y:number){
  const hit=manager()?.pickEndpoint(x,y)
  if(hit?.kind!=='contact'||!hit.contactId){controller.reason='Choose an existing breadboard hole.';refreshHint();return}
  const mount=controller.choose(hit.id,hit.contactId,circuit.graph?.modules??[]);refreshHint()
  if(!mount)return
  try{const id=circuit.placeFlexibleModule(controller.type,mount,workspace.placementProperties??undefined);cancel();workspace.selectModule(id);workspace.editError=''}catch(error){workspace.editError=error instanceof Error?error.message:'Placement failed.'}
 }
 function pointerDown(event:PointerEvent){
  if(!canvas.value||!manager())return false
  if(workspace.componentGeometryPreview){workspace.componentGeometryPreview=null;manager()?.syncGraph(circuit.graph)}
  const point=xy(event)
  if(active()){
   if(event.button===2){right={pointer:event.pointerId,...point,dragged:false};return true}
   if(event.button!==0)return true
   event.preventDefault();event.stopImmediatePropagation();canvas.value.focus();choose(point.x,point.y);return true
  }
  if(event.button!==0||workspace.tool!=='select'||workspace.zoomAreaActive||workspace.marqueeActive)return false
  const hit=manager()!.pickFlexibleHandle(point.x,point.y),module=hit&&circuit.graph?.modules.find(m=>m.id===hit.id)
  if(!hit||!module||!isFlexibleMount(module.mount)||!session.begin(event.pointerId,circuit.activeId))return false
  edit={pointer:event.pointerId,draft:circuit.activeId,module:clone(module),handle:hit.handle,...point,mount:clone(module.mount),dragged:false}
  manager()!.lockPointer(true);canvas.value.setPointerCapture(event.pointerId);canvas.value.focus();event.preventDefault();event.stopImmediatePropagation();return true
 }
 function updateEdit(x:number,y:number){
  if(!edit||!circuit.graph||!isFlexibleMount(edit.module.mount))return
  const original=edit.module.mount;let mount:FlexibleMount|null=null
   const hit=manager()?.pickEndpoint(x,y,edit.module.id),index=edit.handle==='pin-0'?0:1
   if(hit?.kind==='contact'&&hit.id===original.boardId&&hit.contactId){
    const pinId=getPartForType(edit.module.type,original)!.package.pins[index].id
    try{const candidate=circuit.previewComponentGeometry(edit.module.id,pinId,hit.contactId);mount=isFlexibleMount(candidate.mount)?candidate.mount:null;hint.value='Release to re-anchor. Body and leads adjust automatically.'}catch(error){hint.value=error instanceof Error?error.message:'Invalid contact.';mount=null;manager()?.syncGraph(circuit.graph)}
   }else{hint.value='Choose a hole on the same breadboard. The other pin remains fixed.';manager()?.syncGraph(circuit.graph)}
  edit.mount=mount
  if(mount)manager()?.previewFlexibleModule({...edit.module,mount})
 }
 function pointerMove(event:PointerEvent){
  if(!canvas.value||!manager())return false
  const point=xy(event)
  if(right?.pointer===event.pointerId){if(Math.hypot(point.x-right.x,point.y-right.y)>=4)right.dragged=true;return true}
  if(edit){if(!session.owns(event.pointerId,circuit.activeId)){cancel();return true}if(Math.hypot(point.x-edit.x,point.y-edit.y)>=3)edit.dragged=true;if(edit.dragged){pending=point;if(frame===null)frame=requestAnimationFrame(()=>{frame=null;const point=pending;pending=null;if(point&&edit)updateEdit(point.x,point.y)})}return true}
  if(!active())return false
  pending=point
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;const point=pending;pending=null;if(point)show(point.x,point.y)})
  return true
 }
 function pointerUp(event:PointerEvent){
  if(right?.pointer===event.pointerId){const completed=right;right=null
   if(!completed.dragged&&active()&&canvas.value){const point=xy(event);if(Math.hypot(point.x-completed.x,point.y-completed.y)<4){
    if(!controller.first){workspace.cancelPlacement();cancel()}
   }}return true
  }
  if(!edit||edit.pointer!==event.pointerId)return false
  if(frame!==null){cancelAnimationFrame(frame);frame=null}pending=null
  if(canvas.value){const point=xy(event);if(edit.dragged)updateEdit(point.x,point.y)}
  const completed=edit;edit=null;const admitted=session.complete(event.pointerId,circuit.activeId)
  manager()?.lockPointer(false);if(canvas.value?.hasPointerCapture(event.pointerId))canvas.value.releasePointerCapture(event.pointerId)
  if(admitted&&completed.dragged&&completed.mount)try{circuit.updateFlexibleMount(completed.module.id,completed.mount);workspace.editError=''}catch(error){workspace.editError=error instanceof Error?error.message:'Placement failed.'}
  else if(admitted&&completed.dragged&&!completed.mount)workspace.editError=hint.value||'Component geometry does not fit this contact.'
  manager()?.syncGraph(circuit.graph);hint.value='';return true
 }
 function keydown(event:KeyboardEvent){
  if(event.key==='Escape'&&workspace.componentGeometryPreview){event.preventDefault();workspace.componentGeometryPreview=null;return true}
  if(!active())return false
  if(event.key==='Escape'){event.preventDefault();workspace.cancelPlacement();cancel();return true}return false
 }
 watch(()=>[workspace.placementEpoch,workspace.tool],arm,{flush:'sync'})
 watch(()=>[workspace.placementType,workspace.placementProperties],()=>{if(!active()){cancel();return}if(controller.phase==='idle')arm();else{controller.type=workspace.placementType!;if(last){const s=controller.hover(last.boardId,last.contactId,circuit.graph?.modules??[]);if(s?.mount)manager()?.setFlexiblePreview({id:'PLACE',type:controller.type,mount:s.mount,properties:workspace.placementProperties??undefined},circuit.graph?.modules??[])}refreshHint()}},{deep:true})
 watch(()=>[circuit.activeId,auth.connectionEpoch],()=>{workspace.cancelPlacement();cancel()},{flush:'sync'})
 watch(()=>circuit.graph,()=>{if(edit)cancel();if(active())arm()})
 watch(()=>[workspace.selectedModuleId,workspace.tool,workspace.placementType],()=>{if(edit&&workspace.selectedModuleId!==edit.module.id)cancel();manager()?.setFlexibleEditing(workspace.tool==='select'&&!workspace.placementType)})
 watch(()=>workspace.componentGeometryPreview,preview=>{if(circuit.graph)manager()?.syncGraph(preview?{...circuit.graph,schema_version:'1.2',modules:circuit.graph.modules.map(module=>module.id===preview.id?preview:module)}:circuit.graph)},{flush:'sync'})
 onUnmounted(cancel)
 return{active,hint,cancel,cancelEdit,pointerDown,pointerMove,pointerUp,keydown,
  contextMenu(event:MouseEvent){if(active()||right){event.preventDefault();return true}return false},
  pointerCancel(event:PointerEvent){if(edit?.pointer===event.pointerId||right?.pointer===event.pointerId||event.type==='pointercancel'&&active()){workspace.cancelPlacement();cancel();return true}return false},
  drop(type:string,x:number,y:number){if(!supportsFlexiblePlacement(type))return false;workspace.armPlacement(type);arm();choose(x,y);return true}}
}
