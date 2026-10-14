import { Vector3, Quaternion } from 'three'

export interface CubeRegion {
  id: string
  label?: string
  type: 'face' | 'edge' | 'corner'
  normal: Vector3
  vertices: Vector3[]
  center: Vector3
}

export interface ProjectedPolygon {
  id: string
  label?: string
  type: 'face' | 'edge' | 'corner'
  points: string
  centerDepth: number
  normalDepth: number
  centerX: number
  centerY: number
  labelTransform?: string
}

// XZ breadboard: +Y TOP, +X RIGHT/EAST, +Z FRONT/SOUTH.
// Only the five faces and eight upper diagonals are navigation presets.
export const ORIENTATION_DIRECTIONS: Record<string, Vector3> = {
  // 5 Faces
  TOP: new Vector3(0, 1, 0),
  FRONT: new Vector3(0, 0, 1),
  BACK: new Vector3(0, 0, -1),
  LEFT: new Vector3(-1, 0, 0),
  RIGHT: new Vector3(1, 0, 0),

  // 4 Upper Edges
  'TOP-FRONT': new Vector3(0, 1, 1).normalize(),
  'TOP-BACK': new Vector3(0, 1, -1).normalize(),
  'TOP-LEFT': new Vector3(-1, 1, 0).normalize(),
  'TOP-RIGHT': new Vector3(1, 1, 0).normalize(),

  // 4 Upper Corners
  'TOP-FRONT-LEFT': new Vector3(-1, 1, 1).normalize(),
  'TOP-FRONT-RIGHT': new Vector3(1, 1, 1).normalize(),
  'TOP-BACK-LEFT': new Vector3(-1, 1, -1).normalize(),
  'TOP-BACK-RIGHT': new Vector3(1, 1, -1).normalize(),
}

export function buildCubeGeometry(halfSize = 25, bevel = 6.5): CubeRegion[] {
  const S = halfSize
  const F = halfSize - bevel
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

  const makeRegion = (id: string, type: 'face' | 'edge' | 'corner', normal: Vector3, vertices: Vector3[], label?: string): CubeRegion => {
    const center = new Vector3()
    vertices.forEach((p) => center.add(p))
    center.divideScalar(vertices.length)
    return { id, label, type, normal: normal.clone().normalize(), vertices, center }
  }

  const regions: CubeRegion[] = [
    // 5 Faces
    makeRegion('TOP', 'face', v(0, 1, 0), [v(-F, S, -F), v(F, S, -F), v(F, S, F), v(-F, S, F)], 'TOP'),
    makeRegion('FRONT', 'face', v(0, 0, 1), [v(-F, -F, S), v(F, -F, S), v(F, F, S), v(-F, F, S)], 'FRONT'),
    makeRegion('BACK', 'face', v(0, 0, -1), [v(F, -F, -S), v(-F, -F, -S), v(-F, F, -S), v(F, F, -S)], 'BACK'),
    makeRegion('RIGHT', 'face', v(1, 0, 0), [v(S, -F, F), v(S, -F, -F), v(S, F, -F), v(S, F, F)], 'RIGHT'),
    makeRegion('LEFT', 'face', v(-1, 0, 0), [v(-S, -F, -F), v(-S, -F, F), v(-S, F, F), v(-S, F, -F)], 'LEFT'),

    // Upper edges and decorative vertical bevels (no horizontal-diagonal preset).
    makeRegion('TOP-FRONT', 'edge', v(0, 1, 1), [v(-F, S, F), v(F, S, F), v(F, F, S), v(-F, F, S)]),
    makeRegion('TOP-BACK', 'edge', v(0, 1, -1), [v(F, S, -F), v(-F, S, -F), v(-F, F, -S), v(F, F, -S)]),
    makeRegion('TOP-LEFT', 'edge', v(-1, 1, 0), [v(-F, S, -F), v(-F, S, F), v(-S, F, F), v(-S, F, -F)]),
    makeRegion('TOP-RIGHT', 'edge', v(1, 1, 0), [v(F, S, F), v(F, S, -F), v(S, F, -F), v(S, F, F)]),

    makeRegion('FRONT-LEFT', 'edge', v(-1, 0, 1), [v(-S, -F, F), v(-S, F, F), v(-F, F, S), v(-F, -F, S)]),
    makeRegion('FRONT-RIGHT', 'edge', v(1, 0, 1), [v(F, -F, S), v(F, F, S), v(S, F, F), v(S, -F, F)]),
    makeRegion('BACK-LEFT', 'edge', v(-1, 0, -1), [v(-F, -F, -S), v(-F, F, -S), v(-S, F, -F), v(-S, -F, -F)]),
    makeRegion('BACK-RIGHT', 'edge', v(1, 0, -1), [v(S, -F, -F), v(S, F, -F), v(F, F, -S), v(F, -F, -S)]),

    // 4 Upper Corners
    makeRegion('TOP-FRONT-RIGHT', 'corner', v(1, 1, 1), [v(F, S, F), v(S, F, F), v(F, F, S)]),
    makeRegion('TOP-FRONT-LEFT', 'corner', v(-1, 1, 1), [v(-F, S, F), v(-F, F, S), v(-S, F, F)]),
    makeRegion('TOP-BACK-RIGHT', 'corner', v(1, 1, -1), [v(F, S, -F), v(F, F, -S), v(S, F, -F)]),
    makeRegion('TOP-BACK-LEFT', 'corner', v(-1, 1, -1), [v(-F, S, -F), v(-S, F, -F), v(-F, F, -S)]),

  ]

  return regions
}

export function projectCube(
  regions: CubeRegion[],
  quaternion: Quaternion,
  centerX = 68,
  centerY = 68
): ProjectedPolygon[] {
  const inv = quaternion.clone().invert()
  const projected: ProjectedPolygon[] = []

  for (const region of regions) {
    const normalCam = region.normal.clone().applyQuaternion(inv)
    // Only polygons facing towards camera are visible (normalCam.z > 0)
    if (normalCam.z <= -0.01) continue

    const pts = region.vertices.map((p) => {
      const pc = p.clone().applyQuaternion(inv)
      return {
        x: Math.round((centerX + pc.x) * 10) / 10,
        y: Math.round((centerY - pc.y) * 10) / 10,
        z: pc.z,
      }
    })

    const centerCam = region.center.clone().applyQuaternion(inv)
    const pointsStr = pts.map((p) => `${p.x},${p.y}`).join(' ')
    let labelTransform: string | undefined
    if (region.type === 'face') {
      const right = region.normal.y > 0 ? new Vector3(1, 0, 0) : new Vector3().crossVectors(new Vector3(0, 1, 0), region.normal)
      const up = region.normal.y > 0 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0)
      right.applyQuaternion(inv); up.applyQuaternion(inv)
      const values = [right.x, -right.y, -up.x, up.y, centerX + centerCam.x, centerY - centerCam.y]
      labelTransform = `matrix(${values.map(value => Math.round(value * 10000) / 10000).join(' ')})`
    }

    projected.push({
      id: region.id,
      label: region.label,
      type: region.type,
      points: pointsStr,
      centerDepth: centerCam.z,
      normalDepth: normalCam.z,
      centerX: Math.round((centerX + centerCam.x) * 10) / 10,
      centerY: Math.round((centerY - centerCam.y) * 10) / 10,
      labelTransform,
    })
  }

  // Sort visible polygons by depth from back to front
  projected.sort((a, b) => a.centerDepth - b.centerDepth)
  return projected
}

export function projectCompass(quaternion: Quaternion, radius = 49, centerX = 55, centerY = 68) {
  const direction = new Vector3(0, 0, 1).applyQuaternion(quaternion)
  const right = new Vector3(1, 0, 0).applyQuaternion(quaternion)
  // Keep the ring readable edge-on; at TOP derive heading from the screen-right axis.
  const yaw = Math.hypot(direction.x, direction.z) > 1e-6
    ? Math.atan2(direction.x, direction.z) : Math.atan2(-right.z, right.x)
  const cardinal = [
    { label: 'W', angle: Math.PI }, { label: 'N', angle: -Math.PI / 2 },
    { label: 'E', angle: 0 }, { label: 'S', angle: Math.PI / 2 },
  ] as const
  return {
    path: `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 1 1 ${centerX + radius} ${centerY} A ${radius} ${radius} 0 1 1 ${centerX - radius} ${centerY} Z`,
    markers: cardinal.map(({ label, angle }) => ({
      label,
      x: Math.round((centerX + Math.cos(angle + yaw) * radius) * 10) / 10,
      y: Math.round((centerY + Math.sin(angle + yaw) * radius) * 10) / 10,
    })),
  }
}
