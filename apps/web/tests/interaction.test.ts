import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { Vector3 } from 'three'
import { useCircuitEditor, snapPosition } from '../src/composables/useCircuitEditor'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore, type WorkspaceTool } from '../src/stores/workspace'
import { createSceneManager } from '../src/three/SceneManager'
import { breadboardBodiesOverlap, isMechanicalBreadboardDock } from '../src/geometry/breadboardDocking'
import { useUiStore } from '../src/stores/ui'
import {solveFlexibleMount} from '../src/electrical/flexibleGeometry'

// Only the DOM/canvas host and GPU boundary are replaced; picking, camera math,
// Vue lifecycle, graph commands and history use the production implementations.
function setup(tool: WorkspaceTool = 'select') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const documentHost = Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => null }) })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentHost })
  setActivePinia(createPinia())
  const circuit = useCircuitStore(), workspace = useWorkspaceStore()
  workspace.setTool(tool)
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
  const pointer = (x: number, y: number, pointerId = 1, button = 0) => ({ clientX: x, clientY: y, pointerId, button, preventDefault() {} } as PointerEvent)
  return { circuit, workspace, manager, editor, canvas, captured, pointer, dispose() {
    app.unmount(); manager.dispose()
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  } }
}

function supplyFront(h: ReturnType<typeof setup>, x: number, y: number, z = 1.85) {
  h.manager.camera.position.set(0, 1.4, 10)
  h.manager.camera.lookAt(0, 1.4, 0)
  return h.manager.project(new Vector3(x, y, z))
}

// A positive world-Y gesture is counterclockwise in the screen-oriented tool.
function rotationTarget(h: ReturnType<typeof setup>, degrees: number) {
  const center = h.manager.project(h.manager.gizmoOrigin()!), start = h.manager.project(h.manager.gizmoHandlePosition('rotate-y')!)
  const angle = -degrees * Math.PI / 180, x = start.x - center.x, y = start.y - center.y
  return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) }
}

function acquirePlacementGizmo(h: ReturnType<typeof setup>) {
  const axis = h.manager.project(h.manager.gizmoHandlePosition('x')!)
  h.editor.pointerMove(h.pointer(axis.x, axis.y))
  assert.equal(h.manager.placementFollowBlocked(), true, 'approaching a separated handle pauses cursor-follow before free movement')
}

test('common camera/resize cancellation rolls back a flexible edit and releases capture before later pointerup',async()=>{
 const oldRequest=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame'),oldCancel=Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame')
 let queued:FrameRequestCallback|null=null
 Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(cb:FrameRequestCallback)=>{queued=cb;return 1}});Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:()=>{queued=null}})
 const h=setup()
 try{
  const board=h.circuit.placeModule('BREADBOARD',{x:0,y:0,z:0}),mount=solveFlexibleMount('GENERIC_RESISTOR',board,'terminal:A:10','terminal:A:14',h.circuit.graph!.modules).mount!
  const id=h.circuit.placeFlexibleModule('GENERIC_RESISTOR',mount);h.workspace.selectModule(id);await nextTick();h.editor.sync();h.circuit.past=[]
  const pin=h.manager.project(h.manager.flexibleHandlePosition('pin-1')!),target=h.manager.project(h.manager.endpointPosition(`${board}.contact:terminal:A:15`)!),event=(x:number,y:number)=>({...h.pointer(x,y),stopImmediatePropagation(){}})
  const before=h.circuit.snapshot();h.editor.pointerDown(event(pin.x,pin.y));assert.equal(h.captured.size,1)
  const surface=h.manager.models.get(id)!.getObjectByName('package-lead-A')!.getObjectByName('lead-metal') as import('three').Mesh,geometry=surface.geometry
  for(let step=1;step<=10;step++)h.editor.pointerMove(event(pin.x+(target.x-pin.x)*step/10,pin.y+(target.y-pin.y)*step/10))
  assert.equal(surface.geometry,geometry,'pointer events are coalesced before the next frame')
  const pendingFrame=queued as FrameRequestCallback|null;if(pendingFrame)pendingFrame(0);assert.notEqual(surface.geometry,geometry)
  h.editor.cancel();assert.equal(h.captured.size,0)
  h.editor.pointerUp(event(target.x,target.y));await nextTick();assert.equal(h.circuit.snapshot(),before);assert.equal(h.circuit.past.length,0)
 }finally{h.dispose();if(oldRequest)Object.defineProperty(globalThis,'requestAnimationFrame',oldRequest);else Reflect.deleteProperty(globalThis,'requestAnimationFrame');if(oldCancel)Object.defineProperty(globalThis,'cancelAnimationFrame',oldCancel);else Reflect.deleteProperty(globalThis,'cancelAnimationFrame')}
})

test('mounted physical component dragging keeps the same board-plane grab offset in an oblique view', async () => {
  const h = setup('move')
  try {
    h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const id = h.circuit.placeModule('SN74HC08N', { x: 0, y: .309, z: 0 })
    h.workspace.selectModule(id); h.workspace.snap = false; await nextTick(); h.circuit.past = []
    h.manager.camera.position.set(0, 3, 3); h.manager.camera.lookAt(0, .309, 0)
    const screen = h.manager.project(new Vector3(0, .559, 0))
    h.editor.pointerDown(h.pointer(screen.x, screen.y))
    h.editor.pointerMove(h.pointer(screen.x + 5, screen.y))
    h.editor.pointerUp(h.pointer(screen.x + 5, screen.y))
    await nextTick()
    assert.equal(h.workspace.editError, '')
    const mount=h.circuit.graph!.modules.find(m => m.id === id)!.mount
    assert.equal(mount?.kind,'breadboard');assert.ok(mount?.kind==='breadboard')
    assert.equal(mount.pose.position.z, 0)
  } finally { h.dispose() }
})

test('Delete and Backspace remove selections with Undo/Redo independent of the sidebar button', async () => {
  for (const key of ['Delete', 'Backspace']) {
    const h = setup()
    try {
      const id = h.circuit.placeModule('LED', { x: 0, y: 0, z: 0 })
      h.workspace.selectModule(id); await nextTick()
      h.editor.keydown({ key, preventDefault() {} } as KeyboardEvent)
      assert.equal(h.circuit.graph!.modules.length, 0)
      h.circuit.undo(); assert.equal(h.circuit.graph!.modules[0].id, id)
      h.circuit.redo(); assert.equal(h.circuit.graph!.modules.length, 0)
    } finally { h.dispose() }
  }
})

test('area selection takes priority over model editing and commits only a new camera frame', async () => {
  for (const tool of ['move', 'rotate', 'wire'] as const) {
    const h = setup(tool)
    const area = h.workspace, editor = h.editor
    try {
      assert.equal(typeof area.toggleZoomArea, 'function', 'workspace must expose area selection')
      const id = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
      h.workspace.selectModule(id); await nextTick(); h.circuit.past = []
      const graph = JSON.stringify(h.circuit.graph), camera = h.manager.camera.position.clone()
      area.toggleZoomArea(); await nextTick()
      h.editor.pointerDown(h.pointer(500, 350)); h.editor.pointerMove(h.pointer(750, 525))
      assert.deepEqual(editor.zoomAreaRect.value, { left: 500, top: 350, width: 250, height: 175 })
      assert.ok(h.manager.camera.position.equals(camera), 'camera waits for release')
      h.editor.pointerUp(h.pointer(750, 525, 2))
      assert.equal(h.captured.size, 1, 'foreign pointer cannot finish a region')
      h.editor.pointerUp(h.pointer(750, 525)); await nextTick()
      assert.equal(area.zoomAreaActive, false); assert.equal(editor.zoomAreaRect.value, null)
      assert.equal(h.captured.size, 0); assert.equal(h.workspace.tool, tool)
      assert.equal(h.workspace.selectedModuleId, id)
      assert.equal(JSON.stringify(h.circuit.graph), graph); assert.equal(h.circuit.past.length, 0)
      assert.ok(h.manager.camera.position.distanceTo(camera) > 1)
    } finally { h.dispose() }
  }
})

test('area selection retries a click and cancels cleanly on Escape, right click, tool, placement or graph changes', async () => {
  const h = setup()
  const area = h.workspace, editor = h.editor
  try {
    assert.equal(typeof area.toggleZoomArea, 'function')
    const camera = h.manager.camera.position.clone()
    area.toggleZoomArea(); await nextTick()
    h.editor.pointerDown(h.pointer(600, 400)); h.editor.pointerUp(h.pointer(601, 401)); await nextTick()
    assert.equal(area.zoomAreaActive, true, 'an accidental click allows another attempt')
    assert.equal(h.captured.size, 0); assert.ok(h.manager.camera.position.equals(camera))
    const cancelActions = [
      () => h.editor.keydown({ key: 'Escape' } as KeyboardEvent),
      () => h.editor.pointerDown(h.pointer(300, 300, 2, 2)),
      () => area.toggleZoomArea(),
      () => h.workspace.setTool('move'),
      () => h.workspace.armPlacement('LED'),
      () => h.circuit.createDraft(),
      () => h.editor.cancel(),
    ]
    for (const action of cancelActions) {
      if (!area.zoomAreaActive) area.toggleZoomArea()
      await nextTick()
      h.editor.pointerDown(h.pointer(600, 400)); h.editor.pointerMove(h.pointer(-100, -100))
      assert.deepEqual(editor.zoomAreaRect.value, { left: 0, top: 0, width: 600, height: 400 })
      action(); await nextTick()
      assert.equal(area.zoomAreaActive, false); assert.equal(editor.zoomAreaRect.value, null)
      assert.equal(h.captured.size, 0); assert.ok(h.manager.camera.position.equals(camera))
      h.editor.pointerUp(h.pointer(0, 0)); assert.ok(h.manager.camera.position.equals(camera))
    }
  } finally { h.dispose() }
})

test('area drag cancels on a right-button context menu and ignores a release after viewport loss', async () => {
  const h = setup()
  const editor = h.editor
  try {
    assert.equal(typeof editor.contextMenu, 'function', 'mouse chords must also cancel via contextmenu')
    const camera = h.manager.camera.position.clone()
    h.workspace.toggleZoomArea(); await nextTick()
    h.editor.pointerDown(h.pointer(200, 100)); h.editor.pointerMove(h.pointer(700, 500))
    editor.contextMenu({ preventDefault() {} } as MouseEvent); await nextTick()
    h.editor.pointerUp(h.pointer(700, 500))
    assert.equal(h.workspace.zoomAreaActive, false); assert.equal(h.captured.size, 0)
    assert.ok(h.manager.camera.position.equals(camera))
    h.workspace.toggleZoomArea(); await nextTick()
    h.editor.pointerDown(h.pointer(200, 100))
    h.canvas.value!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect
    assert.doesNotThrow(() => h.editor.pointerUp(h.pointer(700, 500)))
    assert.equal(h.workspace.zoomAreaActive, false); assert.equal(h.captured.size, 0)
    assert.ok(h.manager.camera.position.equals(camera))
  } finally { h.dispose() }
})

test('armed area mode allows keyboard focus navigation and a tiny drag survives its lost capture event', async () => {
  const h = setup()
  try {
    h.workspace.toggleZoomArea(); await nextTick()
    let prevented = false
    h.editor.keydown({ key: 'Tab', preventDefault() { prevented = true } } as KeyboardEvent)
    assert.equal(prevented, false, 'Tab must still reach toolbar and other controls')
    h.editor.pointerDown(h.pointer(200, 100)); h.editor.pointerUp(h.pointer(201, 101))
    h.editor.lostPointerCapture(h.pointer(201, 101)); await nextTick()
    assert.equal(h.workspace.zoomAreaActive, true, 'normal release of a rejected drag is not cancellation')
    h.editor.pointerDown(h.pointer(200, 100)); h.editor.lostPointerCapture(h.pointer(700, 500)); await nextTick()
    assert.equal(h.workspace.zoomAreaActive, false, 'unexpected loss during an active drag cancels')
    assert.equal(h.captured.size, 0)
  } finally { h.dispose() }
})

test('voltage drag reaches every common setpoint exactly from an irregular starting value', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
    h.workspace.selectModule(id)
    for (const target of [3, 3.3, 5, 6, 9, 12, 15]) {
      h.circuit.updateModuleProperties(id, { voltage_v: 4.97 })
      await nextTick(); h.circuit.past = []
      const start = supplyFront(h, 0.804, 2.128), pixels = Math.round((target - 4.97) / 0.05)
      h.editor.pointerDown(h.pointer(start.x, start.y))
      h.editor.pointerUp(h.pointer(start.x, start.y - pixels))
      assert.equal(h.circuit.graph!.modules[0].properties!.voltage_v, target)
      assert.equal(h.circuit.past.length, 1)
      h.circuit.undo(); await nextTick()
      assert.equal(h.circuit.graph!.modules[0].properties!.voltage_v, 4.97)
    }
  } finally { h.dispose() }
})

test('Shift adjusts voltage by a hundredth without a dead zone or jump when precision changes', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
    h.circuit.updateModuleProperties(id, { voltage_v: 7.34 }); await nextTick(); h.circuit.past = []
    const start = supplyFront(h, 0.804, 2.128)
    h.editor.pointerDown(h.pointer(start.x, start.y))
    h.editor.pointerMove(Object.assign(h.pointer(start.x, start.y - 1), { shiftKey: true }))
    assert.deepEqual(h.manager.models.get(id)!.getObjectByName('supply-display')!.userData.settings, [false, 7.35, 0])
    h.editor.pointerMove(Object.assign(h.pointer(start.x, start.y - 20), { shiftKey: true }))
    h.editor.pointerUp(h.pointer(start.x, start.y - 22))
    assert.equal(h.circuit.graph!.modules[0].properties!.voltage_v, 7.64, 'changing the modifier affects only new pointer travel')
    assert.equal(h.circuit.past.length, 1)
    h.circuit.updateModuleProperties(id, { voltage_v: 5 }); await nextTick(); h.circuit.past = []
    h.editor.pointerDown(h.pointer(start.x, start.y))
    h.editor.pointerMove(Object.assign(h.pointer(start.x, start.y - 1), { shiftKey: true }))
    h.editor.pointerUp(h.pointer(start.x, start.y - 1))
    assert.equal(h.circuit.graph!.modules[0].properties!.voltage_v, 5.01, 'releasing Shift before the mouse must retain the last fine setting')
    assert.equal(h.circuit.past.length, 1)
  } finally { h.dispose() }
})

test('Select drags each supply knob live, clamps its setting and commits one undo without moving the supply', async () => {
  for (const [index, key, y, maximum] of [[0, 'voltage_v', 2.128, 15], [1, 'current_limit_a', 1.204, 5]] as const) {
    const h = setup()
    try {
      const id = h.circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
      h.workspace.selectModule(id)
      await nextTick(); h.circuit.past = []
      useUiStore().closeWindow('component-info')
      const start = supplyFront(h, 0.804, y), camera = h.manager.camera.position.clone()
      assert.equal(h.manager.pick(start.x, start.y)?.kind, 'control')
      const knob = h.manager.models.get(id)!.getObjectByName(`supply-knob-${index}`)!
      const initialAngle = knob.rotation.z
      h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(start.x, start.y - 80))
      assert.equal(useUiStore().windows.find((window) => window.kind === 'component-info')?.open, false, 'adjustment must not reopen a dismissed overlay')
      assert.ok(Math.abs(knob.rotation.z - initialAngle) > 0.5, 'index and grip rotate during the gesture')
      assert.equal(h.circuit.graph!.modules[0].properties![key], 0, 'preview is not a history command')
      assert.deepEqual(h.manager.models.get(id)!.getObjectByName('supply-display')!.userData.settings, index === 0 ? [false, 4, 0] : [false, 0, 1.6])
      assert.ok(h.manager.camera.position.distanceTo(camera) < 0.0001)
      h.editor.pointerUp(h.pointer(start.x, start.y - 400))
      assert.equal(h.circuit.graph!.modules[0].properties![key], maximum)
      assert.deepEqual(h.circuit.graph!.modules[0].position, { x: 0, y: 0, z: 0 })
      assert.equal(h.circuit.graph!.modules[0].rotation ?? 0, 0)
      assert.equal(h.circuit.past.length, 1); assert.equal(h.captured.size, 0)
      h.circuit.undo(); await nextTick()
      assert.equal(h.circuit.graph!.modules[0].properties![key], 0)
      assert.equal(h.manager.models.get(id)!.getObjectByName(`supply-knob-${index}`)!.rotation.z, initialAngle)
      h.circuit.redo(); assert.equal(h.circuit.graph!.modules[0].properties![key], maximum)
    } finally { h.dispose() }
  }
})

test('supply rocker clicks toggle its pose, undo/redo and ignore dragged or foreign pointer releases', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    const start = supplyFront(h, -0.84, 0.392, 1.75)
    assert.equal(h.manager.pick(start.x, start.y)?.kind, 'control')
    const off = h.manager.models.get(id)!.getObjectByName('power-switch')!.rotation.x
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerUp(h.pointer(start.x, start.y, 2))
    assert.equal(h.captured.size, 1); assert.equal(h.circuit.graph!.modules[0].properties!.power_on, false)
    h.editor.pointerUp(h.pointer(start.x, start.y)); await nextTick()
    assert.equal(h.circuit.graph!.modules[0].properties!.power_on, true)
    assert.ok(h.manager.models.get(id)!.getObjectByName('power-switch')!.rotation.x * off < 0)
    assert.equal(h.circuit.past.length, 1)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules[0].properties!.power_on, false)
    h.circuit.redo(); await nextTick()
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerUp(h.pointer(start.x, start.y + 30))
    assert.equal(h.circuit.graph!.modules[0].properties!.power_on, true)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerUp(h.pointer(start.x, start.y))
    assert.equal(h.circuit.graph!.modules[0].properties!.power_on, false)
  } finally { h.dispose() }
})

test('canceling a supply knob restores its pose; Move still moves the entire supply from a knob', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    const start = supplyFront(h, 0.804, 2.128)
    const initialAngle = h.manager.models.get(id)!.getObjectByName('supply-knob-0')!.rotation.z
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(start.x, start.y - 70))
    assert.ok(Math.abs(h.manager.models.get(id)!.getObjectByName('supply-knob-0')!.rotation.z - initialAngle) > 0.5)
    h.editor.cancel()
    assert.equal(h.manager.models.get(id)!.getObjectByName('supply-knob-0')!.rotation.z, initialAngle)
    assert.equal(h.circuit.past.length, 0); assert.equal(h.captured.size, 0)
    h.workspace.setTool('move'); await nextTick()
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerUp(h.pointer(start.x + 80, start.y))
    assert.ok(Math.abs(h.circuit.graph!.modules[0].position!.x!) > 0.1)
    assert.equal(h.circuit.graph!.modules[0].properties!.voltage_v, 0)
  } finally { h.dispose() }
})

test('gizmo X/Z/free handles move on the work plane with live wires and one undo, even in Select', async () => {
  for (const handle of ['x', 'z', 'xz'] as const) {
    const h = setup()
    try {
      const original = { x: 0.13, y: 0.25, z: 0.19 }
      const id = h.circuit.placeModule('CLOCK', original), led = h.circuit.placeModule('LED', { x: -3, y: 0, z: -2 })
      h.circuit.connectPorts(`${id}.OUT`, `${led}.IN`); h.workspace.selectModule(id)
      await nextTick(); h.circuit.past = []
      const origin = h.manager.gizmoHandlePosition(handle)!, start = h.manager.project(origin)
      const target = h.manager.project(origin.clone().add(new Vector3(1.2, 0, 0.8)))
      const endpoint = h.manager.endpointPosition(`${id}.OUT`)!.clone(), camera = h.manager.camera.position.clone()
      h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(target.x, target.y))
      assert.deepEqual(h.circuit.graph!.modules[0].position, original, 'preview cannot change logical graph')
      assert.ok(h.manager.endpointPosition(`${id}.OUT`)!.distanceTo(endpoint) > 0.5, 'named ports and wires follow preview')
      assert.ok(h.manager.camera.position.distanceTo(camera) < 0.0001, 'gizmo must not pan the camera')
      h.editor.pointerUp(h.pointer(target.x, target.y))
      const position = h.circuit.graph!.modules[0].position!
      assert.equal(position.y, original.y)
      if (handle === 'x') assert.equal(position.z, original.z)
      if (handle === 'z') assert.equal(position.x, original.x)
      assert.equal(h.circuit.past.length, 1); assert.equal(h.captured.size, 0)
      h.circuit.undo(); assert.deepEqual(h.circuit.graph!.modules[0].position, original)
      h.circuit.redo(); assert.deepEqual(h.circuit.graph!.modules[0].position, position)
    } finally { h.dispose() }
  }
})

test('Y rotation gizmo previews continuously, snaps to 15 degrees and records one rotation', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('CLOCK', { x: 0, y: 0.4, z: 0 }); h.workspace.selectModule(id)
    await nextTick(); h.circuit.past = []
    const origin = h.manager.gizmoOrigin()!, handle = h.manager.gizmoHandlePosition('rotate-y')!
    const start = h.manager.project(handle), radius = handle.distanceTo(origin)
    const target = rotationTarget(h, 60)
    const endpoint = h.manager.endpointPosition(`${id}.OUT`)!.clone()
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(target.x, target.y))
    assert.ok(h.manager.endpointPosition(`${id}.OUT`)!.distanceTo(endpoint) > 0.2)
    assert.equal(h.circuit.graph!.modules[0].rotation ?? 0, 0)
    h.editor.pointerUp(h.pointer(target.x, target.y))
    assert.equal(h.circuit.graph!.modules[0].rotation, 60)
    assert.equal(h.circuit.graph!.modules[0].position!.y, 0.4)
    assert.equal(h.circuit.past.length, 1)
    h.circuit.undo(); assert.equal(h.circuit.graph!.modules[0].rotation ?? 0, 0)
  } finally { h.dispose() }
})

test('gizmo cancellation and selection changes roll preview back and ignore foreign pointer release', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0.2, z: 0 }), other = h.circuit.placeModule('POWER_SUPPLY', { x: -5, y: 0, z: -3 })
    h.workspace.selectModule(id); await nextTick(); h.circuit.past = []
    const start = h.manager.project(h.manager.gizmoHandlePosition('xz')!)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(start.x + 60, start.y + 30))
    h.editor.pointerUp(h.pointer(start.x + 60, start.y + 30, 2))
    assert.equal(h.captured.size, 1)
    h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(h.captured.size, 0); assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0.2, 0]); assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(start.x + 60, start.y + 30))
    h.workspace.selectModule(other); await nextTick()
    assert.equal(h.captured.size, 0); assert.equal(h.circuit.past.length, 0)
    assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0.2, 0])
  } finally { h.dispose() }
})

test('breadboard snap separates the actual rotated housing after a non-quarter-turn gizmo rotation', () => {
  const modules = [{ id: 'A', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }, { id: 'B', type: 'BREADBOARD', rotation: 30, position: { x: 0, y: 0, z: 3 } }]
  const position = snapPosition({ x: 0, z: 3 }, true, modules, 'BREADBOARD', 'B')
  assert.equal(breadboardBodiesOverlap(modules[0], { ...modules[1], position }), false, 'snap must not overlap the rotated housing contour')
})

test('extreme finite imported yaw docks and rotates like its equivalent heading, with one undo', async () => {
  const rotation = Number.MAX_VALUE, heading = rotation % 360
  const board = { id: 'B', type: 'BREADBOARD', rotation, position: { x: 0, y: 0, z: 0 } }
  assert.deepEqual(snapPosition({ x: 0, z: 0 }, true, [board], 'BREADBOARD'), snapPosition({ x: 0, z: 0 }, true, [{ ...board, rotation: heading }], 'BREADBOARD'))
  const h = setup()
  try {
    h.circuit.importGraph({ schema_version: '1.0', circuit_id: 'extreme', modules: [{ id: 'C', type: 'CLOCK', rotation }], connections: [] })
    h.workspace.selectModule('C'); h.workspace.snap = false
    await nextTick(); h.circuit.past = []
    const origin = h.manager.gizmoOrigin()!, handle = h.manager.gizmoHandlePosition('rotate-y')!
    const start = h.manager.project(handle)
    const target = rotationTarget(h, 60)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerUp(h.pointer(target.x, target.y))
    assert.ok(Math.abs(h.circuit.graph!.modules[0].rotation! - (heading + 60) % 360) < 0.01)
    assert.equal(h.circuit.past.length, 1)
    assert.ok(h.manager.models.get('C')!.matrixWorld.elements.every(Number.isFinite))
    h.circuit.undo(); await nextTick()
    assert.equal(h.circuit.graph!.modules[0].rotation, rotation)
    assert.ok(h.manager.models.get('C')!.matrixWorld.elements.every(Number.isFinite))
  } finally { h.dispose() }
})

test('Move left drag moves a breadboard, previews without graph mutation and commits one undo', async () => {
  const h = setup('move')
  try {
    const original = { x: 0.13, y: 0.25, z: 0.19 }
    const id = h.circuit.placeModule('BREADBOARD', original)
    await nextTick(); h.circuit.past = []
    const start = h.manager.project(new Vector3(original.x, original.y + 0.12, original.z))
    assert.equal(h.manager.pick(start.x, start.y)?.kind, 'module')
    h.editor.pointerDown(h.pointer(start.x, start.y))
    h.editor.pointerMove(h.pointer(start.x + 80, start.y + 55))
    assert.ok(h.manager.models.get(id)!.position.distanceTo(new Vector3(original.x, original.y, original.z)) > 0.5)
    assert.deepEqual(h.circuit.graph!.modules[0].position, original)
    h.editor.pointerMove(h.pointer(start.x + 120, start.y + 65))
    h.editor.pointerUp(h.pointer(start.x + 120, start.y + 65))
    assert.equal(h.circuit.past.length, 1)
    assert.equal(h.circuit.graph!.modules[0].position!.y, original.y)
    assert.equal(h.captured.size, 0)
    h.circuit.undo(); assert.deepEqual(h.circuit.graph!.modules[0].position, original)
    h.circuit.redo(); assert.notDeepEqual(h.circuit.graph!.modules[0].position, original)
  } finally { h.dispose() }
})

test('left drag of empty surface grabs the XZ plane after orbit without graph/history changes', () => {
  const h = setup()
  try {
    h.manager.orbit(70)
    const before = h.manager.camera.position.clone(), rotation = h.manager.camera.quaternion.clone()
    const grabbed = h.manager.groundPoint(300, 450)!
    const graph = JSON.stringify(h.circuit.graph)
    h.editor.pointerDown(h.pointer(300, 450))
    h.editor.pointerMove(h.pointer(400, 480))
    h.editor.pointerMove(h.pointer(460, 510))
    h.editor.pointerUp(h.pointer(460, 510))
    assert.ok(h.manager.camera.position.distanceTo(before) > 1)
    assert.ok(h.manager.groundPoint(460, 510)!.distanceTo(grabbed) < 0.0001)
    assert.ok(h.manager.camera.quaternion.angleTo(rotation) < 0.0001)
    assert.equal(h.manager.camera.position.y, before.y)
    assert.equal(JSON.stringify(h.circuit.graph), graph)
    assert.equal(h.circuit.past.length, 0)
    assert.equal(h.captured.size, 0)
  } finally { h.dispose() }
})

test('click/jitter on an unsnapped model does not snap it or record history', async () => {
  const h = setup('move')
  try {
    const original = { x: 0.13, y: 0, z: 0.19 }
    const id = h.circuit.placeModule('BREADBOARD', original)
    await nextTick(); h.circuit.past = []
    const p = h.manager.project(new Vector3(original.x, 0.12, original.z))
    h.editor.pointerDown(h.pointer(p.x, p.y))
    h.editor.pointerMove(h.pointer(p.x + 1, p.y + 1))
    h.editor.pointerUp(h.pointer(p.x + 1, p.y + 1))
    assert.equal(h.workspace.selectedModuleId, id)
    assert.deepEqual(h.circuit.graph!.modules[0].position, original)
    assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('cancelled model drag releases capture and restores geometry without changing wires', async () => {
  const h = setup('move')
  try {
    const id = h.circuit.placeModule('DIGITAL_SWITCH', { x: 0, y: 0, z: 0 })
    const led = h.circuit.placeModule('LED', { x: 4, y: 0, z: 0 })
    h.circuit.connectPorts(`${id}.OUT`, `${led}.IN`)
    await nextTick(); h.circuit.past = []
    const graph = JSON.stringify(h.circuit.graph)
    const p = h.manager.project(new Vector3(0, 0.15, 0))
    h.editor.pointerDown(h.pointer(p.x, p.y))
    h.editor.pointerMove(h.pointer(p.x + 100, p.y + 50))
    assert.ok(h.manager.models.get(id)!.position.length() > 0.5)
    h.editor.cancel()
    assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0, 0])
    assert.equal(JSON.stringify(h.circuit.graph), graph)
    assert.equal(h.circuit.past.length, 0)
    assert.equal(h.captured.size, 0)
  } finally { h.dispose() }
})

test('pan preserves selection/pending wire; a blank click clears them without moving the camera', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('CLOCK', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    h.workspace.setTool('wire'); h.workspace.selectModule(id); h.workspace.pendingPort = `${id}.OUT`
    await nextTick()
    h.editor.pointerDown(h.pointer(200, 520)); h.editor.pointerMove(h.pointer(250, 560)); h.editor.pointerUp(h.pointer(250, 560))
    assert.equal(h.workspace.selectedModuleId, id)
    assert.equal(h.workspace.pendingPort, `${id}.OUT`)
    const camera = h.manager.camera.position.clone()
    h.editor.pointerDown(h.pointer(200, 520)); h.editor.pointerUp(h.pointer(200, 520))
    assert.equal(h.workspace.selectedModuleId, null)
    assert.equal(h.workspace.pendingPort, null)
    assert.ok(h.manager.camera.position.distanceTo(camera) < 0.0001)
    assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('Select drags a viewport-filling breadboard to pan and only selects on a click release', async () => {
  const h = setup()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.circuit.past = []
    h.manager.setViewOrientation('TOP', false); h.manager.setZoom(1000)
    const hit = h.manager.pick(500, 350)!
    assert.equal(hit.kind, 'module')
    const anchor = hit.point.clone(), camera = h.manager.camera.position.clone(), target = h.manager.target(), heading = h.manager.camera.quaternion.clone(), graph = h.circuit.snapshot()
    h.editor.pointerDown(h.pointer(500, 350))
    assert.equal(h.workspace.selectedModuleId, null)
    h.editor.pointerMove(h.pointer(560, 390)); h.editor.pointerUp(h.pointer(560, 390)); await nextTick()
    assert.equal(h.workspace.selectedModuleId, null)
    assert.ok(h.manager.camera.position.distanceTo(camera) > .01)
    assert.ok(h.manager.camera.position.clone().sub(camera).distanceTo(h.manager.target().sub(target)) < 1e-6)
    assert.ok(h.manager.camera.quaternion.angleTo(heading) < 1e-6)
    const projected = h.manager.project(anchor)
    assert.ok(Math.hypot(projected.x - 560, projected.y - 390) < 1e-6)
    assert.equal(h.circuit.snapshot(), graph); assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.pointer(500, 350)); h.editor.pointerUp(h.pointer(501, 351)); await nextTick()
    assert.equal(h.workspace.selectedModuleId, bb); assert.equal(h.captured.size, 0)
  } finally { h.dispose() }
})

test('only the captured pointer can move/finish a model; changing tools cancels its preview', async () => {
  const h = setup('move')
  try {
    const id = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    const p = h.manager.project(new Vector3(0, 0.12, 0))
    h.editor.pointerDown(h.pointer(p.x, p.y))
    h.editor.pointerMove(h.pointer(p.x + 100, p.y + 50, 2)); h.editor.pointerUp(h.pointer(p.x + 100, p.y + 50, 2))
    assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0, 0])
    assert.equal(h.captured.size, 1)
    h.editor.pointerMove(h.pointer(p.x + 100, p.y + 50))
    assert.ok(h.manager.models.get(id)!.position.length() > 0.5)
    h.workspace.setTool('select'); await nextTick()
    assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0, 0])
    assert.equal(h.captured.size, 0)
    h.editor.pointerUp(h.pointer(p.x + 100, p.y + 50))
    assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('Wire and Rotate tools keep their click actions instead of starting a model drag', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('DIGITAL_SWITCH', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    h.workspace.setTool('wire'); await nextTick()
    const port = h.manager.project(h.manager.endpointPosition(`${id}.OUT`)!)
    h.editor.pointerDown(h.pointer(port.x, port.y))
    assert.equal(h.workspace.pendingPort, `${id}.OUT`)
    assert.equal(h.captured.size, 0)
    h.workspace.setTool('rotate'); await nextTick()
    const body = h.manager.project(new Vector3(0, 0.15, 0))
    h.editor.pointerDown(h.pointer(body.x, body.y)); h.editor.pointerMove(h.pointer(body.x + 100, body.y + 50)); h.editor.pointerUp(h.pointer(body.x + 100, body.y + 50))
    assert.equal(h.circuit.graph!.modules[0].rotation, 90)
    assert.deepEqual(h.circuit.graph!.modules[0].position, { x: 0, y: 0, z: 0 })
    assert.equal(h.circuit.past.length, 1)
    assert.equal(h.captured.size, 0)
  } finally { h.dispose() }
})

test('a visible model can be dragged at a low orbit angle even when its ray misses the ground', async () => {
  const h = setup('move')
  try {
    const id = h.circuit.placeModule('LED', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    h.manager.camera.position.set(0, 3 * Math.cos(Math.PI / 2 - 0.05), 3 * Math.sin(Math.PI / 2 - 0.05))
    h.manager.camera.lookAt(0, 0, 0)
    const p = h.manager.project(new Vector3(0, 0.45, 0))
    assert.equal(p.visible, true)
    assert.equal(h.manager.pick(p.x, p.y)?.kind, 'module')
    assert.equal(h.manager.groundPoint(p.x, p.y), null)
    h.editor.pointerDown(h.pointer(p.x, p.y))
    assert.equal(h.captured.size, 1)
    h.editor.pointerMove(h.pointer(p.x + 180, p.y))
    assert.ok(h.manager.models.get(id)!.position.length() >= 0.5)
    h.editor.pointerUp(h.pointer(p.x + 180, p.y))
    assert.equal(h.circuit.past.length, 1)
    assert.equal(h.circuit.graph!.modules[0].position!.y, 0)
  } finally { h.dispose() }
})

test('Select click releases pick models without changing camera, geometry or history', async () => {
  for (const type of ['BREADBOARD', 'LED']) {
    const h = setup()
    try {
      const original = { x: 0, y: 0, z: 0 }
      const id = h.circuit.placeModule(type, original)
      await nextTick(); h.circuit.past = []
      const camera = h.manager.camera.position.clone()
      const p = h.manager.project(new Vector3(0, type === 'LED' ? 0.45 : 0.12, 0))
      assert.equal(h.manager.pick(p.x, p.y)?.kind, 'module')
      h.editor.pointerDown(h.pointer(p.x, p.y))
      assert.equal(h.workspace.selectedModuleId, null, 'selection waits until release below the drag threshold')
      h.editor.pointerMove(h.pointer(p.x + 1, p.y + 1))
      h.editor.pointerUp(h.pointer(p.x + 1, p.y + 1))
      assert.equal(h.workspace.selectedModuleId, id)
      assert.deepEqual(h.manager.models.get(id)!.position.toArray(), [0, 0, 0])
      assert.deepEqual(h.circuit.graph!.modules[0].position, original)
      assert.ok(h.manager.camera.position.distanceTo(camera) < 0.0001)
      assert.equal(h.captured.size, 0)
      assert.equal(h.circuit.past.length, 0)
    } finally { h.dispose() }
  }
})

test('picking a model opens one passive Component Info panel without interrupting Move capture', async () => {
  const h = setup('move')
  try {
    const id = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    await nextTick(); h.circuit.past = []
    const p = h.manager.project(new Vector3(0, 0.32, 0.3))
    h.editor.pointerDown(h.pointer(p.x, p.y)); await nextTick()
    const ui = useUiStore(), info = ui.windows.find((window) => window.kind === 'component-info')
    assert.ok(info?.open, 'selection must open Component Info')
    assert.equal(info.activation, 0, 'automatic information must not steal canvas focus')
    assert.equal(h.captured.size, 1)
    assert.equal(h.workspace.selectedModuleId, id)
    h.editor.pointerMove(h.pointer(p.x + 100, p.y + 50)); h.editor.pointerUp(h.pointer(p.x + 100, p.y + 50)); await nextTick()
    assert.equal(h.circuit.past.length, 1)
    assert.equal(ui.windows.filter((window) => window.kind === 'component-info').length, 1)
  } finally { h.dispose() }
})

test('active 3D model placement places on left click and exits on right click', async () => {
  const h = setup()
  try {
    h.workspace.armPlacement('RESISTOR')
    assert.equal(h.workspace.placementType, 'RESISTOR')
    const center = h.manager.project(new Vector3(0, 0, 0))
    h.editor.pointerMove(h.pointer(center.x, center.y))
    assert.ok(h.manager.scene.children.some((child) => child.userData.id === 'PLACE'))

    let prevented = false, stopped = false
    const rightClick = {
      clientX: center.x,
      clientY: center.y,
      pointerId: 1,
      button: 2,
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
      stopImmediatePropagation() { stopped = true },
    } as unknown as PointerEvent
    h.editor.pointerDown(rightClick)
    assert.equal(h.workspace.placementType, null)
    assert.ok(!h.manager.scene.children.some((child) => child.userData.id === 'PLACE'))
    assert.equal(h.circuit.graph!.modules.length, 0)

    h.workspace.armPlacement('RESISTOR')
    assert.equal(h.workspace.placementType, 'RESISTOR')
    const leftClick = h.pointer(center.x, center.y, 1, 0)
    h.editor.pointerDown(leftClick)
    assert.equal(h.workspace.placementType, null)
    assert.equal(h.circuit.graph!.modules.length, 1)
    assert.equal(h.circuit.graph!.modules[0].type, 'RESISTOR')
  } finally { h.dispose() }
})

test('Component Info closes on cleared or deleted selection and opens for an independent placement draft', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const ui = useUiStore()
    await nextTick(); h.workspace.selectModule(id); await nextTick()
    const info = () => ui.windows.find((window) => window.kind === 'component-info')
    assert.equal(info()?.open, true)
    h.workspace.clearSelection(); await nextTick()
    assert.equal(info()?.open, false, 'blank workspace must have no Info panel')
    h.workspace.selectModule(id); await nextTick(); h.workspace.armPlacement('BREADBOARD_630'); await nextTick()
    assert.equal(info()?.open, true, 'the new placement draft exposes its properties before an instance exists')
    assert.equal(h.workspace.selectedModuleId,null)
    assert.equal(h.circuit.graph!.modules.length,1,'opening draft Info must not create an instance')
    h.workspace.selectModule(id); await nextTick(); h.circuit.removeModule(id); await nextTick()
    assert.equal(info()?.open, false, 'deleting the selected model must hide Info')
  } finally { h.dispose() }
})

test('breadboard magnetic docking snaps adjacent boards seamlessly without gaps and avoids overlapping', () => {
  const bb1 = { id: 'bb1', type: 'BREADBOARD_630', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
  const modules = [bb1]

  // Test 1: BB630 approaches bottom edge of BB630 (target Z=2.0 near dock 1.86)
  const dockSouth = snapPosition({ x: 0.1, z: 2.0 }, true, modules, 'BREADBOARD_630')
  assert.deepEqual(dockSouth, { x: 0, y: 0, z: 1.86 })

  // Test 2: BB630 approaches top edge of BB630 (target Z=-1.7 near dock -1.86)
  const dockNorth = snapPosition({ x: -0.1, z: -1.7 }, true, modules, 'BREADBOARD_630')
  assert.deepEqual(dockNorth, { x: 0, y: 0, z: -1.86 })

  // Test 3: BB100 (Power Breadboard) approaches BB630 bottom edge (target Z=1.3 near dock 1.19)
  const dockPower = snapPosition({ x: 0.2, z: 1.3 }, true, modules, 'BREADBOARD_100')
  assert.deepEqual(dockPower, { x: 0, y: 0, z: 1.19 })

  // Test 4: BB100 approaches BB100 bottom edge (target Z=0.6 near dock 0.52)
  const p1 = { id: 'p1', type: 'BREADBOARD_100', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
  const dockPowerToPower = snapPosition({ x: 0.1, z: 0.6 }, true, [p1], 'BREADBOARD_100')
  assert.deepEqual(dockPowerToPower, { x: 0, y: 0, z: 0.52 })

  // Test 5: Anti-overlap: Dragging BB630 directly inside existing BB630 (target Z=0.4)
  const antiOverlap = snapPosition({ x: 0, z: 0.4 }, true, modules, 'BREADBOARD_630')
  assert.deepEqual(antiOverlap, { x: 0, y: 0, z: 1.86 })

  // Test 6: Side-by-side docking along X (target X=8.8, Z=0.2 near dock 9.0)
  const dockSide = snapPosition({ x: 8.8, z: 0.2 }, true, modules, 'BREADBOARD_630')
  assert.deepEqual(dockSide, { x: 9.0, y: 0, z: 0 })

  // Test 7: Resistors placed on breadboard are not blocked or pushed away
  const resistorPos = snapPosition({ x: 0.4, z: 0.6 }, true, modules, 'RESISTOR')
  assert.deepEqual(resistorPos, { x: 0.5, y: 0, z: 0.5 })
})

test('gizmo delete handle removes the selected component with undo support', async () => {
  const h = setup()
  try {
    const id = h.circuit.placeModule('CLOCK', { x: 0, y: 0.4, z: 0 }); h.workspace.selectModule(id)
    await nextTick(); h.circuit.past = []
    const delPos = h.manager.gizmoHandlePosition('delete')!
    const start = h.manager.project(delPos)
    assert.equal(h.manager.pickGizmo(start.x, start.y)?.handle, 'delete')
    h.editor.pointerDown(h.pointer(start.x, start.y))
    assert.equal(h.circuit.graph!.modules.length, 0, 'component must be deleted')
    assert.equal(h.circuit.past.length, 1)
    h.circuit.undo(); await nextTick()
    assert.equal(h.circuit.graph!.modules.length, 1)
    assert.equal(h.circuit.graph!.modules[0].id, id)
  } finally { h.dispose() }
})

function placementGhost(h: ReturnType<typeof setup>) {
  return h.manager.scene.children.find((child) => child.userData.id === 'PLACE')!
}
async function previewPlacement(h: ReturnType<typeof setup>, type = 'CLOCK', position = new Vector3()) {
  h.workspace.armPlacement(type); await nextTick()
  const point = h.manager.project(position)
  h.editor.pointerMove(h.pointer(point.x, point.y)); await nextTick()
  assert.ok(placementGhost(h))
}

for (const path of ['follow', 'immediate', 'drop'] as const) {
  test(`${path} Power Supply placement uses the same world yaw across camera views and one Undo step`, async () => {
    for (const view of ['TOP-FRONT', 'TOP-RIGHT', 'TOP-BACK', 'TOP-LEFT', 'TOP-BACK-RIGHT', 'TOP'] as const) {
      const h = setup()
      try {
        h.manager.setViewOrientation(view, false)
        const p = h.manager.project(new Vector3())
        if (path === 'drop') h.editor.drop({ clientX: p.x, clientY: p.y, preventDefault() {}, dataTransfer: { getData: () => 'POWER_SUPPLY' } } as unknown as DragEvent)
        else {
          h.workspace.armPlacement('POWER_SUPPLY'); await nextTick()
          if (path === 'follow') {
            h.editor.pointerMove(h.pointer(p.x, p.y))
            assert.ok(Math.abs(placementGhost(h).rotation.y) < 1e-8, `${path}/${view} preview`)
            assert.equal(h.circuit.past.length, 0)
          }
          const click = path === 'follow' ? h.pointer(80, 620) : h.pointer(p.x, p.y)
          assert.equal(h.manager.pickGizmo(click.clientX, click.clientY), null, 'commit click must avoid existing transform handles')
          h.editor.pointerDown(click)
        }
        await nextTick()
        const module = h.circuit.graph!.modules[0]
        assert.ok(module, `${path}/${view} commits`)
        assert.ok(Math.abs(module.rotation!) < 1e-8, `${path}/${view} world rotation`)
        assert.equal(h.circuit.past.length, 1)
        h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 0)
        h.circuit.redo(); await nextTick(); assert.deepEqual(h.circuit.graph!.modules[0], module)
      } finally { h.dispose() }
    }
  })
}

const placementViews = ['default', 'FRONT', 'RIGHT', 'BACK', 'LEFT', 'TOP', 'TOP-FRONT-RIGHT', 'orbit37', 'orbit123'] as const
function placementView(h: ReturnType<typeof setup>, view: typeof placementViews[number]) {
  // Fit targets the actual positive-height housing center. Even an exact side
  // view can then recover a y=0 world pointer below its horizontal horizon.
  h.manager.fitCircuit()
  assert.ok(h.manager.target().y > 0)
  if (view === 'orbit37' || view === 'orbit123') h.manager.orbit(view === 'orbit37' ? 37 : 123)
  else if (view !== 'default') h.manager.setViewOrientation(view, false)
}

for (const [type, dockZ] of [['BREADBOARD', 2.66], ['BREADBOARD_630', 2.26], ['BREADBOARD_100', 1.59]] as const) {
  for (const path of ['follow', 'immediate', 'drop'] as const) {
    test(`${type} ${path} docks the same world pose across camera views`, async () => {
      let referencePose: { position: unknown; rotation: number | undefined } | null = null
      for (const view of placementViews) {
        const h = setup()
        try {
          const fixed = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
          await nextTick(); h.circuit.past = []; placementView(h, view)
          const world = new Vector3(.1, 0, dockZ + .2), p = h.manager.project(world)
          assert.ok(p.visible, `${view}: pointer is in the actual viewport`)
          assert.ok(h.manager.groundPoint(p.x, p.y)!.distanceTo(world) < 1e-7, `${view}: real camera unprojects the same world pointer`)
          if (path === 'drop') h.editor.drop({ clientX: p.x, clientY: p.y, preventDefault() {}, dataTransfer: { getData: () => type } } as unknown as DragEvent)
          else {
            h.workspace.armPlacement(type); await nextTick()
            if (path === 'follow') {
              h.editor.pointerMove(h.pointer(p.x, p.y))
              const ghost = placementGhost(h)
              assert.ok(ghost, `${type}/${view}: draft exists`)
              assert.ok(Math.abs(ghost.rotation.y) < 1e-9, `${type}/${view}: mechanical draft is world-aligned`)
              assert.ok(ghost.position.distanceTo(new Vector3(0, 0, dockZ)) < 1e-8)
              assert.equal(h.circuit.past.length, 0)
            }
            const click = path === 'follow' ? h.pointer(80, 620) : h.pointer(p.x, p.y)
            assert.equal(h.manager.pickGizmo(click.clientX, click.clientY), null)
            h.editor.pointerDown(click)
          }
          await nextTick()
          const module = h.circuit.graph!.modules[1]
          assert.ok(module, `${type}/${view}/${path}: placement commits`)
          assert.equal(module.rotation, 0)
          assert.ok(Math.hypot(module.position!.x!, module.position!.y!, module.position!.z! - dockZ) < 1e-8)
          const pose = { position: { ...module.position }, rotation: module.rotation }
          if (!referencePose) referencePose = pose
          else assert.deepEqual(pose, referencePose, 'committed world pose must be exactly camera-invariant')
          assert.equal(isMechanicalBreadboardDock(h.circuit.graph!.modules.find(module => module.id === fixed)!, module), true)
          assert.equal(breadboardBodiesOverlap(h.circuit.graph!.modules[0], module), false)
          assert.equal(h.circuit.past.length, 1)
          h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 1)
          h.circuit.redo(); await nextTick(); assert.deepEqual(h.circuit.graph!.modules[1], module)
        } finally { h.dispose() }
      }
    })
  }
}

test('mechanical and generic gizmos use their own snap policy; Snap OFF retains explicit fine rotation', async () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100', 'POWER_SUPPLY']) {
    for (const target of ['placement', 'module'] as const) for (const snap of [true, false]) {
      const h = setup()
      try {
        h.workspace.snap = snap
        if (target === 'placement') await previewPlacement(h, type)
        else { const id = h.circuit.placeModule(type, { x: 0, y: 0, z: 0 }); h.workspace.selectModule(id); await nextTick() }
        h.circuit.past = []
        const center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!, start = h.manager.project(grip)
        const degrees = snap ? 60 : 37
        const end = rotationTarget(h, degrees)
        h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(end.x, end.y))
        assert.equal(h.circuit.past.length, 0)
        h.editor.pointerUp(h.pointer(end.x, end.y)); await nextTick()
        const expected = snap ? type === 'POWER_SUPPLY' ? 60 : 90 : 37
        const model = target === 'placement' ? placementGhost(h) : [...h.manager.models.values()][0]
        assert.ok(Math.abs(model.rotation.y * 180 / Math.PI - expected) < 1e-7, `${type}/${target}/snap=${snap}`)
        assert.equal(h.circuit.past.length, target === 'module' ? 1 : 0)
        if (target === 'module') { h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules[0].rotation ?? 0, 0); h.circuit.redo(); await nextTick(); assert.equal(h.circuit.graph!.modules[0].rotation, expected) }
      } finally { h.dispose() }
    }
  }
})

test('a mechanical draft retains its explicit world rotation and pose through navigation, follow and one pose commit', async () => {
  const h = setup()
  try {
    h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }, 90); await nextTick(); h.circuit.past = []
    await previewPlacement(h, 'BREADBOARD', new Vector3(12, 0, 0))
    const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!, start = h.manager.project(grip)
    const end = rotationTarget(h, 60)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y))
    const pose = ghost.position.clone(), matrix = ghost.matrixWorld.clone()
    assert.ok(Math.abs(ghost.rotation.y * 180 / Math.PI - 90) < 1e-8)
    for (const navigate of [() => h.manager.orbit(37), () => h.manager.pan(1, -2), () => h.manager.setZoom(175), () => h.manager.setViewOrientation('TOP-BACK-RIGHT', false), () => h.manager.resetView()]) {
      navigate(); await nextTick()
      assert.ok(ghost.position.equals(pose)); assert.ok(ghost.matrixWorld.equals(matrix), 'camera-only changes cannot move/reinitialize the active draft')
      assert.equal(h.circuit.past.length, 0)
    }
    const world = new Vector3(2.86, 0, .1), pointer = h.manager.project(world)
    h.editor.pointerMove(h.pointer(pointer.x, pointer.y))
    assert.ok(Math.abs(ghost.rotation.y * 180 / Math.PI - 90) < 1e-8)
    assert.ok(ghost.position.distanceTo(new Vector3(2.66, 0, 0)) < 1e-8, 'explicitly rotated board follows into its matching world dock')
    h.editor.pointerDown(h.pointer(80, 620)); await nextTick()
    const module = h.circuit.graph!.modules[1]
    assert.equal(module.rotation, 90); assert.equal(isMechanicalBreadboardDock(h.circuit.graph!.modules[0], module), true)
    assert.equal(h.circuit.past.length, 1)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 1)
    h.circuit.redo(); await nextTick(); assert.deepEqual(h.circuit.graph!.modules[1], module)
  } finally { h.dispose() }
})

test('180-degree camera orbit preserves world yaw in both current and new placement drafts', async () => {
  const h = setup()
  try {
    h.manager.orbit(180)
    await previewPlacement(h, 'POWER_SUPPLY')
    const ghost = placementGhost(h)
    assert.ok(Math.abs(ghost.rotation.y) < 1e-8)
    h.manager.orbit(180); h.editor.cancel()
    const target = new Vector3(3, 0, -3), p = h.manager.project(target)
    h.editor.pointerMove(h.pointer(p.x, p.y))
    assert.ok(ghost.position.distanceTo(target) < 1e-8)
    assert.ok(Math.abs(ghost.rotation.y) < 1e-8, 'camera navigation cannot overwrite an existing draft')
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 0)
    h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
    await previewPlacement(h, 'POWER_SUPPLY')
    assert.ok(Math.abs(placementGhost(h).rotation.y) < 1e-8, 'a new draft starts in the same world frame')
  } finally { h.dispose() }
})

test('manual Rotate Y adds to the world-aligned draft and survives follow, commit and Undo/Redo', async () => {
  const h = setup()
  try {
    h.manager.setViewOrientation('TOP-BACK', false)
    await previewPlacement(h, 'POWER_SUPPLY')
    const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!
    const start = h.manager.project(grip)
    assert.equal(h.manager.pickGizmo(start.x, start.y)?.handle, 'rotate-y')
    const end = rotationTarget(h, 60)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y))
    assert.ok(Math.abs(ghost.rotation.y * 180 / Math.PI - 60) < 1e-8)
    h.manager.orbit(45); h.editor.cancel()
    const target = new Vector3(-5, 0, -3), p = h.manager.project(target)
    assert.equal(h.manager.pickGizmo(p.x, p.y), null, 'resumed follow must avoid the transformed gizmo')
    h.editor.pointerMove(h.pointer(p.x, p.y))
    assert.ok(ghost.position.distanceTo(target) < 1e-8)
    assert.ok(Math.abs(ghost.rotation.y * 180 / Math.PI - 60) < 1e-8)
    assert.equal(h.circuit.past.length, 0)
    const commit = h.pointer(80, 620)
    assert.equal(h.manager.pickGizmo(commit.clientX, commit.clientY), null, 'commit click avoids the gizmo at the followed pose')
    h.editor.pointerDown(commit); await nextTick()
    const module = h.circuit.graph!.modules[0], model = h.manager.models.get(module.id)!, matrix = model.matrixWorld.clone()
    assert.equal(module.rotation, 60); assert.deepEqual(module.position, { x: -5, y: 0, z: -3 }); assert.equal(h.circuit.past.length, 1)
    h.manager.orbit(180)
    assert.equal(module.rotation, 60); assert.ok(model.matrixWorld.equals(matrix), 'committed world pose is independent of navigation')
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 0)
    h.circuit.redo(); await nextTick(); assert.deepEqual(h.circuit.graph!.modules[0], module)
    assert.ok(Math.abs(h.manager.models.get(module.id)!.rotation.y * 180 / Math.PI - 60) < 1e-8)
  } finally { h.dispose() }
})

test('placement ghost exposes X/Z/XZ/Rotate Y, pauses follow on handles and resumes after the gesture', async () => {
  for (const handle of ['x', 'z', 'xz'] as const) {
    const h = setup()
    try {
      h.circuit.placeModule('LED', { x: -3, y: 0, z: -2 }); h.circuit.undo(); await nextTick()
      await previewPlacement(h)
      const snapshot = h.circuit.snapshot(), history = [...h.circuit.past], future = [...h.circuit.future]
      assert.equal(future.length, 1, 'editing a placement draft must preserve the existing redo branch')
      const ghost = placementGhost(h), original = ghost.position.clone(), camera = h.manager.camera.position.clone()
      if (handle === 'xz') acquirePlacementGizmo(h)
      assert.equal(h.manager.scene.children.filter((child) => child.name === 'component-transform-gizmo').length, 1)
      for (const part of ['x', 'z', 'xz', 'rotate-y'] as const) assert.ok(h.manager.gizmoHandlePosition(part), part)
      assert.equal(h.manager.gizmoHandlePosition('delete'), null)
      const origin = h.manager.gizmoHandlePosition(handle)!, start = h.manager.project(origin)
      h.editor.pointerMove(h.pointer(start.x, start.y))
      assert.deepEqual(ghost.position.toArray(), original.toArray())
      assert.equal(h.manager.pickGizmo(start.x, start.y)?.handle, handle)
      h.editor.pointerDown(h.pointer(start.x, start.y))
      assert.equal(h.captured.size, 1); assert.equal(h.workspace.placementType, 'CLOCK')
      const end = h.manager.project(origin.clone().add(new Vector3(1.2, 0, 0.8)))
      h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y)); await nextTick()
      const pose = ghost.position.toArray()
      assert.ok(ghost.position.distanceTo(original) > 0.5)
      if (handle === 'x') assert.equal(ghost.position.z, original.z)
      if (handle === 'z') assert.equal(ghost.position.x, original.x)
      assert.equal(h.captured.size, 0); assert.equal(h.circuit.snapshot(), snapshot)
      assert.deepEqual(h.circuit.past, history); assert.deepEqual(h.circuit.future, future)
      assert.equal(h.workspace.selectedModuleId, null); assert.equal(h.manager.models.size, 0)
      assert.equal(h.manager.endpointPosition('PLACE.OUT'), null)
      assert.equal(useUiStore().windows.some((window) => window.kind === 'component-info' && window.open), false)
      const expected = snapPosition(h.manager.groundPoint(120, 550)!, h.workspace.snap, [], 'CLOCK')
      h.editor.pointerMove(h.pointer(120, 550))
      assert.deepEqual(ghost.position.toArray(), [expected.x, expected.y, expected.z], 'normal movement resumes follow')
      assert.notDeepEqual(ghost.position.toArray(), pose)
      h.editor.pointerLeave(); h.editor.cancel(); h.editor.sync(); await nextTick()
      assert.deepEqual(placementGhost(h).position.toArray(), [expected.x, expected.y, expected.z])
      assert.deepEqual(h.manager.camera.position.toArray(), camera.toArray())
    } finally { h.dispose() }
  }
})

test('placement Rotate Y and movement commit the entire pose atomically and Undo/Redo need one step', async () => {
  const h = setup()
  try {
    await previewPlacement(h)
    const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!
    const start = h.manager.project(grip), radius = grip.distanceTo(center)
    const end = rotationTarget(h, 60)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y)); await nextTick()
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 60)
    const x = h.manager.gizmoHandlePosition('x')!, a = h.manager.project(x), b = h.manager.project(x.clone().add(new Vector3(1.5, 0, 0)))
    h.editor.pointerDown(h.pointer(a.x, a.y)); h.editor.pointerMove(h.pointer(b.x, b.y)); h.editor.pointerUp(h.pointer(b.x, b.y))
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 0)
    h.editor.pointerMove(h.pointer(120, 550))
    const pose = { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z }
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 60)
    h.editor.pointerDown(h.pointer(120, 550)); await nextTick()
    const module = h.circuit.graph!.modules[0]
    assert.deepEqual(module.position, pose); assert.equal(module.rotation, 60)
    assert.equal(h.circuit.past.length, 1); assert.equal(h.workspace.selectedModuleId, module.id)
    assert.equal(h.workspace.placementType, null); assert.equal(!!placementGhost(h), false)
    for (const part of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) assert.ok(h.manager.gizmoHandlePosition(part), part)
    assert.equal(h.manager.models.size, 1)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 0)
    h.circuit.redo(); await nextTick(); assert.equal(JSON.stringify(h.circuit.graph!.modules[0]), JSON.stringify(module))
  } finally { h.dispose() }
})

test('Escape/right-click completely discard placement without module deletion', async () => {
  for (const action of ['escape', 'right', 'context-menu'] as const) {
    const h = setup()
    try {
      await previewPlacement(h)
      let removals = 0; h.circuit.removeModule = () => { removals++ }
      if (action === 'escape') {
        acquirePlacementGizmo(h)
        const point = h.manager.project(h.manager.gizmoHandlePosition('xz')!)
        h.editor.pointerDown(h.pointer(point.x, point.y)); h.editor.pointerMove(h.pointer(point.x + 50, point.y + 20))
        h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
      } else if (action === 'right') h.editor.pointerDown(h.pointer(500, 350, 1, 2))
      else h.editor.contextMenu({ preventDefault() {} } as MouseEvent)
      await nextTick()
      assert.equal(removals, 0); assert.equal(h.workspace.placementType, null)
      assert.equal(!!placementGhost(h), false); assert.equal(h.manager.gizmoOrigin(), null)
      assert.equal(h.captured.size, 0); assert.equal(h.circuit.past.length, 0)
      assert.equal(h.circuit.graph!.modules.length, 0)
    } finally { h.dispose() }
  }
})

test('ghost gestures ignore foreign pointers and discard draft on tool/type/graph changes', async () => {
  for (const change of ['tool', 'type', 'graph', 'lost-capture'] as const) {
    const h = setup()
    try {
      await previewPlacement(h)
      acquirePlacementGizmo(h)
      const ghost = placementGhost(h), start = h.manager.project(h.manager.gizmoHandlePosition('xz')!)
      h.editor.pointerDown(h.pointer(start.x, start.y, 7))
      h.editor.pointerMove(h.pointer(start.x + 60, start.y + 30, 8)); h.editor.pointerUp(h.pointer(start.x + 60, start.y + 30, 8))
      h.editor.lostPointerCapture({ pointerId: 8 } as PointerEvent)
      assert.equal(ghost.position.length(), 0); assert.equal(h.captured.size, 1)
      h.editor.pointerMove(h.pointer(start.x + 60, start.y + 30, 7))
      if (change === 'tool') h.workspace.setTool('wire')
      else if (change === 'type') h.workspace.armPlacement('LED')
      else if (change === 'graph') h.circuit.createDraft()
      else h.editor.lostPointerCapture({ pointerId: 7 } as PointerEvent)
      await nextTick()
      assert.equal(h.captured.size, 0); assert.equal(!!placementGhost(h), false)
      assert.equal(h.circuit.graph!.modules.length, 0)
      assert.equal(h.circuit.past.length, change === 'graph' ? 1 : 0)
    } finally { h.dispose() }
  }
})

test('draft breadboard docking and anti-overlap use its explicit 90/180 degree rotation', () => {
  const boards = [{ id: 'A', type: 'BREADBOARD', rotation: 0, position: { x: 0, y: 0, z: 0 } }]
  for (const rotation of [0, 90, 180, 270]) {
    const depth = rotation === 90 ? 9 : 2.66, dock = (2.66 + depth) / 2
    const approached = { id: 'B', type: 'BREADBOARD', rotation, position: snapPosition({ x: 0.1, z: dock + 0.2 }, true, boards, 'BREADBOARD', null, 0, rotation) }
    assert.equal(breadboardBodiesOverlap(boards[0], approached), false)
    assert.equal(isMechanicalBreadboardDock(boards[0], approached), rotation === 0, 'only compatible male/female sides magnetically mate')
    const pushed = snapPosition({ x: 0, z: 1 }, true, boards, 'BREADBOARD', null, 0, rotation)
    assert.equal(breadboardBodiesOverlap(boards[0], { ...approached, position: pushed }), false)
  }
})

test('rotating a breadboard draft re-snaps from its gesture origin without accumulating docking drift', async () => {
  const h = setup()
  try {
    h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.circuit.past = []
    await previewPlacement(h, 'BREADBOARD', new Vector3(0, 0, 2.66))
    const ghost = placementGhost(h), initial = ghost.position.clone(), center = h.manager.gizmoOrigin()!
    const grip = h.manager.gizmoHandlePosition('rotate-y')!, radius = grip.distanceTo(center), start = h.manager.project(grip)
    h.editor.pointerDown(h.pointer(start.x, start.y))
    const quarter = rotationTarget(h, 90), half = rotationTarget(h, 180), threeQuarters = rotationTarget(h, 270), full = rotationTarget(h, 360)
    h.editor.pointerMove(h.pointer(quarter.x, quarter.y))
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 90)
    assert.equal(breadboardBodiesOverlap(h.circuit.graph!.modules[0], { id: 'PLACE', type: 'BREADBOARD', rotation: 90, position: { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z } }), false, 'mismatched quarter-turn tabs must not enter the placed housing')
    h.editor.pointerMove(h.pointer(half.x, half.y))
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 180)
    h.editor.pointerMove(h.pointer(threeQuarters.x, threeQuarters.y))
    h.editor.pointerMove(h.pointer(full.x, full.y)); h.editor.pointerUp(h.pointer(full.x, full.y))
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 0)
    assert.deepEqual(ghost.position.toArray(), initial.toArray(), 'a full turn restores the original compatible dock without drift')
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 1)
  } finally { h.dispose() }
})

test('rotated placement Breadboard X/Z drags prevent overlap while keeping the other axis fixed', async () => {
  for (const axis of ['x', 'z'] as const) {
    const h = setup()
    try {
      h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.circuit.past = []
      await previewPlacement(h, 'BREADBOARD', new Vector3(axis === 'x' ? 9 : 0, 0, axis === 'z' ? 9 : 0))
      const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!
      const start = h.manager.project(grip), quarter = rotationTarget(h, 90)
      h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(quarter.x, quarter.y)); h.editor.pointerUp(h.pointer(quarter.x, quarter.y))
      assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 90)
      const handle = h.manager.gizmoHandlePosition(axis)!, a = h.manager.project(handle)
      const b = h.manager.project(handle.clone().add(new Vector3(axis === 'x' ? -8 : 0, 0, axis === 'z' ? -8 : 0)))
      h.editor.pointerDown(h.pointer(a.x, a.y)); h.editor.pointerMove(h.pointer(b.x, b.y)); h.editor.pointerUp(h.pointer(b.x, b.y))
      assert.equal(breadboardBodiesOverlap(h.circuit.graph!.modules[0], { id: 'PLACE', type: 'BREADBOARD', rotation: 90, position: { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z } }), false, 'axis snap separates actual tabs and plastic')
      assert.equal(ghost.position[axis === 'x' ? 'z' : 'x'], 0)
      assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 1)
      const coordinate = ghost.position[axis]
      h.editor.pointerDown(h.pointer(120, 550)); await nextTick()
      assert.equal(h.circuit.graph!.modules[1].position![axis], coordinate)
      assert.equal(h.circuit.past.length, 1)
    } finally { h.dispose() }
  }
})

test('only the owning pointercancel can discard a ghost transform gesture', async () => {
  const h = setup()
  try {
    await previewPlacement(h)
    acquirePlacementGizmo(h)
    const ghost = placementGhost(h), start = h.manager.project(h.manager.gizmoHandlePosition('xz')!)
    h.editor.pointerDown(h.pointer(start.x, start.y, 7)); h.editor.pointerMove(h.pointer(start.x + 60, start.y + 30, 7))
    const pose = ghost.position.toArray()
    const pointerCancel = h.editor.pointerCancel
    pointerCancel({ pointerId: 8 } as PointerEvent)
    assert.equal(h.captured.size, 1); assert.deepEqual(ghost.position.toArray(), pose)
    pointerCancel({ pointerId: 7 } as PointerEvent)
    assert.equal(h.captured.size, 0); assert.equal(!!placementGhost(h), false)
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 0)
  } finally { h.dispose() }
})

test('Breadboard/Scope/Generator/Supply previews follow cursor without mouse buttons or graph/history changes', async () => {
  for (const type of ['BREADBOARD', 'OSCILLOSCOPE', 'GENERATOR', 'POWER_SUPPLY']) {
    for (const snap of [true, false]) {
      const h = setup()
      try {
        h.workspace.snap = snap
        h.circuit.placeModule('LED', { x: -3, y: 0, z: -2 }); h.circuit.undo(); await nextTick()
        await previewPlacement(h, type)
        const ghost = placementGhost(h), camera = h.manager.camera.position.clone()
        const snapshot = h.circuit.snapshot(), future = [...h.circuit.future]
        for (const target of [new Vector3(-3.13, 0, -2.16), new Vector3(3.12, 0, 2.17), new Vector3(-2.14, 0, 3.18)]) {
          const screen = h.manager.project(target)
          assert.equal(h.manager.pickGizmo(screen.x, screen.y), null)
          h.editor.pointerMove({ ...h.pointer(screen.x, screen.y), buttons: 0 } as PointerEvent)
          const expected = snapPosition(target, snap, [], type, null, 0, 0)
          assert.deepEqual(ghost.position.toArray(), [expected.x, expected.y, expected.z], `${type} must follow without dragging`)
          assert.equal(h.circuit.snapshot(), snapshot); assert.deepEqual(h.circuit.future, future)
        }
        assert.equal(h.captured.size, 0); assert.equal(h.circuit.snapshot(), snapshot); assert.equal(h.circuit.past.length, 0)
        assert.equal(h.workspace.placementType, type); assert.equal(h.manager.models.size, 0)
        assert.equal(h.manager.endpointPosition('PLACE.OUT'), null)
        assert.equal(useUiStore().windows.some((window) => window.kind === 'component-info' && window.open), false)
        assert.deepEqual(h.manager.camera.position.toArray(), camera.toArray())
      } finally { h.dispose() }
    }
  }
})

test('rotation survives resumed cursor follow and normal clicks commit a full pose in one step for every instrument', async () => {
  for (const type of ['BREADBOARD', 'OSCILLOSCOPE', 'GENERATOR', 'POWER_SUPPLY']) {
    const h = setup()
    try {
      await previewPlacement(h, type)
      const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!
      const start = h.manager.project(grip), radius = grip.distanceTo(center)
      const end = rotationTarget(h, 60)
      h.editor.pointerMove(h.pointer(start.x, start.y)); h.editor.pointerDown(h.pointer(start.x, start.y))
      h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y))
      const expectedRotation = type === 'BREADBOARD' ? 90 : 60
      assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), expectedRotation)
      const target = new Vector3(-3, 0, -3), screen = h.manager.project(target)
      assert.equal(h.manager.pickGizmo(screen.x, screen.y), null)
      h.editor.pointerMove({ ...h.pointer(screen.x, screen.y), buttons: 0 } as PointerEvent)
      assert.ok(ghost.position.distanceTo(target) < 0.001); assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), expectedRotation)
      assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 0)
      const pose = { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z }
      h.editor.pointerDown(h.pointer(screen.x, screen.y)); h.editor.pointerUp(h.pointer(screen.x, screen.y)); await nextTick()
      const module = h.circuit.graph!.modules[0]
      assert.deepEqual(module.position, pose); assert.equal(module.rotation, expectedRotation); assert.equal(h.circuit.past.length, 1)
      assert.equal(h.workspace.selectedModuleId, module.id)
      for (const part of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) assert.ok(h.manager.gizmoHandlePosition(part))
      h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 0)
      h.circuit.redo(); await nextTick(); assert.equal(JSON.stringify(h.circuit.graph!.modules[0]), JSON.stringify(module))
    } finally { h.dispose() }
  }
})

test('only Delete is hidden from placement rendering/picking and handle hover takes priority over follow', async () => {
  const h = setup()
  try {
    await previewPlacement(h)
    const root = h.manager.scene.children.find((child) => child.name === 'component-transform-gizmo')!
    h.manager.gizmoOrigin()
    for (const part of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) {
      assert.equal(root.children.find((group) => group.userData.transformHandle === part)!.visible, part !== 'delete')
    }
    const hidden = h.manager.project(root.localToWorld(new Vector3(1.42, 0, 1.42)))
    assert.notEqual(h.manager.pickGizmo(hidden.x, hidden.y)?.handle, 'delete')
    const ghost = placementGhost(h), pose = ghost.position.toArray()
    acquirePlacementGizmo(h)
    const calls: string[] = [], originalHover = h.manager.hoverGizmo, originalGround = h.manager.groundPoint
    h.manager.hoverGizmo = (x, y) => { calls.push('gizmo'); return originalHover(x, y) }
    h.manager.groundPoint = (x, y, height) => { calls.push('ground'); return originalGround(x, y, height) }
    const handle = h.manager.project(h.manager.gizmoHandlePosition('xz')!)
    for (let i = 0; i < 4; i++) h.editor.pointerMove(h.pointer(handle.x, handle.y))
    assert.deepEqual(calls, ['gizmo', 'gizmo', 'gizmo', 'gizmo'])
    assert.deepEqual(ghost.position.toArray(), pose); assert.equal(h.editor.hoveredHandle.value, 'xz')
    calls.length = 0
    h.editor.pointerMove(h.pointer(120, 550)); assert.deepEqual(calls, ['gizmo', 'ground'])
    assert.equal(h.editor.hoveredHandle.value, null)
    assert.equal(Reflect.get(h.manager, 'pickPlacement'), undefined); assert.equal(Reflect.get(h.editor, 'hoveredPlacement'), undefined)
    assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('rotated Breadboard cursor follow keeps current rotation in docking and anti-overlap', async () => {
  const h = setup()
  try {
    h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.circuit.past = []
    await previewPlacement(h, 'BREADBOARD', new Vector3(0, 0, 9))
    const ghost = placementGhost(h), center = h.manager.gizmoOrigin()!, grip = h.manager.gizmoHandlePosition('rotate-y')!
    const start = h.manager.project(grip), quarter = rotationTarget(h, 90)
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(quarter.x, quarter.y)); h.editor.pointerUp(h.pointer(quarter.x, quarter.y))
    const end = h.manager.project(new Vector3(0.1, 0, 1))
    assert.equal(h.manager.pickGizmo(end.x, end.y), null)
    h.editor.pointerMove({ ...h.pointer(end.x, end.y), buttons: 0 } as PointerEvent)
    assert.equal(breadboardBodiesOverlap(h.circuit.graph!.modules[0], { id: 'PLACE', type: 'BREADBOARD', rotation: 90, position: { x: ghost.position.x, y: ghost.position.y, z: ghost.position.z } }), false)
    assert.equal(Math.round(ghost.rotation.y * 180 / Math.PI), 90)
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.graph!.modules.length, 1)
  } finally { h.dispose() }
})

test('placement handle proximity freezes follow before picking and hysteresis prevents boundary chatter', async () => {
  for (const type of ['BREADBOARD', 'OSCILLOSCOPE', 'GENERATOR', 'POWER_SUPPLY']) {
    for (const handle of ['x', 'z', 'xz', 'rotate-y'] as const) {
      const h = setup()
      try {
        await previewPlacement(h, type)
        if (handle === 'xz') acquirePlacementGizmo(h)
        const ghost = placementGhost(h), initial = ghost.position.clone()
        const target = h.manager.project(h.manager.gizmoHandlePosition(handle)!)
        // Approach the outer edge from outside the instrument, avoiding other handles.
        const origin = h.manager.project(h.manager.gizmoOrigin()!)
        const dx = handle === 'xz' ? -1 : target.x - origin.x, dy = handle === 'xz' ? 0 : target.y - origin.y
        const length = Math.hypot(dx, dy), direction = { x: dx / length, y: dy / length }
        const near = { x: target.x + direction.x * 22, y: target.y + direction.y * 22 }
        assert.equal(h.manager.pickGizmo(near.x, near.y), null, `${type} ${handle} outer capture zone must precede the mesh hit`)
        h.editor.pointerMove({ ...h.pointer(near.x, near.y), buttons: 0 } as PointerEvent)
        assert.ok(ghost.position.equals(initial), `${type} ${handle} proximity must freeze before a hit`)
        for (const distance of [25, 31, 24, 30, 23]) {
          h.editor.pointerMove(h.pointer(target.x + direction.x * distance, target.y + direction.y * distance))
          assert.ok(ghost.position.equals(initial), 'entry/exit hysteresis must retain the frozen pose')
        }
        h.editor.pointerMove(h.pointer(target.x, target.y))
        assert.equal(h.manager.pickGizmo(target.x, target.y)?.handle, handle)
        h.editor.pointerDown(h.pointer(target.x, target.y))
        assert.equal(h.captured.size, 1); assert.equal(h.circuit.graph!.modules.length, 0)
        h.editor.pointerUp(h.pointer(target.x, target.y))
        h.editor.pointerMove(h.pointer(120, 550))
        assert.ok(ghost.position.distanceTo(initial) > 0.1, 'leaving the capture zone resumes cursor follow')
        assert.equal(h.circuit.past.length, 0)
      } finally { h.dispose() }
    }
  }
})

test('rapid no-button placement movement renders a unified pose and offset without graph or history commands', async () => {
  for (const type of ['BREADBOARD', 'OSCILLOSCOPE', 'GENERATOR', 'POWER_SUPPLY']) {
    const h = setup()
    try {
      h.workspace.snap = false; await previewPlacement(h, type)
      const ghost = placementGhost(h), offset = h.manager.gizmoOrigin()!.sub(ghost.position)
      for (let i = 1; i <= 80; i++) {
        const point = new Vector3(i / 100, 0, 0), screen = h.manager.project(point)
        h.editor.pointerMove({ ...h.pointer(screen.x, screen.y), buttons: 0 } as PointerEvent)
        assert.ok(ghost.position.distanceTo(point) < 0.00001)
        assert.ok(h.manager.gizmoOrigin()!.sub(ghost.position).distanceTo(offset) < 0.00001)
      }
      assert.equal(h.circuit.graph!.modules.length, 0); assert.equal(h.circuit.past.length, 0); assert.equal(h.captured.size, 0)
    } finally { h.dispose() }
  }
})

test('placement capture follows the visible Y arc and does not freeze over its missing quadrant', async () => {
  for (const visible of [true, false]) {
    const h = setup()
    try {
      await previewPlacement(h)
      const ghost = placementGhost(h), initial = ghost.position.clone()
      const root = h.manager.scene.getObjectByName('component-transform-gizmo')!
      const ring = root.children.find((group) => group.userData.transformHandle === 'rotate-y')!
      const angle = visible ? 1.1 : 5.5
      const point = h.manager.project(ring.localToWorld(new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35)))
      const origin = h.manager.project(h.manager.gizmoOrigin()!), dx = point.x - origin.x, dy = point.y - origin.y, length = Math.hypot(dx, dy)
      const near = { x: point.x + dx / length * 22, y: point.y + dy / length * 22 }
      assert.equal(h.manager.pickGizmo(near.x, near.y), null)
      h.editor.pointerMove(h.pointer(near.x, near.y))
      assert.equal(ghost.position.equals(initial), visible, 'capture zones must match the rendered arc, not its mirrored missing quadrant')
    } finally { h.dispose() }
  }
})

test('an acquired placement overlay keeps every handle reachable through a small-step approach', async () => {
  for (const type of ['CLOCK', 'BREADBOARD', 'OSCILLOSCOPE', 'GENERATOR', 'POWER_SUPPLY']) {
    for (const handle of ['x', 'z', 'xz', 'rotate-y'] as const) {
      const h = setup()
      try {
        h.workspace.snap = false; await previewPlacement(h, type)
        acquirePlacementGizmo(h)
        const ghost = placementGhost(h), start = h.manager.project(ghost.position)
        const target = h.manager.project(h.manager.gizmoHandlePosition(handle)!)
        for (let step = 1; step <= 100; step++) h.editor.pointerMove(h.pointer(start.x + (target.x - start.x) * step / 100, start.y + (target.y - start.y) * step / 100))
        assert.equal(h.manager.pickGizmo(target.x, target.y)?.handle, handle, `${type} ${handle} must remain reachable after gradual approach`)
        h.editor.pointerDown(h.pointer(target.x, target.y)); assert.equal(h.captured.size, 1)
        h.editor.pointerUp(h.pointer(target.x, target.y))
        assert.equal(h.circuit.graph!.modules.length, 0); assert.equal(h.circuit.past.length, 0)
      } finally { h.dispose() }
    }
  }
})

test('placement translation clears the approach corridor at its previous screen position', async () => {
  for (const handle of ['x', 'xz'] as const) {
    const h = setup()
    try {
      h.workspace.snap = false; await previewPlacement(h)
      acquirePlacementGizmo(h)
      const ghost = placementGhost(h), start = h.manager.project(ghost.position)
      const target = h.manager.project(h.manager.gizmoHandlePosition(handle)!)
      for (let step = 1; step <= 100; step++) h.editor.pointerMove(h.pointer(start.x + (target.x - start.x) * step / 100, start.y + (target.y - start.y) * step / 100))
      const grip = h.manager.gizmoHandlePosition(handle)!, down = h.manager.project(grip)
      const end = h.manager.project(grip.clone().add(new Vector3(4, 0, 0)))
      h.editor.pointerDown(h.pointer(down.x, down.y)); h.editor.pointerMove(h.pointer(end.x, end.y)); h.editor.pointerUp(h.pointer(end.x, end.y))
      const pose = ghost.position.clone(), oldCorridor = { x: start.x + (target.x - start.x) * 0.2, y: start.y + (target.y - start.y) * 0.2 }
      assert.equal(h.manager.pickGizmo(oldCorridor.x, oldCorridor.y), null)
      h.editor.pointerMove(h.pointer(oldCorridor.x, oldCorridor.y))
      assert.ok(ghost.position.distanceTo(pose) > 1, `${handle} must resume follow outside the translated gizmo's current capture zone`)
      assert.equal(h.manager.placementFollowBlocked(), false)
      assert.equal(h.circuit.graph!.modules.length, 0); assert.equal(h.circuit.past.length, 0)
    } finally { h.dispose() }
  }
})
