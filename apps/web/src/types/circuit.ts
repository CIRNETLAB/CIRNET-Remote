import type { CircuitConnection } from '../contracts/generated/dto'

export type { CircuitGraph, CircuitModule, CircuitConnection, Point3, PinContactBinding, MountBinding,
  WireRouteMode, WireControlPoint, WireVisual } from '../contracts/generated/dto'

// Editor selections identify canonical connections; they do not own another wire shape.
export type WireIdentity = Pick<CircuitConnection, 'source' | 'destination'>
export type ElectricalEndpoint =
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'contact'; moduleId: string; contactId: string }
