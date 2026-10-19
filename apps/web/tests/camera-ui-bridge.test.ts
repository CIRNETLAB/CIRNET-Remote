import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import type { Plugin } from 'esbuild'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { loadSfc, mountSfc } from './helpers/vueSfc'

// This checks the compiled production SFC's watcher/intent bridge. Browser
// suites provide rendering evidence; these renderer/editor doubles only expose
// the order and number of calls crossing the UI boundary.
test('camera UI bridge applies each zoom intent once, preserves Area on readback and retires stale requests', async () => {
  const globals = ['window', 'document', 'MutationObserver', '__cameraUiTest'] as const
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }) })
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: class { observe() {} disconnect() {} } })
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), circuit = useCircuitStore(), events: string[] = []
  const publish = { current: (_snapshot: { zoom: number; minZoom: number; maxZoom: number }) => {} }
  const snapshot = (zoom: number) => ({ zoom, minZoom: 50, maxZoom: 1000 })
  const editor = {
    cancel() { events.push('cancel'); workspace.cancelZoomArea() }, sync() { events.push('sync') }, updatePorts() {},
    dragging: ref(null), hoveredHandle: ref(null), hoveredControl: ref(null), controlHint: ref(''), ports: ref([]),
    zoomAreaRect: ref(null), marqueeRect: ref(null),
    wireRouting: { editing: ref(false), hint: ref('') },
    selectionCommands: { contextMenuState: ref(null), duplicatePreviewState: ref({ active: false }), movePreviewState: ref({ active: false }) },
  }
  const controller = {
    setZoom(zoom: number) { events.push('zoom:' + zoom); publish.current(snapshot(zoom)) },
    fitCircuit() { events.push('fit-pose'); publish.current(snapshot(100)) },
    setShowPins() {}, setSimulationStates() {}, suspend() {}, requestRender() {}, resize() {},
    dispose() { events.push('dispose') },
  }
  Object.defineProperty(globalThis, '__cameraUiTest', { configurable: true, value: {
    editor,
    createSceneManager(options: { onNavigationChange: typeof publish.current }) {
      publish.current = options.onNavigationChange
      publish.current(snapshot(100))
      return controller
    },
  } })
  const plugin: Plugin = { name: 'camera-ui-boundaries', setup(build) {
    build.onResolve({ filter: /^three$|\/three\/SceneManager$|\/composables\/useCircuitEditor$|\/composables\/frameTasks$|WorkspaceNavigator\.vue$|WireOptions\.vue$|WireContextMenu\.vue$/ }, args => ({ path: args.path, namespace: 'camera-ui-boundary' }))
    build.onLoad({ filter: /.*/, namespace: 'camera-ui-boundary' }, args => {
      const contents = args.path === 'three' ? 'export const PCFSoftShadowMap=2; export class WebGLRenderer { shadowMap={};setPixelRatio(){}dispose(){} }'
        : args.path.endsWith('/SceneManager') ? 'export const createSceneManager=globalThis.__cameraUiTest.createSceneManager'
          : args.path.endsWith('/useCircuitEditor') ? 'export const useCircuitEditor=()=>globalThis.__cameraUiTest.editor'
            : args.path.endsWith('/frameTasks') ? 'export const observeElementSize=()=>({disconnect(){}})'
              : 'export default {render(){return null}}'
      return { contents, loader: 'js' }
    })
  } }
  let view: ReturnType<typeof mountSfc> | undefined
  try {
    workspace.setZoom(400)
    view = mountSfc(await loadSfc('components/workbench/CircuitWorkspace3D.vue', [plugin]), pinia, null, element => Object.assign(element, {
      closest() { return null }, getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 600 } },
    }))
    assert.equal(workspace.zoomAppliedRequest, workspace.zoomRequest)
    assert.equal(events.some(event => event.startsWith('zoom:')), false, 'a request from an earlier component lifetime cannot replay at mount')
    events.length = 0
    workspace.toggleZoomArea()
    publish.current(snapshot(1432.125))
    await nextTick()
    assert.equal(workspace.zoomAreaActive, true)
    assert.deepEqual(events, [], 'readback must neither cancel gestures nor issue camera commands')
    for (let i = 0; i < 100; i++) publish.current(snapshot(800.125 - i * .5))
    await nextTick()
    assert.equal(workspace.zoom, 750.625)
    assert.equal(workspace.zoomAreaActive, true)
    assert.deepEqual(events, [], 'continuous wheel measurements cannot echo into zoom intents or cancel Area')
    workspace.setZoom(512.125)
    assert.deepEqual(events, ['cancel', 'sync', 'zoom:512.125'])
    assert.equal(workspace.zoom, 512.125)
    assert.equal(workspace.zoomAppliedRequest, workspace.zoomRequest)
    await nextTick()
    assert.deepEqual(events, ['cancel', 'sync', 'zoom:512.125'], 'the measured callback cannot echo into another command')
    events.length = 0
    workspace.fitEntireCircuit()
    assert.deepEqual(events, ['cancel', 'sync', 'fit-pose'])
    assert.equal(workspace.zoom, 100)
    events.length = 0
    circuit.createDraft('Next camera document')
    await nextTick()
    assert.deepEqual(events, [], 'document changes cannot replay an earlier zoom or Fit request')
    view.app.unmount(); view = undefined
    publish.current(snapshot(777))
    assert.equal(workspace.zoom, 100, 'late callbacks from a disposed workspace cannot overwrite current UI readback')
    assert.equal(workspace.zoomAppliedRequest, workspace.zoomRequest)
  } finally {
    view?.app.unmount()
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  }
})
