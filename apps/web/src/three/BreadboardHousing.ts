import { CanvasTexture, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape, ShapeGeometry } from 'three'
import { addBreadboardSockets, SOCKET_HALF_OPENING } from './BreadboardSockets'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { BREADBOARD_GEOMETRY as g, getBreadboardGeometrySpec } from '../geometry/BreadboardGeometrySpec'
import { stabilizeThinSurface } from './StudioEnvironment'

// Shared by untextured ABS and its artwork; leave headroom under direct light.
export const BREADBOARD_PLASTIC_COLOR = '#d5d6d3'

// Visual housing only. These contours and recesses never define electrical nets.
export function addBreadboardHousing(group: Group, type: string, color: string, texture: CanvasTexture | null) {
  const spec = getBreadboardGeometrySpec(type)!, [w, h, d] = spec.size
  const points: [number, number][] = spec.outline.map(p => [p.x, p.z])
  const shape = () => {
    const result = new Shape()
    points.forEach(([x, z], i) => i ? result.lineTo(x, -z) : result.moveTo(x, -z))
    result.closePath()
    return result
  }
  const baseShape = shape(), deckShape = shape()
  function slot(z: number, width: number) {
    const left = -w / 2 + g.slotEndInset, right = w / 2 - g.slotEndInset
    const path = new Path()
    path.moveTo(left, -z - width / 2); path.lineTo(right, -z - width / 2)
    path.lineTo(right, -z + width / 2); path.lineTo(left, -z + width / 2); path.closePath()
    deckShape.holes.push(path)
  }
  if (spec.terminal) slot(0, g.terminalSlotWidth)
  if (spec.rails) { slot(-g.railSlotPosition, g.railSlotWidth); slot(g.railSlotPosition, g.railSlotWidth) }
  const topology = getBreadboardTopology(type)!
  const sockets: [number, number][] = topology.contacts.map(c => [c.localPosition[0], c.localPosition[2]])
  for (const [x, z] of sockets) {
    const r = SOCKET_HALF_OPENING, path = new Path()
    path.moveTo(x - r, -z - r); path.lineTo(x + r, -z - r)
    path.lineTo(x + r, -z + r); path.lineTo(x - r, -z + r); path.closePath()
    deckShape.holes.push(path)
  }
  const body = (profile: Shape, height: number, y: number, bodyColor: string) => {
    const matingInset = g.bevelInset - g.visualSeamCompensation
    const geometry = new ExtrudeGeometry(profile, { depth: height, bevelEnabled: true, bevelSize: matingInset, bevelOffset: -matingInset, bevelThickness: g.bevelThickness, bevelSegments: 1, curveSegments: 1 })
    geometry.rotateX(-Math.PI / 2)
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: bodyColor, roughness: 0.82, metalness: 0 }))
    mesh.receiveShadow = true
    mesh.position.y = y; group.add(mesh)
    return mesh
  }
  body(baseShape, g.baseHeight, g.baseY, '#c6cbd0')
  const deck = body(deckShape, h - g.baseHeight, g.deckY, color)
  deck.receiveShadow = true
  deck.userData.breadboardDeck = true
  if (texture) {
    const geometry = new ShapeGeometry(deckShape)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
    for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) + w / 2) / w, 0.5 - positions.getZ(i) / d)
    const face = new Mesh(geometry, stabilizeThinSurface(new MeshStandardMaterial({ map: texture, roughness: 0.86, metalness: 0 })))
    face.name = 'breadboard-artwork'
    face.receiveShadow = true
    face.position.y = h + g.artworkOffset; group.add(face)
  }
  group.userData.selectionProfile = points
  group.userData.selectionHeight = h + g.artworkOffset + 0.001
  group.userData.breadboardDockingProfile = spec.sides
  addBreadboardSockets(group, sockets, h, type)
}
