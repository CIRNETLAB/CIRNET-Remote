import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFrameTask, observeElementSize } from '../src/composables/frameTasks'

function clock() {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  return {
    frames,
    requestFrame(callback: FrameRequestCallback) { frames.set(++id, callback); return id },
    cancelFrame(id: number) { frames.delete(id) },
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) },
  }
}
function observed() {
  const frames = clock(), sizes: number[][] = []
  const element = { getBoundingClientRect() { throw new Error('observer data must replace DOM measurement') } } as unknown as Element
  let deliver: ResizeObserverCallback, disconnected = 0, target: Element | null = null
  class Observer {
    constructor(callback: ResizeObserverCallback) { deliver = callback }
    observe(element: Element) { target = element }
    disconnect() { disconnected++ }
  }
  const observer = observeElementSize(element, (width, height) => sizes.push([width, height]), { ...frames, Observer: Observer as unknown as typeof ResizeObserver })
  const send = (width: number, height: number, node = element) => deliver!([{ target: node, contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
  return { ...frames, sizes, observer, send, element, target: () => target, disconnected: () => disconnected }
}

test('observer bursts apply only the latest dimensions once per animation frame, without layout reads', () => {
  const state = observed()
  try {
    assert.equal(state.target(), state.element)
    for (let i = 0; i < 40; i++) state.send(900 + i / 4, 500.25)
    assert.equal(state.frames.size, 1); assert.deepEqual(state.sizes, [])
    state.flush()
    assert.deepEqual(state.sizes, [[909.75, 500.25]])
    for (let i = 0; i < 40; i++) state.send(909.75, 500.25)
    assert.equal(state.frames.size, 0)
    state.send(950, 550); state.send(909.75, 500.25)
    assert.equal(state.frames.size, 0, 'a layout that returns to the applied size needs no work')
    state.flush(); assert.equal(state.sizes.length, 1)
    state.send(910, 500.25); state.flush()
    assert.deepEqual(state.sizes.at(-1), [910, 500.25])
  } finally { state.observer.disconnect() }
})

test('size observers ignore foreign/invalid entries, handle zero size and restore, and release pending frames', () => {
  const state = observed()
  state.send(900, 500); state.flush()
  state.send(700, 300, {} as Element); state.send(NaN, 500); state.send(900, Infinity)
  assert.equal(state.frames.size, 0); assert.deepEqual(state.sizes, [[900, 500]])
  state.send(-1, 0); state.flush(); assert.deepEqual(state.sizes.at(-1), [0, 0])
  state.send(900, 500); state.flush(); assert.deepEqual(state.sizes.at(-1), [900, 500])
  state.send(1000, 600)
  state.observer.disconnect(); assert.equal(state.disconnected(), 1); assert.equal(state.frames.size, 0)
  state.send(1200, 900); state.flush(); assert.equal(state.sizes.length, 3)
})

test('shared frame tasks coalesce palette updates and cancel pending work on disposal', () => {
  const frames = clock(); let calls = 0
  const task = createFrameTask(() => { calls++ }, frames)
  for (let i = 0; i < 50; i++) task.schedule()
  assert.equal(frames.frames.size, 1); frames.flush(); assert.equal(calls, 1)
  task.schedule(); task.cancel(); frames.flush(); assert.equal(calls, 1)
  task.schedule(); frames.flush(); assert.equal(calls, 2)
})
