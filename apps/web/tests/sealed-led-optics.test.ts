import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Color, Group, Mesh, MeshPhysicalMaterial } from 'three'
import { getPartForType, historicalPartCatalog, MM_TO_WORLD } from '../src/data/partCatalog'
import { addPackageModel } from '../src/three/package/PackageFactory'
import { updatePackageAppearance } from '../src/three/package/PackageAppearance'
import { applyPackageSimulation } from '../src/three/PackageModel'
import { createLedLensMaterial } from '../src/three/package/PackageMaterials'
import { disposeObject } from '../src/three/ComponentModel'

test('sealed wine resin applies its dark pigment once while retaining faint internal light through a 5 mm volume', () => {
  const material = createLedLensMaterial('#ff0000', 5)
  try {
    assert.equal(material.color.getHexString(), '781521')
    assert.equal(material.transmission, .28); assert.equal(material.roughness, .25)
    assert.equal(material.opacity, .98, 'retain only a 2% direct interior signal alongside the dark physical resin')
    assert.equal(material.thickness, 5 * MM_TO_WORLD); assert.equal(material.attenuationDistance, 7.5 * MM_TO_WORLD)
    // Three multiplies diffuseColor by Beer attenuation. The wine surface
    // already supplies the pigment, so the volume must retain a faint signal
    // rather than imposing that same dark pigment a second time.
    for (const channel of ['r', 'g', 'b'] as const) {
      const volumeSignal = Math.pow(material.attenuationColor[channel], material.thickness / material.attenuationDistance)
      assert.ok(volumeSignal >= .8 && volumeSignal < 1, `${channel} volume should retain at least 80% before the separately declared .28 transmission and wine tint`)
    }
  } finally { material.dispose() }
})

test('sealed LED paint updates share the initial optical mapping and preserve selected colors and simulation evidence', () => {
  const part = getPartForType('GENERIC_LED')!, group = new Group(), properties = { color: '#ff0000' }
  addPackageModel(group, { id: 'LED', type: 'GENERIC_LED', properties }, part)
  try {
    const body = group.getObjectByName('package-body') as Mesh, material = body.material as MeshPhysicalMaterial
    for (const color of ['#ff0000', '#3a78dc', '#33bb66']) {
      properties.color = color
      const initial = createLedLensMaterial(color, 5)
      try {
        applyPackageSimulation(group, { status: 'SUPPORTED', ledOn: true })
        updatePackageAppearance(group, { id: 'LED', type: 'GENERIC_LED', properties }, part)
        assert.ok(material.color.equals(initial.color), 'paint and initialization must retain the same surface hue')
        assert.ok(material.attenuationColor.equals(initial.attenuationColor), 'paint must not restore the old duplicate dark volume tint')
        assert.equal(material.opacity, .98, 'paint edits retain the native-verified faint leadframe visibility')
        assert.equal(material.emissive.getHexString(), new Color(color).getHexString()); assert.equal(material.emissiveIntensity, .8)
        assert.equal(properties.color, color)
        applyPackageSimulation(group, { ledOn: false }); assert.equal(material.emissiveIntensity, 0)
        applyPackageSimulation(group, { status: 'UNKNOWN' }); assert.equal(material.emissiveIntensity, 0); assert.equal(group.userData.simulationStatus, 'UNKNOWN')
        updatePackageAppearance(group, { id: 'LED', type: 'GENERIC_LED', properties }, part)
        assert.equal(material.emissiveIntensity, 0, 'a color change cannot invent an ON state')
      } finally { initial.dispose() }
    }
  } finally { disposeObject(group) }
})

test('historical unshaped LED optics retain their original surface and absorption colors', () => {
  const part = historicalPartCatalog.filter(part => part.editorType === 'GENERIC_LED').sort((a, b) => a.revision - b.revision)[0]!, group = new Group(), properties = { color: '#3a78dc' }
  assert.ok(!part.package.shape)
  addPackageModel(group, { id: 'OLD', type: 'GENERIC_LED', properties }, part)
  try {
    const material = (group.getObjectByName('package-body') as Mesh).material as MeshPhysicalMaterial
    assert.equal(material.transmission, .62); assert.equal(material.thickness, .04); assert.equal(material.attenuationDistance, .08); assert.equal(material.opacity, 1)
    assert.equal(material.color.getHexString(), '3a78dc'); assert.equal(material.attenuationColor.getHexString(), '3a78dc')
    properties.color = '#55bb88'; updatePackageAppearance(group, { id: 'OLD', type: 'GENERIC_LED', properties }, part)
    assert.equal(material.color.getHexString(), '55bb88'); assert.equal(material.attenuationColor.getHexString(), '55bb88')
  } finally { disposeObject(group) }
})
