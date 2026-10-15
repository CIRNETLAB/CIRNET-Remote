import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { workspaceRoutes } from '../src/router/routes'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { parseCircuitFile } from '../src/services/files/circuitFile'

beforeEach(() => setActivePinia(createPinia()))

test('drawer safe areas follow panel targets without changing the Three.js viewport', () => {
  const ui = useUiStore(), viewport = ui.viewport
  const insets = () => ui.drawerInsets
  assert.deepEqual(insets(), { left: 66, top: 96 })
  ui.toggleComponentToolbar(); assert.deepEqual(insets(), { left: 66, top: 0 })
  ui.toggleToolsSidebar(); assert.deepEqual(insets(), { left: 0, top: 0 })
  ui.setWorkbenchSize(320, 300)
  ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
  assert.deepEqual(insets(), { left: 54, top: 96 })
  assert.equal(ui.viewport, viewport, 'drawer layout is independent of the canvas viewport')
})

test('floating windows stay out of open drawers and keep their position when drawers close', () => {
  const ui = useUiStore()
  ui.setViewport(1200, 700); ui.setWorkbenchSize(1200, 700); ui.openWindow('oscilloscope')
  const window = ui.windows[0], viewport = ui.viewport
  assert.ok(window.x >= 66 && window.y >= 96, 'open drawers must not obscure the instrument header')
  const position = [window.x, window.y]
  ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
  assert.deepEqual([window.x, window.y], position, 'closing an overlay does not move the instrument')
  ui.moveWindow('oscilloscope', 0, 0)
  ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
  assert.ok(window.x >= 66 && window.y >= 96)
  assert.ok(window.x + window.width <= 1200 && window.y + window.height <= 700)
  assert.equal(ui.viewport, viewport)
})

test('reopening responsive drawers bounds windows without changing the canvas viewport', () => {
  const ui = useUiStore(), viewport = ui.viewport
  ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
  ui.setWorkbenchSize(560, 300); ui.openWindow('oscilloscope')
  ui.moveWindow('oscilloscope', 0, 0)
  ui.toggleToolsSidebar(); ui.toggleComponentToolbar()
  assert.equal(ui.windows[0].x, 54); assert.equal(ui.windows[0].y, 96)
  ui.setWorkbenchSize(561, 300)
  assert.equal(ui.windows[0].x, 66); assert.equal(ui.windows[0].y, 96)
  const position = [ui.windows[0].x, ui.windows[0].y]
  for (let i = 0; i < 20; i++) { ui.toggleToolsSidebar(); ui.toggleComponentToolbar() }
  assert.deepEqual([ui.windows[0].x, ui.windows[0].y], position)
  assert.equal(ui.viewport, viewport)
})

test('duplicate layout notifications retain viewport identities and floating-window bounds', () => {
  const ui = useUiStore()
  ui.setViewport(900.5, 500.25); ui.setWorkbenchSize(1000.5, 700.25); ui.openWindow('oscilloscope')
  const viewport = ui.viewport, layout = ui.workbenchSize, window = ui.windows[0], bounds = { ...window }
  for (let i = 0; i < 20; i++) { ui.setViewport(900.5, 500.25); ui.setWorkbenchSize(1000.5, 700.25) }
  assert.equal(ui.viewport, viewport, 'duplicate viewport callbacks must not invalidate Pinia consumers')
  assert.equal(ui.workbenchSize, layout)
  assert.deepEqual({ ...window }, bounds)
  ui.setViewport(NaN, 500); ui.setViewport(900, Infinity)
  assert.equal(ui.viewport, viewport, 'invalid dimensions must leave the current layout usable')
  ui.setViewport(320, 200)
  assert.notEqual(ui.viewport, viewport)
  assert.ok(window.x + window.width <= 320 && window.y + window.height <= 200)
})
const valid = () => ({ schema_version: '1.0', circuit_id: 'example', modules: [{ id: 'U1', type: '74HC08' }], connections: [], metadata: { name: 'AND lab' } })

test('root, legacy and unknown URLs all enter the same workspace', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: workspaceRoutes })
  for (const path of ['/', '/dashboard', '/laboratory', '/circuits', '/stations', '/experiments', '/settings', '/obsolete/deep']) {
    await router.push(path)
    assert.equal(router.currentRoute.value.path, '/')
    assert.equal(router.currentRoute.value.name, 'SingleWorkspace')
  }
})

test('tools have one shared active state and preview is independent of circuit identity', () => {
  const workspace = useWorkspaceStore()
  for (const tool of ['select', 'wire', 'move', 'rotate'] as const) {
    workspace.setTool(tool)
    assert.equal(workspace.tool, tool)
  }
  workspace.preview('74HC08')
  assert.equal(workspace.previewType, '74HC08')
  assert.equal(workspace.selectedModuleId, null)
  workspace.setZoom(999)
  assert.equal(workspace.zoom, 999)
  workspace.setZoom(2000); assert.equal(workspace.zoom, 1000)
  workspace.setZoom(1); assert.equal(workspace.zoom, 50)
})

test('component collapse closes the palette and restores an independent, closed toolbar', () => {
  const ui = useUiStore()
  assert.equal(ui.componentToolbarCollapsed, false)
  assert.equal(ui.toolsSidebarCollapsed, false)
  ui.toggleRibbon('passive')
  assert.equal(ui.activeRibbonGroup, 'passive')
  ui.toggleComponentToolbar()
  assert.equal(ui.componentToolbarCollapsed, true)
  assert.equal(ui.activeRibbonGroup, null)
  assert.equal(ui.toolsSidebarCollapsed, false)
  ui.toggleRibbon('structure')
  assert.equal(ui.activeRibbonGroup, null)
  ui.toggleToolsSidebar()
  ui.toggleComponentToolbar()
  assert.equal(ui.componentToolbarCollapsed, false)
  assert.equal(ui.toolsSidebarCollapsed, true)
  assert.equal(ui.activeRibbonGroup, null)
  ui.toggleRibbon('structure')
  assert.equal(ui.activeRibbonGroup, 'structure')
  ui.toggleToolsSidebar()
  assert.equal(ui.activeRibbonGroup, 'structure')
})

test('collapsing either toolbar preserves circuit history, selection and the editing mode', () => {
  const ui = useUiStore()
  const circuit = useCircuitStore()
  const workspace = useWorkspaceStore()
  circuit.importGraph(parseCircuitFile(JSON.stringify(valid())))
  circuit.markSaved()
  workspace.setTool('wire')
  workspace.selectModule('U1')
  workspace.pendingPort = 'U1.A'
  workspace.setZoom(125)
  const graph = JSON.stringify(circuit.$state)
  const editing = JSON.stringify(workspace.$state)
  for (let i = 0; i < 2; i++) {
    ui.toggleToolsSidebar()
    ui.toggleComponentToolbar()
    assert.equal(JSON.stringify(circuit.$state), graph)
    assert.equal(JSON.stringify(workspace.$state), editing)
  }
  workspace.armPlacement('RESISTOR')
  ui.toggleComponentToolbar()
  ui.toggleToolsSidebar()
  assert.equal(workspace.placementType, 'RESISTOR')
  assert.equal(JSON.stringify(circuit.$state), graph)
})

test('drawer sizes are fixed across collapse and follow only the tools responsive breakpoint', () => {
  const ui = useUiStore()
  for (const [width, expected] of [[1200, 66], [561, 66], [560, 54], [320, 54], [1200, 66]]) {
    ui.setWorkbenchSize(width, 300)
    assert.equal(ui.toolsOverlayWidth, expected)
    assert.equal(ui.componentOverlayHeight, 96)
    ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
    assert.deepEqual(ui.drawerInsets, { left: 0, top: 0 })
    assert.equal(ui.toolsOverlayWidth, expected, 'the mounted drawer retains its fixed size while hidden')
    assert.equal(ui.componentOverlayHeight, 96)
    ui.toggleComponentToolbar(); ui.toggleToolsSidebar()
    assert.deepEqual(ui.drawerInsets, { left: expected, top: 96 })
  }
})

test('floating windows are unique, reusable and reordered when focused', () => {
  const ui = useUiStore()
  ui.setViewport(1100, 600)
  ui.openWindow('oscilloscope')
  ui.openWindow('generator')
  ui.openWindow('oscilloscope')
  assert.equal(ui.windows.length, 2)
  assert.ok(ui.windows[0].z > ui.windows[1].z)
  ui.closeWindow('oscilloscope')
  assert.equal(ui.windows[0].open, false)
  ui.openWindow('oscilloscope')
  assert.equal(ui.windows[0].open, true)
  assert.equal(ui.windows.length, 2)
})

test('drag and viewport shrink keep every window and its controls inside the workspace', () => {
  const ui = useUiStore()
  ui.setViewport(1200, 700)
  ui.openWindow('oscilloscope')
  ui.moveWindow('oscilloscope', 9999, -500)
  const window = ui.windows[0]
  assert.equal(window.y, ui.drawerInsets.top)
  assert.ok(window.x + window.width <= 1200)
  ui.setViewport(320, 220)
  assert.ok(window.x >= 0 && window.y >= 0)
  assert.ok(window.x + window.width <= 320)
  assert.ok(window.y + window.height <= 220)
  ui.setViewport(1200, 700)
  assert.ok(window.width > 320)
})

test('local file parsing rejects malformed graphs before any draft or history change', () => {
  const store = useCircuitStore()
  store.createDraft('Keep me')
  const snapshot = JSON.stringify(store.drafts)
  for (const bad of ['{', '[]', '{}', JSON.stringify({ ...valid(), modules: [{}] }), JSON.stringify({ ...valid(), modules: [{ id: 'A', type: 'LED', position: { x: 'bad', y: 0 } }] }), JSON.stringify({ ...valid(), connections: [{ source: 'not-a-port', destination: 'U1.A' }] })]) {
    assert.throws(() => store.importGraph(parseCircuitFile(bad)))
    assert.equal(JSON.stringify(store.drafts), snapshot)
  }
  assert.throws(() => parseCircuitFile(' '.repeat(2_000_001)), /large/i)
})

test('New, Open, Save, Undo and Redo preserve independent snapshots and clear redo branches', () => {
  const store = useCircuitStore()
  const first = store.createDraft('First')
  store.markSaved()
  assert.equal(store.dirty, false)
  store.importGraph(parseCircuitFile(JSON.stringify(valid())))
  assert.equal(store.current?.name, 'AND lab')
  const exported = parseCircuitFile(store.exportGraph())
  assert.equal(exported.modules[0].type, '74HC08')
  store.renameCurrent('Edited')
  assert.equal(store.dirty, true)
  store.undo()
  assert.equal(store.current?.name, 'AND lab')
  store.redo()
  assert.equal(store.current?.name, 'Edited')
  store.undo()
  store.renameCurrent('Branch')
  assert.equal(store.canRedo, false)
  store.undo()
  store.undo()
  assert.equal(store.activeId, first)
  assert.equal(store.current?.name, 'First')
  assert.equal(store.dirty, false)
})

test('history is bounded and an undo invalidates old validation', () => {
  const store = useCircuitStore()
  store.createDraft()
  for (let i = 0; i < 80; i++) store.renameCurrent(`Circuit ${i}`)
  assert.equal(store.past.length, 50)
  store.validationResult = { valid: true, code: 'VALID', message: 'Valid' }
  store.validatedSnapshot = JSON.stringify(store.graph)
  assert.ok(store.validation)
  store.undo()
  assert.equal(store.validation, null)
})

test('explicit window reactivation has a focus signal even when already on top', () => {
  const ui = useUiStore()
  ui.openWindow('component-info')
  const activation = ui.windows[0].activation
  ui.openWindow('component-info')
  assert.ok(ui.windows[0].activation > activation)
  const reactivated = ui.windows[0].activation
  ui.focusWindow('component-info')
  assert.equal(ui.windows[0].activation, reactivated)
})

test('a large valid imported graph can be saved and reopened within the same size limit', () => {
  const store = useCircuitStore()
  const graph = { schema_version: '1.0', circuit_id: 'large', modules: Array.from({ length: 20_000 }, (_, i) => ({ id: `R${i}`, type: 'RESISTOR', properties: { resistance: 1000 } })), connections: [] }
  const input = JSON.stringify(graph)
  assert.ok(new TextEncoder().encode(input).length < 2_000_000)
  store.importGraph(parseCircuitFile(input))
  const output = store.exportGraph()
  assert.ok(new TextEncoder().encode(output).length <= 2_000_000)
  assert.equal(parseCircuitFile(output).modules.length, 20_000)
})

test('export refuses a metadata-expanded file above the limit without marking it saved', () => {
  const store = useCircuitStore()
  const graph = { ...valid(), metadata: { name: 'A', padding: '' } }
  graph.metadata.padding = 'x'.repeat(2_000_000 - JSON.stringify(graph).length - 5)
  store.importGraph(parseCircuitFile(JSON.stringify(graph)))
  store.renameCurrent('A much longer project title')
  assert.throws(() => store.exportGraph(), /large/i)
  assert.equal(store.dirty, true)
})
