import type { CircuitConnection, FlexibleMountV1, FlexibleMountV2 } from '../contracts/generated/dto'

export type { AnySupportedCircuitGraph as CircuitGraph, CircuitModuleV12 as CircuitModule, CircuitConnection, Point3, PinContactBinding, MountBinding,
  FlexibleMountV1, FlexibleMountV2, BodyPose3D,
  WireRouteMode, WireControlPoint, WireVisual } from '../contracts/generated/dto'

// Editor selections identify canonical connections; they do not own another wire shape.
export type WireIdentity = Pick<CircuitConnection, 'source' | 'destination'>
export type FlexibleMount = FlexibleMountV1 | FlexibleMountV2
export type ElectricalEndpoint =
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'contact'; moduleId: string; contactId: string }
