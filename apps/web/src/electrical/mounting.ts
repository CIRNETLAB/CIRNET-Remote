import type { CircuitGraph, CircuitModule, MountBinding, Point3 } from '../types/circuit'
import { getPartForType, MM_TO_WORLD } from '../data/partCatalog'
import { getBreadboardTopology, type BreadboardTopology, type BreadboardContact } from './BreadboardTopology'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from './modulePose'

const EPS = 0.00001
export interface MountCandidate {
  boardId: string; position: Point3; rotation: number; valid: boolean; reason: string
  mount: MountBinding; pins: { pinId: string; position: Point3; contactId: string | null; valid: boolean }[]
}
const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const point = (p: readonly number[]): Point3 => ({ x: p[0], y: p[1], z: p[2] })
const norm = (n: number) => ((n % 360) + 360) % 360
const pinPoint = (p: { positionMm: Point3 }) => ({ x: p.positionMm.x * MM_TO_WORLD, y: p.positionMm.y * MM_TO_WORLD, z: p.positionMm.z * MM_TO_WORLD })
const contactIndices = new WeakMap<BreadboardTopology, Map<string, BreadboardContact>>()
const coordinateKey = (p: Point3) => [p.x, p.y, p.z].map(n => Math.round(n * 10000)).join(',')
function contactAt(topology: BreadboardTopology, position: Point3) {
  let index = contactIndices.get(topology)
  if (!index) { index = new Map(topology.contacts.map(c => [coordinateKey(point(c.localPosition)), c])); contactIndices.set(topology, index) }
  const contact = index.get(coordinateKey(position))
  return contact && distance(position, point(contact.localPosition)) < EPS ? contact : undefined
}

function inspectMount(module: CircuitModule, board: CircuitModule, mount: MountBinding, modules: CircuitModule[]): { pins: MountCandidate['pins']; reason: string } {
  const part = getPartForType(module.type), topology = getBreadboardTopology(board.type)
  if (!part || !topology || !part.package.footprint.mountable) return { pins: [], reason: 'This part has no breadboard footprint.' }
  const pose = { position: mount.pose.position, rotation: mount.pose.rotation }
  let reason = ''
  if (part.package.footprint.bridgeCenterGap && (Math.min(norm(pose.rotation), Math.abs(norm(pose.rotation) - 180), 360 - norm(pose.rotation)) > EPS || Math.abs(pose.position.z) > EPS)) reason = 'DIP must bridge the center gap, aligned with the board.'
  const occupied = new Set(modules.filter(item => item.id !== module.id && item.mount?.boardId === board.id).flatMap(item => item.mount!.contacts.map(c => c.contactId)))
  const used = new Set<string>()
  const pins = part.package.pins.map(pin => {
    const local = moduleLocalToWorld(pinPoint(pin), pose)
    const contact = contactAt(topology, local)
    const valid = !!contact && !occupied.has(contact.contactId) && !used.has(contact.contactId)
    if (contact) used.add(contact.contactId)
    if (!valid && !reason) reason = contact ? 'A physical hole is already occupied.' : `Pin ${pin.number} does not fit a hole.`
    return { pinId: pin.id, position: moduleLocalToWorld(local, board), contactId: contact?.contactId ?? null, valid }
  })
  // Only plastic envelopes collide; lead tips may enter the board's sockets.
  const candidate = moduleWorldPose({ ...module, mount }, [board])
  const body = part.package.bodyMm
  const rect = (m: CircuitModule, width: number, depth: number) => {
    const angle = (m.rotation ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
    return { center: { x: m.position?.x ?? 0, z: m.position?.z ?? 0 }, axes: [{ x: c, z: -s }, { x: s, z: c }], half: [width / 2, depth / 2] }
  }
  const a = rect(candidate, body.x * MM_TO_WORLD, body.z * MM_TO_WORLD)
  for (const other of modules) {
    if (other.id === module.id || other.id === board.id) continue
    const otherPart = getPartForType(other.type)
    if (!otherPart) continue
    const poseOther = moduleWorldPose(other, modules)
    const lowA = (candidate.position?.y ?? 0) + part.package.standoffMm * MM_TO_WORLD, lowB = (poseOther.position?.y ?? 0) + otherPart.package.standoffMm * MM_TO_WORLD
    if (lowA + body.y * MM_TO_WORLD <= lowB + EPS || lowB + otherPart.package.bodyMm.y * MM_TO_WORLD <= lowA + EPS) continue
    const b = rect(poseOther, otherPart.package.bodyMm.x * MM_TO_WORLD, otherPart.package.bodyMm.z * MM_TO_WORLD)
    const delta = { x: b.center.x - a.center.x, z: b.center.z - a.center.z }
    const overlap = [...a.axes, ...b.axes].every(axis => {
      const radius = (r: typeof a) => r.half.reduce((sum, half, i) => sum + half * Math.abs(r.axes[i].x * axis.x + r.axes[i].z * axis.z), 0)
      return Math.abs(delta.x * axis.x + delta.z * axis.z) < radius(a) + radius(b) - EPS
    })
    if (overlap) { reason ||= 'Component bodies would overlap.'; break }
  }
  return { pins, reason }
}

export function solveMounting(type: string, desired: Point3, rotation: number, modules: CircuitModule[], activeId = 'PLACE'): MountCandidate | null {
  const part = getPartForType(type)
  if (!part?.package.footprint.mountable || !part.package.pins.length) return null
  let best: MountCandidate | null = null, bestDistance = Infinity
  for (const board of modules) {
    const topology = getBreadboardTopology(board.type)
    if (!topology || board.mount) continue
    const local = worldToModuleLocal(desired, board)
    const xs = topology.contacts.map(c => c.localPosition[0]), zs = topology.contacts.map(c => c.localPosition[2])
    if (local.x < Math.min(...xs) - .3 || local.x > Math.max(...xs) + .3 || local.z < Math.min(...zs) - .3 || local.z > Math.max(...zs) + .3) continue
    const relativeRotation = norm(rotation - (board.rotation ?? 0))
    const anchor = moduleLocalToWorld(pinPoint(part.package.pins[0]), { rotation: relativeRotation })
    // Snap a rigid footprint anchor once. Every lead must then fit simultaneously.
    const contacts = [...topology.contacts].sort((a, b) => Math.hypot(a.localPosition[0] - anchor.x - local.x, a.localPosition[2] - anchor.z - local.z) - Math.hypot(b.localPosition[0] - anchor.x - local.x, b.localPosition[2] - anchor.z - local.z))
    for (const contact of contacts.slice(0, 16)) {
      const position = { x: contact.localPosition[0] - anchor.x, y: contact.localPosition[1] - anchor.y, z: contact.localPosition[2] - anchor.z }
      const mount: MountBinding = { kind: 'breadboard', version: 1, boardId: board.id, partId: part.id, partRevision: part.revision, packageId: part.package.id, packageRevision: part.package.revision, pose: { position, rotation: relativeRotation }, contacts: [] }
      const result = inspectMount({ id: activeId, type }, board, mount, modules)
      mount.contacts = result.pins.filter(p => p.contactId).map(p => ({ kind: 'pin-contact', version: 1, pinId: p.pinId, contactId: p.contactId! }))
      const world = moduleLocalToWorld(position, board), d = Math.hypot(world.x - desired.x, world.z - desired.z) + (result.reason ? 100 : 0)
      if (d < bestDistance) { bestDistance = d; best = { boardId: board.id, position: world, rotation, valid: !result.reason, reason: result.reason, mount, pins: result.pins } }
    }
  }
  return best
}

export function validateMountBindings(graph: CircuitGraph): void {
  for (const module of graph.modules) {
    const part = getPartForType(module.type), mount = module.mount
    if (part && graph.schema_version !== '1.1') throw new Error('Physical parts require schema 1.1.')
    for (const parameter of part?.editor.parameters ?? []) {
      const value = module.properties && Object.hasOwn(module.properties, parameter.key) ? module.properties[parameter.key] : part!.editor.defaults[parameter.key]
      if (parameter.kind === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isFinite(value) || (parameter.kind === 'integer' && !Number.isInteger(value)) || value < (parameter.min ?? -Infinity) || value > (parameter.max ?? Infinity)) throw new Error(`Invalid physical part parameter ${parameter.label}.`)
    }
    if (!mount) continue
    if (!part || graph.schema_version !== '1.1') throw new Error('Mount requires a physical part and schema 1.1.')
    if (module.position !== undefined || module.rotation !== undefined) throw new Error('Mounted pose must only come from its mount binding.')
    const exactKeys = (obj: unknown, names: string[]) => !!obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === names.length && Object.keys(obj).every(k => names.includes(k))
    if (!exactKeys(mount, ['kind', 'version', 'boardId', 'partId', 'partRevision', 'packageId', 'packageRevision', 'pose', 'contacts']) || mount.kind !== 'breadboard' || mount.version !== 1 || mount.partId !== part.id || mount.partRevision !== part.revision || mount.packageId !== part.package.id || mount.packageRevision !== part.package.revision) throw new Error('Invalid mount definition/package revision.')
    if (!exactKeys(mount.pose, ['position', 'rotation']) || !exactKeys(mount.pose.position, ['x', 'y', 'z']) || ![...Object.values(mount.pose.position), mount.pose.rotation].every(n => typeof n === 'number' && Number.isFinite(n)) || !Array.isArray(mount.contacts)) throw new Error('Invalid mount pose or contacts.')
    const board = graph.modules.find(b => b.id === mount.boardId)
    if (!board || board.mount) throw new Error('Mount references a missing breadboard.')
    const result = inspectMount(module, board, mount, graph.modules)
    if (result.reason) throw new Error(`Invalid mount: ${result.reason}`)
    if (mount.contacts.length !== part.package.pins.length || new Set(mount.contacts.map(c => c.pinId)).size !== mount.contacts.length || mount.contacts.some(c => !exactKeys(c, ['kind', 'version', 'pinId', 'contactId']) || c.kind !== 'pin-contact' || c.version !== 1 || !result.pins.some(p => p.pinId === c.pinId && p.contactId === c.contactId))) throw new Error('Mount pin/contact binding does not match the footprint.')
  }
}
