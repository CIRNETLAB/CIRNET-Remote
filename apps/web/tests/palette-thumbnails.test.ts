import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, provide } from 'vue'
import { createPackageThumbnailCache, packageThumbnailCacheKey, type PackageThumbnailCache } from '../src/three/PackageThumbnails'
import { useUiStore } from '../src/stores/ui'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'

const rectangle = (top: number, bottom: number, left = 0, right = 680) => ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} }) as DOMRectReadOnly

function globals(viewportHeight = 240) {
  const keys = ['document', 'window', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'] as const
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const observers: Observer[] = []
  class Observer {
    targets = new Set<Element>(); disconnected = false
    constructor(readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) { observers.push(this) }
    observe(target: Element) { this.targets.add(target) }
    unobserve(target: Element) { this.targets.delete(target) }
    disconnect() { this.disconnected = true; this.targets.clear() }
    emit(target: Element, top: number, visible = true) {
      this.callback([{ target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0, rootBounds: rectangle(0, viewportHeight), boundingClientRect: rectangle(top, top + 120), intersectionRect: rectangle(0, 120), time: 0 }], this as unknown as IntersectionObserver)
    }
  }
  const values = {
    document: Object.assign(new EventTarget(), { activeElement: null, querySelector() { return null }, createElement() { return { getContext: () => null } } }),
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: Observer,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), cancelAnimationFrame: (id: number) => clearTimeout(id),
  }
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] })
  return { observers, restore() { for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } }
}

test('opening 40 Logic ICs mounts lightweight placeholders and only visible or near cards request thumbnails', async () => {
  const environment = globals(), pinia = createPinia(); setActivePinia(pinia)
  const requested: { type: string; priority?: string; released: boolean; finish(image: string): void }[] = []
  const cache: PackageThumbnailCache = { acquire(type, _properties, options) {
    let finish!: (image: string) => void
    const ready = new Promise<string>(resolve => { finish = resolve })
    const entry = { type, priority: options?.priority, released: false, finish }; requested.push(entry)
    return { ready, release() { entry.released = true } }
  } }
  const ribbon = await loadSfc('components/workbench/ComponentRibbon.vue')
  const wrapper = defineComponent({ setup() { provide(packageThumbnailCacheKey, cache); return () => h(ribbon) } })
  const ui = useUiStore(); ui.activeRibbonGroup = 'logic'
  const view = mountSfc(wrapper, pinia)
  try {
    await nextTick(); await nextTick()
    assert.equal(view.all().filter(node => node.props['data-component-type']).length, 40)
    assert.equal(requested.length, 0, 'mounting a palette must not enqueue forty GPU jobs')
    assert.equal(environment.observers.length, 1, 'all cards share one palette-root observer')
    const observer = environment.observers[0]!
    assert.ok(observer.options?.root)
    assert.match(observer.options!.rootMargin!, /72px/)
    const targets = [...observer.targets]
    assert.equal(targets.length, 40)
    targets.slice(0, 15).forEach((target, index) => observer.emit(target, Math.floor(index / 5) * 120))
    await nextTick()
    assert.equal(requested.length, 15, 'two visible rows plus one preload row, not the whole library')
    assert.equal(requested.filter(entry => entry.priority === 'visible').length, 10)
    assert.equal(requested.filter(entry => entry.priority === 'preload').length, 5)
    targets.slice(0, 5).forEach(target => observer.emit(target, -200, false))
    await nextTick()
    assert.equal(requested.filter(entry => entry.released).length, 5, 'scrolling out cancels pending leases')
    targets.slice(15, 20).forEach(target => observer.emit(target, 120))
    await nextTick()
    assert.equal(requested.length, 20, 'scrolling requests only newly visible cards')
    ui.activeRibbonGroup = null; await nextTick()
    assert.ok(requested.every(entry => entry.released))
    assert.equal(observer.disconnected, true)
  } finally { view.app.unmount(); environment.restore() }
})

test('a controlled desktop palette actually captures 25 models once and reopening reuses all bitmaps', async () => {
  const environment = globals(420), pinia = createPinia(); setActivePinia(pinia)
  const jobs: { callback(): void; cancelled: boolean }[] = [], rendered: string[] = []
  let contexts = 0, disposed = 0
  const cache = createPackageThumbnailCache({ idleDelayMs: 0, scheduleTask(callback) {
    const job = { callback, cancelled: false }; jobs.push(job)
    return () => { job.cancelled = true }
  }, createRenderer() {
    contexts++
    return { render(model) { rendered.push(model.userData.type); return `data:image/png;base64,captured-${model.userData.type}` }, dispose() { disposed++ } }
  } })
  const ribbon = await loadSfc('components/workbench/ComponentRibbon.vue')
  const wrapper = defineComponent({ setup() { provide(packageThumbnailCacheKey, cache); return () => h(ribbon) } })
  const ui = useUiStore(); ui.activeRibbonGroup = 'logic'
  const view = mountSfc(wrapper, pinia)
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick() }
  try {
    await nextTick(); await nextTick()
    assert.equal(rendered.length, 0)
    const initial = environment.observers[0]!
    ;[...initial.targets].slice(0, 25).forEach((target, index) => initial.emit(target, Math.floor(index / 5) * 120))
    await nextTick()
    for (let count = 0; jobs.length && count < 100; count++) {
      const job = jobs.shift()!
      if (!job.cancelled) job.callback()
      await flush()
    }
    assert.equal(rendered.length, 25, 'only four visible rows and one preload row build real Three models')
    assert.equal(new Set(rendered).size, 25); assert.equal(contexts, 1)
    assert.equal(view.all().filter(node => typeof node.props.src === 'string' && node.props.src.includes('captured-')).length, 25)
    ui.activeRibbonGroup = null; await nextTick()
    assert.equal(disposed, 1)
    ui.activeRibbonGroup = 'logic'; await nextTick(); await nextTick()
    const reopened = environment.observers.at(-1)!
    ;[...reopened.targets].slice(0, 25).forEach((target, index) => reopened.emit(target, Math.floor(index / 5) * 120))
    await flush(); await flush()
    assert.equal(rendered.length, 25, 'reopening requests cached CPU images without rebuilding models')
    assert.equal(contexts, 1, 'cache hits need no replacement renderer')
    assert.equal(view.all().filter(node => typeof node.props.src === 'string' && node.props.src.includes('captured-')).length, 25)
  } finally { view.app.unmount(); cache.dispose?.(); environment.restore() }
})

test('Search Clear, Escape, Enter and grid Arrow/Home/End navigation retain their focus and placement behavior', async () => {
  const environment = globals(), pinia = createPinia(); setActivePinia(pinia)
  const ui = useUiStore(), workspace = useWorkspaceStore(); ui.activeRibbonGroup = 'logic'
  const view = mountSfc(await loadSfc('components/workbench/ComponentRibbon.vue'), pinia)
  try {
    await nextTick(); await nextTick()
    const root = view.all().find(node => node.props.class === 'component-library-content')!
    let focused: unknown = null
    const cards = () => view.all().filter(node => node.props['data-component-type'])
    const trigger = view.find('button', 'data-group', 'logic')
    const input = view.find('input', 'aria-label', 'Search components')
    const grid = view.all().find(node => node.props.class === 'palette-items')!
    const bindFocus = (node: object) => Object.assign(node, { focus() { focused = node } })
    ;[trigger, input, ...cards()].forEach(bindFocus)
    Object.assign(root, {
      querySelector(selector: string) { return selector === '.palette-items button' ? cards()[0] : selector === '[data-group="logic"]' ? trigger : null },
      querySelectorAll() { return cards() },
    })
    Object.assign(grid, { clientWidth: 640 })
    for (const card of cards()) Object.assign(card, { parentElement: grid })
    const key = (node: typeof input, value: string, target: unknown = node) => (node.props.onKeydown as (event: unknown) => void)({ key: value, target, preventDefault() {}, stopPropagation() {} })
    const all = cards()
    key(input, 'ArrowDown'); assert.equal(focused, all[0])
    key(grid, 'ArrowRight', all[0]); assert.equal(focused, all[1])
    key(grid, 'ArrowDown', all[1]); assert.equal(focused, all[6])
    key(grid, 'ArrowUp', all[6]); assert.equal(focused, all[1])
    key(grid, 'Home', all[1]); assert.equal(focused, all[0])
    key(grid, 'End', all[0]); assert.equal(focused, all.at(-1))
    key(grid, 'ArrowRight', all.at(-1)); assert.equal(focused, all.at(-1))
    dispatch(input, 'onInput', 'no-such-component'); await nextTick()
    key(input, 'ArrowDown') // Empty results remain keyboard-safe.
    dispatch(view.find('button', 'aria-label', 'Clear component search'), 'onClick'); await nextTick()
    assert.equal(focused, input); assert.equal(cards().length, 40)
    dispatch(input, 'onInput', 'SN74HC08N'); await nextTick()
    const type = cards()[0]!.props['data-component-type']
    key(input, 'Enter'); await nextTick()
    assert.equal(workspace.placementType, type); assert.equal(ui.activeRibbonGroup, null); assert.equal(focused, trigger)
    ui.activeRibbonGroup = 'logic'; await nextTick()
    const nextInput = view.find('input', 'aria-label', 'Search components'); bindFocus(nextInput)
    dispatch(nextInput, 'onInput', 'schmitt'); await nextTick()
    key(nextInput, 'Escape'); await nextTick()
    assert.equal(nextInput.props.value, ''); assert.equal(focused, nextInput)
    key(nextInput, 'Escape'); await nextTick()
    assert.equal(ui.activeRibbonGroup, null); assert.equal(focused, trigger)
    assert.equal(workspace.placementType, type)
  } finally { view.app.unmount(); environment.restore() }
})

test('fast Search updates results immediately while old thumbnails resolve without stale images or placement edits', async () => {
  const environment = globals(), pinia = createPinia(); setActivePinia(pinia)
  const pending: { type: string; released: boolean; resolve(image: string): void }[] = []
  const cache: PackageThumbnailCache = { acquire(type) {
    let resolve!: (image: string) => void
    const ready = new Promise<string>(done => { resolve = done }), entry = { type, released: false, resolve }; pending.push(entry)
    return { ready, release() { entry.released = true } }
  } }
  const ribbon = await loadSfc('components/workbench/ComponentRibbon.vue')
  const wrapper = defineComponent({ setup() { provide(packageThumbnailCacheKey, cache); return () => h(ribbon) } })
  const ui = useUiStore(), workspace = useWorkspaceStore(), circuit = useCircuitStore()
  circuit.createDraft(); workspace.armPlacement('RESISTOR_AXIAL'); ui.activeRibbonGroup = 'logic'
  const before = circuit.snapshot(), history = circuit.past.length, view = mountSfc(wrapper, pinia)
  try {
    await nextTick(); await nextTick()
    const observer = environment.observers[0]!, initial = [...observer.targets]
    initial.slice(0, 10).forEach(target => observer.emit(target, 0)); await nextTick()
    const input = view.find('input', 'aria-label', 'Search components')
    for (const query of ['74', 'nand', 'CD4013']) { dispatch(input, 'onInput', query); await nextTick() }
    const results = view.all().filter(node => node.props['data-component-type'])
    assert.equal(results.length, 1)
    assert.ok(String(results[0]!.props['data-component-type']).includes('4013'))
    assert.ok(view.text().includes('1 components'))
    assert.ok(pending.every(entry => entry.released), 'irrelevant queued images release before they complete')
    pending.forEach(entry => entry.resolve(`data:image/png;base64,old-${entry.type}`))
    await Promise.resolve(); await nextTick()
    assert.ok(!view.all().some(node => typeof node.props.src === 'string' && node.props.src.includes('old-')))
    dispatch(view.find('button', 'aria-label', 'Clear component search'), 'onClick'); await nextTick()
    assert.equal(view.all().filter(node => node.props['data-component-type']).length, 40)
    assert.equal(workspace.placementType, 'RESISTOR_AXIAL')
    assert.equal(circuit.snapshot(), before); assert.equal(circuit.past.length, history)
  } finally { view.app.unmount(); environment.restore() }
})
