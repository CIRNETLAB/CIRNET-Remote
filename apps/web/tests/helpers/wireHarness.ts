import { createRenderer, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { Vector3 } from 'three'
import { createSceneManager } from '../../src/three/SceneManager'
import { useCircuitEditor } from '../../src/composables/useCircuitEditor'
import { useCircuitStore } from '../../src/stores/circuit'
import { useWorkspaceStore } from '../../src/stores/workspace'

export function wireHarness() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => null }) }) })
  setActivePinia(createPinia())
  const circuit = useCircuitStore(), workspace = useWorkspaceStore()
  circuit.createDraft(); workspace.setTool('wire')
  const captured = new Set<number>()
  const canvas = ref({ focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }), setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: (id: number) => captured.delete(id) } as unknown as HTMLCanvasElement)
  let frame: FrameRequestCallback | null = null
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: cb => { frame = cb; return 1 }, cancelFrame() { frame = null } })
  manager.resize(1000, 700); manager.camera.position.set(0, 12, 0); manager.camera.lookAt(0, 0, 0)
  const renderer = createRenderer<object, object>({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} })
  let editor!: ReturnType<typeof useCircuitEditor>
  const app = renderer.createApp({ setup() { editor = useCircuitEditor(canvas, () => manager); return () => null } }); app.mount({})
  const pointer = (x: number, y: number, pointerId = 1, button = 0, altKey = false) => ({ clientX: x, clientY: y, pointerId, button, altKey, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} } as PointerEvent)
  const eventAt = (point: { x: number; y: number; z: number }, pointerId = 1, button = 0, altKey = false) => { const p = manager.project(new Vector3(point.x, point.y, point.z)); return pointer(p.x, p.y, pointerId, button, altKey) }
  return { circuit, workspace, manager, editor, captured, canvas, pointer, eventAt,
    endpointEvent(endpoint: string) { return eventAt(manager.endpointPosition(endpoint)!) },
    flush() { const cb = frame; frame = null; cb?.(0) },
    dispose() { app.unmount(); manager.dispose(); if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document') },
  }
}
