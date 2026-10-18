import { getPartForModule } from '../data/partCatalog'
import type { CircuitModule } from '../types/circuit'

export type ContactControl = 'state' | 'pressed' | 'position0' | 'position1' | 'position2' | 'position3'
export interface ContactControlHit { id: string; property: ContactControl }
interface ContactInteractionPort {
  module(id: string): CircuitModule | undefined
  documentId(): string | null
  commit(id: string, patch: Record<string, boolean>): void
  momentary?(id: string, pressed: boolean): void
  releaseMomentary?(id: string, documentId: string | null): void
}

function value(module: CircuitModule, property: ContactControl): boolean | null {
  const part = getPartForModule(module)
  if (part?.package.family !== 'switch' || !(part.internalConnections ?? []).some(connection => connection.when?.property === property)) return null
  const current = module.properties?.[property] ?? part.editor.defaults[property]
  return typeof current === 'boolean' ? current : null
}

/** Pointer state owns no graph copy. Each actual input transition uses a
 * validated command, and cancelled latching controls never
 * commit. A momentary release is idempotent on up/cancel/lost capture/blur. */
export function createContactInteraction(port: ContactInteractionPort) {
  let active: { pointer: number; hit: ContactControlHit; initial: boolean; draft: string | null; type: string } | null = null
  const current = () => {
    if (!active || active.draft !== port.documentId()) return null
    const module = port.module(active.hit.id)
    return module?.type === active.type ? module : null
  }
  function cancel(pointer?: number) {
    if (!active || pointer !== undefined && pointer !== active.pointer) return false
    const held = active, module = current(); active = null
    if (held.hit.property === 'pressed') {
      if (held.draft !== port.documentId()) port.releaseMomentary?.(held.hit.id, held.draft)
      else if (port.momentary) port.momentary(held.hit.id, false)
      else if (module && value(module, 'pressed') === true) port.commit(module.id, { pressed: false })
    }
    return true
  }
  return {
    active: () => active?.hit ?? null,
    begin(pointer: number, hit: ContactControlHit) {
      if (active) return false
      const module = port.module(hit.id), initial = module && value(module, hit.property)
      if (!module || initial === null || initial === undefined) return false
      active = { pointer, hit, initial, draft: port.documentId(), type: module.type }
      try { if (hit.property === 'pressed') { if (port.momentary) port.momentary(hit.id, true); else if (initial !== true) port.commit(hit.id, { pressed: true }) } }
      catch (error) { active = null; throw error }
      return true
    },
    end(pointer: number, overSameControl = true) {
      if (!active || pointer !== active.pointer) return false
      if (active.hit.property === 'pressed') return cancel(pointer)
      const completed = active, module = current(); active = null
      if (overSameControl && module && value(module, completed.hit.property) === completed.initial) port.commit(module.id, { [completed.hit.property]: !completed.initial })
      return true
    },
    cancel,
  }
}
