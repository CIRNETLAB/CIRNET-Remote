import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, Vector3 } from 'three'
import { createWireLayer } from '../src/three/WireLayer'
import { defaultWireVisual } from '../src/wires/wireVisual'
import type { CircuitConnection } from '../src/types/circuit'

test('wire layer renders explicit low routes and changes color without replacing geometry', () => {
  const positions: Record<string, Vector3> = { 'A.OUT': new Vector3(0, .36, 0), 'B.IN': new Vector3(2, .36, 2), 'C.OUT': new Vector3(0, .36, 4), 'D.IN': new Vector3(2, .36, 4) }
  const layer = createWireLayer(e => positions[e] ?? null)
  const wire: CircuitConnection = { source: 'A.OUT', destination: 'B.IN', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', color: '#d8493f', controlPoints: [{ space: 'world', position: { x: 2, y: .36, z: 0 } }] } } }
  try {
    layer.sync([wire, { source: 'C.OUT', destination: 'D.IN' }])
    const [mesh, other] = layer.group.children as Mesh[]
    const geometry = mesh.geometry, material = mesh.material, unrelated = other.geometry
    const route = layer.route(wire)!
    assert.deepEqual(route.points, [{ x: 0, y: .36, z: 0 }, { x: 2, y: .36, z: 0 }, { x: 2, y: .36, z: 2 }])
    const points = mesh.geometry.getAttribute('position')
    for (let i = 0; i < points.count; i++) assert.ok(points.getY(i) < .4, 'jumper must not arch high')
    layer.sync([{ ...wire, metadata: { wireVisual: { ...(wire.metadata!.wireVisual as object), color: '#397ec6' } } }, { source: 'C.OUT', destination: 'D.IN' }])
    assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material); assert.equal(other.geometry, unrelated)
    layer.highlight(wire); layer.selectSegment(0)
    assert.equal(layer.tools.getObjectByName('wire-segment-highlight')?.visible, true)
    layer.selectSegment(null)
    assert.equal(layer.tools.getObjectByName('wire-segment-highlight')?.visible, false)
    layer.previewVisual(wire, { ...defaultWireVisual(), controlPoints: [{ space: 'world', position: { x: 3, y: .36, z: 1 } }] })
    layer.flush(); assert.notEqual(mesh.geometry, geometry); assert.equal(other.geometry, unrelated)
    layer.previewVisual(wire, null); layer.flush()
    assert.deepEqual(layer.route(wire)!.points, route.points)
  } finally { layer.dispose() }
  assert.equal(layer.group.children.length, 0)
})

test('hundreds of wires retain unchanged buffers and preview bursts build only their latest route', () => {
  const layer = createWireLayer(e => new Vector3(e.endsWith('OUT') ? 0 : 2, .36, Number(e.split('.')[0].slice(1)) / 10))
  const wires = Array.from({ length: 300 }, (_, i) => ({ source: `A${i}.OUT`, destination: `B${i}.IN` }))
  try {
    layer.sync(wires)
    const meshes = layer.group.children as Mesh[], buffers = meshes.map(m => m.geometry)
    assert.equal(meshes.length, 300)
    layer.sync(wires); assert.ok(meshes.every((m, i) => m.geometry === buffers[i]))
    for (let i = 0; i < 50; i++) layer.previewVisual(wires[0], { ...defaultWireVisual(), controlPoints: [{ space: 'world', position: { x: i / 10, y: .36, z: 1 } }] })
    assert.equal(meshes[0].geometry, buffers[0])
    layer.flush(); assert.notEqual(meshes[0].geometry, buffers[0]); assert.equal(meshes[1].geometry, buffers[1])
    layer.previewDrawing({ source: wires[0].source, destination: '' }, defaultWireVisual(), { x: 2, y: .36, z: 1 })
    layer.flush()
    const preview = layer.tools.getObjectByName('wire-drawing-preview') as Mesh, previewGeometry = preview.geometry
    let disposals = 0
    previewGeometry.addEventListener('dispose', () => disposals++)
    for (let i = 0; i < 30; i++) {
      layer.previewDrawing({ source: wires[0].source, destination: '' }, { ...defaultWireVisual(), color: '#8656a8' }, { x: 2, y: .36, z: 1 })
      layer.flush(); assert.equal(preview.geometry, previewGeometry)
    }
    assert.equal(disposals, 0, 'unchanged path and color-only preview never allocate another buffer')
    layer.clearDrawing(); assert.equal(disposals, 1)
  } finally { layer.dispose() }
})

test('legacy thin wires render round and clearly, with a reusable gold overlay and no graph mutation', () => {
  const layer = createWireLayer(e => new Vector3(e.endsWith('OUT') ? 0 : 2, .36, 0))
  const wire = { source: 'A.OUT', destination: 'B.IN', metadata: { wireVisual: { ...defaultWireVisual(), thickness: .01 } } }
  const snapshot = JSON.stringify(wire)
  try {
    layer.sync([wire])
    const mesh = layer.group.children[0] as Mesh, vertices = mesh.geometry.getAttribute('position')
    assert.ok(vertices.count >= 20, 'round tube must have at least ten vertices per ring')
    const heights = Array.from({ length: vertices.count }, (_, i) => vertices.getY(i))
    assert.ok(Math.max(...heights) - Math.min(...heights) >= .049)
    const geometry = mesh.geometry
    layer.highlight(wire)
    const halo = layer.tools.getObjectByName('wire-selection-outline') as Mesh
    assert.ok(halo?.visible, 'explicit colored wires need a clear gold silhouette')
    const haloGeometry = halo.geometry
    const materialColor = (mesh.material as import('three').MeshStandardMaterial).color.getHexString()
    for (let i = 0; i < 30; i++) { layer.highlight(wire); layer.hover(wire) }
    assert.equal(mesh.geometry, geometry); assert.equal(halo.geometry, haloGeometry)
    assert.equal((mesh.material as import('three').MeshStandardMaterial).color.getHexString(), materialColor)
    assert.equal(JSON.stringify(wire), snapshot)
    layer.highlight(null); assert.equal(halo.visible, false)
    const hover = layer.tools.getObjectByName('wire-hover-outline') as Mesh
    assert.equal(hover.visible, true)
    const hoverGeometry = hover.geometry
    layer.hover(wire); assert.equal(hover.geometry, hoverGeometry)
    let haloDisposals = 0, hoverDisposals = 0
    haloGeometry.addEventListener('dispose', () => haloDisposals++)
    hoverGeometry.addEventListener('dispose', () => hoverDisposals++)
    layer.sync([]); assert.equal(halo.visible, false); assert.equal(hover.visible, false)
    layer.dispose(); layer.dispose()
    assert.equal(haloDisposals, 1); assert.equal(hoverDisposals, 1)
  } finally { layer.dispose() }
})
