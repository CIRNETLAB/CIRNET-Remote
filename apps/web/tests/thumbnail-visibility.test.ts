import { test } from 'node:test'
import assert from 'node:assert/strict'
import { observeThumbnailVisibility, THUMBNAIL_PRELOAD_MARGIN } from '../src/composables/thumbnailVisibility'
import * as visibility from '../src/composables/thumbnailVisibility'

const rectangle = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 680, width: 680, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRectReadOnly
function geometry(top: number, bottom: number) {
  let bounds = rectangle(top, bottom), reads = 0
  const element = Object.assign(new EventTarget(), { getBoundingClientRect() { reads++; return bounds } }) as unknown as Element
  return { element, move(nextTop: number, nextBottom: number) { bounds = rectangle(nextTop, nextBottom) }, get bounds() { return bounds }, get reads() { return reads } }
}
function intersectionEnvironment(enabled = true) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  const observers: Observer[] = []
  class Observer {
    targets = new Set<Element>()
    disconnected = false
    constructor(readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) { observers.push(this) }
    observe(target: Element) { this.targets.add(target) }
    unobserve(target: Element) { this.targets.delete(target) }
    disconnect() { this.disconnected = true; this.targets.clear() }
    emit(target: Element, bounds: DOMRectReadOnly, intersecting = true) {
      this.callback([{ target, boundingClientRect: bounds, isIntersecting: intersecting, intersectionRatio: intersecting ? 1 : 0, intersectionRect: bounds, rootBounds: rectangle(-72, 312), time: 0 }], this as unknown as IntersectionObserver)
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: enabled ? Observer : undefined })
  return { observers, restore() {
    if (previous) Object.defineProperty(globalThis, 'IntersectionObserver', previous)
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver')
  } }
}

test('a card returning before the next IO sample recovers its canceled thumbnail demand', () => {
  const environment = intersectionEnvironment(), root = geometry(0, 240), card = geometry(0, 120)
  const demands: (string | null)[] = []
  const stop = observeThumbnailVisibility(root.element, card.element, value => demands.push(value))
  try {
    environment.observers[0]!.emit(card.element, card.bounds)
    card.move(-400, -280); root.element.dispatchEvent(new Event('scroll'))
    assert.deepEqual(demands, ['visible', null], 'leaving the preload region cancels demand immediately')
    // IO last sampled an intersecting card and samples it intersecting again.
    // It therefore has no threshold transition to deliver for this round trip.
    card.move(0, 120); root.element.dispatchEvent(new Event('scroll'))
    assert.deepEqual(demands, ['visible', null, 'visible'])
  } finally { stop(); environment.restore() }
})

test('one root observer survives partial unsubscribe and ignores callbacks after release', () => {
  const environment = intersectionEnvironment(), root = geometry(0, 240), first = geometry(0, 120), second = geometry(120, 240)
  const firstDemands: (string | null)[] = [], secondDemands: (string | null)[] = [], renewedDemands: (string | null)[] = []
  const stopFirst = observeThumbnailVisibility(root.element, first.element, value => firstDemands.push(value))
  const stopSecond = observeThumbnailVisibility(root.element, second.element, value => secondDemands.push(value))
  let stopRenewed: (() => void) | undefined
  try {
    assert.equal(environment.observers.length, 1)
    const observer = environment.observers[0]!
    assert.equal(observer.options?.root, root.element)
    assert.equal(observer.options?.rootMargin, `${THUMBNAIL_PRELOAD_MARGIN}px 0px`)
    assert.equal(observer.targets.size, 2)
    stopFirst(); stopFirst()
    assert.equal(observer.disconnected, false)
    observer.emit(first.element, first.bounds)
    observer.emit(second.element, second.bounds)
    assert.deepEqual(firstDemands, [], 'queued records for removed cards do not reacquire a lease')
    assert.deepEqual(secondDemands, ['visible'])
    stopSecond()
    assert.equal(observer.disconnected, true)
    observer.emit(second.element, second.bounds, false)
    assert.deepEqual(secondDemands, ['visible'], 'a disconnected observer cannot publish late records')
    stopRenewed = observeThumbnailVisibility(root.element, second.element, value => renewedDemands.push(value))
    assert.equal(environment.observers.length, 2, 'a later opening gets a fresh live observer')
    observer.emit(second.element, second.bounds)
    assert.deepEqual(renewedDemands, [])
    environment.observers[1]!.emit(second.element, second.bounds)
    assert.deepEqual(renewedDemands, ['visible'])
  } finally { stopFirst(); stopSecond(); stopRenewed?.(); environment.restore() }
})

test('scroll promotes preload priority and only remeasures IO candidates', () => {
  const environment = intersectionEnvironment(), root = geometry(0, 240), near = geometry(260, 300), far = geometry(600, 720)
  const demands: (string | null)[] = []
  const stopNear = observeThumbnailVisibility(root.element, near.element, value => demands.push(value))
  const stopFar = observeThumbnailVisibility(root.element, far.element, () => {})
  try {
    const observer = environment.observers[0]!
    observer.emit(near.element, near.bounds)
    near.move(120, 160); root.element.dispatchEvent(new Event('scroll'))
    assert.deepEqual(demands, ['preload', 'visible'])
    assert.equal(far.reads, 0, 'never-intersecting cards are left to IO discovery')
    observer.emit(near.element, rectangle(600, 720), false)
    const reads = near.reads
    root.element.dispatchEvent(new Event('scroll'))
    assert.equal(near.reads, reads, 'an IO-confirmed exit stops geometry polling')
    assert.deepEqual(demands, ['preload', 'visible', null])
  } finally { stopNear(); stopFar(); environment.restore() }
})

test('geometry fallback keeps requests within the preload margin when IO is unavailable', () => {
  const environment = intersectionEnvironment(false), root = geometry(0, 240), card = geometry(260, 300)
  const demands: (string | null)[] = []
  const stop = observeThumbnailVisibility(root.element, card.element, value => demands.push(value))
  try {
    assert.equal(environment.observers.length, 0)
    assert.deepEqual(demands, ['preload'])
    card.move(120, 160); root.element.dispatchEvent(new Event('scroll'))
    card.move(600, 720); root.element.dispatchEvent(new Event('scroll'))
    card.move(0, 120); root.element.dispatchEvent(new Event('scroll'))
    assert.deepEqual(demands, ['preload', 'visible', null, 'visible'])
    stop(); card.move(600, 720); root.element.dispatchEvent(new Event('scroll'))
    assert.deepEqual(demands, ['preload', 'visible', null, 'visible'])
  } finally { stop(); environment.restore() }
})

test('filtering can refresh surviving cards without IO or a scroll event', () => {
  const environment = intersectionEnvironment(false), root = geometry(0, 240), card = geometry(600, 720)
  const demands: (string | null)[] = []
  const stop = observeThumbnailVisibility(root.element, card.element, value => demands.push(value))
  try {
    card.move(0, 120)
    const refresh = Reflect.get(visibility, 'refreshThumbnailVisibility') as (root: Element) => void
    assert.equal(typeof refresh, 'function', 'a result reflow must remeasure existing subscriptions')
    refresh(root.element)
    assert.deepEqual(demands, ['visible'])
  } finally { stop(); environment.restore() }
})

test('resizing the scroll root promotes an already intersecting preload card and releases the resize observer', () => {
  const environment = intersectionEnvironment(), root = geometry(0, 240), card = geometry(260, 300)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
  const demands: (string | null)[] = []
  let resized: (() => void) | undefined, disconnected = false
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
    constructor(callback: () => void) { resized = callback }
    observe() {}
    disconnect() { disconnected = true }
  } })
  const stop = observeThumbnailVisibility(root.element, card.element, value => demands.push(value))
  try {
    environment.observers[0]!.emit(card.element, card.bounds)
    root.move(0, 360)
    assert.ok(resized, 'viewport growth must update queue priorities without another IO threshold crossing')
    resized()
    assert.deepEqual(demands, ['preload', 'visible'])
    stop(); assert.equal(disconnected, true)
  } finally {
    stop(); environment.restore()
    if (previous) Object.defineProperty(globalThis, 'ResizeObserver', previous); else Reflect.deleteProperty(globalThis, 'ResizeObserver')
  }
})
