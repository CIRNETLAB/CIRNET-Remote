import type { CircuitGraph, CircuitModule, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { formatEndpoint, resolveEndpoint } from '../electrical/endpoints'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from '../electrical/modulePose'
import { copyWireVisual, validateWireVisual } from './wireVisual'

export interface ShiftedContact { endpoint: string; delta: Point3 }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-8
const point = (position: readonly number[]): Point3 => ({ x: position[0], y: position[1], z: position[2] })
export function shiftBreadboardContact(graph: CircuitGraph, value: string, steps: number): ShiftedContact {
  if (!Number.isSafeInteger(steps) || steps < 1) throw new Error('Paste requires a positive contact step.')
  const resolved = resolveEndpoint(graph.modules, value)
  if (!resolved || resolved.endpoint.kind !== 'contact') throw new Error('Paste requires two breadboard contacts with a declared next contact; component ports cannot be shifted.')
  const topology = getBreadboardTopology(resolved.module.type)!
  const contactId = resolved.endpoint.contactId
  // Resolve each successor from the declared contact list, including gaps in power rails.
  let contact = topology.contacts.find(contact => contact.contactId === contactId)!
  const start = contact
  for (let step = 0; step < steps; step++) {
    const previous = contact
    const next = topology.contacts.find(candidate => close(candidate.localPosition[0] - previous.localPosition[0], topology.pitch)
      && close(candidate.localPosition[1], previous.localPosition[1]) && close(candidate.localPosition[2], previous.localPosition[2]))
    if (!next) throw new Error(`No next contact one local X pitch after ${resolved.module.id}.contact:${previous.contactId}. Paste was not applied.`)
    contact = next
  }
  const pose = moduleWorldPose(resolved.module, graph.modules), from = moduleLocalToWorld(point(start.localPosition), pose), to = moduleLocalToWorld(point(contact.localPosition), pose)
  return { endpoint: formatEndpoint({ kind: 'contact', moduleId: resolved.module.id, contactId: contact.contactId }), delta: { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z } }
}

/** Derive a real electrical candidate without changing the graph or temporary clipboard. */
export function shiftedWireCopy(graph: CircuitGraph, wire: WireIdentity, original: WireVisual, steps: number): { wire: WireIdentity; visual: WireVisual } {
  if (!Number.isSafeInteger(steps) || steps < 1) throw new Error('Paste requires a positive contact step.')
  const source = shiftBreadboardContact(graph, wire.source, steps), destination = shiftBreadboardContact(graph, wire.destination, steps)
  if (!['x', 'y', 'z'].every(key => close(source.delta[key as keyof Point3], destination.delta[key as keyof Point3]))) {
    throw new Error('Paste requires both breadboards to have the same local X pitch direction to preserve the wire shape. Different directions cannot share one translation.')
  }
  const visual = copyWireVisual(original), delta = source.delta
  visual.controlPoints = visual.controlPoints.map(control => {
    let pose: CircuitModule | undefined
    if (control.space === 'module') {
      const owner = graph.modules.find(module => module.id === control.moduleId)
      if (!owner) throw new Error('A copied wire control point refers to a missing module.')
      pose = moduleWorldPose(owner, graph.modules)
    }
    const world = pose ? moduleLocalToWorld(control.position, pose) : control.position
    const translated = { x: world.x + delta.x, y: world.y + delta.y, z: world.z + delta.z }
    return { ...control, position: { ...(pose ? worldToModuleLocal(translated, pose) : translated) } }
  })
  validateWireVisual(visual, graph.modules)
  return { wire: { source: source.endpoint, destination: destination.endpoint }, visual }
}

/** Rebase a rigid copy onto an explicitly chosen, declared contact. No port is inferred. */
export function wireCopyAtContact(graph: CircuitGraph, wire: WireIdentity, original: WireVisual, targetSource: string, sourceModules: CircuitModule[] = graph.modules, knownOwners: ReadonlyMap<string, string> = new Map()): { wire: WireIdentity; visual: WireVisual } {
  const source = resolveEndpoint(sourceModules, wire.source), destination = resolveEndpoint(sourceModules, wire.destination), target = resolveEndpoint(graph.modules, targetSource)
  if (!source || !destination || !target || source.endpoint.kind !== 'contact' || destination.endpoint.kind !== 'contact' || target.endpoint.kind !== 'contact') {
    throw new Error('Duplicate requires declared breadboard contacts. Component ports must be selected explicitly; they cannot be guessed.')
  }
  const sourceTopology = getBreadboardTopology(source.module.type)!, targetTopology = getBreadboardTopology(target.module.type)!
  if (!close(sourceTopology.pitch, targetTopology.pitch)) throw new Error('The target breadboard has a different contact pitch.')
  const sourceId = source.endpoint.contactId, targetId = target.endpoint.contactId, destinationId = destination.endpoint.contactId
  const sourceContact = sourceTopology.contacts.find(contact => contact.contactId === sourceId)!
  const targetContact = targetTopology.contacts.find(contact => contact.contactId === targetId)!
  const from = moduleWorldPose(source.module, sourceModules), to = moduleWorldPose(target.module, graph.modules)
  const transform = (world: Point3): Point3 => {
    const local = worldToModuleLocal(world, from)
    return moduleLocalToWorld({ x: local.x - sourceContact.localPosition[0] + targetContact.localPosition[0], y: local.y - sourceContact.localPosition[1] + targetContact.localPosition[1], z: local.z - sourceContact.localPosition[2] + targetContact.localPosition[2] }, to)
  }
  const destinationPose = moduleWorldPose(destination.module, sourceModules)
  const destinationContact = getBreadboardTopology(destination.module.type)!.contacts.find(contact => contact.contactId === destinationId)!
  const expected = transform(moduleLocalToWorld(point(destinationContact.localPosition), destinationPose))
  const boards = source.module.id === destination.module.id ? [target.module] : graph.modules.filter(module => getBreadboardTopology(module.type))
  const matches = boards.flatMap(module => {
    const pose = moduleWorldPose(module, graph.modules), local = worldToModuleLocal(expected, pose)
    return getBreadboardTopology(module.type)!.contacts.filter(contact => contact.localPosition.every((value, index) => close(value, [local.x, local.y, local.z][index]))).map(contact => ({ module, contact }))
  })
  if (matches.length !== 1) throw new Error(matches.length ? 'The destination contact is ambiguous. Choose endpoints explicitly.' : 'No matching destination contact at this position. Move the preview to valid contacts.')
  const mappedDestination = matches[0]
  const ownerMap = new Map(knownOwners)
  ownerMap.set(source.module.id, target.module.id); ownerMap.set(destination.module.id, mappedDestination.module.id)
  const visual = copyWireVisual(original)
  if (visual.frameModuleId) visual.frameModuleId = ownerMap.get(visual.frameModuleId) ?? visual.frameModuleId
  visual.controlPoints = visual.controlPoints.map(control => {
    const owner = control.space === 'module' ? sourceModules.find(module => module.id === control.moduleId) : null
    if (control.space === 'module' && !owner) throw new Error('A copied wire control point refers to a missing module.')
    const world = owner ? moduleLocalToWorld(control.position, moduleWorldPose(owner, sourceModules)) : control.position
    const transformed = transform(world)
    if (control.space === 'world') return { space: 'world' as const, position: { ...transformed } }
    const moduleId = ownerMap.get(control.moduleId) ?? control.moduleId, module = graph.modules.find(item => item.id === moduleId)!
    return { space: 'module' as const, moduleId, position: { ...worldToModuleLocal(transformed, moduleWorldPose(module, graph.modules)) } }
  })
  validateWireVisual(visual, graph.modules)
  return { wire: { source: targetSource, destination: formatEndpoint({ kind: 'contact', moduleId: mappedDestination.module.id, contactId: mappedDestination.contact.contactId }) }, visual }
}
