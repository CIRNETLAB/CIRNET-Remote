import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, Vector3 } from 'three'
import { MM_TO_WORLD, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createPackageMarking, shortPackageCode } from './PackageMarking'

interface MoldRing { y: number; outline: Vector2[] }

/** A ring loft keeps its caps and molded sides in one solid, including the
 * notch floor. All rings have the same contour topology; there are no planes
 * hiding missing caps or independent shells at the mold seam. */
function closedMold(rings: MoldRing[], flatFront?: number): BufferGeometry {
  const count = rings[0]!.outline.length, positions: number[] = [], indices: number[] = []
  for (const ring of rings) for (const p of ring.outline) positions.push(p.x, ring.y, p.y)
  for (let layer = 0; layer < rings.length - 1; layer++) for (let i = 0; i < count; i++) {
    const next = (i + 1) % count, a = layer * count + i, b = layer * count + next, c = (layer + 1) * count + next, d = (layer + 1) * count + i
    indices.push(a, d, b, b, d, c)
  }
  let capStart = indices.length
  for (const [layer, upper] of [[0, false], [rings.length - 1, true]] as const) {
    for (const [a, b, c] of ShapeUtils.triangulateShape(rings[layer]!.outline, [])) {
      const offset = layer * count
      if (upper) indices.push(offset + a!, offset + c!, offset + b!)
      else indices.push(offset + a!, offset + b!, offset + c!)
    }
  }
  const positionAttribute = new Float32BufferAttribute(positions, 3), retained: number[] = []
  let retainedCapStart = 0
  // A same-height floor contour intentionally collapses everywhere outside the
  // notch. Omit those faces using the actual Float32 render positions before
  // building normals; no zero-area triangle belongs in the render buffer.
  const areaSquaredTolerance = Math.pow(MM_TO_WORLD * 1e-4, 4)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map(index => new Vector3().fromBufferAttribute(positionAttribute, index))
    if (b!.clone().sub(a!).cross(c!.clone().sub(a!)).lengthSq() <= areaSquaredTolerance) continue
    retained.push(indices[i]!, indices[i + 1]!, indices[i + 2]!)
    if (i < capStart) retainedCapStart += 3
  }
  indices.splice(0, indices.length, ...retained); capStart = retainedCapStart
  const geometry = new BufferGeometry(); geometry.setAttribute('position', positionAttribute); geometry.setIndex(indices)
  const surface = geometry.toNonIndexed(), normals = new Float32BufferAttribute(new Float32Array(indices.length * 3), 3)
  const faces: { normal: Vector3; planar: boolean }[] = [], adjacent: { face: number; weight: number }[][] = Array.from({ length: positions.length / 3 }, () => [])
  // The indexed loft already shares its exact physical seams. Reuse that
  // topology rather than a fixed-size spatial hash, whose cells can exceed a
  // 0.12 mm bevel at this application's world scale.
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = indices.slice(i, i + 3).map(index => new Vector3(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!))
    const normal = vertices[1]!.clone().sub(vertices[0]!).cross(vertices[2]!.clone().sub(vertices[0]!)).normalize()
    const planar = i >= capStart || vertices.every(point => Math.abs(point.y - vertices[0]!.y) < 1e-12) || (flatFront !== undefined && vertices.every(point => Math.abs(point.z - flatFront) < 1e-10))
    const face = faces.length; faces.push({ normal, planar })
    if (!planar) for (let corner = 0; corner < 3; corner++) {
      const a = vertices[(corner + 1) % 3]!.clone().sub(vertices[corner]!), b = vertices[(corner + 2) % 3]!.clone().sub(vertices[corner]!)
      const weight = Math.acos(Math.max(-1, Math.min(1, a.dot(b) / (a.length() * b.length()))))
      adjacent[indices[i + corner]!]!.push({ face, weight: Number.isFinite(weight) ? weight : 0 })
    }
  }
  for (let i = 0; i < indices.length; i++) {
    const face = faces[Math.floor(i / 3)]!, normal = face.planar ? face.normal : new Vector3()
    if (!face.planar) {
      for (const other of adjacent[indices[i]!]!) if (face.normal.dot(faces[other.face]!.normal) > .5) normal.addScaledVector(faces[other.face]!.normal, other.weight)
      normal.normalize()
    }
    normals.setXYZ(i, normal.x, normal.y, normal.z)
  }
  // Planar lids/front never inherit bevel or notch normals. Curved surfaces
  // retain corner-angle-weighted smoothing, independent of cap triangulation.
  surface.setAttribute('normal', normals); geometry.dispose(); surface.computeBoundingBox(); surface.computeBoundingSphere()
  return surface
}

function dipOutline(w: number, d: number, inset: number, notchDepth: number): Vector2[] {
  const x = w / 2 - inset, z = d / 2 - inset, radius = Math.min(.85 * MM_TO_WORLD, d * .18)
  const points = [new Vector2(-x, -z), new Vector2(x, -z), new Vector2(x, z), new Vector2(-x, z), new Vector2(-x, radius)]
  // Descending along the -X end forms a semicircular recess on its upper half.
  for (let i = 1; i <= 16; i++) {
    const angle = Math.PI / 2 - i * Math.PI / 16
    points.push(new Vector2(-x + notchDepth * Math.cos(angle), radius * Math.sin(angle)))
  }
  return points
}

/** Dimensions are the actual shell envelope; standoff is added by the caller. */
export function createMoldedDipBody(w: number, h: number, d: number, bevel: number): BufferGeometry {
  const notch = Math.min(.85 * MM_TO_WORLD, d * .18), floor = h - Math.min(.75 * MM_TO_WORLD, h * .26)
  const taper = .06 * MM_TO_WORLD
  return closedMold([
    { y: 0, outline: dipOutline(w, d, bevel + taper, 0) },
    { y: bevel, outline: dipOutline(w, d, taper, 0) },
    { y: h * .46, outline: dipOutline(w, d, 0, 0) },
    { y: h * .48, outline: dipOutline(w, d, .025 * MM_TO_WORLD, 0) },
    { y: h * .5, outline: dipOutline(w, d, 0, 0) },
    // The same-height contour change makes a real semicircular floor; repeating
    // its full contour above it makes an upright curved wall, not a sloped ramp.
    { y: floor, outline: dipOutline(w, d, taper, 0) },
    { y: floor, outline: dipOutline(w, d, taper, notch) },
    { y: h - bevel, outline: dipOutline(w, d, taper, notch) },
    { y: h, outline: dipOutline(w, d, bevel + taper, notch) },
  ])
}

function to92Outline(w: number, d: number, inset: number): Vector2[] {
  const x = w / 2 - inset, front = d / 2 - inset, join = d * .2, rearRadius = d * .7 - inset
  const points = [new Vector2(-x, front), new Vector2(x, front), new Vector2(x, join)]
  for (let i = 1; i <= 32; i++) {
    const angle = i * Math.PI / 32
    points.push(new Vector2(x * Math.cos(angle), join - rearRadius * Math.sin(angle)))
  }
  // This outline runs clockwise; normalize once for the closed loft winding.
  return points.reverse()
}

export function createMoldedTo92Body(w: number, h: number, d: number, bevel: number): BufferGeometry {
  return closedMold([
    { y: 0, outline: to92Outline(w, d, bevel) },
    { y: bevel, outline: to92Outline(w, d, 0) },
    { y: h - bevel, outline: to92Outline(w, d, 0) },
    { y: h, outline: to92Outline(w, d, bevel) },
  ], d / 2)
}

/** New shape revisions only. Historical descriptors retain their original
 * silhouettes; no title/model-name inference changes their physical identity. */
export function addMoldedPackageModel(group: Group, _module: CircuitModule, part: PartDefinition): boolean {
  const pkg = part.package, shape = pkg.shape
  if (!shape || (shape.family !== 'dip' && shape.family !== 'to92')) return false
  const mm = MM_TO_WORLD, w = pkg.bodyMm.x * mm, h = pkg.bodyMm.y * mm, d = pkg.bodyMm.z * mm, bottom = pkg.standoffMm * mm
  const bevel = Math.min((shape.bevelMm ?? .12) * mm, h / 4, d / 8)
  const plastic = new MeshStandardMaterial({ color: '#292D30', metalness: 0, roughness: .54, envMapIntensity: .5 })
  const geometry = shape.family === 'dip' ? createMoldedDipBody(w, h, d, bevel) : createMoldedTo92Body(w, h, d, bevel)
  const body = new Mesh(geometry, plastic); body.name = 'package-body'; body.position.y = bottom; body.userData.selectionSurface = true; body.castShadow = true; body.receiveShadow = true; group.add(body)
  const code = shortPackageCode(part.shortName ?? pkg.marking ?? part.name)
  if (shape.family === 'dip') {
    // The real notch is already part of the body. Keep its named orientation
    // handle for consumers without introducing another dark disk or open shell.
    const notch = new Group(); notch.name = 'package-notch'; notch.userData.selectionSurface = false; notch.userData.ignorePick = true; group.add(notch)
    const ink = new MeshStandardMaterial({ color: '#b9b9a6', roughness: .8, metalness: 0 })
    const pin1 = new Mesh(new CylinderGeometry(.22 * mm, .22 * mm, .012 * mm, 20), ink)
    pin1.name = 'package-pin1-marker'; pin1.position.set(-w / 2 + 1.45 * mm, bottom + h + .006 * mm, d * .29); pin1.userData.selectionSurface = false; group.add(pin1)
    const marking = createPackageMarking(code, w * .56, d * .38); marking.position.y = bottom + h + .002 * mm; group.add(marking)
  } else {
    const marking = createPackageMarking(code, w * .78, h * .21)
    marking.rotation.x = 0; marking.position.set(0, bottom + h * .63, d / 2 + .002 * mm); group.add(marking)
    const pinOrder = pkg.pins.slice().sort((a, b) => a.positionMm.x - b.positionMm.x).map(pin => pin.name).join('  ')
    const pinLabels = createPackageMarking(pinOrder, w * .72, h * .13, 'package-pinout-marking')
    pinLabels.rotation.x = 0; pinLabels.position.set(0, bottom + h * .27, d / 2 + .002 * mm); group.add(pinLabels)
  }
  return true
}
