import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDefinition } from '../src/data/editorCatalog'
import { getPartForType, MM_TO_WORLD } from '../src/data/partCatalog'
import { ribbonGroups } from '../src/data/ribbon'
import executionRegistry from '../src/data/physicalParts.json'

// Execution profiles are inspected at their own boundary; editor parts omit them.
const executionPart = (type: string) => executionRegistry.parts.find(part => part.editorType === type)!

test('physical HC08 exposes every numbered package pin without changing the legacy logical definition', () => {
  const physical = getDefinition('SN74HC08N')
  assert.ok(physical, 'the separately selectable SN74HC08N package definition must exist')
  assert.deepEqual(physical.ports.map(pin => pin.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'])
  assert.equal(getDefinition('74HC08')!.ports.length, 12)
  assert.deepEqual(getDefinition('LED')!.ports.map(pin => pin.id), ['IN'])
  assert.deepEqual(getDefinition('POWER_SUPPLY')!.ports, [])
})

test('physical LED and supply have two explicit electrical terminals', () => {
  assert.deepEqual(getDefinition('LED_LTL307EE')?.ports.map(pin => pin.id), ['A', 'K'])
  assert.deepEqual(getDefinition('DC_SUPPLY')?.ports.map(pin => pin.id), ['PLUS', 'MINUS'])
  assert.deepEqual(getDefinition('RESISTOR_AXIAL')?.ports.map(pin => pin.id), ['A', 'B'])
})

test('HC08 pin names, legacy mappings, footprint and gate power share the canonical package', () => {
  const part = getPartForType('SN74HC08N')!
  assert.deepEqual(part.package.pins.map(pin => pin.name), ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'])
  assert.equal(part.package.pins[0]!.logicalPort, 'A1')
  assert.equal(part.package.pins[8]!.logicalPort, 'A3')
  assert.equal(part.package.pins[6]!.role, 'ground')
  assert.equal(part.package.pins[13]!.role, 'power')
  assert.deepEqual(executionPart('SN74HC08N').simulation?.power, { positivePinId: '14', negativePinId: '7', minVoltage: 2, maxVoltage: 6 })
  assert.deepEqual(part.package.pins[0]!.positionMm, { x: -7.62, y: 0, z: 3.81 })
  assert.deepEqual(part.package.pins[13]!.positionMm, { x: -7.62, y: 0, z: -3.81 })
  assert.equal(part.package.footprint.rowSpanMm! * MM_TO_WORLD, .39)
})

test('physical switches describe independent contacts and the button permanent internal pairs', () => {
  const dip = getPartForType('DIP_SWITCH_A6D4100')
  assert.ok(dip, 'four-pole contact switch is a separate physical definition')
  assert.deepEqual(dip.internalConnections, [
    { pins: ['1', '8'], when: { property: 'position0', equals: true } },
    { pins: ['2', '7'], when: { property: 'position1', equals: true } },
    { pins: ['3', '6'], when: { property: 'position2', equals: true } },
    { pins: ['4', '5'], when: { property: 'position3', equals: true } },
  ])
  const button = getPartForType('PUSH_BUTTON_B3F1000')!
  assert.deepEqual(button.internalConnections, [
    { pins: ['1', '2'] }, { pins: ['3', '4'] },
    { pins: ['1', '3'], when: { property: 'pressed', equals: true } },
  ])
  assert.deepEqual(getDefinition('DIP_SWITCH')!.ports.map(pin => pin.id), ['Q0', 'Q1', 'Q2', 'Q3'])
})

test('physical toggle switches its common terminal between two contacts without generating a level', () => {
  const toggle = getPartForType('TOGGLE_SWITCH_200MSP1')
  assert.ok(toggle, 'the SPDT toggle has a separately selectable package')
  assert.deepEqual(toggle.package.pins.map(pin => [pin.id, pin.name, pin.role]), [['1', '1', 'passive'], ['2', 'COM', 'passive'], ['3', '3', 'passive']])
  assert.deepEqual(toggle.internalConnections, [{ pins: ['2', '3'], when: { property: 'state', equals: false } }, { pins: ['2', '1'], when: { property: 'state', equals: true } }])
  assert.ok(ribbonGroups.find(group => group.id === 'input')!.items.some(item => item.type === 'TOGGLE_SWITCH_200MSP1'))
})

test('display packages retain real common pins and multiplex pinouts', () => {
  const single = getPartForType('SEGMENT_SC5611EWA')
  assert.ok(single, 'single common cathode display has its exact part definition')
  assert.deepEqual(single.package.pins.map(pin => pin.name), ['e', 'd', 'CC', 'c', 'DP', 'b', 'a', 'CC', 'f', 'g'])
  assert.deepEqual(getPartForType('SEGMENT_DC5611EWA')!.package.pins.map(pin => pin.name), ['e1', 'd1', 'c1', 'DP1', 'e2', 'd2', 'g2', 'c2', 'DP2', 'b2', 'a2', 'f2', 'CC2', 'CC1', 'b1', 'a1', 'g1', 'f1'])
  assert.deepEqual(getPartForType('SEGMENT_CC5612EWA')!.package.pins.map(pin => pin.name), ['e', 'd', 'DP', 'c', 'g', 'CC4', 'b', 'CC3', 'CC2', 'f', 'a', 'CC1'])
})

test('physical missing families are placeable but unsupported simulation is explicit', () => {
  for (const type of ['TRANSISTOR_2N3904', 'DIODE_1N4148', 'ZENER_1N4733A', 'BUZZER_PS1240', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC']) {
    const part = getPartForType(type)
    assert.ok(part, type)
    assert.ok(getDefinition(type), `${type} must be placeable`)
    assert.equal(executionPart(type).simulation?.status, 'unsupported', type)
    assert.ok(executionPart(type).simulation?.reason, type)
  }
  assert.deepEqual(getPartForType('TRANSISTOR_2N3904')!.package.pins.map(pin => pin.name), ['E', 'B', 'C'])
})

test('NOR/inverter pinouts are separately declared and LS266 has open collector outputs', () => {
  const nor = getPartForType('SN74HC02N')
  assert.ok(nor, 'NOR package has a separate pinout')
  assert.deepEqual(nor.package.pins.slice(0, 3).map(pin => pin.name), ['1Y', '1A', '1B'])
  assert.equal(getPartForType('SN74HC04N')!.package.pins[2]!.name, '2A')
  const xnor = getPartForType('SN74LS266N')!
  assert.equal(executionPart('SN74LS266N').simulation?.status, 'unsupported')
  assert.deepEqual(xnor.package.pins.filter(pin => pin.role === 'output').map(pin => pin.outputType), ['open-collector', 'open-collector', 'open-collector', 'open-collector'])
  for (const type of ['ADDER', 'MULTIPLIER', 'MEMORY']) assert.equal(getPartForType(type), undefined)
})

test('palette exposes physical parts and hides legacy-only families without deleting definitions', () => {
  const items = ribbonGroups.flatMap(group => group.items)
  for (const type of ['SN74HC08N', 'GENERIC_LED', 'GENERIC_RESISTOR', 'DC_SUPPLY', 'GENERIC_BJT', 'GENERIC_DIODE', 'GENERIC_ZENER_DIODE', 'GENERIC_BUZZER', 'SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'PUSH_BUTTON_B3F1000', 'DIP_SWITCH_A6D4100', 'GENERIC_CAPACITOR', 'SN74HC02N', 'SN74HC04N', 'SN74LS266N']) {
    assert.ok(items.some(item => item.type === type), `${type} must be accessible in the palette`)
  }
  const legacy = ribbonGroups.find(group => group.id === 'logical-tools')
  assert.equal(legacy, undefined)
  assert.ok(getDefinition('LED')); assert.ok(getDefinition('DIP_SWITCH')); assert.ok(getDefinition('MEMORY'))
  assert.ok(!ribbonGroups.some(group => ['memory', 'embedded'].includes(group.id)))
  assert.equal(items.find(item => item.type === 'GENERIC_BJT')!.support, 'Place / wire')
  assert.equal(items.some(item => item.type === 'GENERIC_CAPACITOR_ELECTROLYTIC'), false, 'Type selects the second capacitor package')
  for (const type of ['LED_LTL307EE', 'RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC', 'DIODE_1N4148', 'ZENER_1N4733A', 'BUZZER_PS1240', 'TRANSISTOR_2N3904']) assert.ok(getDefinition(type), `${type} legacy files retain their original definition`)
})
