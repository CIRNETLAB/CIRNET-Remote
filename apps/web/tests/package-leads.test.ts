import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three'
import { buildComponent, disposeObject, portAnchor } from '../src/three/ComponentModel'
import { updatePackageAppearance } from '../src/three/PackageModel'
import { getPartForType, historicalPartCatalog, physicalDescriptorForPart } from '../src/data/partCatalog'
import { defaultLeadProperties, isLeadEditableType, normalizeLeadProperties, parseLeadQuantity, readLeadProperties, validateLeadProperties } from '../src/data/leadProperties'
import { createFormedLeadGeometry } from '../src/three/package/LeadGeometry'
import { createSceneManager } from '../src/three/SceneManager'
import { solveMounting, validateMountBindings } from '../src/electrical/mounting'
import { resolveElectricalNets } from '../src/electrical/nets'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import type { CircuitGraph, CircuitModule } from '../src/contracts/generated/dto'

test('lead settings have bounded millimetre input, preserve omitted old properties and reject malformed forms', () => {
  assert.deepEqual(readLeadProperties(undefined), defaultLeadProperties)
  assert.deepEqual(normalizeLeadProperties('RESISTOR_AXIAL', { resistanceOhms: 470 }), { resistanceOhms: 470 })
  assert.equal(parseLeadQuantity('2.5 mm', 'bodyLiftMm'), 2.5)
  for (const value of ['', NaN, Infinity, '-1 mm', '7 mm', {}, undefined]) assert.throws(() => parseLeadQuantity(value, 'bodyLiftMm'))
  for (const value of ['', NaN, Infinity, '-1 mm', '4.01 mm']) assert.throws(() => parseLeadQuantity(value, 'leadLengthMm'))
  for (const leadForm of [['straight'], {}, null, 1, 'unknown']) assert.ok(validateLeadProperties('RESISTOR_AXIAL', { leadForm }).length > 0)
  assert.ok(validateLeadProperties('CAPACITOR_CERAMIC', { leadForm: 'straight', leadLengthMm: 1 }).length > 0)
  assert.ok(validateLeadProperties('CAPACITOR_CERAMIC', { bodyLiftMm: '3' }).length > 0)
  assert.equal(isLeadEditableType('LED_LTL307EE'), false)
  assert.deepEqual(validateLeadProperties('LED_LTL307EE', { bodyLiftMm: 'legacy-opaque' }), [])
})

test('editable resistor lead form changes the wire path without moving its electrical tips', () => {
  const standard = buildComponent({ id: 'R1', type: 'RESISTOR_AXIAL' })
  const straight = buildComponent({ id: 'R2', type: 'RESISTOR_AXIAL', properties: { leadForm: 'straight' } })
  try {
    const standardLead = standard.getObjectByName('lead-metal') as Mesh
    const straightLead = straight.getObjectByName('lead-metal') as Mesh
    assert.notDeepEqual(Array.from(straightLead.geometry.getAttribute('position').array), Array.from(standardLead.geometry.getAttribute('position').array))
    for (const id of ['A', 'B']) {
      const actual = straight.getObjectByName(`package-pin-target-${id}`)!
      const original = standard.getObjectByName(`package-pin-target-${id}`)!
      assert.deepEqual(actual.position.toArray(), original.position.toArray())
      assert.ok(new Box3().setFromObject(straight.getObjectByName(`package-lead-${id}`)!).min.y >= -1e-8)
    }
  } finally { disposeObject(standard); disposeObject(straight) }
})

test('all supported lead forms stay above the insertion plane and keep endpoints at every allowed boundary', () => {
  for (const type of ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC']) {
    for (const leadForm of ['straight', 'formed90', 'offset-s']) for (const bodyLiftMm of [0, 6]) for (const leadLengthMm of leadForm === 'straight' ? [0] : [0, 4]) {
      const model = buildComponent({ id: 'P1', type, properties: { leadForm, bodyLiftMm, leadLengthMm } })
      try {
        const part = getPartForType(type)!
        for (const pin of part.package.pins) {
          const lead = model.getObjectByName(`package-lead-${pin.id}`)!
          const surface = lead.getObjectByName('lead-metal') as Mesh<TubeGeometry>
          const path = surface.geometry.parameters.path
          const expected = portAnchor(type, { id: pin.id, direction: 'input' })
          assert.ok(path.getPoint(0).distanceTo(expected) < 1e-10, `${type} ${leadForm}: fixed electrical contact`)
          assert.ok(new Box3().setFromObject(lead).min.y >= -1e-8, `${type} ${leadForm}: no radius below the insertion plane`)
          const positions = surface.geometry.getAttribute('position')
          for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate))
          assert.ok(lead.userData.endpoint === `P1.${pin.id}`, 'picking identity stays on the same lead group')
          const bodyEnvelope = new Box3().setFromObject(model.getObjectByName('package-body')!)
          let entered = false
          for (let step = 0; step <= 100; step++) {
            const inside = bodyEnvelope.containsPoint(path.getPointAt(step / 100))
            if (inside) entered = true
            else assert.ok(!entered, `${type} ${leadForm}: the path enters the body once at its concealed join, never crosses through it`)
          }
        }
      } finally { disposeObject(model) }
    }
  }
})

test('omitted settings retain the original swept lead geometry and Reset restores baseline transforms', () => {
  const module = { id: 'R1', type: 'RESISTOR_AXIAL' }
  const model = buildComponent(module)
  try {
    const body = model.getObjectByName('package-body') as Mesh
    const initialY = body.position.y, lead = model.getObjectByName('lead-metal') as Mesh
    const baseline = (lead.userData.leadBaseline as [number, number, number][]).map(point => new Vector3(...point))
    const expected = createFormedLeadGeometry(baseline, getPartForType(module.type)!.package.leadDiameterMm * .13 / 2.54)
    try { assert.deepEqual(Array.from(lead.geometry.getAttribute('position').array), Array.from(expected.getAttribute('position').array)) } finally { expected.dispose() }
    updatePackageAppearance(model, { ...module, properties: { leadForm: 'offset-s', bodyLiftMm: 6, leadLengthMm: 4 } }, getPartForType(module.type)!)
    updatePackageAppearance(model, { ...module, properties: { ...defaultLeadProperties } }, getPartForType(module.type)!)
    assert.equal(body.position.y, initialY)
    const reset = createFormedLeadGeometry(baseline, getPartForType(module.type)!.package.leadDiameterMm * .13 / 2.54)
    try { assert.deepEqual(Array.from(lead.geometry.getAttribute('position').array), Array.from(reset.getAttribute('position').array)) } finally { reset.dispose() }
  } finally { disposeObject(model) }
})

test('lead replacement disposes each previous geometry once and final teardown releases the replacement', () => {
  const module = { id: 'R1', type: 'RESISTOR_AXIAL' }, model = buildComponent(module)
  const surface = model.getObjectByName('lead-metal') as Mesh
  let oldDisposed = 0, currentDisposed = 0, bodyDisposed = 0
  surface.geometry.addEventListener('dispose', () => oldDisposed++)
  ;(model.getObjectByName('package-body') as Mesh).geometry.addEventListener('dispose', () => bodyDisposed++)
  updatePackageAppearance(model, { ...module, properties: { leadForm: 'offset-s', bodyLiftMm: 1 } }, getPartForType(module.type)!)
  surface.geometry.addEventListener('dispose', () => currentDisposed++)
  assert.equal(oldDisposed, 1); assert.equal(currentDisposed, 0); assert.equal(bodyDisposed, 0)
  disposeObject(model)
  assert.equal(oldDisposed, 1); assert.equal(currentDisposed, 1); assert.equal(bodyDisposed, 1)
})

test('a mounted lead edit preserves contacts, electrical nets, picking objects and wire endpoint projections', () => {
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD_630', position: { x: 2, y: .2, z: 3 }, rotation: 37 }
  const target = moduleLocalToWorld({ x: 0, y: .309, z: -.715 }, board)
  const legacy=historicalPartCatalog.filter(part=>part.editorType==='RESISTOR_AXIAL').sort((a,b)=>a.revision-b.revision)[0]!
  const solution = solveMounting('RESISTOR_AXIAL', target, 37, [board],'R1',physicalDescriptorForPart(legacy))!
  assert.equal(solution.valid, true, solution.reason)
  const resistor: CircuitModule = { id: 'R1', type: 'RESISTOR_AXIAL', mount: solution.mount }
  const graph: CircuitGraph = { schema_version: '1.1', circuit_id: 'lead-edit', modules: [board, resistor], connections: [] }
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.syncGraph(graph)
    const model = manager.models.get('R1')!
    const contact = model.getObjectByName('package-pin-target-A')!, body = model.getObjectByName('package-body')!
    const initialTop = model.userData.visualBounds[1][1] as number
    manager.highlight('R1')
    const outline = model.children.find(child => child.userData.isOutline)!
    const mount = JSON.stringify(resistor.mount), nets = resolveElectricalNets(graph).endpointNetIds
    const endpoint = manager.wireContext.endpoint('R1.A')!
    const before = JSON.stringify(endpoint)
    resistor.properties = { leadForm: 'offset-s', leadLengthMm: 4, bodyLiftMm: 6 }
    manager.syncGraph(graph)
    validateMountBindings(graph)
    assert.ok(manager.models.get('R1') === model)
    assert.ok(model.getObjectByName('package-pin-target-A') === contact)
    assert.ok(model.getObjectByName('package-body') === body)
    assert.equal(JSON.stringify(resistor.mount), mount)
    assert.deepEqual(resolveElectricalNets(graph).endpointNetIds, nets)
    assert.equal(JSON.stringify(manager.wireContext.endpoint('R1.A')), before)
    assert.ok(model.userData.visualBounds[1][1] > initialTop + .25, 'gizmo bounds follow the raised body in its local frame')
    assert.ok(model.children.find(child => child.userData.isOutline) !== outline, 'selected contour follows the changed lead geometry and raised body')
    assert.equal(resistor.position, undefined)
  } finally { manager.dispose() }
})

test('editing only lead shape disposes only old lead geometry and preserves body, targets and peer component', () => {
  const module = { id: 'C1', type: 'CAPACITOR_ELECTROLYTIC' }
  const model = buildComponent(module), peer = buildComponent({ id: 'C2', type: module.type })
  try {
    const body = model.getObjectByName('package-body') as Mesh
    const target = model.getObjectByName('package-pin-target-PLUS')!
    const lead = model.getObjectByName('lead-metal') as Mesh
    const peerLead = peer.getObjectByName('lead-metal') as Mesh
    const originalGeometry = lead.geometry, originalPeerGeometry = peerLead.geometry
    let disposed = 0
    originalGeometry.addEventListener('dispose', () => { disposed++ })
    updatePackageAppearance(model, { ...module, properties: { leadForm: 'offset-s', bodyLiftMm: 3, leadLengthMm: 2 } }, getPartForType(module.type)!)
    assert.ok(lead.geometry !== originalGeometry)
    assert.equal(disposed, 1)
    assert.ok(model.getObjectByName('package-body') === body)
    assert.ok(model.getObjectByName('package-pin-target-PLUS') === target)
    assert.ok(peerLead.geometry === originalPeerGeometry)
    assert.ok(body.position.y > (peer.getObjectByName('package-body') as Mesh).position.y)
    assert.equal((lead.material as MeshStandardMaterial).metalness > .7, true)
    const afterLeadGeometry = lead.geometry
    updatePackageAppearance(model, { ...module, properties: { leadForm: 'offset-s', bodyLiftMm: 3, leadLengthMm: 2, capacitanceFarads: 22e-6 } }, getPartForType(module.type)!)
    assert.ok(lead.geometry === afterLeadGeometry, 'an electrical value update does not allocate a lead')
    assert.ok(target.position.clone().sub(portAnchor(module.type, { id: 'PLUS', direction: 'input' })).length() < .05)
  } finally { disposeObject(model); disposeObject(peer) }
})
