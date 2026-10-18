import type { CircuitConnection, WireIdentity, WireVisual } from '../types/circuit'
import { deriveWireParts } from '../three/WireTerminals'
import { createWireLayoutCache } from './wireLayout'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from './wireRouting'
import { readWireVisual, wireKey } from './wireVisual'
import { renderWireDiameter, WIRE_CORNER_RADIUS } from './wireAppearance'
import { closestSegmentApproach, type LeadPath } from '../electrical/leadPath'

interface InsulationEnvelope { wire: WireIdentity; path: LeadPath; diameter: number }
const extent = (path: LeadPath) => path.samples.reduce((box,p)=>({minX:Math.min(box.minX,p.x),maxX:Math.max(box.maxX,p.x),minY:Math.min(box.minY,p.y),maxY:Math.max(box.maxY,p.y),minZ:Math.min(box.minZ,p.z),maxZ:Math.max(box.maxZ,p.z)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity})
/** Only the first terminal elbow can converge at an identical electrical
 * endpoint. Matching endpoint IDs never exempt the rest of either wire. */
function convergenceLength(path:LeadPath, end:'source'|'destination',diameter:number):number {
  const segments=end==='source'?path.segments:[...path.segments].reverse()
  let length=0
  for(const segment of segments){length+=segment.length;if(segment.kind==='arc')break}
  return Math.min(path.length/3,length+diameter,Math.PI*WIRE_CORNER_RADIUS+diameter*2)
}
function clearanceSegments(path:LeadPath,cuts:number[]) {
  return path.samples.slice(1).flatMap((end,index)=>{
    const start=path.samples[index]!,low=path.sampleDistances[index]!,high=path.sampleDistances[index+1]!,stations=[low,...cuts.filter(cut=>cut>low+1e-10&&cut<high-1e-10).sort((a,b)=>a-b),high]
    const point=(distance:number)=>{const t=(distance-low)/(high-low);return{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t}}
    return stations.slice(1).map((distance,part)=>({start:point(stations[part]!),end:point(distance),low:stations[part]!,high:distance}))
  })
}
function insulationOverlaps(a:InsulationEnvelope,b:InsulationEnvelope):boolean {
  const clearance=(a.diameter+b.diameter)/2+a.path.sampleError+b.path.sampleError,one=extent(a.path),two=extent(b.path)
  if(one.maxX+clearance<two.minX||two.maxX+clearance<one.minX||one.maxY+clearance<two.minY||two.maxY+clearance<one.minY||one.maxZ+clearance<two.minZ||two.maxZ+clearance<one.minZ)return false
  const shared=(['source','destination'] as const).flatMap(first=>(['source','destination'] as const).filter(second=>a.wire[first]===b.wire[second]).map(second=>({first,second,firstLength:convergenceLength(a.path,first,a.diameter),secondLength:convergenceLength(b.path,second,b.diameter)})))
  const local=(distance:number,path:LeadPath,end:'source'|'destination')=>end==='source'?distance:path.length-distance
  // Split even a long straight at the exception boundary. Testing only its
  // closest point could otherwise hide an overlap continuing past the elbow.
  const firstSegments=clearanceSegments(a.path,shared.map(end=>end.first==='source'?end.firstLength:a.path.length-end.firstLength)),secondSegments=clearanceSegments(b.path,shared.map(end=>end.second==='source'?end.secondLength:b.path.length-end.secondLength))
  for(const first of firstSegments)for(const second of secondSegments){
    if(shared.some(end=>Math.max(local(first.low,a.path,end.first),local(first.high,a.path,end.first))<=end.firstLength+1e-10&&Math.max(local(second.low,b.path,end.second),local(second.high,b.path,end.second))<=end.secondLength+1e-10))continue
    const p=first.start,q=first.end,r=second.start,s=second.end
    if(Math.max(p.x,q.x)+clearance<Math.min(r.x,s.x)||Math.max(r.x,s.x)+clearance<Math.min(p.x,q.x)||Math.max(p.y,q.y)+clearance<Math.min(r.y,s.y)||Math.max(r.y,s.y)+clearance<Math.min(p.y,q.y)||Math.max(p.z,q.z)+clearance<Math.min(r.z,s.z)||Math.max(r.z,s.z)+clearance<Math.min(p.z,q.z))continue
    const approach=closestSegmentApproach(p,q,r,s)
    if(approach.distance>=clearance-1e-8)continue
    return true
  }
  return false
}

/** A commit must fit the same continuous insulation used by previews, including
 * the lanes/bridges its edit causes in neighbouring wires. No inputs mutate. */
export function solveFeasibleWireRoute(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): SolvedWireRoute | null {
  const route=solveWireRoute(wire,visual,context)
  if(!route)return null
  const inputs=connections.filter(peer=>wireKey(peer)!==wireKey(wire)).flatMap(peer=>{
    const appearance=readWireVisual(peer),solved=solveWireRoute(peer,appearance,context)
    return solved?[{wire:peer,visual:appearance,route:solved}]:[]
  })
  inputs.push({wire,visual,route})
  try{
    const layouts=createWireLayoutCache().sync(inputs)
    const envelopes=inputs.map(input=>{const diameter=renderWireDiameter(input.visual);return{wire:input.wire,diameter,path:deriveWireParts(layouts.get(wireKey(input.wire))!,diameter).bodyPath}})
    for(let i=0;i<envelopes.length;i++)for(let j=i+1;j<envelopes.length;j++)if(insulationOverlaps(envelopes[i]!,envelopes[j]!))return null
    return layouts.get(wireKey(wire))??null
  }catch{return null}
}
