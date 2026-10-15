import type { CircuitModule, Point3 } from '../types/circuit'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { resolveEndpoint } from '../electrical/endpoints'
import { moduleLocalToWorld, moduleWorldPose } from '../electrical/modulePose'

export const selectionPoint = (position: readonly number[]): Point3 => ({ x: position[0], y: position[1], z: position[2] })
export const selectionModulePosition = (module: CircuitModule): Point3 => ({ x: module.position?.x ?? 0, y: module.position?.y ?? 0, z: module.position?.z ?? 0 })

export function clipboardContactWorld(modules: CircuitModule[], value: string) {
  const resolved = resolveEndpoint(modules, value)
  if (!resolved || resolved.endpoint.kind !== 'contact') throw new Error('Paste requires declared breadboard contacts; component ports cannot be guessed.')
  const contactId = resolved.endpoint.contactId
  const contact = getBreadboardTopology(resolved.module.type)!.contacts.find(item => item.contactId === contactId)!
  return { module: resolved.module, contact, world: moduleLocalToWorld(selectionPoint(contact.localPosition), moduleWorldPose(resolved.module, modules)) }
}
