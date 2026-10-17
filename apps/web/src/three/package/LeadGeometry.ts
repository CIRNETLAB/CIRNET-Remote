import { Curve, CurvePath, ExtrudeGeometry, LineCurve3, QuadraticBezierCurve3, Shape, TubeGeometry, Vector3, type BufferGeometry } from 'three'

/** Circular fillets honor the mechanical profile's minimum radius. */
export function createFlexibleLeadGeometry(points: Vector3[], diameter: number, radius: number): BufferGeometry {
  class Arc extends Curve<Vector3> {
    constructor(private center: Vector3, private offset: Vector3, private axis: Vector3, private angle: number) { super() }
    getPoint(t: number, target = new Vector3()) { return target.copy(this.offset).applyAxisAngle(this.axis, this.angle * t).add(this.center) }
  }
  const path = new CurvePath<Vector3>()
  let previous = points[0]!.clone()
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i]!, u = corner.clone().sub(points[i - 1]!).normalize(), v = points[i + 1]!.clone().sub(corner).normalize()
    const angle = Math.acos(Math.max(-1, Math.min(1, u.dot(v)))), trim = radius * Math.tan(angle / 2)
    if (angle < 1e-7) continue
    if (!Number.isFinite(trim) || angle > Math.PI - 1e-7) throw Error('Lead cannot reverse at a bend.')
    const before = corner.clone().addScaledVector(u, -trim), after = corner.clone().addScaledVector(v, trim), axis = u.clone().cross(v).normalize()
    if (previous.distanceTo(before) > 1e-8) path.add(new LineCurve3(previous, before))
    const center = before.clone().addScaledVector(axis.clone().cross(u), radius)
    path.add(new Arc(center, before.clone().sub(center), axis, angle)); previous = after
  }
  const end = points.at(-1)!.clone()
  if (previous.distanceTo(end) > 1e-8) path.add(new LineCurve3(previous, end))
  return new TubeGeometry(path, Math.max(64, points.length * 24), diameter / 2, 12, false)
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
  if (!rectangular) return new TubeGeometry(path, steps, diameter / 2, 12, false)
  const section = new Shape(), width = diameter / 2, thickness = diameter * .19
  // At a vertical socket end Frenet's binormal points along X: put the
  // ribbon width on that axis and its narrow thickness in the bend plane.
  section.moveTo(-thickness, -width); section.lineTo(thickness, -width); section.lineTo(thickness, width); section.lineTo(-thickness, width); section.closePath()
  return new ExtrudeGeometry(section, { steps, extrudePath: path, bevelEnabled: false })
}
