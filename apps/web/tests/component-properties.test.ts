import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { fiveBandResistorCode, normalizeComponentProperties, parseEngineeringQuantity, validateComponentProperties } from '../src/data/componentProperties'

test('engineering quantities convert supported units and reject empty, mismatched or nonfinite values', () => {
  for (const [text, unit, expected] of [
    ['220 Ω', 'ohm', 220], ['1 kΩ', 'ohm', 1000], ['4.7 kohm', 'ohm', 4700], ['.1 MΩ', 'ohm', 100000],
    ['100 nF', 'F', 1e-7], ['47 µF', 'F', 47e-6], ['47 μF', 'F', 47e-6], ['2.2 mF', 'F', .0022], ['10 pF', 'F', 1e-11],
    ['250 mW', 'W', .25], ['50 V', 'V', 50], ['1 %', '%', 1],
  ] as const) assert.equal(parseEngineeringQuantity(text, unit), expected)
  assert.equal(parseEngineeringQuantity(1000, 'ohm'), 1000)
  for (const value of ['', '  ', null, true, NaN, Infinity, '1 V', 'Infinity Ω', '1e999 Ω', '0x10', '1 kΩ junk']) {
    assert.throws(() => parseEngineeringQuantity(value, 'ohm'))
  }
  assert.throws(() => parseEngineeringQuantity('0 Ω', 'ohm', { min: .1, max: 1e9 }))
})

test('five-band resistor codes use three exact digits and a separate tolerance band', () => {
  for (const [ohms, digits, exponent, bands] of [
    [220, [2, 2, 0], 0, ['red', 'red', 'black', 'black', 'brown']],
    [1000, [1, 0, 0], 1, ['brown', 'black', 'black', 'brown', 'brown']],
    [4700, [4, 7, 0], 1, ['yellow', 'violet', 'black', 'brown', 'brown']],
    [100000, [1, 0, 0], 3, ['brown', 'black', 'black', 'orange', 'brown']],
  ] as const) {
    const code = fiveBandResistorCode(ohms, 1)
    if (!code.ok) assert.fail(code.reason)
    assert.deepEqual(code.digits, digits); assert.equal(code.multiplierExponent, exponent); assert.deepEqual(code.bands, bands)
  }
  const fivePercent = fiveBandResistorCode(4700, 5)
  assert.equal(fivePercent.ok && fivePercent.bands[4], 'gold')
  for (const value of [0, -1, NaN, Infinity, 1234, .1234, .22]) assert.equal(fiveBandResistorCode(value, 1).ok, false)
  assert.equal(fiveBandResistorCode(1000, 3).ok, false)
})

test('explicit legacy migration preserves arbitrary metadata and canonical values without sharing defaults', () => {
  const legacy = { resistance_ohm: 1000, powerWatts: .25, tolerancePercent: 1, custom: { label: 'R' } }
  const result = normalizeComponentProperties('RESISTOR_AXIAL', legacy)
  assert.equal(result.resistanceOhms, 1000); assert.equal('resistance_ohm' in result, false)
  assert.equal(legacy.resistance_ohm, 1000)
  assert.deepEqual(result.custom, { label: 'R' }); assert.notEqual(result.custom, legacy.custom)
  assert.equal(normalizeComponentProperties('RESISTOR_AXIAL', { resistance_ohm: 330, resistanceOhms: 4700 }).resistanceOhms, 4700)
  assert.deepEqual(normalizeComponentProperties('LEGACY_OTHER', { resistance_ohm: 330 }), { resistance_ohm: 330 })
  assert.deepEqual(normalizeComponentProperties('RESISTOR_AXIAL', undefined), {})
})

test('normalization accepts reactive instance properties and preserves nested arrays without sharing metadata', () => {
  const properties = reactive({ resistanceOhms: 4700, custom: { values: [1, 'value', { flag: true }] } })
  const result = normalizeComponentProperties('RESISTOR_AXIAL', properties)
  assert.deepEqual(result, { resistanceOhms: 4700, custom: { values: [1, 'value', { flag: true }] } })
  ;(result.custom as { values: unknown[] }).values.push(2)
  assert.equal(properties.custom.values.length, 3)
  assert.throws(() => normalizeComponentProperties('RESISTOR_AXIAL', reactive({ resistanceOhms: NaN })), /finite/)
})

test('design properties enforce canonical numeric SI values and bounds independently of execution profiles', () => {
  assert.deepEqual(validateComponentProperties('RESISTOR_AXIAL', { resistanceOhms: 1234, powerWatts: .25, tolerancePercent: 1 }), [])
  assert.deepEqual(validateComponentProperties('CAPACITOR_CERAMIC', { capacitanceFarads: 100e-9, voltageRatingVolts: 50 }), [])
  assert.deepEqual(validateComponentProperties('CAPACITOR_ELECTROLYTIC', { capacitanceFarads: 47e-6, voltageRatingVolts: 25 }), [])
  for (const properties of [{ resistanceOhms: 0 }, { resistanceOhms: '1 kΩ' }, { powerWatts: NaN }, { tolerancePercent: 21 }, { powerWatts: true }]) {
    assert.ok(validateComponentProperties('RESISTOR_AXIAL', properties).length)
    assert.throws(() => normalizeComponentProperties('RESISTOR_AXIAL', properties))
  }
  assert.ok(validateComponentProperties('CAPACITOR_CERAMIC', { capacitanceFarads: 0 }).length)
  assert.ok(validateComponentProperties('CAPACITOR_ELECTROLYTIC', { voltageRatingVolts: Infinity }).length)
})
