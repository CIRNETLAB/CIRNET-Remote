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
export function fixedPackageLeadPath(part: PartDefinition, pinId: string, insertion = 0) {
  const feed = packageFeedthroughPoints(part, pinId), pin = part.package.pins.find(pin => pin.id === pinId)
  if (!pin || !Object.values(pin.positionMm).every(Number.isFinite)) throw Error('A fixed lead requires a finite canonical pin.')
  const anchor = scale(pin.positionMm, MM_TO_WORLD), mm = MM_TO_WORLD
  const offset = Math.hypot(feed.exit.x - anchor.x, feed.exit.z - anchor.z)
  const radialOffset=feed.outward.y<-.999&&offset>1e-8
  const straight = (feed.section.kind === 'stamped'||radialOffset ? .15 : .4) * mm
  const section = feed.section, minimum = (section.kind === 'round' && section.widthMm <= .5 ? .3 : .4) * mm
  const radius = section.kind === 'stamped' ? .15 * mm : minimum
  const stub = { ...anchor, y: anchor.y + straight }, shoulder = { x: feed.exit.x + feed.outward.x * straight, y: feed.exit.y + feed.outward.y * straight, z: feed.exit.z + feed.outward.z * straight }
  const points = [feed.exit]
  if (radialOffset) {
    const midY = feed.exit.y - straight - radius
    points.push({x:feed.exit.x,y:midY,z:feed.exit.z},{x:anchor.x,y:midY,z:anchor.z},anchor)
  } else {
    points.push(sectionIsStamped(feed.section.kind) ? {x:feed.exit.x+feed.outward.x*straight*2,y:feed.exit.y+feed.outward.y*straight*2,z:feed.exit.z+feed.outward.z*straight*2} : shoulder)
    if (offset > 1e-8) points.push({ x: anchor.x, y: feed.exit.y, z: anchor.z })
    points.push(stub, anchor)
  }
  if (insertion > 0) points.push({ ...anchor, y: anchor.y - insertion })
  const path = buildLeadPath(points, radius, section.kind === 'stamped'||radialOffset ? radius : .7 * mm, { start: straight, end: straight })
  validatePackageLeadBudget(part, path.length)
  return { points, feed, path }
}
const sectionIsStamped=(kind:string)=>kind==='stamped'

export function validatePackageLeadBudget(part: PartDefinition, externalLength: number) {
  const mechanics = part.package.boardInsertion
  if (mechanics && externalLength / MM_TO_WORLD > mechanics.maxExternalLeadMm + 1e-6) throw Error('The declared metal lead is too short for this board insertion.')
}

/** All coordinates and widths are world units in the package frame. */
export function rigidPackageLeadStations(part: PartDefinition, pin: PhysicalPin, insertion = 0) {
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
    const narrowStart = Math.max(tip.y + (pkg.boardInsertion ? 1.05 : .6) * mm, bendEnd.y - .35 * mm), narrowEnd = Math.max(tip.y + (pkg.boardInsertion ? .8 : .35) * mm, narrowStart - .65 * mm)
    if (narrowStart < bendEnd.y - 1e-9) stations.push({ point: { x: tip.x, y: narrowStart, z: tip.z }, tangent: down, width: shoulder })
    stations.push({ point: { x: tip.x, y: narrowEnd, z: tip.z }, tangent: down, width }, { point: tip, tangent: down, width })
  } else {
    // The adapted revision completes its fan-out above the deck. Only the
    // normal tail enters a cavity; the canonical contact remains at Y=0.
    const tailY = tip.y + (pkg.boardInsertion ? 1 : 0) * mm
    const down = { x: 0, y: -1, z: 0 }, delta = tip.x - exit.x, height = exit.y - tailY
    stations.push({ point: exit, tangent: down, width })
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, blend = t * t * (3 - 2 * t), slope = 6 * t * (1 - t)
      stations.push({ point: { x: exit.x + delta * blend, y: exit.y - height * t, z: exit.z + (tip.z - exit.z) * blend }, tangent: { x: delta * slope, y: -height, z: (tip.z - exit.z) * slope }, width })
    }
    if (pkg.boardInsertion) stations.push({ point: tip, tangent: down, width })
  }
  if (insertion > 0) stations.push({ point: { ...tip, y: tip.y - insertion }, tangent: { x: 0, y: -1, z: 0 }, width })
  validatePackageLeadBudget(part, stations.slice(1).reduce((sum, station, i) => sum + distance(stations[i]!.point, station.point), 0))
  return { stations, thickness, feedthrough, stampingAxis: shape.family === 'dip' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 }, widthAxisFixed: shape.family === 'dip' }
}

/** Every swept quad lies within the convex hull of its endpoint rectangles.
 * A capsule using the larger endpoint half-diagonal encloses that hull,
 * including the variable-width stamped shoulder and all four corners. */
export function rigidPackageLeadSegments(part: PartDefinition, insertion = 0): RigidLeadSegment[] {
  if (!hasShapedRigidLeads(part)) return []
  const shape = part.package.shape!
  if (shape.family !== 'dip' && shape.family !== 'to92') return part.package.pins.flatMap(pin => {
    const { path, feed } = fixedPackageLeadPath(part, pin.id, insertion), section = feed.section
    const radius = (section.kind === 'round' ? section.widthMm / 2 : Math.hypot(section.widthMm, section.thicknessMm) / 2) * MM_TO_WORLD + path.sampleError
    return path.samples.slice(1).map((point, i) => ({ start: path.samples[i]!, end: point, radius }))
  })
  return part.package.pins.flatMap(pin => {
    const { stations, thickness } = rigidPackageLeadStations(part, pin, insertion)
    return stations.slice(1).map((station, index) => ({ start: stations[index]!.point, end: station.point, radius: Math.hypot(Math.max(station.width, stations[index]!.width), thickness) / 2 }))
  })
}
