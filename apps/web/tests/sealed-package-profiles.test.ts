import { test } from 'node:test'
import assert from 'node:assert/strict'
import corpus from '../../../contracts/design-models/fixtures/sealed-package-parity.json'
import type { CircuitGraph } from '../src/types/circuit'
import { validateMountBindings } from '../src/electrical/mounting'
import { getPartForType, MM_TO_WORLD, packageLeadCollisionRadiusMm } from '../src/data/partCatalog'
import { getMechanicalProfile, resolveFlexibleGeometry, solveFlexibleMount, flexibleLeadsHitBody, rotationMatrix, transformPoint, addPoint } from '../src/electrical/flexibleGeometry'
import { parseStructural } from '../src/contracts/structural'
import { boardContactMechanics } from '../src/geometry/BreadboardMechanicalProfile'

test('all shaped package profiles resolve through the generated contract and shared mm parity corpus', () => {
  assert.equal(corpus.cases.length, 24)
  for (const item of corpus.cases) {
    const graph = item.graph as CircuitGraph, [board, module] = graph.modules, part = getPartForType(module!.type, module!.mount)!
    parseStructural('PackageShapeV1', part.package.shape)
    validateMountBindings(graph)
    const result = resolveFlexibleGeometry(module!, part, board!)
    for (const [i, expected] of item.expectedGeometry.entries()) {
      const lead = result.leads[i]!
      assert.ok(Math.abs(lead.path.length/MM_TO_WORLD-expected.lengthMm) < 1e-10, item.id)
      assert.deepEqual(lead.points, expected.points, item.id)
    }
    const profile = getMechanicalProfile(module!.type, module!.mount)!
    if (part.package.shape!.leadSection.kind === 'round' && part.package.leadDiameterMm === .6) assert.ok(profile.minBendRadiusMm >= .4)
    const invalid = structuredClone(graph)
    if (invalid.modules[1]!.mount?.kind !== 'breadboard-flexible') throw Error('Fixture requires a flexible mount')
    invalid.modules[1]!.mount.bodyPose.position.y -= 1
    assert.throws(() => validateMountBindings(invalid))
  }
})

test('current generic package remains fixed while automatic axial poses and radial standoff follow declared dimensions', () => {
  const board = { id:'BB', type:'BREADBOARD' }
  for (const end of [11, 12, 13, 14]) {
    const result = solveFlexibleMount('GENERIC_RESISTOR', board.id, 'terminal:C:10', `terminal:C:${end}`, [board])
    assert.equal(result.valid, true, result.reason)
    assert.equal(result.mount!.packageId, getPartForType('GENERIC_RESISTOR')!.package.id)
    if (result.mount!.version !== 2) throw Error('New authoring requires automatic V2 routing')
    assert.equal(result.mount!.routing.template, end < 13 ? 'axial-standing' : 'axial-horizontal')
  }
  for (const type of ['GENERIC_CAPACITOR', 'GENERIC_CAPACITOR_ELECTROLYTIC', 'GENERIC_LED']) {
    const part = getPartForType(type)!, result = solveFlexibleMount(type, board.id, 'terminal:C:10', 'terminal:C:11', [board])
    assert.equal(result.valid, true, result.reason)
    const geometry = result.geometry!, lead = geometry.leads[0]!, contact = lead.contact
    assert.ok(Math.abs((geometry.position.y-contact.y)/MM_TO_WORLD-part.package.bodyMm.y/2-part.package.standoffMm) < 1e-10)
    assert.deepEqual(lead.points.at(-1), boardContactMechanics(board.type, result.mount!.contacts[0]!.contactId).tip)
  }
})

test('square lead obstacle collision includes the diagonal envelope beyond half wire diameter', () => {
  const graph = structuredClone(corpus.cases.find(item => item.id === 'sealed-generic_led-11')!.graph) as CircuitGraph
  const [board, module] = graph.modules, part = getPartForType(module!.type, module!.mount)!, geometry = resolveFlexibleGeometry(module!, part, board!)
  const yaw = rotationMatrix({ x:0, y:board!.rotation??0, z:0 }), local = geometry.leads[0]!.points.at(-2)!
  const position = {x:board!.position?.x??0,y:board!.position?.y??0,z:board!.position?.z??0}
  const center = addPoint(position, transformPoint(yaw, local)), width = .1*MM_TO_WORLD
  // Center the tiny obstacle along the radial direction beyond the old round
  // radius but within the square corner's conservative capsule.
  const shift = transformPoint(yaw, { x:0, y:0, z:(.1+.31)*MM_TO_WORLD })
  const obstacle = { center:addPoint(center, shift), axes:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}], half:{x:width,y:width,z:width} }
  assert.ok(packageLeadCollisionRadiusMm(part.package) > part.package.leadDiameterMm/2)
  assert.equal(flexibleLeadsHitBody(module!, graph.modules, obstacle), true)
})
