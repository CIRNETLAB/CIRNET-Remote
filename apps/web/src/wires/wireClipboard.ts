import type { CircuitGraph, CircuitModule, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { formatEndpoint, resolveEndpoint } from '../electrical/endpoints'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from '../electrical/modulePose'
import { copyWireVisual, validateWireVisual } from './wireVisual'

interface ShiftedContact { endpoint: string; delta: Point3 }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-8
const point = (position: readonly number[]): Point3 => ({ x: position[0], y: position[1], z: position[2] })
function shiftContact(graph: CircuitGraph, value: string, steps: number): ShiftedContact {
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
  const source = shiftContact(graph, wire.source, steps), destination = shiftContact(graph, wire.destination, steps)
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
    return { ...control, position: pose ? worldToModuleLocal(translated, pose) : translated }
  })
  validateWireVisual(visual, graph.modules)
  return { wire: { source: source.endpoint, destination: destination.endpoint }, visual }
}
