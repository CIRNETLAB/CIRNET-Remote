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
import { useUiStore } from '../src/stores/ui'
import { useWorkspaceMessageStore } from '../src/stores/workspaceMessages'
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

test('Ctrl+S respects the same saving guard as the File menu command',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
 const keyboardWindow=Object.assign(new EventTarget(),{closest:()=>null})
 Object.defineProperty(globalThis,'window',{configurable:true,value:keyboardWindow})
 const h=mount(titleBar),circuit=useCircuitStore(),projects=useProjectStore(),ui=useUiStore()
 try{
  circuit.createDraft();projects.saveState.phase='saving'
  const event=new Event('keydown',{cancelable:true})
  Object.defineProperties(event,{key:{value:'s'},ctrlKey:{value:true},metaKey:{value:false}})
  keyboardWindow.dispatchEvent(event)
  assert.equal(event.defaultPrevented,true)
  assert.equal(ui.windows.some(window=>window.kind==='projects'&&window.open),false)
 }finally{h.unmount();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('File commands preserve exact menu order and share missing-document and pending-save guards',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
 const h=mount(titleBar),circuit=useCircuitStore(),projects=useProjectStore(),ui=useUiStore()
 try{
  const items=h.state.fileItems as {id:string;label:string;disabled:boolean}[]
  assert.deepEqual(items.map(item=>item.label),['New','Open Project','Save','Save As','Import','Export','History','Assignment'])
  const command=h.state.fileCommand as (id:string)=>void
  command('save');command('saveAs');assert.equal(ui.windows.some(window=>window.open),false)
  circuit.createDraft();projects.saveState.phase='saving';command('save')
  assert.equal(ui.windows.some(window=>window.kind==='projects'&&window.open),false)
  command('open');assert.equal(ui.windows.some(window=>window.kind==='projects'&&window.open),true)
  command('history');command('assignment')
  assert.equal(ui.windows.some(window=>window.kind==='history'&&window.open),true)
  assert.equal(ui.windows.some(window=>window.kind==='assignments'&&window.open),true)
 }finally{h.unmount();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('oversized imports report in workspace messages without reading or changing the graph',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
 const h=mount(titleBar),circuit=useCircuitStore(),messages=useWorkspaceMessageStore()
 try{
  circuit.createDraft();const snapshot=circuit.snapshot();let reads=0
  const input={files:[{name:'huge.json',size:3*1024*1024,text:async()=>{reads++;return graph('Huge')}}],value:'huge.json'}
  await (h.state.openFile as (event:Event)=>Promise<void>)({target:input} as unknown as Event)
  assert.equal(reads,0);assert.equal(circuit.snapshot(),snapshot);assert.equal(input.value,'')
  assert.equal(messages.current?.source,'file');assert.equal(messages.current?.level,'error');assert.match(messages.current?.text??'',/maximum 2 MB/)
 }finally{h.unmount();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('invalid JSON resets the input and a later successful import resolves its footer error',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
 const h=mount(titleBar),messages=useWorkspaceMessageStore()
 try{
  const open=h.state.openFile as (event:Event)=>Promise<void>,bad=pendingFile('same.json')
  const failure=open(bad.event);bad.finish('{');await failure
  assert.equal((bad.event.target as HTMLInputElement).value,'');assert.equal(messages.current?.level,'error')
  const good=pendingFile('same.json'),success=open(good.event);good.finish(graph('Recovered'));await success
  assert.equal((good.event.target as HTMLInputElement).value,'');assert.equal(useCircuitStore().current?.name,'Recovered')
  assert.equal(messages.current?.level,'info');assert.equal(h.state.error,'')
 }finally{h.unmount();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('successful Export keeps a failed Import actionable until another Import succeeds',async()=>{
 const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{append(){}},createElement:()=>({click(){},remove(){}})}})
 const h=mount(titleBar),messages=useWorkspaceMessageStore();useCircuitStore().createDraft()
 try{
  const bad=pendingFile('invalid.json'),open=h.state.openFile as (event:Event)=>Promise<void>
  const pending=open(bad.event);bad.finish('{');await pending
  const error=messages.current
  ;(h.state.fileCommand as (id:string)=>void)('export')
  assert.equal(messages.current?.id,error?.id);assert.equal(messages.current?.level,'error')
  assert.ok(messages.events.some(message=>message.text==='Circuit JSON export requested.'))
  await new Promise(resolve=>setTimeout(resolve,5)) // Finish this download's URL cleanup before replacing browser globals.
  const good=pendingFile('valid.json'),success=open(good.event);good.finish(graph('Recovered'));await success
  assert.equal(messages.current?.level,'info');assert.match(messages.current?.text??'',/Opened valid.json/)
 }finally{
  h.unmount()
  if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else Reflect.deleteProperty(globalThis,'window')
  if(priorDocument)Object.defineProperty(globalThis,'document',priorDocument);else Reflect.deleteProperty(globalThis,'document')
 }
})

test('export revokes its object URL even when the download click throws',async()=>{
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL
 Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
 let removed=0;const revoked:string[]=[]
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{append(){}},createElement:()=>({click(){throw new Error('Download blocked')},remove(){removed++}})}})
 URL.createObjectURL=()=> 'blob:header-export';URL.revokeObjectURL=url=>{revoked.push(url)}
 const h=mount(titleBar);useCircuitStore().createDraft()
 try{
  ;(h.state.fileCommand as (id:string)=>void)('export')
  await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(removed,1);assert.deepEqual(revoked,['blob:header-export']);assert.match(useWorkspaceMessageStore().current?.text??'',/Download blocked/)
 }finally{h.unmount();URL.createObjectURL=create;URL.revokeObjectURL=revoke;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else Reflect.deleteProperty(globalThis,'document')}
})

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
