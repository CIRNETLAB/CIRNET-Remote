/** Geometry-only lead centerlines shared by validation and Three.js rendering.
 * Distances are world units. No scene, catalog or electrical state is read here. */
export interface LeadPoint { x: number; y: number; z: number }
export type LeadPathSegment =
  | { kind: 'line'; start: LeadPoint; end: LeadPoint; length: number }
  | { kind: 'arc'; start: LeadPoint; end: LeadPoint; center: LeadPoint; axis: LeadPoint; angle: number; radius: number; length: number }
export interface LeadPath {
  points: LeadPoint[]
  segments: LeadPathSegment[]
  samples: LeadPoint[]
  sampleDistances: number[]
  /** Maximum distance between a sampled arc chord and the true circular arc. */
  sampleError: number
  bendRadii: number[]
  length: number
}
const add = (a: LeadPoint, b: LeadPoint): LeadPoint => ({ x:a.x+b.x,y:a.y+b.y,z:a.z+b.z })
const sub = (a: LeadPoint, b: LeadPoint): LeadPoint => ({ x:a.x-b.x,y:a.y-b.y,z:a.z-b.z })
const mul = (a: LeadPoint, n: number): LeadPoint => ({ x:a.x*n,y:a.y*n,z:a.z*n })
const dot = (a: LeadPoint, b: LeadPoint) => a.x*b.x+a.y*b.y+a.z*b.z
const cross = (a: LeadPoint, b: LeadPoint): LeadPoint => ({ x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x })
const norm = (p: LeadPoint) => Math.hypot(p.x,p.y,p.z)
const distance = (a: LeadPoint,b: LeadPoint) => norm(sub(a,b))
const unit = (p: LeadPoint) => mul(p,1/norm(p))

/** Closest points include their parameters on the two finite segments. */
export function closestSegmentApproach(a:LeadPoint,b:LeadPoint,c:LeadPoint,d:LeadPoint):{distance:number;first:number;second:number} {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),denominator=aa*cc-bb*bb
  const clamp=(n:number)=>Math.max(0,Math.min(1,n))
  let first=denominator>1e-15?clamp((bb*ee-cc*dd)/denominator):0,second=cc>1e-15?(bb*first+ee)/cc:0
  if(second<0){second=0;first=aa>1e-15?clamp(-dd/aa):0}
  else if(second>1){second=1;first=aa>1e-15?clamp((bb-dd)/aa):0}
  return{distance:distance(add(a,mul(u,first)),add(c,mul(v,second))),first,second}
}

/** Exclude only local portions of one continuous tube from self collision. */
export function leadPathIntersectsItself(path:LeadPath,diameter:number):boolean {
  const {samples,sampleDistances,sampleError}=path
  const localLength=Math.PI*diameter+2*sampleError
  for(let i=0;i<samples.length-1;i++)for(let j=i+2;j<samples.length-1;j++){
    if(sampleDistances[j+1]!-sampleDistances[i]!<=localLength)continue
    const approach=closestSegmentApproach(samples[i]!,samples[i+1]!,samples[j]!,samples[j+1]!)
    const first=sampleDistances[i]!+approach.first*(sampleDistances[i+1]!-sampleDistances[i]!)
    const second=sampleDistances[j]!+approach.second*(sampleDistances[j+1]!-sampleDistances[j]!)
    // Long runs may intersect far from their neighbouring fillets. Continuity
    // is determined at the closest points, not at the adjacent segment ends.
    if(second-first>localLength&&approach.distance<diameter+2*sampleError-1e-5)return true
  }
  return false
}

/** Remove only forward collinear subdivisions. Reversals remain visible to validation. */
export function normalizeLeadPolyline(input: readonly LeadPoint[]): LeadPoint[] {
  if(input.length<2||input.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('A flexible lead requires finite points and two endpoints.')
  const result:LeadPoint[]=[]
  for(const raw of input){
    const p={...raw}
    if(result.length&&distance(result.at(-1)!,p)<1e-10)throw Error('Flexible lead has duplicate or degenerate controls.')
    while(result.length>=2){
      const a=sub(result.at(-1)!,result.at(-2)!),b=sub(p,result.at(-1)!)
      if(dot(a,b)<=0||norm(cross(a,b))>1e-10*norm(a)*norm(b))break
      result.pop()
    }
    result.push(p)
  }
  return result
}

/** Fit tangent fillets while retaining real straight wire at the body and socket.
 * Preferred radii share each straight run's spare budget proportionally, so two
 * symmetric elbows stay symmetric even when their preferred radii cannot fit. */
export function buildLeadPath(input:readonly LeadPoint[],minRadius:number,preferredRadius=minRadius,endpointStraights={start:0,end:0}):LeadPath {
  if(!Number.isFinite(minRadius)||minRadius<=0||!Number.isFinite(preferredRadius)||preferredRadius<minRadius||![endpointStraights.start,endpointStraights.end].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid flexible lead bend radius or straight constraint.')
  const points=normalizeLeadPolyline(input),last=points.length-1
  const lengths=points.slice(1).map((p,i)=>distance(points[i]!,p)),directions=points.slice(1).map((p,i)=>unit(sub(p,points[i]!)))
  const tangents=points.map(()=>0),angles=points.map(()=>0)
  for(let i=1;i<last;i++){
    const cosine=Math.max(-1,Math.min(1,dot(directions[i-1]!,directions[i]!)))
    if(cosine<-1+1e-10)throw Error('Flexible lead reverses through itself.')
    angles[i]=Math.acos(cosine);tangents[i]=Math.tan(angles[i]!/2)
  }
  const minimum=tangents.map(t=>t*minRadius),extra=tangents.map(t=>t*(preferredRadius-minRadius)),factors=points.map(()=>1)
  for(let i=0;i<last;i++){
    const reserved=(i===0?endpointStraights.start:0)+(i===last-1?endpointStraights.end:0)
    const available=lengths[i]!-reserved,required=minimum[i]!+minimum[i+1]!
    if(required>available+1e-9)throw Error('Flexible lead cannot fit its minimum bend radius and endpoint straights.')
    const wanted=extra[i]!+extra[i+1]!,factor=wanted>0?Math.max(0,Math.min(1,(available-required)/wanted)):1
    factors[i]=Math.min(factors[i]!,factor);factors[i+1]=Math.min(factors[i+1]!,factor)
  }
  const radii=tangents.map((t,i)=>t>1e-10?minRadius+(preferredRadius-minRadius)*factors[i]!:0)
  const segments:LeadPathSegment[]=[]
  let previous=points[0]!
  const line=(end:LeadPoint)=>{const length=distance(previous,end);if(length>1e-10)segments.push({kind:'line',start:previous,end,length});previous=end}
  for(let i=1;i<last;i++){
    const radius=radii[i]!,corner=points[i]!,u=directions[i-1]!,v=directions[i]!
    if(radius===0)continue
    const trim=radius*tangents[i]!,start=add(corner,mul(u,-trim)),end=add(corner,mul(v,trim)),axis=unit(cross(u,v)),center=add(start,mul(cross(axis,u),radius))
    line(start);segments.push({kind:'arc',start,end,axis,center,radius,angle:angles[i]!,length:radius*angles[i]!});previous=end
  }
  line(points[last]!)
  const sampleError=Math.min(minRadius/512,1e-5),samples:LeadPoint[]=[points[0]!],sampleDistances=[0]
  let length=0
  for(const segment of segments){
    if(segment.kind==='line'){length+=segment.length;samples.push(segment.end);sampleDistances.push(length);continue}
    const offset=sub(segment.start,segment.center),perpendicular=cross(segment.axis,offset)
    const step=2*Math.acos(Math.max(-1,Math.min(1,1-sampleError/segment.radius))),count=Math.max(1,Math.ceil(segment.angle/step))
    for(let j=1;j<=count;j++){
      const angle=segment.angle*j/count
      samples.push(j===count?segment.end:add(segment.center,add(mul(offset,Math.cos(angle)),mul(perpendicular,Math.sin(angle)))))
      sampleDistances.push(length+segment.length*j/count)
    }
    length+=segment.length
  }
  return{points,segments,samples,sampleDistances,sampleError,bendRadii:radii.slice(1,-1),length}
}
