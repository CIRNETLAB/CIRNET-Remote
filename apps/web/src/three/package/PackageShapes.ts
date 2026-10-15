import { ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three'

/** Molded rectangular outline, with a soft edge and dimensions inside its envelope. */
export function roundedPackageBox(w: number, h: number, d: number, radius: number) {
  const r = Math.min(radius, w / 5, d / 5, h / 5), x = w / 2 - r * 1.5, z = d / 2 - r * 1.5, shape = new Shape()
  shape.moveTo(-x, -z - r); shape.lineTo(x, -z - r); shape.quadraticCurveTo(x + r, -z - r, x + r, -z)
  shape.lineTo(x + r, z); shape.quadraticCurveTo(x + r, z + r, x, z + r); shape.lineTo(-x, z + r)
  shape.quadraticCurveTo(-x - r, z + r, -x - r, z); shape.lineTo(-x - r, -z); shape.quadraticCurveTo(-x - r, -z - r, -x, -z - r)
  return new ExtrudeGeometry(shape, { depth: Math.max(h - r, .0001), bevelEnabled: true, bevelSegments: 3, bevelSize: r / 2, bevelThickness: r / 2, curveSegments: 6, steps: 1 })
}

/** Radius profile is in axial coordinates; body ends tuck around the lead exit. */
export function axialCoatingGeometry(length: number, radius: number, resistor: boolean) {
  const profile = resistor
    ? [[.35, -.5], [.7, -.49], [.96, -.43], [1, -.4], [.95, -.34], [.95, .34], [1, .4], [.96, .43], [.7, .49], [.35, .5]]
    : [[.35, -.5], [.75, -.49], [.97, -.42], [1, -.35], [1, .35], [.97, .42], [.75, .49], [.35, .5]]
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r! * radius, y! * length)), 32)
}

export function ledShellGeometry(radius: number, height: number, flangeHeight: number) {
  const barrelTop = height - radius
  const points = [new Vector2(0, 0), new Vector2(radius * 1.06, 0), new Vector2(radius * 1.08, flangeHeight * .35), new Vector2(radius * 1.08, flangeHeight * .7), new Vector2(radius * 1.03, flangeHeight), new Vector2(radius, flangeHeight * 1.15), new Vector2(radius, barrelTop)]
  for (let i = 1; i <= 12; i++) { const angle = i / 12 * Math.PI / 2; points.push(new Vector2(radius * Math.cos(angle), barrelTop + radius * Math.sin(angle))) }
  return new LatheGeometry(points, 40)
}

/** Clipped segment corners leave visible gutters between the seven glyphs. */
export function segmentGlyphGeometry(w: number, d: number, thickness: number) {
  const inset = Math.min(w, d) * .4, x = w / 2, z = d / 2, shape = new Shape()
  shape.moveTo(-x + inset, -z); shape.lineTo(x - inset, -z); shape.lineTo(x, -z + inset); shape.lineTo(x, z - inset)
  shape.lineTo(x - inset, z); shape.lineTo(-x + inset, z); shape.lineTo(-x, z - inset); shape.lineTo(-x, -z + inset); shape.closePath()
  return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
}
