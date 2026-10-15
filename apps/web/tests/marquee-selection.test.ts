import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'
import { createSceneManager } from '../src/three/SceneManager'
import { wireHarness } from './helpers/wireHarness'
import { defaultWireVisual } from '../src/wires/wireVisual'

test('one-pixel marquee selects the visible edge of a thick wire at 200 percent without graph or history edits', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -2, y: 0, z: 0 }), b = h.circuit.placeModule('LED', { x: 2, y: 0, z: 0 })
    const wire = { source: `${a}.OUT`, destination: `${b}.IN` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { ...defaultWireVisual(), thickness: .2 })
    await nextTick(); h.flush(); h.manager.setZoom(200); h.circuit.past = []
    h.manager.setGhost('CLOCK', { x: 0, y: 0, z: -2 })
    const graph = h.circuit.exportGraph(), geometry = (h.manager.wires.children[0] as Mesh).geometry
    const segment = h.manager.wireRoute(wire)!.segments.filter(segment => segment.editable).sort((left, right) => new Vector3(right.start.x, right.start.y, right.start.z).distanceTo(new Vector3(right.end.x, right.end.y, right.end.z)) - new Vector3(left.start.x, left.start.y, left.start.z).distanceTo(new Vector3(left.end.x, left.end.y, left.end.z)))[0]
    const center = h.manager.project(new Vector3(segment.start.x, segment.start.y, segment.start.z).lerp(new Vector3(segment.end.x, segment.end.y, segment.end.z), .5))
    const y = center.y + 8
    assert.equal(h.manager.pick(center.x, y)?.kind, 'wire', 'the selected pixel lies on the rendered tube surface')
    const result = h.manager.selectInRect({ left: center.x - .5, right: center.x + .5, top: y - .5, bottom: y + .5 })
    assert.deepEqual(result.wires, [wire], 'surface selection uses the rendered diameter rather than a fixed centerline margin')
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, 0)
    assert.ok((h.manager.wires.children[0] as Mesh).geometry === geometry)
    assert.equal(result.moduleIds.includes('PLACE'), false)
  } finally { h.dispose() }
})

test('marquee uses projected visible triangles instead of a rotated model bounding rectangle', async () => {
  const helper = await import('../src/three/ProjectedSelection')
  const camera = new PerspectiveCamera(45, 1, .1, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const root = new Group(), mesh = new Mesh(new BoxGeometry(4, .3, .3), new MeshBasicMaterial())
  root.add(mesh); root.rotation.z = Math.PI / 4; root.updateMatrixWorld(true)
  const rect = (left: number, top: number, right = left + 4, bottom = top + 4) => ({ left, top, right, bottom })
  assert.equal(helper.projectedObjectIntersectsRect(root, camera, 800, 800, rect(395, 395, 405, 405)), true)
  assert.equal(helper.projectedObjectIntersectsRect(root, camera, 800, 800, rect(500, 500)), false, 'empty corner of projected AABB is not component geometry')
  mesh.visible = false
  assert.equal(helper.projectedObjectIntersectsRect(root, camera, 800, 800, rect(395, 395, 405, 405)), false)
  mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose()
})

test('projected geometry crosses a rectangle with outside vertices and excludes geometry behind the camera', async () => {
  const helper = await import('../src/three/ProjectedSelection')
  const camera = new PerspectiveCamera(45, 1, .1, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const rect = { left: 395, top: 395, right: 405, bottom: 405 }
  const mesh = new Mesh(new BoxGeometry(4, .1, .1), new MeshBasicMaterial())
  try {
    assert.equal(helper.projectedObjectIntersectsRect(mesh, camera, 800, 800, rect), true)
    mesh.position.y = 1
    assert.equal(helper.projectedObjectIntersectsRect(mesh, camera, 800, 800, rect), false)
    mesh.position.set(0, 0, 11)
    assert.equal(helper.projectedObjectIntersectsRect(mesh, camera, 800, 800, rect), false)
  } finally { mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose() }
})

test('SceneManager marquee queries committed objects only and highlights without rebuilding or mutating graph', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const graph = { schema_version: '1.0' as const, circuit_id: 'marquee', modules: [{ id: 'A', type: 'CLOCK', position: { x: -3, y: 0, z: 0 } }, { id: 'B', type: 'LED', position: { x: 3, y: 0, z: 0 }, rotation: 45 }], connections: [{ source: 'A.OUT', destination: 'B.IN' }] }
  try {
    manager.resize(1000, 700); manager.syncGraph(graph); manager.setGhost('CLOCK', { x: 0, y: 0, z: -3 })
    const snapshot = JSON.stringify(graph), models = [...manager.models.values()], geometries = models.map(model => (model.children.find(item => item instanceof Mesh) as Mesh)?.geometry)
    const query = Reflect.get(manager, 'selectInRect') as (rect: { left: number; top: number; right: number; bottom: number }) => { moduleIds: string[]; wires: { source: string; destination: string }[] }
    assert.equal(typeof query, 'function', 'SceneManager provides a graph-ID selection projection')
    const result = query({ left: 0, top: 0, right: 1000, bottom: 700 })
    assert.deepEqual(result.moduleIds, ['A', 'B']); assert.deepEqual(result.wires, graph.connections)
    const highlight = Reflect.get(manager, 'highlightSelection') as (modules: string[], wires: { source: string; destination: string }[]) => void
    highlight(result.moduleIds, result.wires)
    assert.ok(models.every(model => model.children.some(child => child.userData.isOutline)), 'all committed modules receive model-owned outlines')
    assert.ok(manager.scene.getObjectByName('wire-tools')?.children.some(child => child.name.startsWith('wire-multi-outline:') && child.visible), 'wire selection has a visible overlay')
    assert.equal(JSON.stringify(graph), snapshot)
    models.forEach((model, i) => { assert.ok(manager.models.get(model.userData.id) === model); assert.ok((model.children.find(item => item instanceof Mesh) as Mesh)?.geometry === geometries[i]) })
    manager.highlight('A')
    assert.equal(models[1].children.some(child => child.userData.isOutline), false, 'normal single editing removes temporary multiple highlight')
  } finally { manager.dispose() }
})

test('marquee selection keeps graph/history/camera state unchanged and reconciles Inspector single selection', () => {
  setActivePinia(createPinia())
  const workspace = useWorkspaceStore(), circuit = useCircuitStore()
  circuit.createDraft(); circuit.placeModule('CLOCK', { x: 0, y: 0, z: 0 }); circuit.past = []
  const snapshot = circuit.snapshot(), zoom = workspace.zoom
  const toggle = Reflect.get(workspace, 'toggleMarquee') as () => void
  const select = Reflect.get(workspace, 'setMarqueeSelection') as (value: { moduleIds: string[]; wires: { source: string; destination: string }[] }) => void
  assert.equal(typeof toggle, 'function', 'marquee mode must be independently activatable')
  toggle(); select({ moduleIds: ['A', 'B', 'A'], wires: [{ source: 'A.OUT', destination: 'B.IN' }] })
  assert.deepEqual(Reflect.get(workspace, 'selectedModuleIds'), ['A', 'B'])
  assert.equal(workspace.selectedModuleId, null); assert.equal(workspace.selectedWire, null)
  select({ moduleIds: ['A'], wires: [] }); assert.equal(workspace.selectedModuleId, 'A')
  workspace.cancelMarquee(); assert.deepEqual(workspace.selectedModuleIds, ['A']); assert.equal(workspace.selectedModuleId, 'A')
  select({ moduleIds: [], wires: [{ source: 'A.OUT', destination: 'B.IN' }] }); assert.deepEqual(workspace.selectedWire, { source: 'A.OUT', destination: 'B.IN' })
  workspace.selectModule('B'); assert.equal(Reflect.get(workspace, 'marqueeActive'), false); assert.deepEqual(Reflect.get(workspace, 'selectedModuleIds'), [])
  toggle(); select({ moduleIds: ['A', 'B'], wires: [] }); workspace.setTool('wire')
  assert.equal(Reflect.get(workspace, 'marqueeActive'), false); assert.deepEqual(Reflect.get(workspace, 'selectedModuleIds'), [])
  assert.equal(circuit.snapshot(), snapshot); assert.equal(circuit.past.length, 0); assert.equal(workspace.zoom, zoom)
})

test('Marquee Select sits between Zoom In and Fit and remains distinct from Zoom To Area', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), circuit = useCircuitStore()
  circuit.createDraft(); circuit.placeModule('CLOCK', { x: 0, y: 0, z: 0 })
  const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => null } })
  const view = mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'), pinia)
  try {
    const labels = view.all().filter(node => node.tag === 'button').map(node => node.props['aria-label'])
    const index = labels.indexOf('Zoom In')
    assert.equal(labels[index + 1], 'Marquee Select'); assert.equal(labels[index + 2], 'Zoom To View Entire Circuit')
    const button = view.find('button', 'aria-label', 'Marquee Select')
    dispatch(button, 'onClick'); await nextTick()
    assert.equal(button.props['aria-pressed'], true); assert.equal(workspace.zoomAreaActive, false)
    dispatch(view.find('button', 'aria-label', 'Zoom To Area'), 'onClick'); await nextTick()
    assert.equal(workspace.zoomAreaActive, true); assert.equal(button.props['aria-pressed'], false)
  } finally { view.app.unmount(); if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else Reflect.deleteProperty(globalThis, 'document') }
})
