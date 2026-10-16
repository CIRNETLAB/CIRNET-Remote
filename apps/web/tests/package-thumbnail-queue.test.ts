import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh } from 'three'
import { getPartForType } from '../src/data/partCatalog'
import { createPackageThumbnailCache, type PackageThumbnailPriority, type PackageThumbnailScheduler } from '../src/three/PackageThumbnails'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function scheduledTasks() {
  const tasks = new Map<number, { run: () => void; priority: PackageThumbnailPriority }>()
  let sequence = 0
  const scheduleTask: PackageThumbnailScheduler = (run, priority) => {
    const id = sequence++
    tasks.set(id, { run, priority })
    return () => { tasks.delete(id) }
  }
  return { scheduleTask, get pending() { return tasks.size }, get priority() { return tasks.values().next().value?.priority }, run() {
    const next = tasks.entries().next().value
    assert.ok(next, 'a deferred capture task should be scheduled')
    tasks.delete(next[0]); next[1].run()
  } }
}

test('the first synchronous GPU capture is deferred beyond input microtasks', async () => {
  let captures = 0
  const cache = createPackageThumbnailCache({ createRenderer: () => ({ render() { captures++; return 'image' }, dispose() {} }), idleDelayMs: 0 })
  const lease = cache.acquire('RESISTOR_AXIAL')
  await flush()
  assert.equal(captures, 0, 'input and Vue microtasks finish before model construction or GPU capture')
  lease.release()
  assert.equal(await lease.ready, null)
  cache.dispose?.()
})

test('browser idle scheduling skips an exhausted frame and cancels abandoned callbacks', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const pending = new Map<number, IdleRequestCallback>()
  let sequence = 0, captures = 0
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    requestIdleCallback(callback: IdleRequestCallback) { const id = sequence++; pending.set(id, callback); return id },
    cancelIdleCallback(id: number) { pending.delete(id) },
  } })
  const runIdle = (timeRemaining: number) => {
    const next = pending.entries().next().value
    assert.ok(next)
    pending.delete(next[0]); next[1]({ didTimeout: false, timeRemaining: () => timeRemaining })
  }
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => ({ render() { captures++; return 'image' }, dispose() {} }) })
  try {
    const first = cache.acquire('RESISTOR_AXIAL')
    await flush(); assert.equal(captures, 0)
    runIdle(0)
    assert.equal(captures, 0, 'an exhausted idle budget defers model construction and capture')
    assert.equal(pending.size, 1)
    runIdle(10); assert.equal(await first.ready, 'image'); first.release()
    const abandoned = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
    abandoned.release()
    assert.equal(pending.size, 0)
    assert.equal(await abandoned.ready, null)
    assert.equal(captures, 1)
  } finally {
    cache.dispose?.()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('browser frame fallback waits for paint and cancels its follow-up capture timer', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const frames = new Map<number, FrameRequestCallback>()
  let sequence = 0, captures = 0
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    requestAnimationFrame(callback: FrameRequestCallback) { const id = sequence++; frames.set(id, callback); return id },
    cancelAnimationFrame(id: number) { frames.delete(id) },
  } })
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, createRenderer: () => ({ render() { captures++; return 'image' }, dispose() {} }) })
  try {
    const first = cache.acquire('RESISTOR_AXIAL')
    await flush(); assert.equal(captures, 0)
    const next = frames.entries().next().value!
    frames.delete(next[0]); next[1](0)
    await flush(); assert.equal(captures, 0, 'frame callback leaves paint before the GPU capture timer')
    first.release()
    assert.equal(await first.ready, null)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(captures, 0)
    const second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
    second.release()
    assert.equal(frames.size, 0, 'cancellation before a frame removes its callback too')
  } finally {
    cache.dispose?.()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('queued captures honor priorities and allow one capture per scheduled task', async () => {
  const scheduler = scheduledTasks(), captures: number[] = []
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render(model) { captures.push(JSON.parse(model.userData.signature)[1].resistanceOhms); return 'image' }, dispose() {} }) })
  const preload = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 }, { priority: 'preload' })
  const visible = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 }, { priority: 'visible' })
  const info = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 }, { priority: 'high' })
  assert.equal(scheduler.pending, 1)
  assert.equal(scheduler.priority, 'high')
  await flush(); assert.deepEqual(captures, [])
  scheduler.run(); await info.ready
  assert.deepEqual(captures, [1000])
  assert.equal(scheduler.pending, 1)
  scheduler.run(); await visible.ready
  assert.deepEqual(captures, [1000, 4700])
  scheduler.run(); await preload.ready
  assert.deepEqual(captures, [1000, 4700, 220])
  info.release(); visible.release(); preload.release(); cache.dispose?.()
})

test('shared request priority follows live leases and canceled work never builds a model', async () => {
  const scheduler = scheduledTasks(), captures: number[] = []
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render(model) { captures.push(JSON.parse(model.userData.signature)[1].resistanceOhms); return 'image' }, dispose() {} }) })
  const background = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 }, { priority: 'preload' })
  const promoted = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 }, { priority: 'high' })
  const visible = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 }, { priority: 'visible' })
  promoted.release()
  assert.equal(scheduler.priority, 'visible', 'releasing the eager consumer restores background priority')
  background.setPriority?.('high')
  assert.equal(scheduler.priority, 'high')
  background.release()
  scheduler.run(); await visible.ready
  assert.deepEqual(captures, [1000])
  assert.equal(await background.ready, null)
  assert.equal(await promoted.ready, null)
  visible.release()
  const canceled = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  canceled.release()
  assert.equal(scheduler.pending, 0, 'final pending lease cancels its scheduled task')
  assert.equal(await canceled.ready, null)
  cache.dispose?.()
})

test('renderer survives offscreen lease churn and explicit disposal releases it once', async () => {
  const scheduler = scheduledTasks()
  let contexts = 0, disposed = 0
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => { contexts++; return { render() { return 'image' }, dispose() { disposed++ } } } })
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  scheduler.run(); await first.ready; first.release()
  assert.equal(disposed, 0, 'a short visibility gap retains the shared GPU context')
  const next = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  scheduler.run(); await next.ready; next.release()
  assert.equal(contexts, 1)
  cache.dispose?.(); cache.dispose?.()
  assert.equal(disposed, 1)
  assert.equal(await cache.acquire('RESISTOR_AXIAL').ready, null)
  assert.equal(scheduler.pending, 0)
})

test('permanent renderer failure stays terminal across lease churn and cache eviction', async () => {
  const scheduler = scheduledTasks()
  let attempts = 0
  const cache = createPackageThumbnailCache({ ...scheduler, maxEntries: 1, idleDelayMs: 0, createRenderer: () => { attempts++; throw new Error('WebGL unavailable') } })
  const first = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  scheduler.run(); assert.equal(await first.ready, null); first.release()
  const second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  assert.equal(await second.ready, null, 'new variants immediately use a stable fallback after context failure')
  second.release()
  assert.equal(attempts, 1)
  assert.equal(scheduler.pending, 0)
  cache.dispose?.()
})

test('a terminal context failure keeps previously cached images usable', async () => {
  const scheduler = scheduledTasks()
  let captures = 0
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render() {
    if (++captures === 2) throw new Error('context lost')
    return 'good-image'
  }, dispose() {} }) })
  const good = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  scheduler.run(); await good.ready; good.release()
  const broken = cache.acquire('CAPACITOR_CERAMIC')
  scheduler.run(); assert.equal(await broken.ready, null); broken.release()
  const cached = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  assert.equal(await cached.ready, 'good-image', 'a failed context does not invalidate completed CPU bitmaps')
  const fallback = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  assert.equal(await fallback.ready, null)
  assert.equal(scheduler.pending, 0)
  assert.equal(captures, 2)
  cached.release(); fallback.release(); cache.dispose?.()
})

test('appearance keys ignore unrelated graph metadata and normalize explicit lead defaults', async () => {
  const scheduler = scheduledTasks()
  let captures = 0
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render() { captures++; return 'image' }, dispose() {} }) })
  const ordinary = cache.acquire('RESISTOR_AXIAL')
  const annotated = cache.acquire('RESISTOR_AXIAL', { label: 'R99', selected: true, position: { x: 5 }, leadForm: 'formed90', leadLengthMm: 0, bodyLiftMm: 0 })
  scheduler.run(); assert.deepEqual(await Promise.all([ordinary.ready, annotated.ready]), ['image', 'image'])
  assert.equal(captures, 1)
  assert.equal(scheduler.pending, 0, 'irrelevant graph changes share the cached appearance')
  ordinary.release(); annotated.release(); cache.dispose?.()
})

test('inactive bitmap eviction retains the most recently used image', async () => {
  const scheduler = scheduledTasks()
  let captures = 0
  const cache = createPackageThumbnailCache({ ...scheduler, maxEntries: 2, createRenderer: () => ({ render() { return `image-${++captures}` }, dispose() {} }) })
  const a = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  scheduler.run(); await a.ready; a.release()
  const b = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  scheduler.run(); await b.ready; b.release()
  const touched = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  assert.equal(await touched.ready, 'image-1'); touched.release()
  const c = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 4700 })
  scheduler.run(); await c.ready; c.release()
  const retained = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 220 })
  assert.equal(await retained.ready, 'image-1')
  const evicted = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  assert.equal(scheduler.pending, 1)
  scheduler.run(); assert.equal(await evicted.ready, 'image-4')
  retained.release(); evicted.release(); cache.dispose?.()
})

test('all visual values, physical lead changes, and package revisions invalidate images', async () => {
  const scheduler = scheduledTasks(), signatures: string[] = []
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render(model) { signatures.push(model.userData.signature); return `image-${signatures.length}` }, dispose() {} }) })
  const variants = [
    cache.acquire('RESISTOR_AXIAL'),
    cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 }),
    cache.acquire('RESISTOR_AXIAL', { tolerancePercent: 5 }),
    cache.acquire('RESISTOR_AXIAL', { powerWatts: 1 }),
    cache.acquire('RESISTOR_AXIAL', { leadForm: 'straight' }),
    cache.acquire('RESISTOR_AXIAL', { leadLengthMm: 1 }),
    cache.acquire('RESISTOR_AXIAL', { bodyLiftMm: 1 }),
    cache.acquire('CAPACITOR_CERAMIC'),
    cache.acquire('CAPACITOR_CERAMIC', { capacitanceFarads: 2e-7 }),
    cache.acquire('CAPACITOR_CERAMIC', { voltageRatingVolts: 100 }),
    cache.acquire('TOGGLE_SWITCH_200MSP1', { state: false }),
    cache.acquire('TOGGLE_SWITCH_200MSP1', { state: true }),
  ]
  for (const variant of variants) { scheduler.run(); await variant.ready }
  assert.equal(new Set(await Promise.all(variants.map(variant => variant.ready))).size, variants.length)
  const part = getPartForType('RESISTOR_AXIAL')!, original = part.package.revision
  try {
    part.package.revision++
    const revised = cache.acquire('RESISTOR_AXIAL')
    scheduler.run(); assert.equal(await revised.ready, 'image-13'); revised.release()
  } finally { part.package.revision = original; variants.forEach(variant => variant.release()); cache.dispose?.() }
})

test('asynchronous capture owns its renderer and transient resources until completion', async () => {
  const scheduler = scheduledTasks()
  let finish!: (image: string) => void, disposed = 0, geometryDisposals = 0
  const cache = createPackageThumbnailCache({ ...scheduler, createRenderer: () => ({ render(model) {
    model.traverse(object => { if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => geometryDisposals++) })
    return new Promise<string>(resolve => { finish = resolve })
  }, dispose() { disposed++ } }) })
  const first = cache.acquire('RESISTOR_AXIAL')
  scheduler.run()
  const second = cache.acquire('RESISTOR_AXIAL', { resistanceOhms: 1000 })
  cache.dispose?.()
  assert.equal(scheduler.pending, 0)
  assert.equal(disposed, 0, 'disposing the cache waits for the in-flight canvas owner')
  assert.equal(await second.ready, null)
  finish('image')
  assert.equal(await first.ready, null)
  assert.ok(geometryDisposals > 0)
  assert.equal(disposed, 1)
  first.release(); second.release()
})
