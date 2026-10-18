/** Pure bounded authoring geometry. No mesh intersection creates an electrical bond. */
import catalog from '../data/flexibleMechanics.json'
import type {FlexibleMountV1,FlexibleMountV2,MechanicalAuthoringProfileV1} from '../contracts/generated/dto'
import type {CircuitModule,Point3} from '../types/circuit'
import {getPartForType,getPartForModule,MM_TO_WORLD,packageLeadCollisionRadiusMm,type PartDefinition,type PinnedPartDescriptor} from '../data/partCatalog'
import {getBreadboardContact,getBreadboardTopology} from './BreadboardTopology'
import {buildLeadPath,closestSegmentApproach,leadPathIntersectsItself,type LeadPath} from './leadPath'
import {hasShapedRigidLeads,rigidPackageLeadSegments,type RigidLeadSegment} from './rigidPackageLeads'

export type Matrix3=readonly [Point3,Point3,Point3]
export interface BodyEnvelope {center:Point3;axes:Point3[];half:Point3}
export type FlexibleMount=FlexibleMountV1|FlexibleMountV2
export interface FlexibleGeometry {position:Point3;matrix:Matrix3;half:Point3;profile:MechanicalAuthoringProfileV1;leads:{pinId:string;points:Point3[];path:LeadPath}[]}
export interface FlexibleSolution {valid:boolean;reason:string;mount:FlexibleMount|null;geometry:FlexibleGeometry|null}
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
export const getMechanicalProfile=(type:string,mount?:PinnedPartDescriptor|null)=>{const part=getPartForType(type,mount);return part?profiles.find(p=>p.packageId===part.package.id&&p.packageRevision===part.package.revision)??null:null}
export const isFlexibleMount=(mount: CircuitModule['mount']):mount is FlexibleMount=>mount?.kind==='breadboard-flexible'
export const supportsFlexiblePlacement=(type:string)=>!!getMechanicalProfile(type)&&getPartForType(type)?.package.pins.length===2

export function segmentDistance(a:Point3,b:Point3,c:Point3,d:Point3):number {
 return closestSegmentApproach(a,b,c,d).distance
}
function entersBody(a:Point3,b:Point3,position:Point3,matrix:Matrix3,half:Point3):boolean {
 const start=inverseTransformPoint(matrix,subtractPoint(a,position)),end=inverseTransformPoint(matrix,subtractPoint(b,position));let lower=0,upper=1
 for(const axis of axes){const bound=Math.max(0,half[axis]-EPS),delta=end[axis]-start[axis];if(Math.abs(delta)<1e-14){if(!(start[axis]>-bound&&start[axis]<bound))return false;continue}
  const first=(-bound-start[axis])/delta,second=(bound-start[axis])/delta;lower=Math.max(lower,Math.min(first,second));upper=Math.min(upper,Math.max(first,second));if(lower>=upper)return false}
 return lower<upper&&upper>EPS&&lower<1-EPS
}
export function resolveFlexibleGeometry(module:CircuitModule,part:PartDefinition,board:CircuitModule):FlexibleGeometry {
 const mount=module.mount
 if(!isFlexibleMount(mount)||!((mount.version===1&&mount.geometryRevision===1)||(mount.version===2&&mount.geometryRevision===2)))throw Error('Unsupported flexible placement version.')
 const profile=getMechanicalProfile(module.type,mount),pkg=part.package
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
 const contactSpan=pointDistance(tuple(contacts[0]!.contact!.localPosition),tuple(contacts[1]!.contact!.localPosition))
 const preferredRadius=mount.version===1?profile.minBendRadiusMm*MM_TO_WORLD:mount.routing.template==='axial-standing'?Math.max(profile.minBendRadiusMm*MM_TO_WORLD,contactSpan/2):(profile.preferredBendRadiusMm??profile.minBendRadiusMm)*MM_TO_WORLD
 const leads=profile.pins.map(pin=>{
  const controls=mount.leads.find(p=>p.pinId===pin.pinId)!.controlPoints
  if(controls.length>profile.maxControlsPerLead)throw Error('Too many flexible lead controls.')
  const exit=addPoint(position,transformPoint(matrix,scalePoint(pin.bodyExitMm,MM_TO_WORLD))),outward=profile.strategy==='axial'?{x:Math.sign(pin.bodyExitMm.x)||1,y:0,z:0}:{x:0,y:-1,z:0}
  const shoulder=addPoint(exit,transformPoint(matrix,scalePoint(outward,profile.exitStraightMm*MM_TO_WORLD)))
  const contact=tuple(contacts.find(p=>p.binding.pinId===pin.pinId)!.contact!.localPosition),stub=addPoint(contact,{x:0,y:profile.contactStubMm*MM_TO_WORLD,z:0})
  const raw=[exit,shoulder,...controls,stub,contact]
  if(raw.some(p=>!Object.values(p).every(n=>typeof n==='number'&&Number.isFinite(n))||p.y<plane-EPS))throw Error('Flexible lead intersects the breadboard or is nonfinite.')
  const path=buildLeadPath(raw,profile.minBendRadiusMm*MM_TO_WORLD,preferredRadius,mount.version===1?{start:0,end:0}:{start:profile.exitStraightMm*MM_TO_WORLD,end:profile.contactStubMm*MM_TO_WORLD})
  const {points,samples,sampleError}=path,length=path.length/MM_TO_WORLD
  if(length<profile.minLeadLengthMm||length>profile.maxLeadLengthMm)throw Error('Flexible lead length exceeds mechanical bounds.')
  if(samples.slice(1).some((p,i)=>entersBody(samples[i],p,position,matrix,half)))throw Error('Flexible lead intersects its rigid body.')
  const diameter=2*packageLeadCollisionRadiusMm(pkg)*MM_TO_WORLD
  if(mount.version===2){
   const radius=diameter/2+sampleError,expanded={x:half.x+radius,y:half.y+radius,z:half.z+radius}
   // The first straight exits the body at its declared port. Every following
   // line/arc must clear the complete tube envelope, including sampling error.
   if(samples.slice(2).some((p,i)=>entersBody(samples[i+1]!,p,position,matrix,expanded)))throw Error('Flexible lead tube intersects its rigid body.')
   // The final normal straight is the intentional socket insertion. All other
   // centerline samples retain a full wire radius above the board surface.
   if(samples.slice(0,-1).some(p=>p.y-radius<plane-EPS))throw Error('Flexible lead tube intersects the breadboard.')
  }
  if(leadPathIntersectsItself(path,diameter))throw Error('Flexible lead intersects itself.')
  return {pinId:pin.pinId,points,path}
 })
 const first=leads[0]!.path,second=leads[1]!.path
 for(let i=0;i<first.samples.length-1;i++)for(let j=0;j<second.samples.length-1;j++)if(segmentDistance(first.samples[i]!,first.samples[i+1]!,second.samples[j]!,second.samples[j+1]!)<2*packageLeadCollisionRadiusMm(pkg)*MM_TO_WORLD+first.sampleError+second.sampleError-EPS)throw Error('Flexible leads intersect each other.')
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
function leadPathsIntersect(first:{paths:Point3[][];radius:number},second:{paths:Point3[][];radius:number}):boolean {
 return leadSegmentsIntersect(pathSegments(first.paths,first.radius),pathSegments(second.paths,second.radius))
}
/** Preserve historical all-V1 scenes while new geometry respects existing wire obstacles. */
export function flexibleLeadsIntersect(first:CircuitModule,second:CircuitModule,modules:CircuitModule[]):boolean {
 if(!isFlexibleMount(first.mount)||!isFlexibleMount(second.mount)||(first.mount.version===1&&second.mount.version===1))return false
 return leadPathsIntersect(worldLeadPaths(first,modules),worldLeadPaths(second,modules))
}
function worldLeadPaths(module:CircuitModule,modules:CircuitModule[]):{radius:number;paths:Point3[][]}{
 const part=getPartForType(module.type,module.mount)!,board=modules.find(item=>item.id===module.mount!.boardId)!,geometry=resolveFlexibleGeometry(module,part,board)
 const yaw=rotationMatrix({x:0,y:board.rotation??0,z:0}),origin={x:board.position?.x??0,y:board.position?.y??0,z:board.position?.z??0}
 return{radius:packageLeadCollisionRadiusMm(part.package)*MM_TO_WORLD+Math.max(...geometry.leads.map(lead=>lead.path.sampleError)),paths:geometry.leads.map(lead=>lead.path.samples.map(p=>addPoint(origin,transformPoint(yaw,p))))}
}
const pathSegments=(paths:Point3[][],radius:number):RigidLeadSegment[]=>paths.flatMap(points=>points.slice(1).map((point,i)=>({start:points[i]!,end:point,radius})))
function rigidModulePose(module:CircuitModule,modules:CircuitModule[]){
 if(isFlexibleMount(module.mount))throw Error('A rigid lead pose cannot use a flexible body frame.')
 let position:Point3={x:module.position?.x??0,y:module.position?.y??0,z:module.position?.z??0},yaw=module.rotation??0
 if(module.mount){const board=modules.find(item=>item.id===module.mount!.boardId);if(!board||board.mount)throw Error('Mount references a missing breadboard.');const rotation=rotationMatrix({x:0,y:board.rotation??0,z:0});position=addPoint({x:board.position?.x??0,y:board.position?.y??0,z:board.position?.z??0},transformPoint(rotation,module.mount.pose.position));yaw=(board.rotation??0)+module.mount.pose.rotation}
 return{position,matrix:rotationMatrix({x:0,y:yaw,z:0})}
}
/** The hidden body embed is absent from these canonical external segments. */
export function moduleRigidLeadSegments(module:CircuitModule,modules:CircuitModule[]):RigidLeadSegment[]{
 const part=getPartForModule(module)
 if(!part||isFlexibleMount(module.mount)||!hasShapedRigidLeads(part))return[]
 const pose=rigidModulePose(module,modules),point=(p:Point3)=>addPoint(pose.position,transformPoint(pose.matrix,p))
 return rigidPackageLeadSegments(part).map(segment=>({...segment,start:point(segment.start),end:point(segment.end)}))
}
function moduleLeadSegments(module:CircuitModule,modules:CircuitModule[]):RigidLeadSegment[]{
 if(!isFlexibleMount(module.mount))return moduleRigidLeadSegments(module,modules)
 const lead=worldLeadPaths(module,modules);return pathSegments(lead.paths,lead.radius)
}
function segmentsBounds(segments:RigidLeadSegment[]){
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity}
 for(const segment of segments)for(const axis of axes){min[axis]=Math.min(min[axis],segment.start[axis]-segment.radius,segment.end[axis]-segment.radius);max[axis]=Math.max(max[axis],segment.start[axis]+segment.radius,segment.end[axis]+segment.radius)}
 return{min,max}
}
function leadSegmentsIntersect(first:RigidLeadSegment[],second:RigidLeadSegment[]):boolean{
 if(!first.length||!second.length)return false
 const a=segmentsBounds(first),b=segmentsBounds(second)
 if(axes.some(axis=>a.max[axis]<=b.min[axis]+EPS||b.max[axis]<=a.min[axis]+EPS))return false
 return first.some(p=>second.some(q=>{
  const radius=p.radius+q.radius-EPS
  if(axes.some(axis=>Math.min(p.start[axis],p.end[axis])-Math.max(q.start[axis],q.end[axis])>=radius||Math.min(q.start[axis],q.end[axis])-Math.max(p.start[axis],p.end[axis])>=radius))return false
  return segmentDistance(p.start,p.end,q.start,q.end)<radius
 }))
}
function leadSegmentsHitBody(segments:RigidLeadSegment[],other:BodyEnvelope):boolean{
 const matrix:Matrix3=[{x:other.axes[0].x,y:other.axes[1].x,z:other.axes[2].x},{x:other.axes[0].y,y:other.axes[1].y,z:other.axes[2].y},{x:other.axes[0].z,y:other.axes[1].z,z:other.axes[2].z}]
 return segments.some(segment=>entersBody(segment.start,segment.end,other.center,matrix,{x:other.half.x+segment.radius,y:other.half.y+segment.radius,z:other.half.z+segment.radius}))
}
export function moduleLeadsHitBody(module:CircuitModule,modules:CircuitModule[],other:BodyEnvelope):boolean{
 return leadSegmentsHitBody(moduleLeadSegments(module,modules),other)
}
/** Historical all-V1 flexible and unshaped rigid scenes retain their rules. */
export function moduleLeadsIntersect(first:CircuitModule,second:CircuitModule,modules:CircuitModule[]):boolean{
 if(isFlexibleMount(first.mount)&&isFlexibleMount(second.mount))return flexibleLeadsIntersect(first,second,modules)
 return leadSegmentsIntersect(moduleLeadSegments(first,modules),moduleLeadSegments(second,modules))
}
function leadPathsHitBody(paths:Point3[][],radius:number,other:BodyEnvelope):boolean{
 const half={x:other.half.x+radius,y:other.half.y+radius,z:other.half.z+radius}
 const matrix:Matrix3=[{x:other.axes[0].x,y:other.axes[1].x,z:other.axes[2].x},{x:other.axes[0].y,y:other.axes[1].y,z:other.axes[2].y},{x:other.axes[0].z,y:other.axes[1].z,z:other.axes[2].z}]
 return paths.some(points=>points.slice(1).some((point,i)=>entersBody(points[i],point,other.center,matrix,half)))
}

export function moduleBodyEnvelope(module:CircuitModule,modules:CircuitModule[]):BodyEnvelope|null {
 const part=getPartForModule(module)
 if(!part)return null
 const board=module.mount?modules.find(item=>item.id===module.mount!.boardId):undefined
 if(isFlexibleMount(module.mount)){if(!board)throw Error('Mount references a missing breadboard.');return flexibleBodyEnvelope(module,part,board)}
 const {position,matrix}=rigidModulePose(module,modules)
 const half={x:part.package.bodyMm.x*MM_TO_WORLD/2,y:part.package.bodyMm.y*MM_TO_WORLD/2,z:part.package.bodyMm.z*MM_TO_WORLD/2}
 return {center:{...position,y:position.y+part.package.standoffMm*MM_TO_WORLD+half.y},half,axes:axes.map(axis=>({x:matrix[0][axis],y:matrix[1][axis],z:matrix[2][axis]}))}
}
// Document commands replace the modules array. One scan per immutable revision,
// independent of the number of pointer events or candidate poses in a frame.
const sceneIndices=new WeakMap<CircuitModule[],{occupied:Map<string,Map<string,string>>;bodies:{id:string;body:BodyEnvelope}[];leads:{id:string;segments:RigidLeadSegment[]}[]}>()
function sceneIndex(modules:CircuitModule[]){let index=sceneIndices.get(modules);if(!index){const occupied=new Map<string,Map<string,string>>(),bodies:{id:string;body:BodyEnvelope}[]=[],leads:{id:string;segments:RigidLeadSegment[]}[]=[];for(const module of modules){if(module.mount){let board=occupied.get(module.mount.boardId);if(!board){board=new Map();occupied.set(module.mount.boardId,board)}for(const binding of module.mount.contacts)board.set(binding.contactId,module.id)}const body=moduleBodyEnvelope(module,modules);if(body)bodies.push({id:module.id,body});const segments=moduleLeadSegments(module,modules);if(segments.length)leads.push({id:module.id,segments})}index={occupied,bodies,leads};sceneIndices.set(modules,index)}return index}
export function contactOccupied(modules:CircuitModule[],boardId:string,contactId:string,activeId?:string):boolean {const owner=sceneIndex(modules).occupied.get(boardId)?.get(contactId);return owner!==undefined&&owner!==activeId}

export interface FlexibleIntent {previous?:FlexibleMount;descriptor?:PinnedPartDescriptor;activeId?:string}
/** New authoring always recomputes automatic geometry; legacy overrides remain
 * authoritative only when resolving stored V1 mounts, never as a pose candidate. */
export function solveFlexibleMount(type:string,boardId:string,first:string,second:string,modules:CircuitModule[],intent:FlexibleIntent={}):FlexibleSolution {
 const fail=(reason:string):FlexibleSolution=>({valid:false,reason,mount:null,geometry:null}),part=getPartForType(type,intent.descriptor),profile=getMechanicalProfile(type,intent.descriptor),board=modules.find(m=>m.id===boardId)
 if(!part||!profile||part.package.pins.length!==2)return fail('This part has no flexible two-lead strategy.')
 if(!board||board.mount)return fail('Choose two holes on one breadboard.')
 const firstContact=getBreadboardContact(board.type,first),secondContact=getBreadboardContact(board.type,second)
 if(!firstContact||!secondContact)return fail('Choose an existing breadboard hole.')
 if(first===second)return fail('Choose two distinct physical holes.')
 if(contactOccupied(modules,boardId,first,intent.activeId)||contactOccupied(modules,boardId,second,intent.activeId))return fail('A physical hole is already occupied.')
 const a=tuple(firstContact.localPosition),b=tuple(secondContact.localPosition),delta=subtractPoint(b,a),span=Math.hypot(delta.x,delta.z),yaw=Math.atan2(-delta.z,delta.x)*180/Math.PI,center=scalePoint(addPoint(a,b),.5),pkg=part.package
 const mm=MM_TO_WORLD,r=profile.minBendRadiusMm,plane=Math.max(a.y,b.y),exitStraight=profile.exitStraightMm,stub=profile.contactStubMm
 // Inclusive hole count: 2/3 holes = 1/2 pitches; 4/5 holes = 3/4 pitches.
 // Contact distance remains continuous for diagonal spans; no rounding to holes.
 const horizontal=profile.strategy==='axial'&&span>=3*getBreadboardTopology(board.type)!.pitch-EPS&&span/mm-pkg.bodyMm.x>=2*(exitStraight+r)-EPS
 const template=profile.strategy==='radial'?'radial-upright':horizontal?'axial-horizontal':'axial-standing'
 const rotation={x:0,y:yaw,z:template==='axial-standing'?90:0},matrix=rotationMatrix(rotation)
 let position:Point3
 if(template==='axial-standing'){
  const lower=profile.pins.find(pin=>pin.pinId===pkg.pins[0]!.id)!
  const offset=transformPoint(matrix,scalePoint(lower.bodyExitMm,mm))
  const lowerHeight=Math.max(exitStraight+stub+.15,profile.bodyClearanceMm)
  position={x:a.x-offset.x,y:plane+lowerHeight*mm-offset.y,z:a.z-offset.z}
 }else if(template==='axial-horizontal'){
  const height=Math.max(pkg.bodyMm.y/2+profile.bodyClearanceMm,stub+r+.1)
  position={x:center.x,y:plane+height*mm,z:center.z}
 }else{
  const pitch=Math.abs(profile.pins[1]!.bodyExitMm.x-profile.pins[0]!.bodyExitMm.x),offset=Math.abs(span/mm-pitch)/2
  const preferred=profile.preferredBendRadiusMm??r
  const height=offset<1e-7?Math.max(pkg.shape?pkg.standoffMm:1.25,exitStraight+stub+.1):exitStraight+stub+2*preferred+Math.max(.6,Math.min(offset,4)*.3)
  const lowestExit=Math.min(...profile.pins.map(pin=>pin.bodyExitMm.y))
  position={x:center.x,y:plane+(Math.max(pkg.bodyMm.y/2+profile.bodyClearanceMm,height-lowestExit))*mm,z:center.z}
 }
 const contacts=pkg.pins.map((pin,i)=>({kind:'pin-contact' as const,version:1 as const,pinId:pin.id,contactId:i===0?first:second}))
 const leads=profile.pins.map(pin=>{
  const anchor=contacts.find(p=>p.pinId===pin.pinId)!.contactId===first?a:b
  const exit=addPoint(position,transformPoint(matrix,scalePoint(pin.bodyExitMm,mm)))
  const controls:Point3[]=[]
  if(template==='axial-standing'&&pin.bodyExitMm.x>0){
   const top=exit.y+exitStraight*mm+span/2
   controls.push({x:exit.x,y:top,z:exit.z},{x:anchor.x,y:top,z:anchor.z})
  }else if(template==='axial-horizontal')controls.push({x:anchor.x,y:exit.y,z:anchor.z})
  else if(template==='radial-upright'&&Math.hypot(exit.x-anchor.x,exit.z-anchor.z)>EPS){
   const preferred=profile.preferredBendRadiusMm??r
   controls.push({x:exit.x,y:exit.y-(exitStraight+preferred)*mm,z:exit.z},{x:anchor.x,y:plane+(stub+preferred)*mm,z:anchor.z})
  }
  return {pinId:pin.pinId,controlPoints:controls}
 })
 const mount:FlexibleMountV2={kind:'breadboard-flexible',version:2,boardId,partId:part.id,partRevision:part.revision,packageId:pkg.id,packageRevision:pkg.revision,mechanicalProfileId:profile.id,mechanicalProfileRevision:profile.revision,geometryRevision:2,routing:{version:1,mode:'automatic',template},bodyPose:{position,rotation},contacts,leads}
 try{
  const module={id:intent.activeId??'PLACE',type,mount},geometry=resolveFlexibleGeometry(module,part,board),body=flexibleBodyEnvelope(module,part,board),index=sceneIndex(modules)
  const candidateSegments=moduleLeadSegments(module,modules)
  if(index.bodies.some(other=>other.id!==intent.activeId&&(bodiesOverlap(body,other.body)||leadSegmentsHitBody(candidateSegments,other.body)))||index.leads.some(other=>other.id!==intent.activeId&&(leadSegmentsHitBody(other.segments,body)||leadSegmentsIntersect(candidateSegments,other.segments))))throw Error('Component bodies or leads would intersect.')
  return {valid:true,reason:'',mount,geometry}
 }catch(error){return fail(error instanceof Error?error.message:'Invalid flexible geometry.')}
}
