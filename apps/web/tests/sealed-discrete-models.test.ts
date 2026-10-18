import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Raycaster, SRGBColorSpace, Vector3 } from 'three'
import { getPartForType, MM_TO_WORLD as mm, type PartDefinition } from '../src/data/partCatalog'
import { addPackageModel, applyPackageSimulation, updatePackageAppearance } from '../src/three/PackageModel'
import { disposeObject } from '../src/three/ComponentModel'
import { countUnsealedEdges as boundaryEdges, solidContainsPoint } from './helpers/packageSolids'
import { sealedCeramicGeometry } from '../src/three/package/SealedPackageShapes'

function fixture(type: string, family: string, dims: [number, number, number], extra = {}): PartDefinition {
  const part = structuredClone(getPartForType(type)!)
  part.package.bodyMm = { x: dims[0], y: dims[1], z: dims[2] }
  ;(part.package as any).shape = { version: 1, family, embeddedDepthMm: .15, leadSection: { kind: 'round', widthMm: .6, thicknessMm: .6 }, ...part.package.shape, ...extra }
  return part
}
function model(part: PartDefinition, properties = {}) {
  const group = new Group()
  addPackageModel(group, { id: 'part', type: part.editorType, properties }, part)
  group.updateMatrixWorld(true)
  return group
}
function mesh(group: Group, name = 'package-body') { const result = group.getObjectByName(name); assert.ok(result instanceof Mesh); return result }
function surfaceZ(body: Mesh, x: number, y: number) {
  body.updateWorldMatrix(true, false)
  return new Raycaster(new Vector3(x * mm, y * mm, 10 * mm), new Vector3(0, 0, -1)).intersectObject(body)[0]?.point.z
}

test('new resistor, epoxy diode and glass envelopes close every welded edge at both axial ends', () => {
  for (const [type, family, dims] of [
    ['GENERIC_RESISTOR', 'resistor', [4.9, 1.75, 1.75]], ['GENERIC_DIODE', 'diode', [4.5, 2.3, 2.3]], ['GENERIC_ZENER_DIODE', 'zener', [3.5, 1.6, 1.6]],
  ] as const) {
    const group = model(fixture(type, family, [...dims]))
    try { assert.equal(boundaryEdges(mesh(group).geometry), 0, `${family} must have closed coating end faces`)
      const actual = new Box3().setFromObject(mesh(group)).getSize(new Vector3()).divideScalar(mm).toArray()
      for (const [axis, expected] of dims.entries()) assert.ok(Math.abs(actual[axis]! - expected) < 1e-4, `${family} rendered body axis${axis} must match the chosen mm preset`)
      assert.equal(group.children.some(child => /washer/.test(child.name)), false)
    } finally { disposeObject(group) }
  }
})

test('ceramic bottom feedthrough boots are part of the closed 5×5×2.2 solid and surround both wires', () => {
  const part = fixture('GENERIC_CAPACITOR', 'ceramic', [5, 5, 2.2], { leadExits: ['A', 'B'].map((pinId, i) => ({ pinId, positionMm: { x: (i ? 1 : -1) * 1.27, y: -2.5, z: 0 }, normal: { x: 0, y: -1, z: 0 } })) })
  const group = model(part)
  try {
    const body = mesh(group), bounds = new Box3().setFromObject(body).getSize(new Vector3()).divideScalar(mm)
    for (const [actual, expected] of [[bounds.x, 5], [bounds.y, 5], [bounds.z, 2.2]]) assert.ok(Math.abs(actual! - expected!) < 1e-4)
    assert.equal(boundaryEdges(body.geometry), 0)
    for (const x of [-1.27, 1.27]) {
      assert.ok((surfaceZ(body, x, part.package.standoffMm + .075) ?? -Infinity) > .3 * mm, 'real bottom boot surface must cover lead radius during embedded feedthrough')
      assert.ok((surfaceZ(body, x + .29, part.package.standoffMm + .075) ?? -Infinity) > .1 * mm, 'seal must wrap wire circumference')
    }
  } finally { disposeObject(group) }
})

test('ceramic lensed faces remain a single unfolded surface across both concave boot roots', () => {
  const geometry = sealedCeramicGeometry(5, 5, 2.2, 2.54)
  const body = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }))
  try {
    const positions = geometry.getAttribute('position'), indices = geometry.getIndex()!
    for (let i = 0; i < indices.count; i += 3) {
      const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
      if (!ids.every(id => positions.getZ(id) >= .55 - 1e-6)) continue
      const [a, b, c] = ids.map(id => new Vector3().fromBufferAttribute(positions, id))
      const projectedArea = (b!.x - a!.x) * (c!.y - a!.y) - (b!.y - a!.y) * (c!.x - a!.x)
      assert.ok(projectedArea > 1e-12, 'front coating must not fold or reverse over a boot root')
    }
    body.updateMatrixWorld(true)
    for (const side of [-1, 1]) for (const [x, y] of [[.48, -1.25], [.6, -1.6], [.75, -2], [1.27, -2.4]]) {
      const hits = new Raycaster(new Vector3(side * x!, y!, 10), new Vector3(0, 0, -1)).intersectObject(body)
      const crossings = hits.filter((hit, i) => !i || hit.point.distanceTo(hits[i - 1]!.point) > 1e-6)
      assert.equal(crossings.length, 2, 'a ray across the boot blend must enter and leave exactly one coating volume')
    }
  } finally { geometry.dispose(); (body.material as MeshBasicMaterial).dispose() }
})

test('LED has independent 5mm lens, 5.8mm flange and 8.7mm total sealed shell and connected internal frame', () => {
  const part = fixture('GENERIC_LED', 'led', [5.8, 8.7, 5.8], { lensDiameterMm: 5, flangeDiameterMm: 5.8, flangeHeightMm: 1, domeRadiusMm: 2.49, leadExits: ['A', 'K'].map((pinId, i) => ({ pinId, positionMm: { x: (i ? 1 : -1) * 1.27, y: -4.35, z: 0 }, normal: { x: 0, y: -1, z: 0 } })) })
  const group = model(part, { color: '#ff0000' })
  try {
    const body = mesh(group), material = body.material as MeshPhysicalMaterial
    assert.equal(boundaryEdges(body.geometry), 0)
    assert.equal(material.color.getHexString(), '781521')
    assert.ok(material.transmission >= .2 && material.transmission <= .35)
    const bounds = new Box3().setFromObject(body).getSize(new Vector3()).divideScalar(mm)
    assert.ok(Math.abs(bounds.x - 5.8) < 1e-4); assert.ok(Math.abs(bounds.y - 8.7) < 1e-4)
    const y = part.package.standoffMm + 2
    const radius = surfaceZ(body, 0, y)
    assert.ok(Math.abs(radius! / mm - 2.5) < .005)
    for (const name of ['package-led-anode-post', 'package-led-cathode-stem']) {
      const bounds = new Box3().setFromObject(mesh(group, name))
      assert.ok(bounds.min.y <= part.package.standoffMm * mm, 'internal posts meet feedthrough at bottom of shell')
    }
    applyPackageSimulation(group, { ledOn: true }); assert.equal(material.emissiveIntensity, .8)
    updatePackageAppearance(group, { id: 'part', type: 'GENERIC_LED', properties: { color: '#00ff00' } }, part)
    assert.equal(material.emissive.getHexString(), '00ff00'); assert.notEqual(material.color.getHexString(), '00ff00')
    applyPackageSimulation(group, null); assert.equal(material.emissiveIntensity, 0)
  } finally { disposeObject(group) }
})

test('electrolytic closed sleeve overlaps lid and bung and exposes vent above the recessed lid', () => {
  const part = fixture('GENERIC_CAPACITOR_ELECTROLYTIC', 'electrolytic', [6.3, 11, 6.3])
  const group = model(part, { capacitanceFarads: 47e-6, voltageRatingVolts: 25 })
  try {
    assert.equal(boundaryEdges(mesh(group).geometry), 0)
    const lid = new Box3().setFromObject(mesh(group, 'package-capacitor-lid'))
    const vent = new Box3().setFromObject(mesh(group, 'package-capacitor-vent-1'))
    assert.ok(vent.min.y >= lid.max.y - 1e-6, 'vent is on the visible upper lid surface')
    assert.equal(group.userData.appearance.label, '47 µF / 25 V')
    assert.equal((mesh(group).material as MeshPhysicalMaterial).color.getHexString(), new Color('#3B6EA5').getHexString())
  } finally { disposeObject(group) }
})

test('each discrete metal feedthrough intersects its declared real coating or bung solid throughout the bounded embed', () => {
  for (const type of ['GENERIC_RESISTOR', 'GENERIC_DIODE', 'GENERIC_ZENER_DIODE', 'GENERIC_CAPACITOR', 'GENERIC_CAPACITOR_ELECTROLYTIC', 'GENERIC_LED']) {
    const part = getPartForType(type)!, shape = part.package.shape!, group = model(part)
    try {
      const seal = mesh(group, shape.family === 'electrolytic' ? 'package-capacitor-bung' : 'package-body')
      for (const exit of shape.leadExits) {
        const normal = new Vector3(exit.normal.x, exit.normal.y, exit.normal.z)
        const point = new Vector3(exit.positionMm.x, exit.positionMm.y + part.package.standoffMm + part.package.bodyMm.y / 2, exit.positionMm.z).addScaledVector(normal, -.075).multiplyScalar(mm)
        const metal = (group.getObjectByName(`package-lead-${exit.pinId}`) as Group).getObjectByName('lead-metal') as Mesh
        assert.ok(solidContainsPoint(seal, point), `${type}.${exit.pinId}: hidden metal center is inside real seal`)
        assert.ok(solidContainsPoint(metal, point), `${type}.${exit.pinId}: render actually reaches the declared embed`)
        const tangent = Math.abs(normal.x) < .9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
        for (const direction of [tangent, normal.clone().cross(tangent)]) {
          const sample = point.clone().addScaledVector(direction, pkgRadius(part) * mm * .9)
          assert.ok(solidContainsPoint(seal, sample), `${type}.${exit.pinId}: seal surrounds the wire rather than only its axis`)
          assert.ok(solidContainsPoint(metal, sample), `${type}.${exit.pinId}: finite section intersects its seal`)
        }
      }
    } finally { disposeObject(group) }
  }
})

function pkgRadius(part: PartDefinition) { return Math.min(part.package.shape!.leadSection.widthMm, part.package.shape!.leadSection.thicknessMm) / 2 }

test('sealed LED initialization and paint edits preserve the selected sRGB hue without mutating document color', () => {
  const part = getPartForType('GENERIC_LED')!, properties = { color: '#3a78dc' }, group = model(part, properties)
  try {
    const material = mesh(group).material as MeshPhysicalMaterial
    const expected = { h: 0, s: 0, l: 0 }, observed = { h: 0, s: 0, l: 0 }
    new Color(properties.color).getHSL(expected, SRGBColorSpace); material.color.getHSL(observed, SRGBColorSpace)
    assert.ok(Math.abs(observed.h - expected.h) < 1e-6, 'dark resin retains the selected display-space hue')
    assert.equal(properties.color, '#3a78dc')
    const initial = material.color.getHexString()
    updatePackageAppearance(group, { id: 'part', type: 'GENERIC_LED', properties }, part)
    assert.equal(material.color.getHexString(), initial, 'initial and updated resin share one mapping')
    assert.equal(material.emissiveIntensity, 0)
  } finally { disposeObject(group) }
})
