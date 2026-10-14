import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three'
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

test('completed and preview jumpers have real narrower copper pins and insulation ends above the socket', () => {
  const positions: Record<string, Vector3> = { 'BB.contact:A': new Vector3(0, .309, 0), 'BB.contact:B': new Vector3(1, .309, 1) }
  const context = { modulePose: () => ({ id: 'BB', type: 'BREADBOARD' }), endpoint: (endpoint: string) => positions[endpoint] ? { endpoint, position: positions[endpoint], contactModuleId: 'BB' } : null }
  const layer = createWireLayer(e => positions[e] ?? null, context)
  const visual = { ...defaultWireVisual(), routeMode: 'FREE' as const, thickness: .052, height: .04 }
  const wire = { source: 'BB.contact:A', destination: 'BB.contact:B', metadata: { wireVisual: visual } }, saved = JSON.stringify(wire)
  try {
    layer.sync([wire])
    const body = layer.group.children[0] as Mesh
    for (const name of ['wire-terminal-source', 'wire-terminal-destination']) {
      const core = body.getObjectByName(name) as Mesh
      assert.ok(core instanceof Mesh, 'terminal must be actual metal geometry')
      assert.equal(core.geometry.type, 'CylinderGeometry')
      assert.ok(core.scale.x < .026 && core.scale.x > .008)
      assert.ok((core.material as import('three').MeshStandardMaterial).metalness > .5)
      const tip = core.localToWorld(new Vector3(0, -.5, 0))
      assert.ok(tip.distanceTo(name.endsWith('source') ? positions[wire.source] : positions[wire.destination]) < 1e-8)
    }
    const vertices = body.geometry.getAttribute('position')
    assert.ok(Array.from({ length: vertices.count }, (_, i) => vertices.getY(i)).every(y => y > .335), 'red insulation ends above the plastic deck, copper alone enters the hole')
    layer.previewDrawing({ source: wire.source, destination: '' }, visual, { x: .5, y: .37, z: -.5 }); layer.flush()
    const preview = layer.tools.getObjectByName('wire-drawing-preview') as Mesh
    const free = preview.getObjectByName('wire-terminal-free') as Mesh
    assert.ok(free instanceof Mesh)
    assert.ok(free.localToWorld(new Vector3(0, -.5, 0)).distanceTo(new Vector3(.5, .37, -.5)) < 1e-8)
    layer.previewDrawing({ source: wire.source, destination: '' }, { ...visual, controlPoints: [{ space: 'world', position: { x: .5, y: .37, z: -.5 } }] }, { x: .9, y: .37, z: .3 }); layer.flush()
    assert.equal(preview.getObjectByName('wire-terminal-free'), free, 'one moving free copper tip, no terminal at each bend')
    assert.ok(free.localToWorld(new Vector3(0, -.5, 0)).distanceTo(new Vector3(.9, .37, .3)) < 1e-8)
    assert.equal(JSON.stringify(wire), saved)
  } finally { layer.dispose() }
})

test('selected user handles stay small in screen pixels at close zoom without rebuilding the wire', () => {
  const layer = createWireLayer(e => new Vector3(e.endsWith('OUT') ? 0 : 1, .37, e.endsWith('OUT') ? 0 : 1))
  const wire = { source: 'A.OUT', destination: 'B.IN', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', controlPoints: [{ space: 'world', position: { x: .26, y: .37, z: 0 } }] } } }
  try {
    layer.sync([wire]); layer.highlight(wire)
    const geometry = (layer.group.children[0] as Mesh).geometry, camera = new PerspectiveCamera(42, 1000 / 700, .005, 150)
    camera.up.set(0, 0, -1)
    const update = Reflect.get(layer, 'updateCamera') as (camera: PerspectiveCamera, height: number) => void
    assert.equal(typeof update, 'function')
    for (const height of [1.5, .4]) {
      camera.position.set(.26, height, 0); camera.lookAt(.26, .37, 0); camera.updateMatrixWorld()
      update(camera, 700)
      const handles = layer.tools.getObjectByName('wire-handles') as InstancedMesh, matrix = new Matrix4()
      handles.getMatrixAt(0, matrix)
      const point = new Vector3().setFromMatrixPosition(matrix), scale = new Vector3().setFromMatrixScale(matrix).x
      const center = point.clone().project(camera), edge = point.clone().add(new Vector3(.04 * scale, 0, 0)).project(camera)
      const pixels = Math.abs(edge.x - center.x) * 500
      assert.ok(pixels >= 2.5 && pixels <= 4.5, 'handle is legible without covering the enlarged insulation')
      assert.equal((layer.group.children[0] as Mesh).geometry, geometry)
    }
  } finally { layer.dispose() }
})

test('deleting a wire or preview does not dispose shared copper resources still used by other jumpers', () => {
  const layer = createWireLayer(e => new Vector3(e.endsWith('OUT') ? 0 : 2, .37, e.startsWith('C') || e.startsWith('D') ? 1 : 0))
  const first = { source: 'A.OUT', destination: 'B.IN' }, second = { source: 'C.OUT', destination: 'D.IN' }
  try {
    layer.sync([first, second])
    const copper = layer.group.children[0].getObjectByName('wire-terminal-source') as Mesh, other = layer.group.children[1].getObjectByName('wire-terminal-source') as Mesh
    assert.equal(copper.geometry, other.geometry); assert.equal(copper.material, other.material)
    let geometryDisposals = 0, materialDisposals = 0
    copper.geometry.addEventListener('dispose', () => geometryDisposals++)
    ;(copper.material as import('three').Material).addEventListener('dispose', () => materialDisposals++)
    layer.sync([second]); assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0)
    layer.previewDrawing({ source: second.source, destination: '' }, defaultWireVisual(), { x: .5, y: .37, z: 1.5 }); layer.flush(); layer.clearDrawing()
    assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, 0)
    layer.dispose(); layer.dispose()
    assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1)
  } finally { layer.dispose() }
})
