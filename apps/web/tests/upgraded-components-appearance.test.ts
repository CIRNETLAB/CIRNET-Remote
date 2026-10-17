import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Color, ExtrudeGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { applyPackageSimulation, updatePackageAppearance } from '../src/three/PackageModel'
import { getPartForType } from '../src/data/partCatalog'

const materialOf = (model: any, name: string) => {
  const obj = model.getObjectByName(name)
  assert.ok(obj instanceof Mesh, `mesh ${name} should exist`)
  return obj.material as MeshStandardMaterial
}

test('Resistor 5-band has mandatory #4A90E2 albedo, 5 bands conforming to value, and smooth profile', () => {
  const part = getPartForType('RESISTOR_AXIAL')!
  const resistor = buildComponent({ id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 1000, tolerancePercent: 1 } })
  try {
    const bodyMat = materialOf(resistor, 'package-body')
    assert.equal(bodyMat.color.getHexString(), new Color('#4A90E2').getHexString(), 'resistor albedo is strictly #4A90E2')
    assert.ok(bodyMat.roughness >= .3 && bodyMat.roughness <= .45, 'resistor has slight-gloss finish')

    // 1k 1% = brown (1), black (0), black (0), brown (x10), brown (1%)
    const expected = ['704725', '1c1d20', '1c1d20', '704725', '704725']
    for (let i = 0; i < 5; i++) {
      const band = resistor.getObjectByName(`package-resistor-band-${i}`) as Mesh
      assert.ok(band, `band ${i} exists`)
      assert.equal((band.material as MeshStandardMaterial).color.getHexString(), expected[i])
      assert.equal(band.castShadow, false, 'bands do not cast fake floating shadows')
    }

    // Dynamic property update to 4.7k 5% = yellow (4), violet (7), black (0), brown (x10), gold (5%)
    updatePackageAppearance(resistor, { id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 4700, tolerancePercent: 5 } }, part)
    const expected4k7 = ['e9c83e', '824986', '1c1d20', '704725', 'bea047']
    for (let i = 0; i < 5; i++) {
      const band = resistor.getObjectByName(`package-resistor-band-${i}`) as Mesh
      assert.equal((band.material as MeshStandardMaterial).color.getHexString(), expected4k7[i])
    }

    // Fallback for unencodable value
    updatePackageAppearance(resistor, { id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 12345.67 } }, part)
    const readout = resistor.getObjectByName('package-property-marking') as Mesh
    assert.ok(readout, 'property marking exists for uncodable values')
  } finally { disposeObject(resistor) }
})

test('Electrolytic capacitor has blue sleeve, recessed aluminum lid, X vent, and polarity stripe oriented towards MINUS', () => {
  const part = getPartForType('CAPACITOR_ELECTROLYTIC')!
  const cap = buildComponent({ id: 'C1', type: 'CAPACITOR_ELECTROLYTIC', properties: { capacitanceFarads: 47e-6, voltageRatingVolts: 25 } })
  try {
    const sleeve = materialOf(cap, 'package-body')
    assert.equal(sleeve.color.getHexString(), new Color('#2b6cb0').getHexString(), 'sleeve has blue finish')
    assert.ok(sleeve.roughness >= .3 && sleeve.roughness <= .45)

    const lid = materialOf(cap, 'package-capacitor-lid')
    assert.equal(lid.color.getHexString(), 'd8dce0')
    assert.ok(lid.metalness >= .8, 'lid is metallic aluminum')

    const vent1 = cap.getObjectByName('package-capacitor-vent--1')
    const vent2 = cap.getObjectByName('package-capacitor-vent-1')
    assert.ok(vent1 && vent2, 'X vent grooves exist on capacitor lid')

    const bung = cap.getObjectByName('package-capacitor-bung')
    assert.ok(bung, 'bottom rubber bung exists')

    const stripe = cap.getObjectByName('package-polarity-stripe') as Mesh
    assert.ok(stripe, 'polarity stripe exists')
    assert.equal((stripe.material as MeshStandardMaterial).color.getHexString(), 'e4e7eb')

    for (let i = 0; i < 3; i++) {
      assert.ok(cap.getObjectByName(`package-negative-sign-${i}`), `negative sign ${i} exists`)
    }

    // Verify polarity stripe orientation towards MINUS pin
    const polarityGroup = cap.getObjectByName('package-polarity-group')
    assert.ok(polarityGroup, 'polarity group exists')
    const minusPin = part.package.pins.find(p => p.id === 'MINUS')!
    const expectedAngle = Math.atan2(minusPin.positionMm.x, minusPin.positionMm.z)
    assert.ok(Math.abs(polarityGroup.rotation.y - expectedAngle) < 1e-4, 'polarity stripe faces MINUS pin')

    assert.equal(cap.userData.appearance.label, '47 µF / 25 V')
  } finally { disposeObject(cap) }
})

test('Ceramic capacitor has dipped disc geometry, golden-brown lacquer material, and non-polarized marking', () => {
  const cap = buildComponent({ id: 'C2', type: 'CAPACITOR_CERAMIC', properties: { capacitanceFarads: 100e-9 } })
  try {
    const body = cap.getObjectByName('package-body') as Mesh
    assert.ok(body, 'ceramic body exists')
    assert.ok(body.geometry instanceof ExtrudeGeometry, 'ceramic capacitor uses beveled dipped disc geometry, not a sphere')

    const mat = body.material as MeshStandardMaterial
    assert.equal(mat.color.getHexString(), new Color('#b87d32').getHexString(), 'golden-brown lacquer material')
    assert.ok(mat.roughness >= .35 && mat.roughness <= .48)

    const disc = cap.getObjectByName('package-ceramic-disc')
    assert.ok(disc, 'ceramic disc group exists')
  } finally { disposeObject(cap) }
})

test('Diode has charcoal epoxy body and silver band; Zener has glass envelope, inner slug and dark band', () => {
  const diode = buildComponent({ id: 'D1', type: 'DIODE_1N4148' })
  const zener = buildComponent({ id: 'Z1', type: 'ZENER_1N4733A' })
  try {
    // Diode
    const diodeBody = materialOf(diode, 'package-body')
    assert.equal(diodeBody.color.getHexString(), new Color('#1b1e22').getHexString(), 'diode epoxy is charcoal/black')
    assert.ok(diodeBody.roughness >= .35 && diodeBody.roughness <= .45)
    const diodeBand = materialOf(diode, 'package-cathode-marker')
    assert.equal(diodeBand.color.getHexString(), 'c8cbd0', 'diode cathode band is silver/grey-white')

    // Zener
    const zenerBody = diode.getObjectByName.call(zener, 'package-body') as Mesh
    assert.ok(zenerBody.material instanceof MeshPhysicalMaterial, 'zener body is transmissive glass')
    const glassMat = zenerBody.material as MeshPhysicalMaterial
    assert.equal(glassMat.color.getHexString(), new Color('#e86a3e').getHexString())
    assert.ok(glassMat.transmission > .6, 'zener envelope is transparent/translucent glass')

    const slug = zener.getObjectByName('package-zener-slug') as Mesh
    assert.ok(slug, 'inner semiconductor slug exists inside zener glass envelope')
    assert.equal((slug.material as MeshStandardMaterial).color.getHexString(), new Color('#c44f2b').getHexString())

    const zenerBand = materialOf(zener, 'package-cathode-marker')
    assert.equal(zenerBand.color.getHexString(), new Color('#14171a').getHexString(), 'zener cathode band is dark')
  } finally {
    disposeObject(diode)
    disposeObject(zener)
  }
})

test('LED has transmissive colored resin lens, internal anode post and cathode anvil with die, and simulation emission', () => {
  const part = getPartForType('GENERIC_LED')!
  const led = buildComponent({ id: 'L1', type: 'GENERIC_LED', properties: { color: '#28b485' } })
  try {
    const lens = led.getObjectByName('package-body') as Mesh
    assert.ok(lens.material instanceof MeshPhysicalMaterial, 'lens is transmissive resin')
    const lensMat = lens.material as MeshPhysicalMaterial
    assert.equal(lensMat.color.getHexString(), new Color('#28b485').getHexString())
    assert.ok(lensMat.transmission > .5, 'lens has transmission')
    assert.equal(lensMat.emissiveIntensity, 0, 'off by default')

    // Internal leadframe
    const anodePost = led.getObjectByName('package-led-anode-post')
    const cathodeAnvil = led.getObjectByName('package-led-cathode-anvil')
    const die = led.getObjectByName('package-led-die')
    assert.ok(anodePost, 'internal anode post exists')
    assert.ok(cathodeAnvil, 'internal cathode anvil exists')
    assert.ok(die, 'internal silicon die exists')

    // Cathode flat marker
    assert.ok(led.getObjectByName('package-cathode-marker'), 'cathode flat marker exists')

    // Simulation turns on/off
    applyPackageSimulation(led, { ledOn: true })
    assert.equal(lensMat.emissive.getHexString(), new Color('#28b485').getHexString())
    assert.ok(lensMat.emissiveIntensity > 0)

    applyPackageSimulation(led, { ledOn: false })
    assert.equal(lensMat.emissiveIntensity, 0)
  } finally { disposeObject(led) }
})

test('Real component geometry casts and receives shadows while pick targets and highlights do not', () => {
  const resistor = buildComponent({ id: 'R1', type: 'RESISTOR_AXIAL' })
  try {
    const body = resistor.getObjectByName('package-body') as Mesh
    assert.equal(body.castShadow, true, 'body casts shadow')
    assert.equal(body.receiveShadow, true, 'body receives shadow')

    resistor.traverse(obj => {
      if (obj.name.includes('pin-target') || obj.name.includes('pin-highlight') || obj.name.includes('marking')) {
        assert.equal(obj.castShadow, false, `${obj.name} does not cast shadow`)
      }
    })
  } finally { disposeObject(resistor) }
})
