import { BufferGeometry, Float32BufferAttribute, LatheGeometry, Shape, ShapeUtils, Vector2 } from 'three'

export type AxialCoatingKind = 'resistor' | 'diode' | 'zener'
export type RadiusProfile = readonly Vector2[]

/** Closed meridian, including the axis at both ends. Coordinates use the body Y axis. */
export function sealedAxialProfile(length: number, radius: number, kind: AxialCoatingKind, leadRadius: number, bevelRadius = radius * .13): Vector2[] {
  if (kind === 'diode') {
    const edge = Math.min(bevelRadius, radius / 2, length / 4)
    const points = [new Vector2(0, -length / 2), new Vector2(radius - edge, -length / 2)]
    for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI / 2; points.push(new Vector2(radius - edge + edge * Math.sin(a), -length / 2 + edge * (1 - Math.cos(a)))) }
    points.push(new Vector2(radius, length / 2 - edge))
    for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI / 2; points.push(new Vector2(radius - edge + edge * Math.cos(a), length / 2 - edge + edge * Math.sin(a))) }
    points.push(new Vector2(0, length / 2)); return points
  }
  const contour = kind === 'resistor'
    ? [[0, -.5], [leadRadius / radius, -.5], [.58, -.493], [.8, -.475], [.94, -.445], [1, -.4], [1, -.35], [.97, -.31], [.96, -.27], [.96, .27], [.97, .31], [1, .35], [1, .4], [.94, .445], [.8, .475], [.58, .493], [leadRadius / radius, .5], [0, .5]]
    : [[0, -.5], [leadRadius / radius, -.5], [.42, -.49], [.72, -.46], [.94, -.42], [1, -.37], [1, .37], [.94, .42], [.72, .46], [.42, .49], [leadRadius / radius, .5], [0, .5]]
  return contour.map(([r, y]) => new Vector2(r! * radius, y! * length))
}

export function sealedAxialGeometry(length: number, radius: number, kind: AxialCoatingKind, leadRadius: number, bevelRadius?: number) {
  return new LatheGeometry(sealedAxialProfile(length, radius, kind, leadRadius, bevelRadius), 64)
}

function radiusAt(profile: RadiusProfile, y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!, b = profile[i]!
    if (b.y > a.y && y >= a.y && y <= b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)
  }
  return 0
}

/** Paint follows the very same meridian as the closed coating, including its shoulders. */
export function axialContourBandGeometry(profile: RadiusProfile, center: number, width: number, paintOffset: number) {
  const lo = center - width / 2, hi = center + width / 2
  const points = [new Vector2(radiusAt(profile, lo) + paintOffset, lo), ...profile.filter(p => p.y > lo && p.y < hi && p.x > 0).map(p => new Vector2(p.x + paintOffset, p.y)), new Vector2(radiusAt(profile, hi) + paintOffset, hi)]
  return new LatheGeometry(points, 64)
}

/** One watertight dipped disc, including two short coating boots in the declared envelope. */
export function sealedCeramicGeometry(w: number, h: number, d: number, pitch: number): BufferGeometry {
  const shape = new Shape(), sx = w / 5, sy = h / 5
  for (let angle = -50; angle <= 230; angle += 5) {
    const a = angle * Math.PI / 180, x = 2.5 * Math.cos(a) * sx, y = (.15 + 2.35 * Math.sin(a)) * sy
    if (angle === -50) shape.moveTo(x, y); else shape.lineTo(x, y)
  }
  const x = pitch / 2, bootHalf = Math.min(.38 * sx, pitch * .18)
  shape.quadraticCurveTo(-x - bootHalf, -2.02 * sy, -x - bootHalf, -2.3 * sy)
  shape.quadraticCurveTo(-x - bootHalf, -2.5 * sy, -x - bootHalf + .08 * sx, -2.5 * sy)
  shape.lineTo(-x + bootHalf - .08 * sx, -2.5 * sy)
  shape.quadraticCurveTo(-x + bootHalf, -2.5 * sy, -x + bootHalf, -2.25 * sy)
  shape.quadraticCurveTo(-x + bootHalf, -1.95 * sy, -.7 * sx, -2.05 * sy)
  shape.quadraticCurveTo(0, -2.2 * sy, .7 * sx, -2.05 * sy)
  shape.quadraticCurveTo(x - bootHalf, -1.95 * sy, x - bootHalf, -2.25 * sy)
  shape.quadraticCurveTo(x - bootHalf, -2.5 * sy, x - bootHalf + .08 * sx, -2.5 * sy)
  shape.lineTo(x + bootHalf - .08 * sx, -2.5 * sy)
  shape.quadraticCurveTo(x + bootHalf, -2.5 * sy, x + bootHalf, -2.3 * sy)
  shape.quadraticCurveTo(x + bootHalf, -2.02 * sy, 2.5 * Math.cos(-50 * Math.PI / 180) * sx, (.15 + 2.35 * Math.sin(-50 * Math.PI / 180)) * sy)
  const outline = shape.getPoints(8); outline.pop()
  // The boot outline is concave and cannot be filled by scaling rings toward one
  // center: its inner boot edges would fold those rings over the front face.
  const points = outline.map(point => point.clone())
  let triangles = ShapeUtils.triangulateShape(outline, []).map(([a, b, c]) => {
    const p = points[a!]!, q = points[b!]!, r = points[c!]!
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) > 0 ? [a!, b!, c!] : [a!, c!, b!]
  })
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`
  const maxEdgeSq = (Math.min(w, h) * .085) ** 2
  for (let pass = 0; pass < 8; pass++) {
    const midpoints = new Map<string, number>()
    for (const [a, b, c] of triangles) for (const [u, v] of [[a!, b!], [b!, c!], [c!, a!]]) {
      const key = edgeKey(u!, v!)
      if (!midpoints.has(key) && points[u!]!.distanceToSquared(points[v!]!) > maxEdgeSq) {
        midpoints.set(key, points.length); points.push(points[u!]!.clone().add(points[v!]!).multiplyScalar(.5))
      }
    }
    if (!midpoints.size) break
    const refined: number[][] = []
    for (const [a, b, c] of triangles) {
      const ab = midpoints.get(edgeKey(a!, b!)), bc = midpoints.get(edgeKey(b!, c!)), ca = midpoints.get(edgeKey(c!, a!))
      if (ab !== undefined && bc !== undefined && ca !== undefined) refined.push([a!, ab, ca], [ab, b!, bc], [ca, bc, c!], [ab, bc, ca])
      else if (ab !== undefined && bc !== undefined) refined.push([a!, ab, bc], [a!, bc, c!], [ab, b!, bc])
      else if (ab !== undefined && ca !== undefined) refined.push([a!, ab, ca], [ab, b!, c!], [ab, c!, ca])
      else if (bc !== undefined && ca !== undefined) refined.push([c!, ca, bc], [a!, b!, ca], [b!, bc, ca])
      else if (ab !== undefined) refined.push([a!, ab, c!], [ab, b!, c!])
      else if (bc !== undefined) refined.push([b!, bc, a!], [bc, c!, a!])
      else if (ca !== undefined) refined.push([c!, ca, b!], [ca, a!, b!])
      else refined.push([a!, b!, c!])
    }
    triangles = refined
  }
  // A smooth distance blend rounds the dipped coating at both boot roots. Using
  // all outline edges avoids the creases produced by a nearest-edge distance.
  const depths = points.map(point => {
    let inverseDistance = 0
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!, b = outline[(i + 1) % outline.length]!, dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq))
      const distanceSq = (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2
      if (distanceSq <= Math.min(w, h) ** 2 * 1e-18) return 0
      inverseDistance += Math.sqrt(lengthSq) / distanceSq ** 2
    }
    return Math.cbrt(1 / inverseDistance)
  })
  const maxDepth = Math.max(...depths), positions: number[] = [], indices: number[] = [], n = points.length
  for (const side of [1, -1]) for (const [i, point] of points.entries()) positions.push(point.x, point.y, side * d * (.25 + .25 * Math.sin(depths[i]! / maxDepth * Math.PI / 2)))
  const edges = new Map<string, [number, number]>()
  for (const [a, b, c] of triangles) {
    indices.push(a!, b!, c!, n + a!, n + c!, n + b!)
    for (const [u, v] of [[a!, b!], [b!, c!], [c!, a!]]) {
      const key = edgeKey(u!, v!); if (edges.has(key)) edges.delete(key); else edges.set(key, [u!, v!])
    }
  }
  for (const [a, b] of edges.values()) indices.push(a, n + a, n + b, a, n + b, b)
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

/** Sleeve volume has a shallow top recess and a real bottom bung socket. */
export function sealedElectrolyticProfile(radius: number, h: number, mm: number): Vector2[] {
  return [[0, .16 * mm], [radius * .8, .16 * mm], [radius * .8, 0], [radius - .14 * mm, 0], [radius - .03 * mm, .12 * mm], [radius, .3 * mm], [radius, .6 * mm], [radius - .08 * mm, .8 * mm], [radius, 1.02 * mm], [radius, h - .45 * mm], [radius - .05 * mm, h - .2 * mm], [radius - .16 * mm, h], [radius - .34 * mm, h], [radius - .34 * mm, h - .18 * mm], [0, h - .18 * mm]].map(([r, y]) => new Vector2(r!, y! - h / 2))
}

export function sealedElectrolyticGeometry(radius: number, height: number, mm: number) { return new LatheGeometry(sealedElectrolyticProfile(radius, height, mm), 64) }

/** Lens radius, flange radius and dome rise are independent, all inside total height. */
export function sealedLedShellGeometry(lensRadius: number, flangeRadius: number, height: number, flangeHeight: number, domeRise: number, mm: number) {
  const points = [[0, 0], [flangeRadius - .08 * mm, 0], [flangeRadius, .08 * mm], [flangeRadius, flangeHeight - .08 * mm], [flangeRadius - .08 * mm, flangeHeight], [lensRadius, flangeHeight], [lensRadius, height - domeRise]].map(([r, y]) => new Vector2(r!, y! - height / 2))
  for (let i = 1; i <= 24; i++) { const a = i / 24 * Math.PI / 2; points.push(new Vector2(i === 24 ? 0 : lensRadius * Math.cos(a), height / 2 - domeRise + domeRise * Math.sin(a))) }
  return new LatheGeometry(points, 64)
}
