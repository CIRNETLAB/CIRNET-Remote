import { ShapeUtils, Vector2 } from 'three'
import { getDefinition } from '../data/editorCatalog'

export type BreadboardSide = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'
export interface ProfilePoint { readonly x: number; readonly z: number }
export interface BreadboardDockingProfile {
  readonly side: BreadboardSide
  readonly normal: ProfilePoint
  readonly tangent: ProfilePoint
  readonly matingPlane: ProfilePoint
  readonly halfSpan: number
  readonly joint: {
    readonly kind: 'male' | 'female'
    readonly family: 'strip' | 'end'
    readonly centers: readonly number[]
    readonly rootHalfWidth: number
    readonly tipHalfWidth: number
    readonly depth: number
    readonly clearance: number
  }
}
export interface BreadboardGeometrySpec {
  readonly type: string
  readonly size: readonly [number, number, number]
  readonly terminal: boolean
  readonly rails: boolean
  readonly sides: readonly BreadboardDockingProfile[]
  readonly outline: readonly ProfilePoint[]
  readonly triangles: readonly (readonly number[])[]
}

// Editor-world units. Clearance is inside the female joint, never a gap between
// the straight mating planes. Keep the original nominal dimensions/socket pitch.
export const BREADBOARD_GEOMETRY = Object.freeze({
  jointClearance: .0015,
  bevelInset: .008,
  visualSeamCompensation: .0075,
  bevelThickness: .008,
  baseHeight: .09,
  baseY: .02,
  deckY: .11,
  artworkOffset: .030,
  slotEndInset: .18,
  terminalSlotWidth: .21,
  railSlotPosition: .93,
  railSlotWidth: .025,
  stripKeyFraction: .3,
  stripRootHalfWidth: .16,
  stripTipHalfWidth: .12,
  stripKeyDepth: .055,
  endRootHalfWidth: .19,
  endTipHalfWidth: .14,
  endKeyDepth: .065,
  captureNormal: .65,
  captureStripTangent: 1.5,
  captureEndTangent: 1.2,
  poseTolerance: .0002,
  collisionTolerance: 1e-7,
})

const specs = new Map<string, BreadboardGeometrySpec>()
export function getBreadboardGeometrySpec(type: string): BreadboardGeometrySpec | null {
  const cached = specs.get(type)
  if (cached) return cached
  const definition = getDefinition(type)
  if (!definition || !['breadboard', 'breadboard_630', 'breadboard_100'].includes(definition.visual)) return null
  const size = Object.freeze([...definition.size]) as readonly [number, number, number]
  const [width, , depth] = size, g = BREADBOARD_GEOMETRY
  const makeSide = (side: BreadboardSide, normal: ProfilePoint, tangent: ProfilePoint, extent: number, halfSpan: number, kind: 'male' | 'female', family: 'strip' | 'end'): BreadboardDockingProfile => {
    const strip = family === 'strip', allowance = kind === 'female' ? g.jointClearance : 0
    return Object.freeze({ side, normal: Object.freeze(normal), tangent: Object.freeze(tangent), matingPlane: Object.freeze({ x: normal.x * extent, z: normal.z * extent }), halfSpan,
      joint: Object.freeze({ kind, family, centers: Object.freeze(strip ? [-width * g.stripKeyFraction, 0, width * g.stripKeyFraction] : [0]),
        rootHalfWidth: (strip ? g.stripRootHalfWidth : g.endRootHalfWidth) + allowance,
        tipHalfWidth: (strip ? g.stripTipHalfWidth : g.endTipHalfWidth) + allowance,
        depth: (strip ? g.stripKeyDepth : g.endKeyDepth) + allowance, clearance: g.jointClearance }) })
  }
  const sides = Object.freeze([
    makeSide('NORTH', { x: 0, z: -1 }, { x: 1, z: 0 }, depth / 2, width / 2, 'male', 'strip'),
    makeSide('EAST', { x: 1, z: 0 }, { x: 0, z: 1 }, width / 2, depth / 2, 'male', 'end'),
    makeSide('SOUTH', { x: 0, z: 1 }, { x: 1, z: 0 }, depth / 2, width / 2, 'female', 'strip'),
    makeSide('WEST', { x: -1, z: 0 }, { x: 0, z: 1 }, width / 2, depth / 2, 'female', 'end'),
  ])
  const outline: ProfilePoint[] = []
  for (const side of sides) {
    const sign = side.side === 'NORTH' || side.side === 'EAST' ? 1 : -1, joint = side.joint
    const point = (along: number, outward = 0) => outline.push(Object.freeze({ x: side.matingPlane.x + side.tangent.x * along + side.normal.x * outward, z: side.matingPlane.z + side.tangent.z * along + side.normal.z * outward }))
    point(-sign * side.halfSpan)
    for (const center of [...joint.centers].sort((a, b) => sign * (a - b))) {
      const outward = (joint.kind === 'male' ? 1 : -1) * joint.depth
      point(center - sign * joint.rootHalfWidth); point(center - sign * joint.tipHalfWidth, outward)
      point(center + sign * joint.tipHalfWidth, outward); point(center + sign * joint.rootHalfWidth)
    }
  }
  const triangles = ShapeUtils.triangulateShape(outline.map(p => new Vector2(p.x, p.z)), []).map(t => Object.freeze(t))
  const spec = Object.freeze({ type, size, terminal: definition.visual !== 'breadboard_100', rails: definition.visual === 'breadboard', sides, outline: Object.freeze(outline), triangles: Object.freeze(triangles) })
  specs.set(type, spec)
  return spec
}
