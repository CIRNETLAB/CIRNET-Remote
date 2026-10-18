/** Pure analytic centerline shared by routing, picking, meshes and envelopes. */
import { buildLeadPath, leadPathIntersectsItself, type LeadPath } from '../electrical/leadPath'
import type { Point3 } from '../types/circuit'
import { WIRE_CORNER_RADIUS, WIRE_MIN_BEND_RADIUS } from './wireAppearance'

export function cleanWirePolyline(points: readonly Point3[]): Point3[] {
  const result: Point3[] = []
  for (const raw of points) {
    if (!Object.values(raw).every(Number.isFinite)) throw Error('Wire geometry requires finite points.')
    const p = { ...raw }, last = result.at(-1)
    if (last && Math.hypot(last.x-p.x,last.y-p.y,last.z-p.z) <= 1e-5) continue
    while (result.length > 1) {
      const a=result.at(-2)!, b=result.at(-1)!, u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:p.x-b.x,y:p.y-b.y,z:p.z-b.z}
      const dot=u.x*v.x+u.y*v.y+u.z*v.z,cross=Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)
      const firstLength=Math.hypot(u.x,u.y,u.z),secondLength=Math.hypot(v.x,v.y,v.z)
      // A fillet shorter than the local Float32 resolution collapses its rings.
      // Normalize only this render-resolution subdivision; saved controls stay
      // untouched and picking/envelopes use this same normalized path.
      const magnitude=Math.max(1,...Object.values(a).map(Math.abs),...Object.values(b).map(Math.abs),...Object.values(p).map(Math.abs))
      const tolerance=Math.max(1e-5,magnitude*2**-20/Math.min(firstLength,secondLength))
      if(dot<=0||cross>firstLength*secondLength*tolerance)break
      result.pop()
    }
    result.push(p)
  }
  return result
}

export function wireCenterline(points: readonly Point3[], diameter = 0, endpointStraights = { start: 0, end: 0 }): LeadPath {
  const radius = Math.max(WIRE_MIN_BEND_RADIUS,diameter/2+Math.max(.1*.13/2.54,diameter*.08))
  const path = buildLeadPath(cleanWirePolyline(points), radius, Math.max(radius, WIRE_CORNER_RADIUS), endpointStraights)
  if (diameter > 0 && leadPathIntersectsItself(path, diameter)) throw Error('Wire insulation intersects itself.')
  return path
}
