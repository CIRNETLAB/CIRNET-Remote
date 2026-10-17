import registry from './editorParts.json'
import type { SignalDomain } from '../contracts/generated/dto'
import type { ComponentParameter } from './componentParameters'

/** The existing board pitch is .13 world units for 2.54 mm. */
export const MM_TO_WORLD = .13 / 2.54
export interface PartPoint { x: number; y: number; z: number }
export type PinRole = 'input' | 'output' | 'power' | 'ground' | 'passive' | 'nc'
export interface PhysicalPin {
  id: string
  number: string
  name: string
  role: PinRole
  /** Historical external descriptors may omit this; canonical catalogs declare it. */
  domain?: SignalDomain
  outputType?: 'push-pull' | 'open-collector' | 'open-drain'
  polarity?: 'active-high' | 'active-low'
  signal?: 'data' | 'clock' | 'set' | 'reset' | 'enable'
  edge?: 'rising' | 'falling'
  inputCharacteristics?: 'standard' | 'schmitt-trigger'
  /** Pin tip at the mounting plane, in the package frame. */
  positionMm: PartPoint
  /** Optional body exit for explicitly formed discrete leads. */
  bodyPositionMm?: PartPoint
  logicalPort?: string
}
export interface PartPackage {
  id: string
  revision: number
  family: 'dip' | 'axial' | 'radial-led' | 'radial-capacitor' | 'to92' | 'switch' | 'seven-segment' | 'buzzer' | 'terminal'
  bodyMm: PartPoint
  leadDiameterMm: number
  standoffMm: number
  pins: PhysicalPin[]
  footprint: { id: string; revision: number; pitchMm: number; rowSpanMm?: number; mountable: boolean; bridgeCenterGap?: boolean; leadForming?: string }
  polarized?: boolean
  digits?: number
  marking?: string
  visualVariant?: 'resistor' | 'diode' | 'zener' | 'polarized' | 'ceramic' | 'push-button' | 'dip-switch' | 'toggle'
  actuator?: { heightMm: number; diameterMm: number; bushingHeightMm: number; bushingDiameterMm: number; throwDegrees: number }
}
export interface SimulationModel {
  model: string
  status: 'supported' | 'unsupported'
  reason?: string
  power?: { positivePinId: string; negativePinId: string; minVoltage: number; maxVoltage: number }
  gates?: { inputs: string[]; output: string }[]
  defaultVoltage?: number
  defaultOhms?: number
  forwardVoltage?: number
  maxCurrentAmps?: number
}
export interface PartDefinition {
  id: string
  revision: number
  editorType: string
  name: string
  shortName?: string
  aliases?: string[]
  identityKind?: 'exact-part' | 'configurable-generic' | 'instrument'
  logic?: { code: string; family: string; gate: string; inputCharacteristics?: 'standard' | 'schmitt-trigger' }
  /** Legacy fixture compatibility only; production authoring descriptors omit these fields. */
  manufacturer?: string
  partNumber?: string
  datasheet?: { url: string; title: string; revision?: string; pages?: string }
  function: string
  package: PartPackage
  simulation?: SimulationModel
  internalConnections?: { pins: [string, string]; when?: { property: string; equals: boolean | number } }[]
  editor: { family: string; visual: string; color: string; defaults: Record<string, unknown>; parameters: ComponentParameter[]; componentKind?: string; displayName?: string; addType?: string; hidden?: boolean }
  notes?: string
}
export const partCatalog = registry.parts as PartDefinition[]
export const historicalPartCatalog = (registry.historicalParts ?? []) as PartDefinition[]
const allParts = [...partCatalog, ...historicalPartCatalog]
const byId = new Map(partCatalog.map(part => [part.id, part]))
const byType = new Map(partCatalog.map(part => [part.editorType, part]))
export interface PinnedPartDescriptor { partId: string; partRevision: number; packageId: string; packageRevision: number }
export interface PhysicalDescriptor extends PinnedPartDescriptor { version: 1 }
export interface PhysicalPartModule { type: string; mount?: PinnedPartDescriptor; physicalDescriptor?: unknown }
export const physicalDescriptorForPart = (part: PartDefinition): PhysicalDescriptor => ({ version: 1, partId: part.id, partRevision: part.revision, packageId: part.package.id, packageRevision: part.package.revision })
export const getPartDefinition = (id: string, revision?: number) => revision === undefined ? byId.get(id) : allParts.find(part => part.id === id && part.revision === revision)
/** Existing mounts must resolve their exact descriptor; new authoring uses the current default. */
export const getPartForType = (type: string, mount?: PinnedPartDescriptor | null) => mount == null ? byType.get(type) : allParts.find(part => part.editorType === type && part.id === mount.partId && part.revision === mount.partRevision && part.package.id === mount.packageId && part.package.revision === mount.packageRevision)
/** Unmarked free modules predate compact defaults and retain their historical package. */
export const getPartForModule = (module: PhysicalPartModule) => module.mount ? getPartForType(module.type, module.mount)
  : module.physicalDescriptor !== undefined ? typeof module.physicalDescriptor === 'object' && module.physicalDescriptor !== null && (module.physicalDescriptor as PhysicalDescriptor).version === 1 ? getPartForType(module.type, module.physicalDescriptor as PhysicalDescriptor) : undefined
  : historicalPartCatalog.filter(part => part.editorType === module.type).sort((a, b) => a.revision - b.revision)[0] ?? getPartForType(module.type)
export const getPhysicalPin = (type: string, pinId: string, mount?: PinnedPartDescriptor | null) => getPartForType(type, mount)?.package.pins.find(pin => pin.id === pinId)
export const componentDisplayName = (type: string) => getPartForType(type)?.editor.displayName ?? getPartForType(type)?.name ?? type
export const componentAddType = (type: string) => getPartForType(type)?.editor.addType ?? type
/** Only new generic capacitor designs opt into a package/polarity change. */
export function componentDesignTransition(type: string, patch: Record<string, unknown>): { type: string; pinMap?: Record<string, string> } {
  if (!['GENERIC_CAPACITOR', 'GENERIC_CAPACITOR_ELECTROLYTIC'].includes(type) || patch.capacitorType === undefined) return { type }
  if (patch.capacitorType === 'CERAMIC') return { type: 'GENERIC_CAPACITOR', ...(type !== 'GENERIC_CAPACITOR' ? { pinMap: { PLUS: 'A', MINUS: 'B' } } : {}) }
  if (patch.capacitorType === 'ELECTROLYTIC') return { type: 'GENERIC_CAPACITOR_ELECTROLYTIC', ...(type !== 'GENERIC_CAPACITOR_ELECTROLYTIC' ? { pinMap: { A: 'PLUS', B: 'MINUS' } } : {}) }
  throw new Error('Choose Ceramic or Electrolytic.')
}
