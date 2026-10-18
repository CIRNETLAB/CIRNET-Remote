import { BufferGeometry,Float32BufferAttribute,Curve, CurvePath, ExtrudeGeometry, LineCurve3, QuadraticBezierCurve3, Quaternion, Shape, TubeGeometry, Vector3 } from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import { buildLeadPath, type LeadPath } from '../../electrical/leadPath'

/** Circular fillets honor the mechanical profile's minimum radius. */
export function createFlexibleLeadGeometry(points: Vector3[], diameter: number, radius: number, preferredRadius = radius, endpointStraights = { start:0,end:0 }): BufferGeometry {
  return createFlexibleLeadPathGeometry(buildLeadPath(points,radius,preferredRadius,endpointStraights),diameter)
}

/** Sweep the already validated analytic path, after an optional rigid frame change. */
export interface LeadSweepOptions {embeddedDepth:number;section:{kind:'round'|'rectangular'|'stamped';width:number;thickness:number}}
export function createFlexibleLeadPathGeometry(centerline:LeadPath,diameter:number,point=(p:{x:number;y:number;z:number})=>new Vector3(p.x,p.y,p.z),direction=point,options?:LeadSweepOptions):BufferGeometry {
  class Arc extends Curve<Vector3> {
    constructor(private center: Vector3, private offset: Vector3, private axis: Vector3, private angle: number) { super() }
    getPoint(t: number, target = new Vector3()) { return target.copy(this.offset).applyAxisAngle(this.axis, this.angle * t).add(this.center) }
  }
  if(!Number.isFinite(diameter)||diameter<=0)throw Error('A flexible lead requires a positive diameter.')
  const path=new CurvePath<Vector3>()
  if(options){
    const first=centerline.segments[0]
    if(!first||first.kind!=='line')throw Error('A sealed feedthrough requires an outward straight section.')
    if(!Number.isFinite(options.embeddedDepth)||options.embeddedDepth<0)throw Error('Invalid feedthrough embed depth.')
    const start=point(first.start),tangent=point(first.end).sub(start).normalize()
    if(options.embeddedDepth>0)path.add(new LineCurve3(start.clone().addScaledVector(tangent,-options.embeddedDepth),start))
  }
  for(const segment of centerline.segments){
    if(segment.kind==='line')path.add(new LineCurve3(point(segment.start),point(segment.end)))
    else path.add(new Arc(point(segment.center),point(segment.start).sub(point(segment.center)),direction(segment.axis),segment.angle))
  }
  const steps=Math.max(64,centerline.samples.length*2)
  if(options?.section.kind==='rectangular'||options?.section.kind==='stamped')return createRectangularPathGeometry(path,options.section.width,options.section.thickness,steps)
  const tube=new TubeGeometry(path,steps,diameter/2,16,false)
  if(!options)return tube
  // Close only the concealed/socket ends. There are no end caps at elbows.
  const caps=[0,1].map(t=>{
    const cap=new BufferGeometry(),normal=path.getTangentAt(t).multiplyScalar(t===0?-1:1),center=path.getPointAt(t),source=tube.getAttribute('position')
    const positions=[...center.toArray()],normals=[...normal.toArray()],uv=[.5,.5],indices:number[]=[],offset=t===0?0:steps*17
    // Reuse the *actual* transported end ring. An independently rotated regular
    // polygon has a different phase on diagonal paths and leaves open wedges.
    for(let j=0;j<16;j++){positions.push(source.getX(offset+j),source.getY(offset+j),source.getZ(offset+j));normals.push(...normal.toArray());uv.push((Math.cos(j*Math.PI/8)+1)/2,(Math.sin(j*Math.PI/8)+1)/2)}
    const a=new Vector3(...positions.slice(3,6) as [number,number,number]).sub(center),b=new Vector3(...positions.slice(6,9) as [number,number,number]).sub(center),forward=a.cross(b).dot(normal)>0
    for(let j=0;j<16;j++){const first=j+1,second=(j+1)%16+1;indices.push(0,forward?first:second,forward?second:first)}
    cap.setAttribute('position',new Float32BufferAttribute(positions,3));cap.setAttribute('normal',new Float32BufferAttribute(normals,3));cap.setAttribute('uv',new Float32BufferAttribute(uv,2));cap.setIndex(indices);return cap
  })
  const merged=mergeGeometries([tube,...caps]);caps.forEach(cap=>cap.dispose())
  if(!merged){tube.dispose();throw Error('Cannot close a round feedthrough sweep.')}
  BufferGeometry.prototype.copy.call(tube,merged);merged.dispose();return tube
}

/** A parallel-transported rectangular section. Faces retain hard transverse
 * edges while sharing longitudinal vertices; a bend never opens or twists. */
export function createRectangularPathGeometry(path:Curve<Vector3>,width:number,thickness:number,steps=96):BufferGeometry {
 if(![width,thickness].every(n=>Number.isFinite(n)&&n>0))throw Error('A rectangular lead requires finite positive section dimensions.')
 const positions:number[]=[],indices:number[]=[],corners=[[-1,-1],[1,-1],[1,1],[-1,1]] as const
 let prior=path.getTangentAt(0).normalize(),normal=new Vector3(Math.abs(prior.x)<.9?1:0,0,Math.abs(prior.x)<.9?0:1);normal.addScaledVector(prior,-normal.dot(prior)).normalize()
 for(let i=0;i<=steps;i++){
  const t=i/steps,tangent=path.getTangentAt(t).normalize()
  if(i)normal.applyQuaternion(new Quaternion().setFromUnitVectors(prior,tangent));normal.addScaledVector(tangent,-normal.dot(tangent)).normalize()
  const binormal=tangent.clone().cross(normal).normalize(),center=path.getPointAt(t)
  for(let face=0;face<4;face++)for(const corner of [corners[face]!,corners[(face+1)%4]!])positions.push(...center.clone().addScaledVector(normal,corner[0]*width/2).addScaledVector(binormal,corner[1]*thickness/2).toArray())
  if(i)for(let face=0;face<4;face++){const a=(i-1)*8+face*2,b=i*8+face*2;indices.push(a,a+1,b,b,a+1,b+1)}
  prior=tangent
 }
 for(const [ring,reverse] of [[0,true],[steps,false]] as const){const base=positions.length/3;for(const corner of [0,2,4,6])positions.push(...positions.slice(ring*24+corner*3,ring*24+corner*3+3));if(reverse)indices.push(base,base+2,base+1,base,base+3,base+2);else indices.push(base,base+1,base+2,base,base+2,base+3)}
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals()
 Object.assign(geometry,{parameters:{path,width,thickness,steps}})
 return geometry
}

/** One sweep, with end caps only at the socket/body ends of a rectangular lead.
 * The rounded elbow shares its surface and normals with both straight runs.
 * Round wire is open at its concealed ends; there is no cap at the elbow. */
export function createFormedLeadGeometry(points: Vector3[], diameter: number, rectangular = false): BufferGeometry {
  if (!Number.isFinite(diameter) || diameter <= 0 || points.some(point => ![point.x, point.y, point.z].every(Number.isFinite))) throw new Error('A formed lead requires finite points and a positive diameter.')
  points = points.filter((point, index) => index === 0 || point.distanceTo(points[index - 1]!) > 1e-8)
  if (points.length < 2) throw new Error('A formed lead requires two distinct endpoints.')
  const path = new CurvePath<Vector3>()
  let previous = points[0]!.clone()
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i]!, incoming = previous.clone().sub(corner), outgoing = points[i + 1]!.clone().sub(corner)
    const trim = Math.min(incoming.length() * .3, outgoing.length() * .3, diameter * 2.5)
    if (trim < 1e-8 || incoming.clone().normalize().dot(outgoing.clone().normalize()) < -.99999) {
      if (previous.distanceTo(corner) > 1e-8) path.add(new LineCurve3(previous, corner.clone()))
      previous = corner.clone(); continue
    }
    const before = corner.clone().add(incoming.normalize().multiplyScalar(trim)), after = corner.clone().add(outgoing.normalize().multiplyScalar(trim))
    if (previous.distanceTo(before) > 1e-8) path.add(new LineCurve3(previous, before))
    path.add(new QuadraticBezierCurve3(before, corner.clone(), after)); previous = after
  }
  const end = points[points.length - 1]!.clone()
  if (previous.distanceTo(end) > 1e-8) path.add(new LineCurve3(previous, end))
  const steps = Math.max(48, (points.length - 1) * 16)
  if (!rectangular) return new TubeGeometry(path, steps, diameter / 2, 16, false)
  const section = new Shape(), width = diameter / 2, thickness = diameter * .19
  // At a vertical socket end Frenet's binormal points along X: put the
  // ribbon width on that axis and its narrow thickness in the bend plane.
  section.moveTo(-thickness, -width); section.lineTo(thickness, -width); section.lineTo(thickness, width); section.lineTo(-thickness, width); section.closePath()
  return new ExtrudeGeometry(section, { steps, extrudePath: path, bevelEnabled: false })
}
