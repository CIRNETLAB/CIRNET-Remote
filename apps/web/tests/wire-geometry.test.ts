import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { buildWireGeometry, roundedWirePoints } from '../src/three/WireGeometry'

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
