export interface CircuitModule {
  id: string
  type: string
  position?: { x?: number; y?: number; z?: number }
  rotation?: number
  properties?: Record<string, unknown>
  mount?: MountBinding
}

export interface Point3 { x: number; y: number; z: number }
export interface PinContactBinding { kind: 'pin-contact'; version: 1; pinId: string; contactId: string }
export interface MountBinding {
  kind: 'breadboard'; version: 1; boardId: string
  partId: string; partRevision: number; packageId: string; packageRevision: number
  pose: { position: Point3; rotation: number }
  contacts: PinContactBinding[]
}
export type ElectricalEndpoint =
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'contact'; moduleId: string; contactId: string }

export interface CircuitConnection {
  source: string
  destination: string
  metadata?: Record<string, unknown>
}
export type WireIdentity = Pick<CircuitConnection, 'source' | 'destination'>
export type WireRouteMode = 'FREE' | 'ORTHOGONAL' | 'AUTO'
export type WireControlPoint =
  | { space: 'world'; position: Point3 }
  | { space: 'module'; moduleId: string; position: Point3 }
export interface WireVisual {
  version: 1
  color: string
  routeMode: WireRouteMode
  controlPoints: WireControlPoint[]
  thickness: number
  height?: number
  layer?: number
  frameModuleId?: string | null
}

export interface CircuitGraph {
  schema_version: '1.0' | '1.1'
  circuit_id: string
  modules: CircuitModule[]
  connections: CircuitConnection[]
  metadata?: Record<string, unknown>
}
