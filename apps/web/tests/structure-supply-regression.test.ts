import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, Vector3 } from 'three'
import { nextTick } from 'vue'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { getDefinition } from '../src/data/editorCatalog'
import { getPartForType } from '../src/data/partCatalog'
import { wireHarness } from './helpers/wireHarness'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { supplyControlValue } from '../src/three/PowerSupplyModel'

test('DC source dispatch restores the detailed Structure assembly without changing its electrical identity', () => {
  const module = { id: 'PS', type: 'DC_SUPPLY', properties: { voltage: 5, power_on: true } }
  const before = JSON.stringify(module), model = buildComponent(module)
  try {
    for (const name of ['supply-enclosure', 'supply-display', 'supply-knob-0', 'supply-knob-1', 'power-switch', 'supply-brand-icon']) assert.ok(model.getObjectByName(name), name)
    assert.equal(model.userData.type, 'DC_SUPPLY')
    assert.deepEqual(getDefinition('DC_SUPPLY')!.ports.map(port => port.id), ['PLUS', 'MINUS'])
    assert.deepEqual(getPartForType('DC_SUPPLY')!.package.pins.map(pin => [pin.id, pin.positionMm]), [
      ['PLUS', { x: -10, y: 20, z: 25 }], ['MINUS', { x: 10, y: 20, z: 25 }],
    ])
    assert.equal(JSON.stringify(module), before)
    const screen = model.getObjectByName('supply-display')!
    assert.deepEqual(screen.userData.settings, [true, 5, null], 'only the canonical voltage is a setpoint; current/power are unavailable')
    assert.notEqual(model.getObjectByName('supply-knob-1')!.userData.kind, 'control', 'an electrical source has no invented current-limit control')
  } finally { disposeObject(model) }
})

test('DC source binding post openings and picking share the detailed supply anchors after rotation without changing pins', async () => {
  const h = wireHarness()
  try {
    const id = h.circuit.placeModule('DC_SUPPLY', { x: 2, y: .3, z: -1 })
    h.circuit.rotateModule(id, 35); await nextTick()
    const model = h.manager.models.get(id)!
    const original = JSON.stringify(h.circuit.graph)
    for (const [pin, x] of [['PLUS', -.048], ['MINUS', .744]] as const) {
      const anchor = new Vector3(x, .392, 1.867)
      const endpoint = h.manager.endpointPosition(`${id}.${pin}`)!
      assert.ok(endpoint.distanceTo(model.localToWorld(anchor.clone())) < 1e-10)
      const opening = model.getObjectByName(`supply-socket-opening-${pin}`)
      assert.ok(opening, `visible ${pin} binding post opening`)
      assert.ok(opening.getWorldPosition(new Vector3()).distanceTo(endpoint) < 1e-10)
      // The top camera is above the posts: a perspective ray through the solid
      // case from its rear must stay occluded, just like the original instrument.
      for (const view of [new Vector3(0, 12, 2), new Vector3(0, .8, 8), new Vector3(5, 7, 9)]) {
        h.manager.camera.position.copy(model.localToWorld(view.clone()))
        h.manager.camera.lookAt(model.localToWorld(new Vector3(0, .6, 0))); h.manager.camera.updateMatrixWorld()
        const p = h.manager.project(endpoint)
        assert.equal(h.manager.pickEndpoint(p.x, p.y)?.endpoint, `${id}.${pin}`, `visible post is reachable from ${view.toArray()}`)
      }
    }
    assert.equal(JSON.stringify(h.circuit.graph), original, 'rendering/picking never changes the graph')
  } finally { h.dispose() }
})

test('DC display reads canonical voltage before its old control alias and preserves legacy visual-only supply values', () => {
  assert.equal(supplyControlValue({ voltage: 3.3, voltage_v: 9 }, 'voltage_v', 'DC_SUPPLY'), 3.3)
  assert.equal(supplyControlValue({ voltage_v: 9 }, 'voltage_v', 'DC_SUPPLY'), 9)
  assert.equal(supplyControlValue({ voltage: NaN, voltage_v: 9 }, 'voltage_v', 'DC_SUPPLY'), 0)
  assert.equal(supplyControlValue({ voltage: 3.3, voltage_v: 9 }, 'voltage_v', 'POWER_SUPPLY'), 9)
})

test('DC voltage knob edits canonical voltage with live preview, one undo and intact saved source wires', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('select')
    const id = h.circuit.placeModule('DC_SUPPLY', { x: 0, y: 0, z: 0 })
    const board = h.circuit.placeModule('BREADBOARD_100', { x: -6, y: 0, z: 0 })
    h.circuit.connectPorts(`${id}.PLUS`, `${board}.contact:rail:positive:01`)
    await nextTick(); h.circuit.past = []
    const model = h.manager.models.get(id)!, screen = model.getObjectByName('supply-display')!
    const knob = model.getObjectByName('supply-knob-0')!
    h.manager.camera.position.copy(model.localToWorld(new Vector3(0, 1.5, 9)))
    h.manager.camera.lookAt(model.localToWorld(new Vector3(0, 1.5, 0))); h.manager.camera.updateMatrixWorld()
    const p = h.manager.project(knob.getWorldPosition(new Vector3()).add(new Vector3(0, 0, .11)))
    assert.equal(h.manager.pick(p.x, p.y)?.kind, 'control')
    h.editor.pointerDown(h.pointer(p.x, p.y)); h.editor.pointerMove(h.pointer(p.x, p.y - 20))
    assert.deepEqual(screen.userData.settings, [true, 6, null])
    assert.equal(h.circuit.graph!.modules.find(m => m.id === id)!.properties!.voltage, 5)
    h.editor.pointerUp(h.pointer(p.x, p.y - 20)); await nextTick()
    assert.equal(h.circuit.graph!.modules.find(m => m.id === id)!.properties!.voltage, 6)
    assert.equal(h.circuit.graph!.modules.find(m => m.id === id)!.properties!.voltage_v, undefined)
    assert.equal(h.circuit.past.length, 1)
    assert.ok(h.manager.models.get(id) === model)
    assert.ok(model.getObjectByName('supply-display') === screen)
    h.circuit.undo(); await nextTick(); assert.deepEqual(screen.userData.settings, [true, 5, null])
    h.circuit.redo(); await nextTick(); assert.deepEqual(screen.userData.settings, [true, 6, null])
    const reopened = parseCircuitFile(h.circuit.exportGraph())
    assert.equal(reopened.modules.find(m => m.id === id)!.type, 'DC_SUPPLY')
    assert.equal(reopened.modules.find(m => m.id === id)!.properties!.voltage, 6)
    assert.deepEqual(reopened.connections, h.circuit.graph!.connections)
    assert.ok(h.manager.wires.children.some(object => object instanceof Mesh))
  } finally { h.dispose() }
})
