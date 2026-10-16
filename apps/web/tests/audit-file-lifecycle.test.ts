import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, type Component, type ComponentInternalInstance } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useProjectStore } from '../src/stores/projects'
import type { MemoryImage } from '../src/types/memory'
import { createMemoryImage } from '../src/services/files/memoryImage'

beforeEach(() => setActivePinia(createPinia()))

// Compile and mount the actual SFC setup code. Only the DOM host is replaced;
// its async handlers, refs, watchers, Pinia stores and lifecycle remain real.
async function componentScript(relative: string): Promise<Component> {
  const filename = resolve(relative), source = await readFile(filename, 'utf8')
  const script = compileScript(parse(source, { filename }).descriptor, { id: relative }).content
  const outfile = resolve('.test-build/audit-async/sfc', `${relative.split('/').at(-1)}.mjs`)
  await mkdir(dirname(outfile), { recursive: true })
  await build({
    stdin: { contents: script, resolveDir: dirname(filename), loader: 'ts', sourcefile: filename },
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'sfc-script', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => ({
      contents: compileScript(parse(await readFile(path, 'utf8'), { filename: path }).descriptor, { id: path }).content,
      loader: 'ts', resolveDir: dirname(path),
    })) } }],
  })
  return (await import(pathToFileURL(outfile).href)).default
}

const titleBar = await componentScript('src/components/workbench/AppTitleBar.vue')
const hexEditor = await componentScript('src/components/windows/HexEditorWindow.vue')
function mount(component: Component) {
  const renderer = createRenderer<object, object>({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} })
  const app = renderer.createApp({ ...component, render: () => null })
  const vm = app.mount({})
  const state = (vm.$ as ComponentInternalInstance & { setupState: Record<string, unknown> }).setupState
  return { state, unmount: () => app.unmount() }
}

function pendingFile(name: string) {
  let finish!: (contents: string) => void
  const contents = new Promise<string>((complete) => { finish = complete })
  const input = { files: [{ name, size: 100, text: () => contents }], value: name }
  return { event: { target: input } as unknown as Event, finish }
}
const graph = (name: string) => JSON.stringify({ schema_version: '1.0', circuit_id: name, modules: [], connections: [], metadata: { name } })
const image = (byte: number) => JSON.stringify({ version: '1.0', word_bits: 8, depth: 1, data: [byte] })

test('newer circuit file selection wins when earlier file reads finish last', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const h = mount(titleBar), store = useCircuitStore()
  try {
    const older = pendingFile('older.json'), newer = pendingFile('newer.json')
    const open = h.state.openFile as (event: Event) => Promise<void>
    const first = open(older.event), second = open(newer.event)
    newer.finish(graph('Newer')); await second
    older.finish(graph('Older')); await first
    assert.equal(store.current?.name, 'Newer')
    assert.equal(store.drafts.length, 1)
  } finally { h.unmount(); if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') }
})

test('unmounted file toolbar cannot import a pending circuit read', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const h = mount(titleBar), store = useCircuitStore(), file = pendingFile('pending.json')
  try {
    const pending = (h.state.openFile as (event: Event) => Promise<void>)(file.event)
    h.unmount(); file.finish(graph('Late')); await pending
    assert.equal(store.drafts.length, 0)
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') }
})

test('a principal switch cancels a pending local circuit import without remounting the toolbar',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
  const h=mount(titleBar),projects=useProjectStore();await projects.setPrincipal('first')
  try {
    const file=pendingFile('private.json'),pending=(h.state.openFile as (event:Event)=>Promise<void>)(file.event)
    await projects.setPrincipal('second');file.finish(graph('Private first principal'));await pending
    assert.equal(useCircuitStore().drafts.some(draft=>draft.name==='Private first principal'),false)
  }finally{h.unmount();projects.dispose();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('newer memory image selection wins when earlier reads finish last', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  const h = mount(hexEditor)
  try {
    const older = pendingFile('older.json'), newer = pendingFile('newer.json')
    const load = h.state.load as (event: Event) => Promise<void>
    const first = load(older.event), second = load(newer.event)
    newer.finish(image(2)); await second
    older.finish(image(1)); await first
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [2])
  } finally { h.unmount() }
})

test('closing the memory editor discards pending image reads without a history command', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  const h = mount(hexEditor), file = pendingFile('pending.json'), snapshot = store.snapshot(), history = store.past.length
  const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
  h.unmount(); file.finish(image(7)); await pending
  assert.equal(store.snapshot(), snapshot)
  assert.equal(store.past.length, history)
})

test('explicit Apply supersedes a pending memory file without adding a late history command', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    h.state.file = file.event.target
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    h.state.hex = '22'; (h.state.apply as () => void)()
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [34])
    assert.equal((file.event.target as HTMLInputElement).value, '')
    const history = store.past.length
    file.finish(image(17)); await pending
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [34])
    assert.equal(store.past.length, history)
  } finally { h.unmount() }
})

test('an unchanged explicit Apply still supersedes an older pending memory file', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  store.setMemoryImage(id, { version: '1.0', word_bits: 8, depth: 1, data: [34] })
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    h.state.hex = '22'; (h.state.apply as () => void)()
    file.finish(image(17)); await pending
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [34])
  } finally { h.unmount() }
})

test('initializing a selected memory supersedes its pending file read', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.importGraph({ schema_version: '1.0', circuit_id: 'uninitialized', modules: [{ id: 'M1', type: 'MEMORY' }], connections: [] }); workspace.selectModule('M1')
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    // This is the Initialize button's existing production command.
    store.setMemoryImage('M1', createMemoryImage())
    const history = store.past.length
    file.finish(image(17)); await pending
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, Array(32).fill(0))
    assert.equal(store.past.length, history)
  } finally { h.unmount() }
})

test('same-component memory replacements supersede a pending file read', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    store.setMemoryImage(id, { version: '1.0', word_bits: 8, depth: 1, data: [55] })
    file.finish(image(17)); await pending
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [55])
  } finally { h.unmount() }
})

test('in-place memory edits supersede a pending file read even when image identity is unchanged', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  store.setMemoryImage(id, { version: '1.0', word_bits: 8, depth: 1, data: [0] })
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    const currentImage = store.graph!.modules[0].properties!.memory as MemoryImage
    currentImage.data[0] = 55
    file.finish(image(17)); await pending
    assert.deepEqual((store.graph!.modules[0].properties!.memory as MemoryImage).data, [55])
  } finally { h.unmount() }
})

test('deleting and recreating a selected memory ID discards the old pending file', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    store.removeModule(id)
    assert.equal(store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }), id)
    workspace.selectModule(id)
    const snapshot = store.snapshot(), history = store.past.length
    file.finish(image(17)); await pending
    assert.equal(store.snapshot(), snapshot)
    assert.equal(store.past.length, history)
  } finally { h.unmount() }
})

test('undo restoring the selected memory discards a pending read for its replaced revision', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore()
  store.createDraft(); const id = store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  store.setMemoryImage(id, { version: '1.0', word_bits: 8, depth: 1, data: [55] })
  const h = mount(hexEditor), file = pendingFile('older.json')
  try {
    const pending = (h.state.load as (event: Event) => Promise<void>)(file.event)
    store.undo()
    const snapshot = store.snapshot(), history = store.past.length
    file.finish(image(17)); await pending
    assert.equal(store.snapshot(), snapshot)
    assert.equal(store.past.length, history)
  } finally { h.unmount() }
})

test('New cancels a pending file and resets its input so the same file can be selected again', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const h = mount(titleBar), store = useCircuitStore(), file = pendingFile('same-file.json')
  try {
    h.state.fileInput = file.event.target
    const pending = (h.state.openFile as (event: Event) => Promise<void>)(file.event)
    const newFile = h.state.newFile as () => void
    newFile()
    assert.equal((file.event.target as HTMLInputElement).value, '')
    file.finish(graph('Cancelled')); await pending
    assert.equal(store.drafts.length, 1)
    assert.equal(store.current?.name, 'Untitled circuit 1')
  } finally { h.unmount(); if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') }
})
