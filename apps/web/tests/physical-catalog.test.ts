import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDefinition } from '../src/data/editorCatalog'
import { getPartForType, getPartDefinition, packageLeadCollisionRadiusMm, physicalDescriptorForPart, getPartForModule, MM_TO_WORLD } from '../src/data/partCatalog'
import { ribbonGroups } from '../src/data/ribbon'
import executionRegistry from '../src/data/physicalParts.json'

// Execution profiles are inspected at their own boundary; editor parts omit them.
const executionPart = (type: string) => executionRegistry.parts.find(part => part.editorType === type)!

test('compact generic defaults resolve separately from every pinned historical descriptor', () => {
  const latest = getPartForType('GENERIC_RESISTOR')!
  assert.equal(latest.revision, 7)
  assert.deepEqual(latest.package.boardInsertion, { version: 1, mechanicalProfileId: 'BREADBOARD_MECHANICS_V1', maxExternalLeadMm: 35 })
  assert.deepEqual(latest.package.bodyMm, { x: 4.9, y: 1.75, z: 1.75 })
  assert.equal(latest.editor.color, '#4A90E2')
  const old = { partId: latest.id, partRevision: 1, packageId: 'MRS25-1016', packageRevision: 1 }
  assert.equal(getPartForType('GENERIC_RESISTOR', old)!.package.bodyMm.x, 6.5)
  assert.equal(getPartDefinition(latest.id, 1)!.package.id, old.packageId)
  assert.equal(getPartDefinition(latest.id)!.revision, 7)
  assert.equal(getPartDefinition(latest.id, 6)!.package.boardInsertion, undefined)
  assert.equal(getPartForType('GENERIC_RESISTOR', { ...old, packageRevision: 99 }), undefined)
  assert.equal(getPartForType('GENERIC_DIODE', old), undefined)
  assert.deepEqual(getPartForType('GENERIC_CAPACITOR_ELECTROLYTIC')!.package.bodyMm, { x: 6.3, y: 11, z: 6.3 })
  assert.deepEqual(getPartForType('CAPACITOR_ELECTROLYTIC')!.package.bodyMm, { x: 10, y: 12.5, z: 10 })
})

test('sealed shapes preserve every previous descriptor and enclose actual rectangular lead sections', () => {
  const sizes: Record<string, number[]> = {
    GENERIC_RESISTOR: [4.9, 1.75, 1.75], GENERIC_DIODE: [4.5, 2.3, 2.3], GENERIC_ZENER_DIODE: [3.5, 1.6, 1.6],
    GENERIC_CAPACITOR: [5, 5, 2.2], GENERIC_CAPACITOR_ELECTROLYTIC: [6.3, 11, 6.3], GENERIC_LED: [5.8, 8.7, 5.8],
    GENERIC_BJT: [4.6, 5.1, 3.9], SN74HC08N: [19, 3.04, 6.35],
  }
  for (const [type, dimensions] of Object.entries(sizes)) {
    const part = getPartForType(type)!, { shape, bodyMm } = part.package
    assert.deepEqual([bodyMm.x, bodyMm.y, bodyMm.z], dimensions)
    assert.equal(shape!.embeddedDepthMm, .15)
    assert.deepEqual(shape!.leadExits.map(exit => exit.pinId), part.package.pins.map(pin => pin.id))
    for (const exit of shape!.leadExits) assert.ok(Math.abs(Math.hypot(exit.normal.x, exit.normal.y, exit.normal.z)-1) < 1e-12)
    assert.equal(getPartForModule({ type, physicalDescriptor: physicalDescriptorForPart(part) }), part)
  }
  assert.equal(packageLeadCollisionRadiusMm(getPartForType('GENERIC_DIODE')!.package), .3)
  assert.equal(packageLeadCollisionRadiusMm(getPartForType('GENERIC_LED')!.package), Math.hypot(.5, .5)/2)
  assert.equal(packageLeadCollisionRadiusMm(getPartForType('GENERIC_BJT')!.package), Math.hypot(.44, .42)/2)
  assert.equal(packageLeadCollisionRadiusMm(getPartForType('SN74HC08N')!.package), Math.hypot(1.4, .28)/2)
  const old = getPartDefinition('GENERIC-RESISTOR-AXIAL', 2)!
  assert.deepEqual(old.package.bodyMm, { x: 5, y: 2, z: 2 })
  assert.equal(old.package.shape, undefined)
  const observed = getPartDefinition('GENERIC-RESISTOR-AXIAL', 3)!
  assert.equal(observed.package.id, 'GENERIC-AXIAL-R36-762')
  assert.deepEqual(observed.package.bodyMm, { x:3.6, y:1.6, z:1.6 })
  assert.equal(observed.package.shape?.version, 1)
  assert.equal(getPartForModule({ type:'GENERIC_RESISTOR', physicalDescriptor:physicalDescriptorForPart(observed) }), observed)
  const longerObserved = getPartDefinition('GENERIC-RESISTOR-AXIAL', 4)!
  assert.equal(longerObserved.package.id, 'GENERIC-AXIAL-R39-762')
  assert.deepEqual(longerObserved.package.bodyMm, { x:3.9, y:1.75, z:1.75 })
  assert.equal(getPartForModule({ type:'GENERIC_RESISTOR', physicalDescriptor:physicalDescriptorForPart(longerObserved) }), longerObserved)
  const latestObserved = getPartDefinition('GENERIC-RESISTOR-AXIAL', 5)!
  assert.equal(latestObserved.package.id, 'GENERIC-AXIAL-R43-762')
  assert.deepEqual(latestObserved.package.bodyMm, { x:4.3, y:1.75, z:1.75 })
  assert.equal(getPartForModule({ type:'GENERIC_RESISTOR', physicalDescriptor:physicalDescriptorForPart(latestObserved) }), latestObserved)
  assert.equal(getPartForModule({ type: 'GENERIC_RESISTOR' })!.revision, 1)
  assert.equal(getPartForType('DIODE_1N4148')!.package.id, 'DO35-1016-BBI3')
  assert.equal(getPartForType('DIODE_1N4148', { partId: 'VISHAY-1N4148', partRevision: 1, packageId: 'DO35-1016', packageRevision: 1 })?.package.id, 'DO35-1016')
  const dipOld = getPartForType('SN74HC08N', { partId:'TI-SN74HC08N', partRevision:1, packageId:'PDIP-14-300', packageRevision:1 })!
  assert.deepEqual(dipOld.package.bodyMm, { x:19.3, y:5.08, z:6.4 })
  assert.deepEqual(getPartForType('SN74HC08N')!.package.pins, dipOld.package.pins)
})

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

test('historical toggle retains its contact model while new authoring selects the SS12D10', () => {
  const toggle = getPartForType('TOGGLE_SWITCH_200MSP1')
  assert.ok(toggle, 'the SPDT toggle has a separately selectable package')
  assert.deepEqual(toggle.package.pins.map(pin => [pin.id, pin.name, pin.role]), [['1', '1', 'passive'], ['2', 'COM', 'passive'], ['3', '3', 'passive']])
  assert.deepEqual(toggle.internalConnections, [{ pins: ['2', '3'], when: { property: 'state', equals: false } }, { pins: ['2', '1'], when: { property: 'state', equals: true } }])
  const inputs = ribbonGroups.find(group => group.id === 'input')!.items
  assert.ok(inputs.some(item => item.type === 'SLIDE_SWITCH_SS12D10'))
  assert.ok(!inputs.some(item => item.type === 'TOGGLE_SWITCH_200MSP1'))
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
  assert.equal(items.filter(item => item.type === 'GENERIC_CAPACITOR').length, 1)
  assert.equal(items.filter(item => item.type === 'GENERIC_CAPACITOR_ELECTROLYTIC').length, 1)
  for (const type of ['LED_LTL307EE', 'RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC', 'DIODE_1N4148', 'ZENER_1N4733A', 'BUZZER_PS1240', 'TRANSISTOR_2N3904']) assert.ok(getDefinition(type), `${type} legacy files retain their original definition`)
})
