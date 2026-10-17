import { ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three'

/** Molded rectangular outline, with a soft edge and dimensions inside its envelope. */
export function roundedPackageBox(w: number, h: number, d: number, radius: number) {
  const r = Math.min(radius, w / 5, d / 5, h / 5), x = w / 2 - r * 1.5, z = d / 2 - r * 1.5, shape = new Shape()
  shape.moveTo(-x, -z - r); shape.lineTo(x, -z - r); shape.quadraticCurveTo(x + r, -z - r, x + r, -z)
  shape.lineTo(x + r, z); shape.quadraticCurveTo(x + r, z + r, x, z + r); shape.lineTo(-x, z + r)
  shape.quadraticCurveTo(-x - r, z + r, -x - r, z); shape.lineTo(-x - r, -z); shape.quadraticCurveTo(-x - r, -z - r, -x, -z - r)
  return new ExtrudeGeometry(shape, { depth: Math.max(h - r, .0001), bevelEnabled: true, bevelSegments: 3, bevelSize: r / 2, bevelThickness: r / 2, curveSegments: 6, steps: 1 })
}

/** Radius profile is in axial coordinates; body ends tuck smoothly around the lead exit. */
export function axialCoatingGeometry(length: number, radius: number, resistor: boolean) {
  const profile = resistor
    ? [
        [.35, -.5], [.58, -.495], [.82, -.47], [.95, -.43], [1, -.38], [1, -.34],
        [.96, -.3], [.96, .3], [1, .34], [1, .38], [.95, .43], [.82, .47], [.58, .495], [.35, .5]
      ]
    : [
        [.35, -.5], [.65, -.495], [.88, -.47], [.98, -.43], [1, -.38],
        [1, .38], [.98, .43], [.88, .47], [.65, .495], [.35, .5]
      ]
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r! * radius, y! * length)), 48)
}

/** Translucent dome with cylindrical barrel, bottom flange and smooth normals. */
export function ledShellGeometry(radius: number, height: number, flangeHeight: number) {
  // The descriptor diameter includes the flange, not only the narrower barrel.
  radius /= 1.08
  const barrelTop = height - radius
  const points = [
    new Vector2(0, 0),
    new Vector2(radius * 1.05, 0),
    new Vector2(radius * 1.08, flangeHeight * .35),
    new Vector2(radius * 1.08, flangeHeight * .7),
    new Vector2(radius * 1.03, flangeHeight),
    new Vector2(radius, flangeHeight * 1.15),
    new Vector2(radius, barrelTop),
  ]
  const domeSegments = 24
  for (let i = 1; i <= domeSegments; i++) {
    const angle = (i / domeSegments) * Math.PI / 2
    points.push(new Vector2(radius * Math.cos(angle), barrelTop + radius * Math.sin(angle)))
  }
  return new LatheGeometry(points, 48)
}

/** Dipped ceramic disc with soft rounded rim and natural lead-exit taper. */
export function ceramicDiscGeometry(w: number, h: number, d: number) {
  const shape = new Shape()
  const bevel = Math.min(d * .25, .008)
  const r = (Math.min(w, h) / 2 - bevel) / 1.06
  const depth = Math.max(d - 2 * bevel, .001)
  const segments = 48
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    let rad = r
    const sinA = Math.sin(angle)
    if (sinA < -.65) {
      rad = r * (1 + .06 * Math.abs(Math.cos(angle * 2)))
    }
    const x = rad * Math.cos(angle)
    const y = rad * Math.sin(angle)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 24,
  })
  geo.center()
  return geo
}

/** Cylindrical sleeve with rounded shoulder, crimp groove, bottom curl and recessed top lip. */
export function electrolyticSleeveGeometry(radius: number, height: number) {
  const points: Vector2[] = [
    new Vector2(radius * .55, 0),
    new Vector2(radius * .85, .01 * height),
    new Vector2(radius * .98, .04 * height),
    new Vector2(radius, .08 * height),
    new Vector2(radius, .14 * height),
    new Vector2(radius * .94, .18 * height),
    new Vector2(radius, .22 * height),
    new Vector2(radius, .91 * height),
    new Vector2(radius * .98, .96 * height),
    new Vector2(radius * .92, height),
    new Vector2(radius * .88, .97 * height),
  ]
  return new LatheGeometry(points, 48)
}

/** Clipped segment corners leave visible gutters between the seven glyphs. */
export function segmentGlyphGeometry(w: number, d: number, thickness: number) {
  const inset = Math.min(w, d) * .4, x = w / 2, z = d / 2, shape = new Shape()
  shape.moveTo(-x + inset, -z); shape.lineTo(x - inset, -z); shape.lineTo(x, -z + inset); shape.lineTo(x, z - inset)
  shape.lineTo(x - inset, z); shape.lineTo(-x + inset, z); shape.lineTo(-x, z - inset); shape.lineTo(-x, -z + inset); shape.closePath()
  return new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
}
