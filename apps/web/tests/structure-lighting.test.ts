import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, MeshStandardMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'

test('Breadboard has a restrained matte response without disabling the studio for other surfaces', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const model = buildComponent({ id: type, type, position: { x: 0, y: 0, z: 0 } })
    try {
      let count = 0
      model.traverse(object => {
        if (!(object instanceof Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof MeshStandardMaterial)) continue
          count++
          assert.equal(material.envMapIntensity, .12, `${type}/${object.name} retains faint indirect light`)
          assert.ok(material.roughness >= .92, `${type}/${object.name} remains matte`)
        }
      })
      assert.ok(count > 0)
    } finally { disposeObject(model) }
  }
  for (const type of ['POWER_SUPPLY', 'DC_SUPPLY', 'RESISTOR_AXIAL', 'SN74HC08N', 'SEGMENT_SC5611EWA', 'GENERATOR', 'OSCILLOSCOPE']) {
    const model = buildComponent({ id: type, type })
    try {
      const physicalMaterials: MeshStandardMaterial[] = []
      model.traverse(object => {
        if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof MeshStandardMaterial) physicalMaterials.push(material)
        }
      })
      assert.ok(physicalMaterials.length > 0)
      assert.ok(physicalMaterials.every(material => material.envMapIntensity > 0), `${type} retains studio reflection`)
    } finally { disposeObject(model) }
  }
})
