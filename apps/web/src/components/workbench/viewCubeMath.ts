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
}

export interface CompassPoint {
  label: string
  x: number
  y: number
  depth: number
}

// 26 Orientation Directions (Y-up, +Z Front, +X Right)
export const ORIENTATION_DIRECTIONS: Record<string, Vector3> = {
  // 6 Faces
  TOP: new Vector3(0, 1, 0.0001).normalize(),
  BOTTOM: new Vector3(0, -1, 0.0001).normalize(),
  FRONT: new Vector3(0, 0, 1),
  BACK: new Vector3(0, 0, -1),
  LEFT: new Vector3(-1, 0, 0),
  RIGHT: new Vector3(1, 0, 0),

  // 12 Edges
  'TOP-FRONT': new Vector3(0, 1, 1).normalize(),
  'TOP-BACK': new Vector3(0, 1, -1).normalize(),
  'TOP-LEFT': new Vector3(-1, 1, 0.0001).normalize(),
  'TOP-RIGHT': new Vector3(1, 1, 0.0001).normalize(),
  'BOTTOM-FRONT': new Vector3(0, -1, 1).normalize(),
  'BOTTOM-BACK': new Vector3(0, -1, -1).normalize(),
  'BOTTOM-LEFT': new Vector3(-1, -1, 0.0001).normalize(),
  'BOTTOM-RIGHT': new Vector3(1, -1, 0.0001).normalize(),
  'FRONT-LEFT': new Vector3(-1, 0, 1).normalize(),
  'FRONT-RIGHT': new Vector3(1, 0, 1).normalize(),
  'BACK-LEFT': new Vector3(-1, 0, -1).normalize(),
  'BACK-RIGHT': new Vector3(1, 0, -1).normalize(),

  // 8 Corners
  'TOP-FRONT-LEFT': new Vector3(-1, 1, 1).normalize(),
  'TOP-FRONT-RIGHT': new Vector3(1, 1, 1).normalize(),
  'TOP-BACK-LEFT': new Vector3(-1, 1, -1).normalize(),
  'TOP-BACK-RIGHT': new Vector3(1, 1, -1).normalize(),
  'BOTTOM-FRONT-LEFT': new Vector3(-1, -1, 1).normalize(),
  'BOTTOM-FRONT-RIGHT': new Vector3(1, -1, 1).normalize(),
  'BOTTOM-BACK-LEFT': new Vector3(-1, -1, -1).normalize(),
  'BOTTOM-BACK-RIGHT': new Vector3(1, -1, -1).normalize(),
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
    // 6 Faces
    makeRegion('TOP', 'face', v(0, 1, 0), [v(-F, S, -F), v(F, S, -F), v(F, S, F), v(-F, S, F)], 'TOP'),
    makeRegion('BOTTOM', 'face', v(0, -1, 0), [v(-F, -S, F), v(F, -S, F), v(F, -S, -F), v(-F, -S, -F)], 'BOTTOM'),
    makeRegion('FRONT', 'face', v(0, 0, 1), [v(-F, -F, S), v(F, -F, S), v(F, F, S), v(-F, F, S)], 'FRONT'),
    makeRegion('BACK', 'face', v(0, 0, -1), [v(F, -F, -S), v(-F, -F, -S), v(-F, F, -S), v(F, F, -S)], 'BACK'),
    makeRegion('RIGHT', 'face', v(1, 0, 0), [v(S, -F, F), v(S, -F, -F), v(S, F, -F), v(S, F, F)], 'RIGHT'),
    makeRegion('LEFT', 'face', v(-1, 0, 0), [v(-S, -F, -F), v(-S, -F, F), v(-S, F, F), v(-S, F, -F)], 'LEFT'),

    // 12 Edges
    makeRegion('TOP-FRONT', 'edge', v(0, 1, 1), [v(-F, S, F), v(F, S, F), v(F, F, S), v(-F, F, S)]),
    makeRegion('TOP-BACK', 'edge', v(0, 1, -1), [v(F, S, -F), v(-F, S, -F), v(-F, F, -S), v(F, F, -S)]),
    makeRegion('TOP-LEFT', 'edge', v(-1, 1, 0), [v(-F, S, -F), v(-F, S, F), v(-S, F, F), v(-S, F, -F)]),
    makeRegion('TOP-RIGHT', 'edge', v(1, 1, 0), [v(F, S, F), v(F, S, -F), v(S, F, -F), v(S, F, F)]),

    makeRegion('BOTTOM-FRONT', 'edge', v(0, -1, 1), [v(-F, -F, S), v(F, -F, S), v(F, -S, F), v(-F, -S, F)]),
    makeRegion('BOTTOM-BACK', 'edge', v(0, -1, -1), [v(F, -F, -S), v(-F, -F, -S), v(-F, -S, -F), v(F, -S, -F)]),
    makeRegion('BOTTOM-LEFT', 'edge', v(-1, -1, 0), [v(-S, -F, -F), v(-S, -F, F), v(-F, -S, F), v(-F, -S, -F)]),
    makeRegion('BOTTOM-RIGHT', 'edge', v(1, -1, 0), [v(S, -F, F), v(S, -F, -F), v(F, -S, -F), v(F, -S, F)]),

    makeRegion('FRONT-LEFT', 'edge', v(-1, 0, 1), [v(-S, -F, F), v(-S, F, F), v(-F, F, S), v(-F, -F, S)]),
    makeRegion('FRONT-RIGHT', 'edge', v(1, 0, 1), [v(F, -F, S), v(F, F, S), v(S, F, F), v(S, -F, F)]),
    makeRegion('BACK-LEFT', 'edge', v(-1, 0, -1), [v(-F, -F, -S), v(-F, F, -S), v(-S, F, -F), v(-S, -F, -F)]),
    makeRegion('BACK-RIGHT', 'edge', v(1, 0, -1), [v(S, -F, -F), v(S, F, -F), v(F, F, -S), v(F, -F, -S)]),

    // 8 Corners
    makeRegion('TOP-FRONT-RIGHT', 'corner', v(1, 1, 1), [v(F, S, F), v(S, F, F), v(F, F, S)]),
    makeRegion('TOP-FRONT-LEFT', 'corner', v(-1, 1, 1), [v(-F, S, F), v(-F, F, S), v(-S, F, F)]),
    makeRegion('TOP-BACK-RIGHT', 'corner', v(1, 1, -1), [v(F, S, -F), v(F, F, -S), v(S, F, -F)]),
    makeRegion('TOP-BACK-LEFT', 'corner', v(-1, 1, -1), [v(-F, S, -F), v(-S, F, -F), v(-F, F, -S)]),

    makeRegion('BOTTOM-FRONT-RIGHT', 'corner', v(1, -1, 1), [v(F, -S, F), v(F, -F, S), v(S, -F, F)]),
    makeRegion('BOTTOM-FRONT-LEFT', 'corner', v(-1, -1, 1), [v(-F, -S, F), v(-S, -F, F), v(-F, -F, S)]),
    makeRegion('BOTTOM-BACK-RIGHT', 'corner', v(1, -1, -1), [v(F, -S, -F), v(S, -F, -F), v(F, -F, -S)]),
    makeRegion('BOTTOM-BACK-LEFT', 'corner', v(-1, -1, -1), [v(-F, -S, -F), v(-F, -F, -S), v(-S, -F, -F)]),
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

    projected.push({
      id: region.id,
      label: region.label,
      type: region.type,
      points: pointsStr,
      centerDepth: centerCam.z,
      normalDepth: normalCam.z,
      centerX: Math.round((centerX + centerCam.x) * 10) / 10,
      centerY: Math.round((centerY - centerCam.y) * 10) / 10,
    })
  }

  // Sort visible polygons by depth from back to front
  projected.sort((a, b) => a.centerDepth - b.centerDepth)
  return projected
}

export function projectCompass(
  quaternion: Quaternion,
  radius = 48,
  baseY = -27,
  centerX = 68,
  centerY = 68
): { path: string; markers: CompassPoint[] } {
  const inv = quaternion.clone().invert()
  const points: { x: number; y: number; z: number }[] = []
  const steps = 36

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2
    const p = new Vector3(radius * Math.sin(theta), baseY, radius * Math.cos(theta)).applyQuaternion(inv)
    points.push({
      x: Math.round((centerX + p.x) * 10) / 10,
      y: Math.round((centerY - p.y) * 10) / 10,
      z: p.z,
    })
  }

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  // Cardinal markers: N (-Z), S (+Z), E (+X), W (-X)
  const cardinal = [
    { label: 'N', vec: new Vector3(0, baseY, -radius - 8) },
    { label: 'S', vec: new Vector3(0, baseY, radius + 8) },
    { label: 'E', vec: new Vector3(radius + 8, baseY, 0) },
    { label: 'W', vec: new Vector3(-radius - 8, baseY, 0) },
  ]

  const markers: CompassPoint[] = cardinal.map(({ label, vec }) => {
    const pc = vec.applyQuaternion(inv)
    return {
      label,
      x: Math.round((centerX + pc.x) * 10) / 10,
      y: Math.round((centerY - pc.y) * 10) / 10,
      depth: pc.z,
    }
  })

  return { path, markers }
}
