/** Pure bounded authoring geometry. No mesh intersection creates an electrical bond. */
import catalog from '../data/flexibleMechanics.json'
import type {BodyPose3D,FlexibleMountV1,MechanicalAuthoringProfileV1} from '../contracts/generated/dto'
import type {CircuitModule,Point3} from '../types/circuit'
import {getPartForType,MM_TO_WORLD,type PartDefinition} from '../data/partCatalog'
import {getBreadboardContact,getBreadboardTopology} from './BreadboardTopology'

export type Matrix3=readonly [Point3,Point3,Point3]
export interface BodyEnvelope {center:Point3;axes:Point3[];half:Point3}
export interface FlexibleGeometry {position:Point3;matrix:Matrix3;half:Point3;profile:MechanicalAuthoringProfileV1;leads:{pinId:string;points:Point3[]}[]}
export interface FlexibleSolution {valid:boolean;reason:string;mount:FlexibleMountV1|null;geometry:FlexibleGeometry|null}
const EPS=1e-5,axes=['x','y','z'] as const
export const addPoint=(a:Point3,b:Point3):Point3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
export const subtractPoint=(a:Point3,b:Point3):Point3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
export const scalePoint=(a:Point3,n:number):Point3=>({x:a.x*n,y:a.y*n,z:a.z*n})
export const dotPoint=(a:Point3,b:Point3)=>a.x*b.x+a.y*b.y+a.z*b.z
export const pointDistance=(a:Point3,b:Point3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const unit=(a:Point3)=>{const n=Math.hypot(a.x,a.y,a.z);if(n<=EPS)throw Error('Invalid flexible lead direction.');return scalePoint(a,1/n)}
const tuple=(a:readonly number[]):Point3=>({x:a[0],y:a[1],z:a[2]})
export function rotationMatrix(rotation:Point3):Matrix3 {
 const [x,y,z]=axes.map(axis=>rotation[axis]*Math.PI/180),a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z)
 return [{x:c*e+d*b*f,y:d*b*e-c*f,z:a*d},{x:a*f,y:a*e,z:-b},{x:c*b*f-d*e,y:c*b*e+d*f,z:a*c}]
}
export const transformPoint=(m:Matrix3,p:Point3):Point3=>({x:dotPoint(m[0],p),y:dotPoint(m[1],p),z:dotPoint(m[2],p)})
export const inverseTransformPoint=(m:Matrix3,p:Point3):Point3=>({x:m[0].x*p.x+m[1].x*p.y+m[2].x*p.z,y:m[0].y*p.x+m[1].y*p.y+m[2].y*p.z,z:m[0].z*p.x+m[1].z*p.y+m[2].z*p.z})
const profiles=catalog.profiles as MechanicalAuthoringProfileV1[]
export const getMechanicalProfile=(type:string)=>{const part=getPartForType(type);return part?profiles.find(p=>p.packageId===part.package.id&&p.packageRevision===part.package.revision)??null:null}
export const isFlexibleMount=(mount: CircuitModule['mount']):mount is FlexibleMountV1=>mount?.kind==='breadboard-flexible'
export const supportsFlexiblePlacement=(type:string)=>!!getMechanicalProfile(type)&&getPartForType(type)?.package.pins.length===2

export function segmentDistance(a:Point3,b:Point3,c:Point3,d:Point3):number {
 const u=subtractPoint(b,a),v=subtractPoint(d,c),w=subtractPoint(a,c),aa=dotPoint(u,u),bb=dotPoint(u,v),cc=dotPoint(v,v),dd=dotPoint(u,w),ee=dotPoint(v,w),denominator=aa*cc-bb*bb
 const clamp=(n:number)=>Math.max(0,Math.min(1,n));let s=denominator>1e-15?clamp((bb*ee-cc*dd)/denominator):0,t=cc>1e-15?(bb*s+ee)/cc:0
 if(t<0){t=0;s=aa>1e-15?clamp(-dd/aa):0}else if(t>1){t=1;s=aa>1e-15?clamp((bb-dd)/aa):0}
 return pointDistance(addPoint(a,scalePoint(u,s)),addPoint(c,scalePoint(v,t)))
}
function entersBody(a:Point3,b:Point3,position:Point3,matrix:Matrix3,half:Point3):boolean {
 const start=inverseTransformPoint(matrix,subtractPoint(a,position)),end=inverseTransformPoint(matrix,subtractPoint(b,position));let lower=0,upper=1
 for(const axis of axes){const bound=Math.max(0,half[axis]-EPS),delta=end[axis]-start[axis];if(Math.abs(delta)<1e-14){if(!(start[axis]>-bound&&start[axis]<bound))return false;continue}
  const first=(-bound-start[axis])/delta,second=(bound-start[axis])/delta;lower=Math.max(lower,Math.min(first,second));upper=Math.min(upper,Math.max(first,second));if(lower>=upper)return false}
 return lower<upper&&upper>EPS&&lower<1-EPS
}
export function resolveFlexibleGeometry(module:CircuitModule,part:PartDefinition,board:CircuitModule):FlexibleGeometry {
 const mount=module.mount
 if(!isFlexibleMount(mount)||mount.version!==1||mount.geometryRevision!==1)throw Error('Unsupported flexible placement version.')
 const profile=getMechanicalProfile(module.type),pkg=part.package
 if(!profile||mount.mechanicalProfileId!==profile.id||mount.mechanicalProfileRevision!==profile.revision)throw Error('Unknown mechanical authoring profile revision.')
 if(mount.boardId!==board.id||board.mount||!getBreadboardTopology(board.type))throw Error('Unknown mounting breadboard.')
 if(mount.partId!==part.id||mount.partRevision!==part.revision||mount.packageId!==pkg.id||mount.packageRevision!==pkg.revision)throw Error('Part/package revision mismatch.')
 if(module.position!==undefined||module.rotation!==undefined)throw Error('Mounted pose must only come from its mount binding.')
 const pins=pkg.pins.map(p=>p.id)
 if(pins.length!==2||mount.contacts.length!==2||mount.leads.length!==2||new Set(mount.contacts.map(p=>p.pinId)).size!==2||new Set(mount.leads.map(p=>p.pinId)).size!==2||!pins.every(id=>mount.contacts.some(p=>p.pinId===id)&&mount.leads.some(p=>p.pinId===id)&&profile.pins.some(p=>p.pinId===id)))throw Error('Flexible placement must bind each stable pin exactly once.')
 const position=mount.bodyPose.position,rotation=mount.bodyPose.rotation
 if(![...Object.values(position),...Object.values(rotation)].every(n=>typeof n==='number'&&Number.isFinite(n)))throw Error('Flexible body pose must be finite.')
 const matrix=rotationMatrix(rotation),half={x:pkg.bodyMm.x*MM_TO_WORLD/2,y:pkg.bodyMm.y*MM_TO_WORLD/2,z:pkg.bodyMm.z*MM_TO_WORLD/2}
 const contacts=mount.contacts.map(binding=>({binding,contact:getBreadboardContact(board.type,binding.contactId)}))
 if(contacts.some(p=>!p.contact))throw Error('Unknown mounting breadboard contact.')
 if(new Set(contacts.map(p=>p.binding.contactId)).size!==2)throw Error('Flexible pins require distinct physical holes.')
 const plane=Math.max(...contacts.map(p=>p.contact!.localPosition[1])),low=position.y-axes.reduce((sum,axis)=>sum+Math.abs(matrix[1][axis])*half[axis],0)
 if(low<plane+profile.bodyClearanceMm*MM_TO_WORLD-EPS)throw Error('Flexible body intersects the breadboard clearance.')
 if(position.y-plane>profile.maxBodyLiftMm*MM_TO_WORLD+EPS)throw Error('Flexible body lift exceeds mechanical bounds.')
 const leads=profile.pins.map(pin=>{
  const controls=mount.leads.find(p=>p.pinId===pin.pinId)!.controlPoints
  if(controls.length>profile.maxControlsPerLead)throw Error('Too many flexible lead controls.')
  const exit=addPoint(position,transformPoint(matrix,scalePoint(pin.bodyExitMm,MM_TO_WORLD))),outward=profile.strategy==='axial'?{x:Math.sign(pin.bodyExitMm.x)||1,y:0,z:0}:{x:0,y:-1,z:0}
  const shoulder=addPoint(exit,transformPoint(matrix,scalePoint(outward,profile.exitStraightMm*MM_TO_WORLD)))
  const contact=tuple(contacts.find(p=>p.binding.pinId===pin.pinId)!.contact!.localPosition),stub=addPoint(contact,{x:0,y:profile.contactStubMm*MM_TO_WORLD,z:0})
  const points=[exit,shoulder,...controls,stub,contact]
  if(points.some(p=>!Object.values(p).every(n=>typeof n==='number'&&Number.isFinite(n))||p.y<plane-EPS))throw Error('Flexible lead intersects the breadboard or is nonfinite.')
  const lengths=points.slice(1).map((p,i)=>pointDistance(points[i],p))
  if(lengths.some(n=>n<EPS))throw Error('Flexible lead has duplicate or degenerate controls.')
  const length=lengths.reduce((sum,n)=>sum+n,0)/MM_TO_WORLD
  if(length<profile.minLeadLengthMm||length>profile.maxLeadLengthMm)throw Error('Flexible lead length exceeds mechanical bounds.')
  if(points.slice(2).some((p,i)=>entersBody(points[i+1],p,position,matrix,half)))throw Error('Flexible lead intersects its rigid body.')
  const trims=points.map(()=>0)
  for(let i=1;i<points.length-1;i++){const cosine=Math.max(-1,Math.min(1,dotPoint(unit(subtractPoint(points[i],points[i-1])),unit(subtractPoint(points[i+1],points[i])))));if(cosine<-1+1e-8)throw Error('Flexible lead reverses through itself.');trims[i]=profile.minBendRadiusMm*MM_TO_WORLD*Math.sqrt(Math.max(0,(1-cosine)/(1+cosine)))}
  if(lengths.some((n,i)=>trims[i]+trims[i+1]>n+EPS))throw Error('Flexible lead cannot fit its minimum bend radius.')
  for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++)if(segmentDistance(points[i],points[i+1],points[j],points[j+1])<pkg.leadDiameterMm*MM_TO_WORLD-EPS)throw Error('Flexible lead intersects itself.')
  return {pinId:pin.pinId,points}
 })
 for(let i=0;i<leads[0].points.length-1;i++)for(let j=0;j<leads[1].points.length-1;j++)if(segmentDistance(leads[0].points[i],leads[0].points[i+1],leads[1].points[j],leads[1].points[j+1])<pkg.leadDiameterMm*MM_TO_WORLD-EPS)throw Error('Flexible leads intersect each other.')
 return {position,matrix,half,profile,leads}
}

export function flexibleBodyEnvelope(module:CircuitModule,part:PartDefinition,board:CircuitModule):BodyEnvelope {
 const geometry=resolveFlexibleGeometry(module,part,board),yaw=rotationMatrix({x:0,y:board.rotation??0,z:0})
 const center=addPoint({x:board.position?.x??0,y:board.position?.y??0,z:board.position?.z??0},transformPoint(yaw,geometry.position))
 const column=(axis:typeof axes[number])=>transformPoint(yaw,{x:geometry.matrix[0][axis],y:geometry.matrix[1][axis],z:geometry.matrix[2][axis]})
 return {center,axes:axes.map(column),half:geometry.half}
}
export function bodiesOverlap(a:BodyEnvelope,b:BodyEnvelope):boolean {
 const delta=subtractPoint(b.center,a.center),cross=(p:Point3,q:Point3)=>({x:p.y*q.z-p.z*q.y,y:p.z*q.x-p.x*q.z,z:p.x*q.y-p.y*q.x})
 for(const raw of [...a.axes,...b.axes,...a.axes.flatMap(p=>b.axes.map(q=>cross(p,q)))]){
  if(Math.hypot(raw.x,raw.y,raw.z)<1e-10)continue
  const axis=unit(raw),radius=(r:BodyEnvelope)=>axes.reduce((sum,key,i)=>sum+r.half[key]*Math.abs(dotPoint(r.axes[i],axis)),0)
  if(Math.abs(dotPoint(delta,axis))>=radius(a)+radius(b)-EPS)return false
 }
 return true
}

export function flexibleLeadsHitBody(module:CircuitModule,modules:CircuitModule[],other:BodyEnvelope):boolean {
 if(!isFlexibleMount(module.mount))return false
 const leads=worldLeadPaths(module,modules)
 return leadPathsHitBody(leads.paths,leads.radius,other)
}
function worldLeadPaths(module:CircuitModule,modules:CircuitModule[]):{radius:number;paths:Point3[][]}{
 const part=getPartForType(module.type)!,board=modules.find(item=>item.id===module.mount!.boardId)!,geometry=resolveFlexibleGeometry(module,part,board)
 const yaw=rotationMatrix({x:0,y:board.rotation??0,z:0}),origin={x:board.position?.x??0,y:board.position?.y??0,z:board.position?.z??0}
 return{radius:part.package.leadDiameterMm*MM_TO_WORLD/2,paths:geometry.leads.map(lead=>lead.points.map(p=>addPoint(origin,transformPoint(yaw,p))))}
}
function leadPathsHitBody(paths:Point3[][],radius:number,other:BodyEnvelope):boolean{
 const half={x:other.half.x+radius,y:other.half.y+radius,z:other.half.z+radius}
 const matrix:Matrix3=[{x:other.axes[0].x,y:other.axes[1].x,z:other.axes[2].x},{x:other.axes[0].y,y:other.axes[1].y,z:other.axes[2].y},{x:other.axes[0].z,y:other.axes[1].z,z:other.axes[2].z}]
 return paths.some(points=>points.slice(1).some((point,i)=>entersBody(points[i],point,other.center,matrix,half)))
}

export function moduleBodyEnvelope(module:CircuitModule,modules:CircuitModule[]):BodyEnvelope|null {
 const part=getPartForType(module.type)
 if(!part)return null
 const board=module.mount?modules.find(item=>item.id===module.mount!.boardId):undefined
 if(isFlexibleMount(module.mount)){if(!board)throw Error('Mount references a missing breadboard.');return flexibleBodyEnvelope(module,part,board)}
 let position:Point3={x:module.position?.x??0,y:module.position?.y??0,z:module.position?.z??0},yaw=module.rotation??0
 if(module.mount){if(!board||board.mount)throw Error('Mount references a missing breadboard.');const rotation=rotationMatrix({x:0,y:board.rotation??0,z:0});position=addPoint({x:board.position?.x??0,y:board.position?.y??0,z:board.position?.z??0},transformPoint(rotation,module.mount.pose.position));yaw=(board.rotation??0)+module.mount.pose.rotation}
 const half={x:part.package.bodyMm.x*MM_TO_WORLD/2,y:part.package.bodyMm.y*MM_TO_WORLD/2,z:part.package.bodyMm.z*MM_TO_WORLD/2},matrix=rotationMatrix({x:0,y:yaw,z:0})
 return {center:{...position,y:position.y+part.package.standoffMm*MM_TO_WORLD+half.y},half,axes:axes.map(axis=>({x:matrix[0][axis],y:matrix[1][axis],z:matrix[2][axis]}))}
}
// Document commands replace the modules array. One scan per immutable revision,
// independent of the number of pointer events or candidate poses in a frame.
const sceneIndices=new WeakMap<CircuitModule[],{occupied:Map<string,Map<string,string>>;bodies:{id:string;body:BodyEnvelope}[];leads:({id:string;radius:number;paths:Point3[][]})[]}>()
function sceneIndex(modules:CircuitModule[]){let index=sceneIndices.get(modules);if(!index){const occupied=new Map<string,Map<string,string>>(),bodies:{id:string;body:BodyEnvelope}[]=[],leads:{id:string;radius:number;paths:Point3[][]}[]=[];for(const module of modules){if(module.mount){let board=occupied.get(module.mount.boardId);if(!board){board=new Map();occupied.set(module.mount.boardId,board)}for(const binding of module.mount.contacts)board.set(binding.contactId,module.id)}const body=moduleBodyEnvelope(module,modules);if(body)bodies.push({id:module.id,body});if(isFlexibleMount(module.mount))leads.push({id:module.id,...worldLeadPaths(module,modules)})}index={occupied,bodies,leads};sceneIndices.set(modules,index)}return index}
export function contactOccupied(modules:CircuitModule[],boardId:string,contactId:string,activeId?:string):boolean {const owner=sceneIndex(modules).occupied.get(boardId)?.get(contactId);return owner!==undefined&&owner!==activeId}

export interface FlexibleIntent {bodyPose?:BodyPose3D;bends?:Point3[];previous?:FlexibleMountV1;activeId?:string}
export function solveFlexibleMount(type:string,boardId:string,first:string,second:string,modules:CircuitModule[],intent:FlexibleIntent={}):FlexibleSolution {
 const fail=(reason:string):FlexibleSolution=>({valid:false,reason,mount:null,geometry:null}),part=getPartForType(type),profile=getMechanicalProfile(type),board=modules.find(m=>m.id===boardId)
 if(!part||!profile||part.package.pins.length!==2)return fail('This part has no flexible two-lead strategy.')
 if(!board||board.mount)return fail('Choose two holes on one breadboard.')
 const firstContact=getBreadboardContact(board.type,first),secondContact=getBreadboardContact(board.type,second)
 if(!firstContact||!secondContact)return fail('Choose an existing breadboard hole.')
 if(first===second)return fail('Choose two distinct physical holes.')
 if(contactOccupied(modules,boardId,first,intent.activeId)||contactOccupied(modules,boardId,second,intent.activeId))return fail('A physical hole is already occupied.')
 const a=tuple(firstContact.localPosition),b=tuple(secondContact.localPosition),delta=subtractPoint(b,a),span=Math.hypot(delta.x,delta.z),yaw=Math.atan2(-delta.z,delta.x)*180/Math.PI,center=scalePoint(addPoint(a,b),.5),pkg=part.package
 const half={x:pkg.bodyMm.x*MM_TO_WORLD/2,y:pkg.bodyMm.y*MM_TO_WORLD/2,z:pkg.bodyMm.z*MM_TO_WORLD/2}
 const ratio=Math.min(1,span/Math.max(pkg.bodyMm.x*MM_TO_WORLD+2*profile.exitStraightMm*MM_TO_WORLD,.00001))
 const preferred=profile.strategy==='axial'?Math.acos(ratio)*180/Math.PI:Math.min(35,Math.max(0,(span/ MM_TO_WORLD-2.54)*2))
 const closePrevious=intent.previous&&Math.abs(intent.previous.bodyPose.rotation.z-preferred)<12
 const rotations=intent.bodyPose?[intent.bodyPose.rotation]:[...(closePrevious?[intent.previous!.bodyPose.rotation]:[]),{x:0,y:yaw,z:preferred},{x:0,y:yaw,z:0},{x:0,y:yaw,z:90},{x:profile.strategy==='radial'?20:0,y:yaw,z:profile.strategy==='axial'?55:0}]
 let reason='This span exceeds the mechanical lead limits.'
 for(const rotation of rotations){
  const matrix=rotationMatrix(rotation),verticalExtent=axes.reduce((sum,axis)=>sum+Math.abs(matrix[1][axis])*half[axis],0)
  const weight=profile.strategy==='axial'&&rotation.z>60?-.2:profile.strategy==='radial'?-.12:0
  const position=intent.bodyPose?.position??{x:center.x+delta.x*weight,y:Math.max(a.y,b.y)+verticalExtent+(profile.bodyClearanceMm+profile.contactStubMm+profile.exitStraightMm+1)*MM_TO_WORLD,z:center.z+delta.z*weight}
  const contacts=pkg.pins.map((pin,i)=>({kind:'pin-contact' as const,version:1 as const,pinId:pin.id,contactId:i===0?first:second}))
  const leads=profile.pins.map(pin=>{
   const anchor=contacts.find(p=>p.pinId===pin.pinId)!.contactId===first?a:b
   const exit=addPoint(position,transformPoint(matrix,scalePoint(pin.bodyExitMm,MM_TO_WORLD))),outward=profile.strategy==='axial'?{x:Math.sign(pin.bodyExitMm.x)||1,y:0,z:0}:{x:0,y:-1,z:0}
   const shoulder=addPoint(exit,transformPoint(matrix,scalePoint(outward,profile.exitStraightMm*MM_TO_WORLD)))
   const controls:Point3[]=[],direction=transformPoint(matrix,outward)
   let routingY=shoulder.y
   if(profile.strategy==='radial'&&direction.y<-.1){
    // Continue away from the tilted underside before turning toward the socket.
    routingY=Math.max(a.y,b.y)+(profile.contactStubMm+profile.minBendRadiusMm*2+.2)*MM_TO_WORLD
    const travel=(shoulder.y-routingY)/-direction.y
    if(travel>EPS)controls.push(addPoint(shoulder,scalePoint(direction,travel)))
   }
   if(pin.pinId===pkg.pins[1].id)controls.push(...(intent.bends??[]))
   const knee={x:anchor.x,y:routingY,z:anchor.z},last=controls.at(-1)??shoulder,stub=addPoint(anchor,{x:0,y:profile.contactStubMm*MM_TO_WORLD,z:0})
   if(pointDistance(last,knee)>EPS&&pointDistance(knee,stub)>EPS)controls.push(knee)
   return {pinId:pin.pinId,controlPoints:controls}
  })
  const mount:FlexibleMountV1={kind:'breadboard-flexible',version:1,boardId,partId:part.id,partRevision:part.revision,packageId:pkg.id,packageRevision:pkg.revision,mechanicalProfileId:profile.id,mechanicalProfileRevision:profile.revision,geometryRevision:1,bodyPose:{position:{...position},rotation:{...rotation}},contacts,leads}
  try{const module={id:intent.activeId??'PLACE',type,mount},geometry=resolveFlexibleGeometry(module,part,board),body=flexibleBodyEnvelope(module,part,board),index=sceneIndex(modules);if(index.bodies.some(other=>other.id!==intent.activeId&&(bodiesOverlap(body,other.body)||flexibleLeadsHitBody(module,modules,other.body)))||index.leads.some(other=>other.id!==intent.activeId&&leadPathsHitBody(other.paths,other.radius,body)))throw Error('Component bodies or leads would intersect.');return {valid:true,reason:'',mount,geometry}}
  catch(error){reason=error instanceof Error?error.message:'Invalid flexible geometry.'}
 }
 return fail(reason)
}
