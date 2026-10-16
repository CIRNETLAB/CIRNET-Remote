import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick, provide, reactive } from 'vue'
import { Mesh, type Group } from 'three'
import { createPackageThumbnailCache, packageThumbnailCacheKey, type PackageThumbnailRenderer } from '../src/three/PackageThumbnails'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { loadSfc, mountSfc } from './helpers/vueSfc'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick(); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; !condition() && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 0))
  assert.ok(condition(), 'expected queued capture to become ready')
}

function deferredRenderer() {
  const jobs: { model: Group; finish: (url: string) => void }[] = []
  let disposed = 0
  const renderer: PackageThumbnailRenderer = {
    render(model) { return new Promise<string>(finish => jobs.push({ model, finish })) },
    dispose() { disposed++ },
  }
  return { renderer, jobs, get disposed() { return disposed } }
}

test('equal effective properties share one bitmap and cached cards need no renderer', async () => {
  const backend = deferredRenderer()
  let contexts = 0
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => { contexts++; return backend.renderer } })
  const a = cache.acquire('RESISTOR_AXIAL'), b = cache.acquire('RESISTOR_AXIAL', { tolerancePercent: 1, resistanceOhms: 330, powerWatts: .25 })
  await flush()
  assert.equal(contexts, 1)
  assert.equal(backend.jobs.length, 1, 'descriptor defaults and explicit defaults have identical appearance')
  const model = backend.jobs[0]!.model
  assert.ok(model.getObjectByName('package-body'), 'thumbnail uses the editor package factory')
  assert.equal(model.userData.type, 'RESISTOR_AXIAL')
  backend.jobs[0]!.finish('data:image/png;base64,resistor')
  assert.deepEqual(await Promise.all([a.ready, b.ready]), ['data:image/png;base64,resistor', 'data:image/png;base64,resistor'])
  a.release(); b.release()
  assert.equal(backend.disposed, 1)
  const cached = cache.acquire('RESISTOR_AXIAL', { resistance_ohm: 330 })
  assert.equal(await cached.ready, 'data:image/png;base64,resistor', 'legacy properties use the same canonical appearance key')
  assert.equal(contexts, 1, 'cached images never create a replacement GPU context')
  cached.release()
})

test('pending renders cannot reuse the canvas concurrently or dispose an in-flight renderer', async () => {
  const backend = deferredRenderer()
  let contexts = 0
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => { contexts++; return backend.renderer } })
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  await flush()
  let geometryDisposals = 0
  backend.jobs[0]!.model.traverse(object => { if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => geometryDisposals++) })
  first.release()
  const second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  await flush()
  assert.equal(backend.jobs.length, 1, 'a pending image capture owns the shared canvas until it settles')
  assert.equal(backend.disposed, 0)
  backend.jobs[0]!.finish('data:image/png;base64,old')
  assert.equal(await first.ready, null, 'released consumers cannot publish stale images')
  await waitFor(() => backend.jobs.length === 2)
  assert.ok(geometryDisposals > 0, 'the completed transient model releases its owned resources')
  assert.equal(backend.jobs.length, 2)
  assert.equal(contexts, 1)
  second.release()
  assert.equal(backend.disposed, 0, 'even the final release waits for capture completion')
  backend.jobs[1]!.finish('data:image/png;base64,new')
  assert.equal(await second.ready, null)
  await flush()
  assert.equal(backend.disposed, 1)
})

test('released queued drafts are skipped and renderer failures settle as cached fallbacks', async () => {
  let contexts = 0, renders = 0, disposed = 0
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => {
    contexts++
    return { render() { renders++; throw new Error('context lost') }, dispose() { disposed++ } }
  } })
  const abandoned = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  abandoned.release()
  assert.equal(await abandoned.ready, null)
  assert.equal(contexts, 0)
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 }), second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  assert.deepEqual(await Promise.all([first.ready, second.ready]), [null, null])
  assert.equal(renders, 1, 'a broken renderer is not retried for every visible card')
  assert.equal(contexts, 1)
  assert.equal(disposed, 1)
  first.release(); second.release()
  const cached = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  assert.equal(await cached.ready, null)
  assert.equal(contexts, 1)
  cached.release()
})

test('synchronous GPU captures yield to cancellation between queued cards', async () => {
  const rendered: number[] = []
  let cancelled!: ReturnType<ReturnType<typeof createPackageThumbnailCache>['acquire']>
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => ({
    render(model) {
      rendered.push(JSON.parse(model.userData.signature)[1].resistanceOhms)
      if (rendered.length === 1) setTimeout(() => cancelled.release(), 0)
      return 'data:image/png;base64,capture'
    },
    dispose() {},
  }) })
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  cancelled = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  const last = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  try {
    assert.deepEqual(await Promise.all([first.ready, cancelled.ready, last.ready]), ['data:image/png;base64,capture', null, 'data:image/png;base64,capture'])
    assert.deepEqual(rendered, [1000, 220], 'input tasks can cancel cards before their GPU capture starts')
  } finally { first.release(); cancelled.release(); last.release() }
})

test('bounded cache evicts inactive images without invalidating active leases', async () => {
  let contexts = 0, renders = 0
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, maxEntries: 1, createRenderer: () => {
    contexts++
    return { render(model) { renders++; return `data:image/png;base64,${model.userData.signature}` }, dispose() {} }
  } })
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  const firstUrl = await first.ready
  const second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  await second.ready
  const stillActive = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  assert.equal(await stillActive.ready, firstUrl)
  assert.equal(renders, 2)
  stillActive.release(); first.release(); second.release()
  const evicted = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  await evicted.ready
  assert.equal(renders, 3)
  assert.equal(contexts, 2)
  evicted.release()
})

test('thumbnail disposal leaves editor model resources and caller properties intact', async () => {
  const editorModel = buildComponent({ id: 'live-resistor', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 1000 } })
  let editorDisposals = 0
  editorModel.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.addEventListener('dispose', () => editorDisposals++)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.addEventListener('dispose', () => editorDisposals++)
  })
  const input = { resistanceOhms: 1000 }, backend = deferredRenderer()
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => backend.renderer })
  const lease = cache.acquire('RESISTOR_AXIAL', input)
  input.resistanceOhms = 4700
  try {
    await flush()
    assert.equal(JSON.parse(backend.jobs[0]!.model.userData.signature)[1].resistanceOhms, 1000, 'an acquired image snapshots its draft')
    backend.jobs[0]!.finish('data:image/png;base64,snapshot')
    await lease.ready
    lease.release()
    assert.equal(input.resistanceOhms, 4700)
    assert.equal(editorDisposals, 0, 'editor and transient thumbnail models own separate GPU resources')
  } finally { lease.release(); disposeObject(editorModel) }
})

test('ComponentThumbnail ignores stale draft completion and releases its final lease on unmount', async () => {
  const backend = deferredRenderer(), cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => backend.renderer })
  const component = await loadSfc('components/workbench/ComponentThumbnail.vue')
  const properties = reactive({ resistanceOhms: 1000 })
  const wrapper = defineComponent({ setup() {
    provide(packageThumbnailCacheKey, cache)
    return () => h(component, { type: 'RESISTOR_AXIAL', properties, alt: 'Resistor preview' })
  } })
  const view = mountSfc(wrapper, createPinia())
  try {
    await flush()
    assert.equal(view.all().some(node => node.tag === 'svg'), true)
    properties.resistanceOhms = 4700
    await flush()
    backend.jobs[0]!.finish('data:image/png;base64,stale')
    await waitFor(() => backend.jobs.length === 2)
    await flush()
    assert.equal(view.all().some(node => node.tag === 'img'), false, 'old draft cannot appear while the new draft is pending')
    backend.jobs[1]!.finish('data:image/png;base64,current')
    await flush()
    const image = view.all().find(node => node.tag === 'img')
    assert.equal(image?.props.src, 'data:image/png;base64,current')
    assert.equal(image?.props.alt, 'Resistor preview')
    assert.equal(backend.disposed, 0)
  } finally { view.app.unmount() }
  assert.equal(backend.disposed, 1)
})
