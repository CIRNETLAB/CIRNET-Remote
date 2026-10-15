import { test } from 'node:test'
import assert from 'node:assert/strict'
import { componentCatalog } from '../src/data/editorCatalog'
import { placementInitialRotation, rotationSnapStep } from '../src/geometry/placementRotation'

test('mechanical initial yaw never evaluates camera heading, even for side/pole/arbitrary views', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const yaw = placementInitialRotation(type, () => { throw new Error('camera must not participate in mechanical placement') })
    assert.equal(yaw, 0)
  }
})

test('every catalog component starts world-aligned without evaluating camera heading', () => {
  for (const { type } of componentCatalog) {
    assert.equal(placementInitialRotation(type, () => { throw new Error(`${type} must not read camera heading`) }), 0)
  }
  assert.equal(placementInitialRotation('UNSUPPORTED', () => { throw new Error('unknown type must not read camera heading') }), 0)
})

test('world-aligned defaults preserve mechanical and free component rotation snap steps', () => {
  assert.equal(rotationSnapStep('BREADBOARD'), 90)
  assert.equal(rotationSnapStep('SN74HC08N'), 90)
  assert.equal(rotationSnapStep('OSCILLOSCOPE'), 15)
  assert.equal(rotationSnapStep('GENERATOR'), 15)
})
