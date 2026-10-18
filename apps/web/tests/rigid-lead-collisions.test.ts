import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPartForType, historicalPartCatalog, MM_TO_WORLD, physicalDescriptorForPart, type PinnedPartDescriptor } from '../src/data/partCatalog'
import { solveMounting, validateMountBindings } from '../src/electrical/mounting'
import { solveFlexibleMount } from '../src/electrical/flexibleGeometry'
import { fixedPackageLeadPath, packageFeedthroughPoints, rigidPackageLeadSegments, rigidPackageLeadStations } from '../src/electrical/rigidPackageLeads'
import type { CircuitGraph, CircuitModule } from '../src/types/circuit'
import rigidParity from '../../../contracts/design-models/fixtures/rigid-leads-parity.json'

type SegmentFixture = { start: number[]; end: number[]; radiusMm: number }
const parity = rigidParity as unknown as {
  geometry: { type: string; descriptor: PinnedPartDescriptor; pins: { pinId: string; stations: { position: number[]; tangent: number[]; widthMm: number; thicknessMm: number }[]; segments: SegmentFixture[] }[] }[]
  fixedGeometry: { type: string; descriptor: PinnedPartDescriptor; pins: { pinId: string; pointsMm: number[][]; samplesMm: number[][]; lengthMm: number; bendRadiiMm: number[]; sampleErrorMm: number; segments: SegmentFixture[] }[] }[]
  cases: { id: string; valid: boolean; graph: CircuitGraph }[]
}

const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }
function mounted(type: string): CircuitModule {
  const candidate = solveMounting(type, { x: 0, y: 0, z: 0 }, 0, [board], 'RIGID')
  assert.ok(candidate?.valid, candidate?.reason)
  return { id: 'RIGID', type, mount: candidate.mount }
}
const graph = (modules: CircuitModule[]): CircuitGraph => ({ schema_version: '1.2', circuit_id: 'rigid-lead-collision', modules, connections: [] })

test('physical validation rejects the reproduced free resistor body intersecting a shaped DIP shoulder', () => {
  const dip = mounted('SN74HC08N'), resistor: CircuitModule = { id: 'R', type: 'GENERIC_RESISTOR', physicalDescriptor: physicalDescriptorForPart(getPartForType('GENERIC_RESISTOR')!), position: { x: -.39, y: .3490748031496063, z: .2200787401574803 } }
  assert.throws(() => validateMountBindings(graph([board, dip, resistor])), /lead/i)
  const historical = historicalPartCatalog.filter(part => part.editorType === dip.type).sort((a, b) => a.revision - b.revision)[0]!
  const old = solveMounting(dip.type, { x: 0, y: 0, z: 0 }, 0, [board], 'RIGID', physicalDescriptorForPart(historical))!
  assert.doesNotThrow(() => validateMountBindings(graph([board, { ...dip, mount: old.mount }, resistor])), 'unshaped historical rigid packages retain their accepted geometry rules')
})

test('flexible placement considers the actual rigid DIP shoulder as a body obstacle', () => {
  const baseline = solveFlexibleMount('GENERIC_RESISTOR', board.id, 'terminal:C:10', 'terminal:C:13', [board])
  assert.ok(baseline.valid, baseline.reason)
  const center = baseline.geometry!.position, dip: CircuitModule = {
    id: 'DIP', type: 'SN74HC08N', physicalDescriptor: physicalDescriptorForPart(getPartForType('SN74HC08N')!),
    position: { x: center.x + .39, y: center.y - .1219645669291339, z: center.z - .2200787401574803 },
  }
  const obstructed = solveFlexibleMount('GENERIC_RESISTOR', board.id, 'terminal:C:10', 'terminal:C:13', [board, dip])
  assert.equal(obstructed.valid, false, 'the body may clear the DIP body while intersecting its stamped metal')
  assert.match(obstructed.reason, /lead|intersect|overlap/i)
})

test('physical validation rejects rectangular TO-92 tail overlaps while their molded bodies stay separate', () => {
  const first = mounted('GENERIC_BJT'); assert.equal(first.mount?.kind, 'breadboard')
  if (first.mount?.kind !== 'breadboard') throw Error('Expected a rigid canonical mount.')
  const second: CircuitModule = {
    id: 'OTHER', type: 'GENERIC_BJT', physicalDescriptor: physicalDescriptorForPart(getPartForType('GENERIC_BJT')!),
    position: { x: first.mount.pose.position.x + 4.8 * MM_TO_WORLD, y: first.mount.pose.position.y, z: first.mount.pose.position.z },
  }
  assert.throws(() => validateMountBindings(graph([board, first, second])), /lead/i)
})

test('direct feedthrough builders reject nonfinite coordinates, normals, embed and malformed lead sections', () => {
  const cases = [
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.leadExits[0]!.positionMm.x = NaN },
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.leadExits[0]!.normal.x = NaN },
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.embeddedDepthMm = Infinity },
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.leadSection.widthMm = 0 },
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.leadSection.thicknessMm = NaN },
    (part: ReturnType<typeof getPartForType>) => { part!.package.shape!.leadSection.shoulderWidthMm = -1 },
    (part: ReturnType<typeof getPartForType>) => { part!.package.bodyMm.y = Infinity },
    (part: ReturnType<typeof getPartForType>) => { part!.package.standoffMm = NaN },
  ]
  for (const mutate of cases) {
    const part = structuredClone(getPartForType('SN74HC08N')!); mutate(part)
    assert.throws(() => packageFeedthroughPoints(part, part.package.pins[0]!.id), /finite|positive|invalid/i)
  }
  const part = structuredClone(getPartForType('GENERIC_BJT')!); part.package.pins[0]!.positionMm.x = NaN
  assert.throws(() => rigidPackageLeadStations(part, part.package.pins[0]!), /finite|invalid/i)
})

test('new free fixed round and square package leads are obstacles outside their distinct bodies', () => {
  const free = (id: string, type: string, x: number): CircuitModule => ({ id, type, physicalDescriptor: physicalDescriptorForPart(getPartForType(type)!), position: { x: x * MM_TO_WORLD, y: 0, z: 0 } })
  assert.throws(() => validateMountBindings(graph([board, free('R1', 'GENERIC_RESISTOR', 0), free('R2', 'GENERIC_RESISTOR', 7.62)])), /lead/i, 'axial lead tips coincide while compact resistor bodies stay over 4 mm apart')
  assert.throws(() => validateMountBindings(graph([board, free('LED', 'GENERIC_LED', 0), free('R', 'GENERIC_RESISTOR', 5.08)])), /lead/i, 'round and square contact tails coincide beyond both separate bodies')
})

test('Python and TypeScript share exact external molded stations, variable sections and conservative segment envelopes', () => {
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`)
  for (const entry of parity.geometry) {
    const part = getPartForType(entry.type, entry.descriptor)!
    for (const fixture of entry.pins) {
      const lead = rigidPackageLeadStations(part, part.package.pins.find(pin => pin.id === fixture.pinId)!)
      assert.equal(lead.stations.length, fixture.stations.length)
      lead.stations.forEach((station, i) => {
        const expected = fixture.stations[i]!
        for (const [axis, j] of [['x', 0], ['y', 1], ['z', 2]] as const) {
          near(station.point[axis] / MM_TO_WORLD, expected.position[j]!)
          near(station.tangent[axis] / Math.hypot(station.tangent.x, station.tangent.y, station.tangent.z), expected.tangent[j]! / Math.hypot(...expected.tangent))
        }
        near(station.width / MM_TO_WORLD, expected.widthMm); near(lead.thickness / MM_TO_WORLD, expected.thicknessMm)
      })
    }
    const actual = rigidPackageLeadSegments(part), expected = entry.pins.flatMap(pin => pin.segments)
    assert.equal(actual.length, expected.length)
    actual.forEach((segment, i) => { for (const [axis, j] of [['x', 0], ['y', 1], ['z', 2]] as const) { near(segment.start[axis] / MM_TO_WORLD, expected[i]!.start[j]!); near(segment.end[axis] / MM_TO_WORLD, expected[i]!.end[j]!) } near(segment.radius / MM_TO_WORLD, expected[i]!.radiusMm) })
  }
})

test('all fixed two-pin families share Python line/arc samples, sampling error and real section radii', () => {
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`)
  for (const entry of parity.fixedGeometry) {
    const part = getPartForType(entry.type, entry.descriptor)!
    for (const fixture of entry.pins) {
      const { path } = fixedPackageLeadPath(part, fixture.pinId)
      for (const [actual, expected] of [[path.points, fixture.pointsMm], [path.samples, fixture.samplesMm]] as const) {
        assert.equal(actual.length, expected.length)
        actual.forEach((point, i) => { for (const [axis, j] of [['x', 0], ['y', 1], ['z', 2]] as const) near(point[axis] / MM_TO_WORLD, expected[i]![j]!) })
      }
      near(path.length / MM_TO_WORLD, fixture.lengthMm); near(path.sampleError / MM_TO_WORLD, fixture.sampleErrorMm)
      assert.equal(path.bendRadii.length, fixture.bendRadiiMm.length); path.bendRadii.forEach((radius, i) => near(radius / MM_TO_WORLD, fixture.bendRadiiMm[i]!))
    }
    const actual = rigidPackageLeadSegments(part), expected = entry.pins.flatMap(pin => pin.segments)
    assert.equal(actual.length, expected.length)
    actual.forEach((segment, i) => { for (const [axis, j] of [['x', 0], ['y', 1], ['z', 2]] as const) { near(segment.start[axis] / MM_TO_WORLD, expected[i]!.start[j]!); near(segment.end[axis] / MM_TO_WORLD, expected[i]!.end[j]!) } near(segment.radius / MM_TO_WORLD, expected[i]!.radiusMm) })
  }
})

test('Python and TypeScript agree on shaped rigid body, mixed lead and legacy acceptance scenes', () => {
  for (const entry of parity.cases) {
    if (entry.valid) assert.doesNotThrow(() => validateMountBindings(entry.graph), entry.id)
    else assert.throws(() => validateMountBindings(entry.graph), /lead|overlap|intersect/i, entry.id)
  }
})
