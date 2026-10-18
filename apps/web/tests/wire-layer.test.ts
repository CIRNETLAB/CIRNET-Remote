import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { createWireLayer } from '../src/three/WireLayer'
import { defaultWireVisual, readWireVisual } from '../src/wires/wireVisual'
import type { CircuitConnection } from '../src/types/circuit'
import { deriveWireParts } from '../src/three/WireTerminals'
import { solveWireRoute } from '../src/wires/wireRouting'
import { assertHealthyWireGeometry } from './helpers/wireGeometryAssertions'

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
    assert.equal(layer.tools.getObjectByName('wire-segment-hover-line')?.visible, true)
    assert.equal(layer.tools.getObjectByName('wire-segment-highlight'), undefined)
    layer.selectSegment(null)
    assert.equal(layer.tools.getObjectByName('wire-segment-hover-line')?.visible, false)
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
    layer.flush(); assert.notEqual(meshes[0].geometry, buffers[0]); assert.ok(meshes[20].geometry === buffers[20], 'wire at z=2 is outside the edited route crossing group')
    layer.previewVisual(wires[0],null);layer.flush()
    layer.previewDrawing({ source: wires[0].source, destination: '' }, defaultWireVisual(), { x: 2, y: .36, z: -1 })
    layer.flush()
    const preview = layer.tools.getObjectByName('wire-drawing-preview') as Mesh, previewGeometry = preview.geometry
    let disposals = 0
    previewGeometry.addEventListener('dispose', () => disposals++)
    for (let i = 0; i < 30; i++) {
      layer.previewDrawing({ source: wires[0].source, destination: '' }, { ...defaultWireVisual(), color: '#8656a8' }, { x: 2, y: .36, z: -1 })
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
    const core=body.getObjectByName('wire-conductor') as Mesh
    assert.ok(core instanceof Mesh,'the complete core is one continuous metal sweep')
    assertHealthyWireGeometry(core.geometry)
    for (const [index,terminal] of (core.userData.terminals as import('../src/three/WireTerminals').WireTerminal[]).entries()) {
      assert.ok(terminal.radius < .026 && terminal.radius > .008)
      assert.ok((core.material as import('three').MeshStandardMaterial).metalness > .5)
      const tip = terminal.tip
      const endpoint = index===0 ? positions[wire.source] : positions[wire.destination]
      assert.ok(Math.abs(tip.x - endpoint.x) < 1e-8 && Math.abs(tip.z - endpoint.z) < 1e-8)
      assert.ok(tip.y < endpoint.y - .04, 'metal is inserted below the unchanged electrical anchor')
    }
    const vertices = body.geometry.getAttribute('position')
    assert.ok(Array.from({ length: vertices.count }, (_, i) => vertices.getY(i)).every(y => y > .3339), 'insulation clears the plastic deck, copper alone enters the hole')
    layer.previewDrawing({ source: wire.source, destination: '' }, visual, { x: .5, y: .37, z: -.5 }); layer.flush()
    const preview = layer.tools.getObjectByName('wire-drawing-preview') as Mesh
    const free = preview.getObjectByName('wire-conductor-free') as Mesh
    assert.ok(free instanceof Mesh)
    assert.deepEqual(free.userData.terminals[1].tip,{x:.5,y:.37,z:-.5})
    layer.previewDrawing({ source: wire.source, destination: '' }, { ...visual, controlPoints: [{ space: 'world', position: { x: .5, y: .37, z: -.5 } }] }, { x: .9, y: .37, z: .3 }); layer.flush()
    assert.equal(preview.getObjectByName('wire-conductor-free'), free, 'one moving continuous core, no extra metal joint at each bend')
    const tip=free.userData.terminals[1].tip
    assert.ok(new Vector3(tip.x,tip.y,tip.z).distanceTo(new Vector3(.9,.37,.3))<1e-8)
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
    const copper = layer.group.children[0].getObjectByName('wire-conductor') as Mesh, other = layer.group.children[1].getObjectByName('wire-conductor') as Mesh
    assert.notEqual(copper.geometry, other.geometry); assert.equal(copper.material, other.material)
    let geometryDisposals = 0, otherDisposals=0, materialDisposals = 0
    copper.geometry.addEventListener('dispose', () => geometryDisposals++)
    other.geometry.addEventListener('dispose',()=>otherDisposals++)
    ;(copper.material as import('three').Material).addEventListener('dispose', () => materialDisposals++)
    layer.sync([second]); assert.equal(geometryDisposals, 1); assert.equal(otherDisposals,0); assert.equal(materialDisposals, 0)
    layer.previewDrawing({ source: second.source, destination: '' }, defaultWireVisual(), { x: .5, y: .37, z: 1.5 }); layer.flush(); layer.clearDrawing()
    assert.equal(geometryDisposals, 1); assert.equal(otherDisposals,0); assert.equal(materialDisposals, 0)
    layer.dispose(); layer.dispose()
    assert.equal(geometryDisposals, 1); assert.equal(otherDisposals,1); assert.equal(materialDisposals, 1)
  } finally { layer.dispose() }
})

test('opaque preview has silver deep-inserted contacts, longer free pin and only a thin segment hover line', () => {
  const endpoints: Record<string, Vector3> = { A: new Vector3(0, .309, 0), B: new Vector3(1, .309, 1) }
  const context = { modulePose: () => ({ id: 'BB', type: 'BREADBOARD' }), endpoint: (endpoint: string) => endpoints[endpoint] ? { endpoint, position: endpoints[endpoint], contactModuleId: 'BB' } : null }
  const layer = createWireLayer(endpoint => endpoints[endpoint] ?? null, context)
  const visual = { ...defaultWireVisual(), routeMode: 'FREE' as const, thickness: .052, height: .04 }
  const wire = { source: 'A', destination: 'B', metadata: { wireVisual: visual } }
  try {
    layer.sync([wire]); layer.highlight(wire)
    const body = layer.group.children[0] as Mesh, pin = body.getObjectByName('wire-conductor') as Mesh
    const material = pin.material as import('three').MeshStandardMaterial
    assert.ok(pin.userData.terminals[0].tip.y < .309 - .04, 'conductor extends deeply below the electrical contact')
    assert.ok(material.color.r > .4 && material.color.g > .4 && material.color.b > .4 && Math.abs(material.color.r - material.color.b) < .12, 'light silver tinned copper')
    assert.ok(material.metalness >= .8 && material.roughness <= .4); assert.equal(material.emissive.getHex(), 0)
    layer.selectSegment(layer.route(wire)!.segments.find(segment => segment.editable)!.index)
    assert.equal(layer.tools.getObjectByName('wire-segment-highlight'), undefined, 'no thick cylinder covers the wire')
    assert.ok(layer.tools.getObjectByName('wire-handles'))
    layer.previewDrawing({ source: 'A', destination: '' }, visual, { x: .5, y: .37, z: -.5 }); layer.flush()
    const preview = layer.tools.getObjectByName('wire-drawing-preview') as Mesh
    assert.equal((preview.material as import('three').Material).transparent, false)
    assert.equal((preview.material as import('three').Material).opacity, 1)
    const free = preview.getObjectByName('wire-conductor-free') as Mesh
    const terminal=free.userData.terminals[1]
    assert.ok(new Vector3(terminal.tip.x,terminal.tip.y,terminal.tip.z).distanceTo(new Vector3(terminal.junction.x,terminal.junction.y,terminal.junction.z))>.05,'the free conductor has a visible straight exposed end')
  } finally { layer.dispose() }
})

test('contact collar, exposed silver and insertion depth stay fixed at priorities zero and ten', () => {
  const context = { modulePose: () => ({ id: 'BB', type: 'BREADBOARD' }), endpoint: (endpoint: string) => ({ endpoint, position: { x: endpoint === 'A' ? 0 : 2, y: .309, z: 0 }, contactModuleId: 'BB' }) }
  const visual = { ...defaultWireVisual(), routeMode: 'FREE' as const, thickness: .052, height: .4 }
  const parts = [0, 10].map(layer => deriveWireParts(solveWireRoute({ source: 'A', destination: 'B' }, { ...visual, layer }, context)!, .052))
  for (const index of [0, 1]) {
    assert.deepEqual(parts[1].terminals[index], parts[0].terminals[index], 'priority cannot lengthen the metal or move the collar')
    const pin = parts[0].terminals[index]
    assert.ok(pin.junction.y > .33 && pin.junction.y <= .352, 'short exposed pin above the .33 deck')
    assert.ok(pin.tip.y < .26, 'deep insertion under .309 logical contact')
  }
  assert.ok(parts[0].bodyPoints.some(point => point.y <= .352), 'insulation reaches the fixed collar')
})

test('silver-plated conductor is capped, opaque and metallic without emissive brightness', () => {
  const layer = createWireLayer(endpoint => new Vector3(endpoint === 'A' ? 0 : 2, .37, 0))
  try {
    layer.sync([{ source: 'A', destination: 'B' }])
    const pin = layer.group.children[0].getObjectByName('wire-conductor') as Mesh
    const material = pin.material as import('three').MeshStandardMaterial
    assert.ok(material.metalness >= .9 && material.metalness <= 1)
    assert.ok(material.roughness >= .28 && material.roughness <= .40)
    assert.equal(material.transparent, false); assert.equal(material.emissive.getHex(), 0)
    assertHealthyWireGeometry(pin.geometry)
  } finally { layer.dispose() }
})

test('same-path contact priorities produce lateral lanes rather than vertically separated bodies', () => {
  const context = { modulePose: () => ({ id: 'BB', type: 'BREADBOARD' }), endpoint: (endpoint: string) => ({ endpoint, position: { x: endpoint.endsWith('A') ? 0 : 2, y: .309, z: endpoint.endsWith('A') ? 0 : 1 }, contactModuleId: 'BB' }) }
  const layer = createWireLayer(() => null, context)
  const wires = Array.from({ length: 3 }, (_, i) => ({ source: `S${i}A`, destination: `D${i}B`, metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', thickness: .052, height: .04, layer: i } } }))
  try {
    layer.sync(wires)
    const bodies = layer.group.children as Mesh[]
    bodies.forEach(body => body.geometry.computeBoundingBox())
    for (let i = 1; i < bodies.length; i++) assert.ok(Math.abs(bodies[i].geometry.boundingBox!.max.y - bodies[0].geometry.boundingBox!.max.y) < 1e-6, 'priority cannot create a Y tower')
  } finally { layer.dispose() }
})

test('mixed-diameter bundle priorities keep terminal insulation at a fixed low base', () => {
  for (const contact of [true, false]) {
    const context = { modulePose: () => ({ id: 'BB', type: 'BREADBOARD' }), endpoint: (endpoint: string) => ({ endpoint, position: { x: endpoint.endsWith('A') ? 0 : 2, y: contact ? .309 : .37, z: 0 }, ...(contact ? { contactModuleId: 'BB' } : {}) }) }
    const layer = createWireLayer(() => null, context)
    const wires = [.12, .052, .052].map((thickness, i) => ({ source: `S${i}A`, destination: `D${i}B`, metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', height: .04, thickness, layer: i } } }))
    try {
      layer.sync(wires)
      const bodies = layer.group.children as Mesh[]
      bodies.forEach(body => body.geometry.computeBoundingBox())
      for (let i = 1; i < bodies.length; i++) assert.ok(bodies[i].geometry.boundingBox!.max.y < .5, 'a thicker neighboring wire cannot globally lift this body')
    } finally { layer.dispose() }
  }
})

test('scene wire layer displays compact derived lanes and previews only rebuild their conflict group', () => {
  const positions = (endpoint: string) => new Vector3(endpoint.endsWith('A') ? -2 : 2, .36, endpoint.startsWith('OTHER') ? 3 : 0)
  const layer = createWireLayer(positions)
  const wires = Array.from({ length: 10 }, (_, index) => ({ source: `S${index}A`, destination: `D${index}B`, metadata: { wireVisual: { ...defaultWireVisual(), thickness: .052, routeMode: 'FREE' as const, layer: index } } }))
  const other = { source: 'OTHERA', destination: 'OTHERB' }
  try {
    layer.sync([...wires, other])
    const unchanged = (layer.group.children[10] as Mesh).geometry
    const route = layer.route(wires[0])!
    assert.ok(route.renderPoints, 'WireLayer must consume derived layout rather than rendering the raw semantic route')
    assert.ok(route.renderPoints.some(point => point.z < -.24))
    layer.previewVisual(wires[0], { ...readWireVisual(wires[0]), controlPoints: [{ space: 'world', position: { x: 0, y: .36, z: .15 } }] })
    layer.flush()
    assert.equal((layer.group.children[10] as Mesh).geometry, unchanged)
    layer.previewVisual(wires[0], null); layer.flush()
    assert.deepEqual(layer.route(wires[0])!.renderPoints, route.renderPoints)
  } finally { layer.dispose() }
})
