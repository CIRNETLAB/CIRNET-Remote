import registry from './editorParts.json'
import type { SignalDomain } from '../contracts/generated/dto'

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
  editor: { family: string; visual: string; color: string; defaults: Record<string, unknown>; parameters: { key: string; label: string; kind: 'number' | 'integer' | 'boolean'; min?: number; max?: number }[] }
  notes?: string
}
export const partCatalog = registry.parts as PartDefinition[]
const byId = new Map(partCatalog.map(part => [part.id, part]))
const byType = new Map(partCatalog.map(part => [part.editorType, part]))
export const getPartDefinition = (id: string) => byId.get(id)
export const getPartForType = (type: string) => byType.get(type)
export const getPhysicalPin = (type: string, pinId: string) => getPartForType(type)?.package.pins.find(pin => pin.id === pinId)
