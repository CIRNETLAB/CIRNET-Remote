import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createRenderer, nextTick, ref } from 'vue'
import { Vector3 } from 'three'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { useUiStore } from '../src/stores/ui'
import { useCircuitEditor } from '../src/composables/useCircuitEditor'
import { createSceneManager } from '../src/three/SceneManager'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('Workspace source and CSS no longer contain .scene-inventory or text Components (N)', async () => {
  const workspaceSfc = await readFile(resolve('src/components/workbench/CircuitWorkspace3D.vue'), 'utf-8')
  assert.ok(!workspaceSfc.includes('scene-inventory'), 'CircuitWorkspace3D must not contain scene-inventory class')
  assert.ok(!workspaceSfc.includes('Components ('), 'CircuitWorkspace3D must not contain Components (N) summary')
  assert.ok(!workspaceSfc.includes('<details'), 'CircuitWorkspace3D must not contain details element')

  const css = await readFile(resolve('src/style.css'), 'utf-8')
  assert.ok(!css.includes('.scene-inventory'), 'style.css must not contain .scene-inventory rule')
})

test('Simulation Status Bar continues to display component and wire counts', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore()
  circuit.createDraft()
  circuit.placeModule('74HC08', { x: 0, y: 0, z: 0 })
  circuit.placeModule('CLOCK', { x: 2, y: 0, z: 0 })

  const view = mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'), pinia)
  try {
    const text = view.text()
    assert.ok(text.includes('Components'), 'Status bar must show Components label')
    assert.ok(text.includes('2'), 'Status bar must show 2 components')
    assert.ok(text.includes('Wires'), 'Status bar must show Wires label')
    assert.ok(text.includes('0'), 'Status bar must show 0 wires')
  } finally { view.app.unmount() }
})

test('Inspector allows selecting components and updates workspace selectedModuleId', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore()
  circuit.createDraft()
  const m1 = circuit.placeModule('74HC08', { x: 0, y: 0, z: 0 })
  const m2 = circuit.placeModule('CLOCK', { x: 2, y: 0, z: 0 })

  const view = mountSfc(await loadSfc('components/windows/InspectorWindow.vue'), pinia)
  try {
    const label = view.all().find(node => node.tag === 'label' && node.children.some(child => child.text.includes('Select component')))
    const select = label?.children.find(child => child.tag === 'select')
    assert.ok(select, 'Inspector must have Select component dropdown')
    dispatch(select!, 'onChange', m1)
    assert.equal(workspace.selectedModuleId, m1)
    dispatch(select!, 'onChange', m2)
    assert.equal(workspace.selectedModuleId, m2)
    dispatch(select!, 'onChange', '')
    assert.equal(workspace.selectedModuleId, null)
  } finally { view.app.unmount() }
})

test('Clicking 3D model selects module and opens Component Info', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const documentHost = Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => null }) })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentHost })
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft(); circuit.past = []

  const captured = new Set<number>()
  const canvas = ref({
    focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  } as unknown as HTMLCanvasElement)

  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1000, 700)

  const renderer = createRenderer<object, object>({
    insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {},
  })

  let editor!: ReturnType<typeof useCircuitEditor>
  const app = renderer.createApp({ setup() { editor = useCircuitEditor(canvas, () => manager); return () => null } })
  app.mount({})

  try {
    const id = circuit.placeModule('CLOCK', { x: 0, y: 0, z: 0 })
    manager.syncGraph(circuit.graph!)
    const p = manager.project(new Vector3(0, 0, 0))
    const pointer = (button = 0) => ({ clientX: p.x, clientY: p.y, pointerId: 1, button, preventDefault() {} } as PointerEvent)
    editor.pointerDown(pointer())
    editor.pointerUp(pointer())
    await nextTick()

    assert.equal(workspace.selectedModuleId, id, 'Clicking 3D model must select the module')
    const infoWindow = ui.windows.find(w => w.kind === 'component-info')
    assert.ok(infoWindow?.open, 'Clicking 3D model must open Component Info window')
  } finally {
    app.unmount(); manager.dispose()
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('Wire Options and Component Info share upper-right layout convention and class', async () => {
  const css = await readFile(resolve('src/style.css'), 'utf-8')
  assert.ok(css.includes('.contextual-panel'), 'style.css must define .contextual-panel')
  assert.ok(css.includes('top: calc(var(--drawer-top) + 20px)'), 'contextual panels must be anchored at top: calc(var(--drawer-top) + 20px)')
  assert.ok(css.includes('right: 20px'), 'contextual panels must be anchored at right: 20px')
  assert.ok(css.includes('width: min(300px, calc(100% - var(--drawer-left) - 40px))'), 'contextual panels must share width: min(300px, calc(100% - var(--drawer-left) - 40px))')

  const wireSfc = await readFile(resolve('src/components/workbench/WireOptions.vue'), 'utf-8')
  assert.ok(wireSfc.includes('contextual-panel'), 'WireOptions template must have contextual-panel class')
  assert.ok(!wireSfc.includes('bottom: 42px'), 'WireOptions scoped style must not have bottom: 42px')
  assert.ok(!wireSfc.includes('width: 230px'), 'WireOptions scoped style must not have width: 230px')

  const workspaceSfc = await readFile(resolve('src/components/workbench/CircuitWorkspace3D.vue'), 'utf-8')
  assert.ok(!workspaceSfc.includes('ui.toolsSidebarCollapsed ? 44'), 'CircuitWorkspace3D must not have inline toolsSidebar-dependent left style on WireOptions')
})

test('Wire mode with selected component arbitrates upper-right panels without overlap and restores Component Info on exit', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft()
  const id = circuit.placeModule('74HC08', { x: 0, y: 0, z: 0 })

  // 1. Select component and open Component Info
  workspace.selectModule(id)
  ui.openWindow('component-info')
  assert.equal(workspace.wireOptionsActive, false)

  const componentInfoComponent = await loadSfc('components/windows/ComponentInfoWindow.vue')
  const wireOptionsComponent = await loadSfc('components/workbench/WireOptions.vue')

  // When wireOptions is not active, Component Info visual surface renders
  const view1 = mountSfc(componentInfoComponent, pinia)
  try {
    assert.equal(view1.all().filter(n => n.tag === 'aside').length, 1, 'Component Info visual surface is mounted')
    assert.ok(view1.text().includes('74HC08'), 'Component Info displays the selected module name')
  } finally { view1.app.unmount() }

  // 2. Switch to Wire mode: Component Info hides, Wire Options displays
  workspace.setTool('wire')
  assert.equal(workspace.tool, 'wire')
  assert.equal(workspace.selectedModuleId, id, 'Selecting Wire tool must not clear module selection')
  assert.equal(workspace.wireOptionsActive, true)
  assert.equal(ui.windows.find(w => w.kind === 'component-info')?.open, true, 'Component Info state remains open')

  const view2 = mountSfc(componentInfoComponent, pinia)
  try {
    assert.equal(view2.all().filter(n => n.tag === 'aside').length, 0, 'Component Info visual surface is hidden in Wire mode')
  } finally { view2.app.unmount() }

  const wireView = mountSfc(wireOptionsComponent, pinia)
  try {
    assert.equal(wireView.all().filter(n => n.tag === 'section').length, 1, 'Wire Options is mounted in Wire mode')
  } finally { wireView.app.unmount() }

  // 3. Switch back to select tool: Component Info visual surface is restored
  workspace.setTool('select')
  assert.equal(workspace.tool, 'select')
  assert.equal(workspace.selectedModuleId, id, 'Selection is still preserved after leaving Wire mode')
  assert.equal(workspace.wireOptionsActive, false)

  const view3 = mountSfc(componentInfoComponent, pinia)
  try {
    assert.equal(view3.all().filter(n => n.tag === 'aside').length, 1, 'Component Info is restored after leaving Wire mode')
    assert.ok(view3.text().includes('74HC08'), 'Component Info still displays the preserved selection')
  } finally { view3.app.unmount() }
})

test('Gizmo obstacle avoidance clears upper-right Wire panel', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} }) as ReturnType<typeof createSceneManager> & { setGizmoObstacles?: (rects: { left: number; top: number; right: number; bottom: number }[]) => void }
  try {
    manager.resize(1000, 700)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'panel', modules: [{ id: 'A', type: 'CLOCK' }], connections: [] })
    manager.highlight('A')

    const p = manager.project(manager.gizmoHandlePosition('xz')!)
    assert.equal(typeof manager.setGizmoObstacles, 'function')

    // Place an obstacle at the upper-right wire panel position (canvas 1000x700: left 680 to 980, top 20 to 260)
    const wirePanelObstacle = { left: p.x - 65, top: p.y - 60, right: p.x + 65, bottom: p.y + 60 }
    manager.setGizmoObstacles!([wirePanelObstacle])

    const moved = manager.project(manager.gizmoHandlePosition('xz')!)
    assert.ok(Math.abs(moved.x - p.x) > 120 || Math.abs(moved.y - p.y) > 115, 'gizmo handle must clear screen location occupied by Wire panel')
  } finally { manager.dispose() }
})
