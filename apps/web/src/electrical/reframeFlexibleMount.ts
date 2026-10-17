import type {CircuitModule,FlexibleMount,Point3} from '../types/circuit'
import {moduleLocalToWorld,worldToModuleLocal} from './modulePose'

/** Apply one rigid world transform to all board-local intent, retaining stable pins. */
export function reframeFlexibleMount(mount:FlexibleMount,source:CircuitModule,target:CircuitModule,transform:(point:Point3)=>Point3,yaw:number,contacts:FlexibleMount['contacts']):FlexibleMount{
 const local=(point:Point3)=>worldToModuleLocal(transform(moduleLocalToWorld(point,source)),target)
 return{...mount,boardId:target.id,contacts:contacts.map(binding=>({...binding})),bodyPose:{position:local(mount.bodyPose.position),rotation:{...mount.bodyPose.rotation,y:((mount.bodyPose.rotation.y+(source.rotation??0)+yaw-(target.rotation??0))%360+360)%360}},leads:mount.leads.map(lead=>({...lead,controlPoints:lead.controlPoints.map(local)}))}
}
