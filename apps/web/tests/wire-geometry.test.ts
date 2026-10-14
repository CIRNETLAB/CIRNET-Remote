import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { buildWireGeometry, roundedWirePoints } from '../src/three/WireGeometry'
import { assertHealthyWireGeometry } from './helpers/wireGeometryAssertions'

test('jumper corners are tangent circular fillets contained by the XZ route, with pinned endpoints', () => {
  const points = [{ x: 0, y: .37, z: 0 }, { x: 1, y: .37, z: 0 }, { x: 1, y: .37, z: 1 }]
  const rounded = roundedWirePoints(points), center = new Vector3(.935, .37, .065)
  assert.ok(rounded[0].equals(new Vector3(0, .37, 0)))
  assert.ok(rounded.at(-1)!.equals(new Vector3(1, .37, 1)))
  for (const point of rounded) {
    assert.ok(point.x >= 0 && point.x <= 1 + 1e-10 && point.z >= -1e-10 && point.z <= 1)
    assert.equal(point.y, .37)
  }
  const arc = rounded.slice(1, -1)
  assert.ok(arc.length >= 9, 'short curves have smooth angular sampling; straight runs are not subdivided')
  for (const point of arc) assert.ok(Math.abs(point.distanceTo(center) - .065) < 1e-8)
  const start = arc[1].clone().sub(arc[0]).normalize(), end = arc.at(-1)!.clone().sub(arc.at(-2)!).normalize()
  assert.ok(start.dot(new Vector3(1, 0, 0)) > .99)
  assert.ok(end.dot(new Vector3(0, 0, 1)) > .99)
})

test('short and coincident jumper runs retain finite positions and unit normals', () => {
  for (const points of [
    [{ x: 0, y: .309, z: 0 }, { x: 0, y: .37, z: 0 }, { x: .02, y: .37, z: 0 }, { x: .02, y: .309, z: 0 }],
    [{ x: 0, y: .37, z: 0 }, { x: 0, y: .37, z: 0 }, { x: 1, y: .37, z: 0 }],
  ]) {
    const geometry = buildWireGeometry({ points, handles: [], segments: [], frameModuleId: null, materializedControlPoints: [] }, .052)
    try {
      assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite))
      const normals = geometry.getAttribute('normal')
      for (let i = 0; i < normals.count; i++) assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-6)
    } finally { geometry.dispose() }
  }
})

test('legacy and new contact insertion elbows have no folded tube faces', () => {
  for (const height of [.36, .37]) {
    const geometry = buildWireGeometry({ points: [{ x: 0, y: .309, z: 0 }, { x: 0, y: height, z: 0 }, { x: 2, y: height, z: 0 }], handles: [], segments: [], frameModuleId: null, materializedControlPoints: [] }, .052)
    try {
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index!
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2)
        const point = (index: number) => new Vector3().fromBufferAttribute(positions, index)
        const face = point(b).sub(point(a)).cross(point(c).sub(point(a)))
        const average = new Vector3().fromBufferAttribute(normals, a).add(new Vector3().fromBufferAttribute(normals, b)).add(new Vector3().fromBufferAttribute(normals, c))
        assert.ok(face.dot(average) >= -1e-10, 'the visible tube must not fold inward at the socket elbow')
      }
    } finally { geometry.dispose() }
  }
})

test('straight diagonal insulation is sealed and short 3D corners do not produce degenerate or inverted faces', () => {
  const paths = [
    [{ x: 0, y: .37, z: 0 }, { x: 2, y: .37, z: 2 }],
    [{ x: 0, y: .37, z: 0 }, { x: .03, y: .37, z: 0 }, { x: .03, y: .37, z: .03 }, { x: .03, y: .4, z: .03 }, { x: .4, y: .4, z: .4 }],
  ]
  for (const [pathIndex, points] of paths.entries()) {
    const geometry = buildWireGeometry({ points, handles: [], segments: [], frameModuleId: null, materializedControlPoints: [] }, .052)
    try {
      const vertices = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index!, edges = new Map<string, number>()
      const vertex = (i: number) => new Vector3().fromBufferAttribute(vertices, i)
      const key = (i: number) => vertex(i).toArray().map(value => Math.round(value * 1e6)).join(',')
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)], [a, b, c] = ids
        const face = vertex(b).sub(vertex(a)).cross(vertex(c).sub(vertex(a)))
        assert.ok(face.lengthSq() > 1e-20, 'no zero-area tube triangles')
        const average = ids.reduce((normal, id) => normal.add(new Vector3().fromBufferAttribute(normals, id)), new Vector3())
        assert.ok(face.dot(average) >= -1e-10, 'short corners must not fold inward')
        for (let side = 0; side < 3; side++) { const edge = [key(ids[side]), key(ids[(side + 1) % 3])].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1) }
      }
      if (pathIndex === 0) assert.ok([...edges.values()].every(count => count === 2), 'insulation end caps close the tube')
    } finally { geometry.dispose() }
  }
})

test('very short shallow FREE corners use bounded fillets rather than full-radius sharp rings', () => {
  for (const [length, degrees] of [[.001, 2.55], [.0001, 1], [.0001, 2.55], [.01, 1]]) {
    const angle = degrees * Math.PI / 180
    const points = [{ x: 0, y: .37, z: 0 }, { x: length, y: .37, z: 0 }, { x: length * (1 + Math.cos(angle)), y: .37, z: length * Math.sin(angle) }]
    const geometry = buildWireGeometry({ points }, .052)
    try { assertHealthyWireGeometry(geometry) } finally { geometry.dispose() }
  }
})

test('an intentional antiparallel return stays finite in both the body and the unsplit picking polyline', () => {
  const points = [{ x: 0, y: .37, z: 0 }, { x: 1, y: .37, z: 0 }, { x: 0, y: .37, z: 0 }]
  const rounded = roundedWirePoints(points)
  assert.ok(rounded.every(point => point.toArray().every(Number.isFinite)))
  assert.ok(rounded.some(point => point.distanceTo(new Vector3(1, .37, 0)) < 1e-8), 'an intentional return cannot be erased')
  const geometry = buildWireGeometry({ points }, .052)
  try { assertHealthyWireGeometry(geometry) } finally { geometry.dispose() }
})

test('render-only nearly collinear cleanup avoids sub-Float32 fillet faces at board coordinates', () => {
  const angle = .0001 * Math.PI / 180
  const points = [{ x: -4.03, y: .37, z: 0 }, { x: -3.03, y: .37, z: 0 }, { x: -3.03 + Math.cos(angle), y: .37, z: Math.sin(angle) }]
  const geometry = buildWireGeometry({ points }, .052)
  try { assertHealthyWireGeometry(geometry) } finally { geometry.dispose() }
})

test('insulation keeps full diameter through tight flat corners and endpoint transitions', () => {
  for (const points of [
    [{ x: 0, y: .37, z: 0 }, { x: .02, y: .37, z: 0 }, { x: .02, y: .37, z: .02 }, { x: .4, y: .37, z: .02 }],
    [{ x: 0, y: .37, z: 0 }, { x: .03, y: .37, z: .01 }, { x: .01, y: .37, z: .04 }, { x: .4, y: .37, z: .3 }],
  ]) {
    const geometry = buildWireGeometry({ points }, .052)
    try {
      assertHealthyWireGeometry(geometry)
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
      let measured = 0
      for (let i = 0; i < positions.count; i++) if (Math.abs(normals.getY(i)) > .9) {
        assert.ok(Math.abs(positions.getY(i) - .37 - normals.getY(i) * .026) < 1e-6, 'every vertical radius sample stays full size; no tapered corner rings')
        measured++
      }
      assert.ok(measured >= 4)
    } finally { geometry.dispose() }
  }
})

test('sub-Float32 arcs use a full-radius safe joint after boards move away from the origin', () => {
  for (const offset of [20, 100]) for (const degrees of [.0007, .001, .003]) {
    const angle = degrees * Math.PI / 180, points = [{ x: offset, y: .37, z: 0 }, { x: offset + 1, y: .37, z: 0 }, { x: offset + 1 + Math.cos(angle), y: .37, z: Math.sin(angle) }]
    const geometry = buildWireGeometry({ points }, .052)
    try { assertHealthyWireGeometry(geometry) } finally { geometry.dispose() }
  }
})
