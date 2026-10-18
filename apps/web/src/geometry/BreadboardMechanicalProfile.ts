/** Versioned CAD mechanics. Electrical topology and node/contact positions are
 * deliberately inputs, never rewritten by the socket or conductor geometry. */
import data from '../data/breadboardMechanics.json'
import type { BreadboardMechanicalProfileV1 } from '../contracts/generated/dto'
import { MM_TO_WORLD } from '../data/partCatalog'
import { getBreadboardContact, getBreadboardTopology } from '../electrical/BreadboardTopology'
import type { Point3 } from '../types/circuit'

export const BREADBOARD_MECHANICAL_PROFILE = Object.freeze(data) as BreadboardMechanicalProfileV1
export function getBoardMechanicalProfile(type: string): BreadboardMechanicalProfileV1 | null {
  return BREADBOARD_MECHANICAL_PROFILE.moduleTypes.includes(type as never) ? BREADBOARD_MECHANICAL_PROFILE : null
}
export function boardContactMechanics(type: string, contactId: string) {
  const profile = getBoardMechanicalProfile(type), topology = getBreadboardTopology(type), contact = getBreadboardContact(type, contactId)
  if (!profile || !topology || !contact) throw Error('Unknown breadboard mechanical contact.')
  const [x, y, z] = contact.localPosition, surface = { x, y: topology.deckHeight, z }
  return { profile, contact: { x, y, z }, surface,
    tip: { x, y: surface.y - profile.insertionDepthMm * MM_TO_WORLD, z },
    floor: { x, y: surface.y - profile.cavityDepthMm * MM_TO_WORLD, z },
    insulationEnd: { x, y: surface.y + profile.insulationClearanceMm * MM_TO_WORLD, z } }
}

/** Only a normal conductor in this exact socket is admitted below the deck.
 * Horizontal plastic crossings, a neighbouring hole and the rear case fail. */
export function conductorFitsContactCavity(type: string, contactId: string, start: Point3, end: Point3, radius: number): boolean {
  const { profile, surface, floor } = boardContactMechanics(type, contactId)
  if (!Number.isFinite(radius) || radius <= 0 || ![start, end].every(p => Object.values(p).every(Number.isFinite))) return false
  if (Math.hypot(start.x - end.x, start.z - end.z) > 1e-7) return false
  const throat = profile.throatHalfWidthWorld
  if ([start, end].some(p => Math.abs(p.x - surface.x) + radius > throat + 1e-7 || Math.abs(p.z - surface.z) + radius > throat + 1e-7)) return false
  return Math.min(start.y, end.y) >= floor.y - 1e-7
}

export function validateBoardConductorSegment(type: string, contactId: string, start: Point3, end: Point3, radius: number): void {
  const { surface } = boardContactMechanics(type, contactId)
  const length = Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)
  const verticalRadius = length > 1e-12 ? radius * Math.sqrt(Math.max(0,1-((end.y-start.y)/length)**2)) : radius
  if (Math.min(start.y, end.y) - verticalRadius >= surface.y - 1e-7) return
  if (!conductorFitsContactCavity(type, contactId, start, end, radius)) throw Error('Conductor intersects breadboard plastic outside its contact cavity.')
}

/** Append a straight continuation to a canonical contact-ended lead. The
 * original contact remains separately available to picking and pin binding. */
export function insertionContinuation(type: string, contactId: string, radius: number) {
  const mechanics = boardContactMechanics(type, contactId)
  if (!conductorFitsContactCavity(type, contactId, mechanics.contact, mechanics.tip, radius)) throw Error('Conductor does not fit its contact cavity.')
  return { start: mechanics.contact, end: mechanics.tip, radius, length: mechanics.contact.y - mechanics.tip.y }
}
