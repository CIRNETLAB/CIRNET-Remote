import data from '../data/breadboardTopologies.json'

export interface BreadboardContact {
  readonly contactId: string
  readonly localPosition: readonly [number, number, number]
  readonly nodeId: string
}
export interface BreadboardTopology {
  readonly id: string
  readonly version: 1
  readonly moduleTypes: readonly string[]
  readonly pitch: number
  readonly deckHeight: number
  readonly contacts: readonly BreadboardContact[]
}

const profiles = new Map<string, BreadboardTopology>()
const contacts = new Map<string, Map<string, BreadboardContact>>()
for (const raw of data.profiles) {
  const profile = raw as unknown as BreadboardTopology
  for (const contact of profile.contacts) { Object.freeze(contact.localPosition); Object.freeze(contact) }
  Object.freeze(profile.contacts); Object.freeze(profile)
  const lookup = new Map(profile.contacts.map(contact => [contact.contactId, contact]))
  for (const type of profile.moduleTypes) { profiles.set(type, profile); contacts.set(type, lookup) }
}

// Declared editor topology, independent of physical station routing capabilities.
export const getBreadboardTopology = (type: string): BreadboardTopology | null => profiles.get(type) ?? null
export const getBreadboardContact = (type: string, contactId: string): BreadboardContact | null => contacts.get(type)?.get(contactId) ?? null
export function contactFromInstance(type: string, instanceId: number): BreadboardContact | null {
  return Number.isInteger(instanceId) && instanceId >= 0 ? getBreadboardTopology(type)?.contacts[instanceId] ?? null : null
}
