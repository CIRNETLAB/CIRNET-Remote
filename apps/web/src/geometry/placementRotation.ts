import { getBreadboardGeometrySpec } from './BreadboardGeometrySpec'
import { getPartForType } from '../data/partCatalog'

export type PlacementRotationPolicy = 'WORLD_ALIGNED' | 'MECHANICAL'

// Every model starts in its canonical world frame. Mechanical profiles only
// change rotation snapping; camera navigation never supplies a placement pose.
export function placementRotationPolicy(type?: string): PlacementRotationPolicy {
  if (type && (getBreadboardGeometrySpec(type)?.sides.length || getPartForType(type))) return 'MECHANICAL'
  return 'WORLD_ALIGNED'
}

export function placementInitialRotation(_type: string, _legacyCameraFacingYaw?: () => number): number {
  return 0
}

export function rotationSnapStep(type?: string): number {
  return placementRotationPolicy(type) === 'MECHANICAL' ? 90 : 15
}
