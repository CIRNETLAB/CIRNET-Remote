/** Canonical sectioned rigid-package metal. Rendering and mechanical checks
 * consume the same stations; only rendering includes the declared interior. */
import { MM_TO_WORLD, type PartDefinition, type PhysicalPin } from '../data/partCatalog'
import type { Point3 } from '../types/circuit'
import { buildLeadPath } from './leadPath'

export interface RigidLeadStation { point: Point3; tangent: Point3; width: number }
export interface RigidLeadSegment { start: Point3; end: Point3; radius: number }
const scale = (p: Point3, n: number): Point3 => ({ x: p.x * n, y: p.y * n, z: p.z * n })
const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function packageFeedthroughPoints(part: PartDefinition, pinId: string) {
  const pkg = part.package, shape = pkg.shape, declared = shape?.leadExits.find(exit => exit.pinId === pinId)
  if (!shape || !declared) throw Error(`Missing declared feedthrough for ${pinId}.`)
  const positive = [pkg.bodyMm.x, pkg.bodyMm.y, pkg.bodyMm.z, shape.embeddedDepthMm, shape.leadSection.widthMm, shape.leadSection.thicknessMm, ...(shape.leadSection.shoulderWidthMm === undefined ? [] : [shape.leadSection.shoulderWidthMm])]
  if (positive.some(value => !Number.isFinite(value) || value <= 0) || !Number.isFinite(pkg.standoffMm) || pkg.standoffMm < 0 || !Object.values(declared.positionMm).every(Number.isFinite) || !Object.values(declared.normal).every(Number.isFinite)) throw Error('A feedthrough requires finite coordinates and positive shape dimensions.')
  const exit = scale(declared.positionMm, MM_TO_WORLD); exit.y += (pkg.standoffMm + pkg.bodyMm.y / 2) * MM_TO_WORLD
  const length = Math.hypot(declared.normal.x, declared.normal.y, declared.normal.z)
  if (!Number.isFinite(length) || length < 1e-6) throw Error('A feedthrough requires a finite outward normal.')
  const outward = scale(declared.normal, 1 / length), depth = shape.embeddedDepthMm * MM_TO_WORLD
  const embeddedStart = { x: exit.x - outward.x * depth, y: exit.y - outward.y * depth, z: exit.z - outward.z * depth }
  return { exit, outward, embeddedStart, depth, section: shape.leadSection }
}
export function hasShapedRigidLeads(part: PartDefinition) { return !!part.package.shape }

/** Canonical external line/arc path for fixed two-pin shape revisions. */
export function fixedPackageLeadPath(part: PartDefinition, pinId: string) {
  const feed = packageFeedthroughPoints(part, pinId), pin = part.package.pins.find(pin => pin.id === pinId)
  if (!pin || !Object.values(pin.positionMm).every(Number.isFinite)) throw Error('A fixed lead requires a finite canonical pin.')
  const anchor = scale(pin.positionMm, MM_TO_WORLD), mm = MM_TO_WORLD, straight = .4 * mm
  const stub = { ...anchor, y: anchor.y + straight }, shoulder = { x: feed.exit.x + feed.outward.x * straight, y: feed.exit.y + feed.outward.y * straight, z: feed.exit.z + feed.outward.z * straight }
  const points = [feed.exit, shoulder]
  if (Math.hypot(feed.exit.x - anchor.x, feed.exit.z - anchor.z) > 1e-8) points.push({ x: anchor.x, y: feed.exit.y, z: anchor.z })
  points.push(stub, anchor)
  const section = feed.section, minimum = (section.kind === 'round' && section.widthMm <= .5 ? .3 : .4) * mm
  return { points, feed, path: buildLeadPath(points, minimum, .7 * mm, { start: straight, end: straight }) }
}

/** All coordinates and widths are world units in the package frame. */
export function rigidPackageLeadStations(part: PartDefinition, pin: PhysicalPin) {
  const pkg = part.package, shape = pkg.shape
  if (!shape || (shape.family !== 'dip' && shape.family !== 'to92')) throw Error('A molded lead requires a DIP or TO-92 shape specification.')
  const feedthrough = packageFeedthroughPoints(part, pin.id), mm = MM_TO_WORLD, { exit } = feedthrough
  if (!Object.values(pin.positionMm).every(Number.isFinite)) throw Error('A molded lead requires a finite contact tip.')
  const tip = scale(pin.positionMm, mm), width = shape.leadSection.widthMm * mm, thickness = shape.leadSection.thicknessMm * mm
  const stations: RigidLeadStation[] = []
  if (shape.family === 'dip') {
    const shoulder = (shape.leadSection.shoulderWidthMm ?? shape.leadSection.widthMm) * mm, sign = Math.sign(feedthrough.outward.z) || Math.sign(tip.z) || 1
    const outward = { x: 0, y: 0, z: sign }, down = { x: 0, y: -1, z: 0 }
    const reach = Math.abs(tip.z - exit.z), radius = Math.min(.42 * mm, reach * .75, (exit.y - tip.y) * .3)
    const bendStart = { x: exit.x, y: exit.y, z: tip.z - sign * radius }
    stations.push({ point: exit, tangent: outward, width: shoulder })
    if (distance(bendStart, exit) > 1e-9) stations.push({ point: bendStart, tangent: outward, width: shoulder })
    for (let i = 1; i <= 12; i++) {
      const angle = i / 12 * Math.PI / 2
      stations.push({ point: { x: exit.x, y: exit.y - radius * (1 - Math.cos(angle)), z: bendStart.z + sign * radius * Math.sin(angle) }, tangent: { x: 0, y: -Math.sin(angle), z: sign * Math.cos(angle) }, width: shoulder })
    }
    const bendEnd = stations[stations.length - 1]!.point
    const narrowStart = Math.max(tip.y + .6 * mm, bendEnd.y - .35 * mm), narrowEnd = Math.max(tip.y + .35 * mm, narrowStart - .65 * mm)
    if (narrowStart < bendEnd.y - 1e-9) stations.push({ point: { x: tip.x, y: narrowStart, z: tip.z }, tangent: down, width: shoulder })
    stations.push({ point: { x: tip.x, y: narrowEnd, z: tip.z }, tangent: down, width }, { point: tip, tangent: down, width })
  } else {
    const down = { x: 0, y: -1, z: 0 }, delta = tip.x - exit.x, height = exit.y - tip.y
    stations.push({ point: exit, tangent: down, width })
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, blend = t * t * (3 - 2 * t), slope = 6 * t * (1 - t)
      stations.push({ point: { x: exit.x + delta * blend, y: exit.y - height * t, z: exit.z + (tip.z - exit.z) * blend }, tangent: { x: delta * slope, y: -height, z: (tip.z - exit.z) * slope }, width })
    }
  }
  return { stations, thickness, feedthrough, stampingAxis: shape.family === 'dip' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 }, widthAxisFixed: shape.family === 'dip' }
}

/** Every swept quad lies within the convex hull of its endpoint rectangles.
 * A capsule using the larger endpoint half-diagonal encloses that hull,
 * including the variable-width stamped shoulder and all four corners. */
export function rigidPackageLeadSegments(part: PartDefinition): RigidLeadSegment[] {
  if (!hasShapedRigidLeads(part)) return []
  const shape = part.package.shape!
  if (shape.family !== 'dip' && shape.family !== 'to92') return part.package.pins.flatMap(pin => {
    const { path, feed } = fixedPackageLeadPath(part, pin.id), section = feed.section
    const radius = (section.kind === 'round' ? section.widthMm / 2 : Math.hypot(section.widthMm, section.thicknessMm) / 2) * MM_TO_WORLD + path.sampleError
    return path.samples.slice(1).map((point, i) => ({ start: path.samples[i]!, end: point, radius }))
  })
  return part.package.pins.flatMap(pin => {
    const { stations, thickness } = rigidPackageLeadStations(part, pin)
    return stations.slice(1).map((station, index) => ({ start: stations[index]!.point, end: station.point, radius: Math.hypot(Math.max(station.width, stations[index]!.width), thickness) / 2 }))
  })
}
