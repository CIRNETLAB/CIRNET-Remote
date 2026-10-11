import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { useDrawerMotion } from '../src/composables/useDrawerMotion'

function fixture(reduced = false, initiallyCollapsed = false) {
  const collapsed = ref(initiallyCollapsed), resizing = ref(false), listeners = new Set<() => void>()
  const media = { matches: reduced, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }
  const scope = effectScope()
  const drawer = { getAnimations: () => [] as { playState: string }[] }
  const motion = scope.run(() => useDrawerMotion({ collapsed: () => collapsed.value, resizing: () => resizing.value, drawer: () => drawer as unknown as HTMLElement, media: media as unknown as MediaQueryList }))!
  const end = (propertyName = 'transform', child = false) => motion.transitionEnd({ propertyName, target: child ? {} : drawer, currentTarget: drawer } as unknown as TransitionEvent)
  return { collapsed, resizing, motion, scope, listeners, drawer, end, preference(reduce: boolean) { media.matches = reduce; listeners.forEach((listener) => listener()) } }
}

test('closing keeps its obstacle until the drawer transform completes', () => {
  const f = fixture()
  f.collapsed.value = true
  assert.equal(f.motion.occupied.value, true)
  f.end('opacity'); f.end('transform', true)
  assert.equal(f.motion.occupied.value, true, 'unrelated and child transitions must not hide the drawer')
  f.end(); assert.equal(f.motion.occupied.value, false)
  f.collapsed.value = false; assert.equal(f.motion.occupied.value, true)
  f.scope.stop()
})

test('rapid reversals retain the current target and ignore stale transition completions', () => {
  const f = fixture(true, true)
  f.preference(false)
  f.collapsed.value = false; f.collapsed.value = true; f.collapsed.value = false
  f.end(); assert.equal(f.motion.occupied.value, true)
  f.collapsed.value = true
  f.drawer.getAnimations = () => [{ playState: 'running' }]
  f.end(); assert.equal(f.motion.occupied.value, true)
  f.drawer.getAnimations = () => []
  f.end(); assert.equal(f.motion.occupied.value, false)
  f.scope.stop()
})

test('reduced motion and manual resizing settle without waiting for an animation event', () => {
  const f = fixture()
  f.collapsed.value = true; f.preference(true)
  assert.equal(f.motion.occupied.value, false)
  f.collapsed.value = false; f.collapsed.value = true
  assert.equal(f.motion.occupied.value, false)
  f.preference(false); f.collapsed.value = false; f.collapsed.value = true
  f.resizing.value = true
  assert.equal(f.motion.occupied.value, false)
  assert.equal(f.listeners.size, 1)
  f.scope.stop(); assert.equal(f.listeners.size, 0, 'the owned media listener must be disposed')
})

test('an expand/collapse reversal in one Vue frame releases the obstacle without an end event', async () => {
  const f = fixture(false, true)
  f.collapsed.value = false
  f.collapsed.value = true
  await nextTick()
  assert.equal(f.motion.occupied.value, false, 'an unchanged committed transform emits no transitionend')
  f.scope.stop()
})

test('the DOM commit check retains a running transform until its completion', async () => {
  const f = fixture()
  f.drawer.getAnimations = () => [{ playState: 'running' }]
  f.collapsed.value = true
  await nextTick()
  assert.equal(f.motion.occupied.value, true)
  f.drawer.getAnimations = () => []
  f.end(); assert.equal(f.motion.occupied.value, false)
  f.scope.stop()
})
