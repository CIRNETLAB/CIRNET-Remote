import { CurvePath, ExtrudeGeometry, LineCurve3, QuadraticBezierCurve3, Shape, TubeGeometry, Vector3, type BufferGeometry } from 'three'

/** One sweep, with end caps only at the socket/body ends of a rectangular lead.
 * The rounded elbow shares its surface and normals with both straight runs.
 * Round wire is open at its concealed ends; there is no cap at the elbow. */
export function createFormedLeadGeometry(points: Vector3[], diameter: number, rectangular = false): BufferGeometry {
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
  if (!rectangular) return new TubeGeometry(path, 48, diameter / 2, 12, false)
  const section = new Shape(), width = diameter / 2, thickness = diameter * .19
  // At a vertical socket end Frenet's binormal points along X: put the
  // ribbon width on that axis and its narrow thickness in the bend plane.
  section.moveTo(-thickness, -width); section.lineTo(thickness, -width); section.lineTo(thickness, width); section.lineTo(-thickness, width); section.closePath()
  return new ExtrudeGeometry(section, { steps: 48, extrudePath: path, bevelEnabled: false })
}
