/** Rigid assembly transforms preserve authored lead shape and bind exact holes. */
import type {CircuitGraph,CircuitModule,FlexibleMountV1,Point3} from '../types/circuit'
import {getBreadboardTopology,type BreadboardTopology,type BreadboardContact} from './BreadboardTopology'
import {isFlexibleMount} from './flexibleGeometry'
import {moduleLocalToWorld,moduleWorldPose,worldToModuleLocal} from './modulePose'
import {validateMountBindings} from './mounting'
import {withCircuitModules} from '../domain/document/graphVersion'
import {reframeFlexibleMount} from './reframeFlexibleMount'

const indices=new WeakMap<BreadboardTopology,Map<string,BreadboardContact>>()
const key=(p:Point3)=>[p.x,p.y,p.z].map(n=>Math.round(n*100000)).join(',')
const point=(p:readonly number[]):Point3=>({x:p[0],y:p[1],z:p[2]})
export function transformFlexibleMount(module:CircuitModule,sourceModules:CircuitModule[],targetBoard:CircuitModule,transformWorld:(point:Point3)=>Point3,yawDelta=0):FlexibleMountV1{
 const mount=module.mount
 if(!isFlexibleMount(mount))throw Error('Select a flexible mounted assembly.')
 const source=sourceModules.find(m=>m.id===mount.boardId),topology=getBreadboardTopology(targetBoard.type)
 if(!source||!topology||targetBoard.mount)throw Error('Choose one declared supporting breadboard.')
 const sourcePose=moduleWorldPose(source,sourceModules)
 const toTarget=(local:Point3)=>worldToModuleLocal(transformWorld(moduleLocalToWorld(local,sourcePose)),targetBoard)
 let index=indices.get(topology);if(!index){index=new Map(topology.contacts.map(c=>[key(point(c.localPosition)),c]));indices.set(topology,index)}
 const sourceTopology=getBreadboardTopology(source.type)!
 const contacts=mount.contacts.map(binding=>{
  const old=sourceTopology.contacts.find(c=>c.contactId===binding.contactId)
  if(!old)throw Error('The source contact does not exist.')
  const local=toTarget(point(old.localPosition)),contact=index!.get(key(local))
  if(!contact||Math.hypot(contact.localPosition[0]-local.x,contact.localPosition[1]-local.y,contact.localPosition[2]-local.z)>1e-5)throw Error('The assembly transform must land every pin on an exact breadboard hole.')
  return {...binding,contactId:contact.contactId}
 })
 return reframeFlexibleMount(mount,sourcePose,targetBoard,transformWorld,yawDelta,contacts)
}
/** Returns a canonical module, never the derived world-pose selection object. */
export function buildFlexibleTransformCandidate(graph:CircuitGraph,id:string,position?:Point3,degrees=0):CircuitModule{
 const module=graph.modules.find(m=>m.id===id)
 if(!module||!isFlexibleMount(module.mount))throw Error('Select a flexible mounted assembly.')
 const board=graph.modules.find(m=>m.id===module.mount!.boardId)!,world=moduleWorldPose(module,graph.modules)
 const origin={x:world.position?.x??0,y:world.position?.y??0,z:world.position?.z??0},target=position??origin
 if(![...Object.values(target),degrees].every(Number.isFinite))throw Error('Assembly transform must be finite.')
 const transform=(p:Point3)=>moduleLocalToWorld({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z},{position:target,rotation:degrees})
 const candidate={...module,mount:transformFlexibleMount(module,graph.modules,board,transform,degrees)}
 validateMountBindings(withCircuitModules(graph,graph.modules.map(m=>m.id===id?candidate:m)))
 return candidate
}
