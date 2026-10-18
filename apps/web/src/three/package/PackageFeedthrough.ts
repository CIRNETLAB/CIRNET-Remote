import {Vector3} from 'three'
import {MM_TO_WORLD,type PartDefinition} from '../../data/partCatalog'
import {fixedPackageLeadPath,packageFeedthroughPoints} from '../../electrical/rigidPackageLeads'
import {createFlexibleLeadPathGeometry} from './LeadGeometry'

/** One body-local -> package-frame mapping, shared by every feedthrough consumer.
 * The hidden segment is a declared interior join, never an electrical contact
 * or additional mechanically validated external lead length. */
export function packageFeedthrough(part:PartDefinition,pinId:string){
 const points=packageFeedthroughPoints(part,pinId)
 const vector=(p:{x:number;y:number;z:number})=>new Vector3(p.x,p.y,p.z)
 return{...points,exit:vector(points.exit),outward:vector(points.outward),embeddedStart:vector(points.embeddedStart)}
}

export function packageLeadSweepOptions(part:PartDefinition){
 const shape=part.package.shape
 if(!shape)return undefined
 return{embeddedDepth:shape.embeddedDepthMm*MM_TO_WORLD,section:{kind:shape.leadSection.kind,width:shape.leadSection.widthMm*MM_TO_WORLD,thickness:shape.leadSection.thicknessMm*MM_TO_WORLD}}
}

/** Fixed packages use the same declared surface exit, circular fillets and
 * interior segment as flexible packages; only their contact frame differs. */
export function createFixedPackageLead(part:PartDefinition,pinId:string){
 const definition=fixedPackageLeadPath(part,pinId),feed=packageFeedthrough(part,pinId),path=definition.path
 const points=definition.points.map(point=>new Vector3(point.x,point.y,point.z))
 const geometry=createFlexibleLeadPathGeometry(path,part.package.leadDiameterMm*MM_TO_WORLD,undefined,undefined,packageLeadSweepOptions(part))
 return{geometry,points,feed,path}
}
