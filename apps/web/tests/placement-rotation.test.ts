import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placementInitialRotation } from '../src/geometry/placementRotation'

test('mechanical initial yaw never evaluates camera heading, even for side/pole/arbitrary views', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const yaw = placementInitialRotation(type, () => { throw new Error('camera must not participate in mechanical placement') })
    assert.equal(yaw, 0)
  }
})

test('known nonmechanical components retain camera-facing placement while unknown types stay world-aligned', () => {
  for (const type of ['POWER_SUPPLY', 'OSCILLOSCOPE', 'GENERATOR', 'CLOCK', 'LED']) {
    let samples = 0
    assert.equal(placementInitialRotation(type, () => { samples++; return 123 }), 123)
    assert.equal(samples, 1)
  }
  assert.equal(placementInitialRotation('UNSUPPORTED', () => { throw new Error('unknown type has no camera-facing policy') }), 0)
})
