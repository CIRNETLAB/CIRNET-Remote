import test from 'node:test'
import assert from 'node:assert/strict'
import { Color, Mesh, MeshStandardMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { applyPackageSimulation, updatePackageAppearance } from '../src/three/PackageModel'
import { getPartForType } from '../src/data/partCatalog'
import { subduedBodyColor } from '../src/three/package/PackageMaterials'

test('generic LED color edits retain the physical assembly and never turn on an unobserved LED', () => {
  const module = { id: 'L', type: 'GENERIC_LED', properties: { color: '#3a78dc' } }, part = getPartForType('GENERIC_LED')!
  const model = buildComponent(module)
  try {
    const lens = model.getObjectByName('package-body') as Mesh
    const material = lens.material as MeshStandardMaterial, lead = model.getObjectByName('package-lead-A')
    const anodePost = model.getObjectByName('package-led-anode-post')
    const cathodeAnvil = model.getObjectByName('package-led-cathode-anvil')
    assert.ok(anodePost, 'internal anode post exists')
    assert.ok(cathodeAnvil, 'internal cathode anvil exists')
    assert.equal(material.color.getHexString(), new Color('#3a78dc').getHexString())
    assert.equal(material.emissiveIntensity, 0)
    updatePackageAppearance(model, { ...module, properties: { color: '#42b567' } }, part)
    assert.equal(model.getObjectByName('package-body'), lens); assert.equal(model.getObjectByName('package-lead-A'), lead)
    assert.equal(material.color.getHexString(), new Color('#42b567').getHexString())
    assert.equal(material.emissiveIntensity, 0)
    applyPackageSimulation(model, { ledOn: true })
    assert.equal(material.emissive.getHexString(), '42b567'); assert.ok(material.emissiveIntensity > 0)
    updatePackageAppearance(model, { ...module, properties: { color: '#ffffff' } }, part)
    assert.equal(material.emissive.getHexString(), 'ffffff')
    applyPackageSimulation(model, null)
    assert.equal(material.emissiveIntensity, 0)
    updatePackageAppearance(model, module, part)
    assert.equal(material.emissiveIntensity, 0)
  } finally { disposeObject(model) }
})

test('legacy SKU LED opaque color metadata retains its original appearance and emission semantics', () => {
  const model = buildComponent({ id: 'legacy', type: 'LED_LTL307EE', properties: { color: '#3a78dc' } })
  try {
    const material = (model.getObjectByName('package-body') as Mesh).material as MeshStandardMaterial
    assert.equal(material.color.getHexString(), new Color('#ba3434').getHexString())
    applyPackageSimulation(model, { ledOn: true }); assert.equal(material.emissive.getHexString(), 'ed281e')
  } finally { disposeObject(model) }
})

test('design value markings preserve unrounded engineering values when a resistor has no exact band code', () => {
  const model = buildComponent({ id: 'R', type: 'GENERIC_RESISTOR', properties: { resistanceOhms: 12345.678901234567, powerWatts: .25, tolerancePercent: 1 } })
  try { assert.equal(model.userData.appearance.label, '12.345678901234567 kΩ · 0.25 W · ±1%') }
  finally { disposeObject(model) }
})
