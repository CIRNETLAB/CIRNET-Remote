import { BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'

export type SocketPosition = [number, number]
export const SOCKET_HALF_OPENING = 0.037

// Compatibility view over the declared topology; coordinates never define conductivity.
export function breadboardSocketPositions(terminal: boolean, rails: boolean): SocketPosition[] {
  return getBreadboardTopology(terminal ? rails ? 'BREADBOARD' : 'BREADBOARD_630' : 'BREADBOARD_100')!.contacts.map(c => [c.localPosition[0], c.localPosition[2]])
}

export function addBreadboardSockets(group: Group, positions: SocketPosition[], height: number, type?: string) {
  const vertices: number[] = [], colors: number[] = []
  const corners = (radius: number, y: number) => [[-radius, y, -radius], [radius, y, -radius], [radius, y, radius], [-radius, y, radius]]
  const mouth = corners(SOCKET_HALF_OPENING, 0.030), throat = corners(0.024, 0.009), floor = corners(0.024, -0.070)
  const quad = (a: number[], b: number[], c: number[], d: number[], color: string) => {
    const rgb = new Color(color).toArray()
    for (const point of [a, d, b, b, d, c]) { vertices.push(...point); colors.push(...rgb) }
  }
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4
    quad(mouth[i], mouth[next], throat[next], throat[i], '#bdc4c9')
    quad(throat[i], throat[next], floor[next], floor[i], '#65727b')
  }
  quad(floor[0], floor[1], floor[2], floor[3], '#17222b')
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals()
  const sockets = new InstancedMesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), positions.length)
  const matrix = new Matrix4()
  positions.forEach(([x, z], index) => sockets.setMatrixAt(index, matrix.makeTranslation(x, height, z)))
  sockets.instanceMatrix.needsUpdate = true; sockets.userData.breadboardSockets = true
  if (type) {
    const topology = getBreadboardTopology(type)!
    sockets.userData.topologyId = topology.id
    sockets.userData.contactIds = topology.contacts.map(c => c.contactId)
  }
  group.add(sockets)
}
