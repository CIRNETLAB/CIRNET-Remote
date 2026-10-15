import { getDefinition } from '../data/editorCatalog'
import { getBreadboardGeometrySpec } from './BreadboardGeometrySpec'

export type PlacementRotationPolicy = 'WORLD_ALIGNED' | 'CAMERA_FACING' | 'MECHANICAL'

// Mechanical profiles own their world frame. Known nonmechanical models retain
// the existing camera-facing UX; no duplicated breadboard type list is needed.
export function placementRotationPolicy(type?: string): PlacementRotationPolicy {
  if (type && getBreadboardGeometrySpec(type)?.sides.length) return 'MECHANICAL'
  return type && getDefinition(type) ? 'CAMERA_FACING' : 'WORLD_ALIGNED'
}

export function placementInitialRotation(type: string, cameraFacingYaw: () => number): number {
  return placementRotationPolicy(type) === 'CAMERA_FACING' ? cameraFacingYaw() : 0
}

export function rotationSnapStep(type?: string): number {
  return placementRotationPolicy(type) === 'MECHANICAL' ? 90 : 15
}
