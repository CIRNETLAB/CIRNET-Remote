import assert from 'node:assert/strict'
import { Vector3, type BufferGeometry } from 'three'

export function assertHealthyWireGeometry(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), indices = geometry.index!
  assert.ok([...positions.array].every(Number.isFinite))
  assert.ok([...normals.array].every(Number.isFinite))
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
    const point = (index: number) => new Vector3().fromBufferAttribute(positions, index)
    const area = point(ids[1]).sub(point(ids[0])).cross(point(ids[2]).sub(point(ids[0])))
    assert.ok(area.lengthSq() > 1e-20, 'wire face must have nonzero area')
    const normal = ids.reduce((sum, index) => sum.add(new Vector3().fromBufferAttribute(normals, index)), new Vector3())
    assert.ok(area.dot(normal) >= -1e-10, 'wire face must not fold inward')
  }
}
