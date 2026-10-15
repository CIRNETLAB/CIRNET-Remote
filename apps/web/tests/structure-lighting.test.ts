import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, MeshStandardMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'

test('Structure keeps its pre-studio material response without changing other component groups', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100', 'POWER_SUPPLY', 'DC_SUPPLY']) {
    const model = buildComponent({ id: type, type, position: { x: 0, y: 0, z: 0 } })
    try {
      let count = 0
      model.traverse(object => {
        if (!(object instanceof Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof MeshStandardMaterial)) continue
          count++
          assert.equal(material.envMapIntensity, 0, `${type}/${object.name} must not inherit the new studio reflection`)
        }
      })
      assert.ok(count > 0)
    } finally { disposeObject(model) }
  }
  for (const type of ['RESISTOR_AXIAL', 'SN74HC08N', 'SEGMENT_SC5611EWA', 'GENERATOR', 'OSCILLOSCOPE']) {
    const model = buildComponent({ id: type, type })
    try {
      const physicalMaterials: MeshStandardMaterial[] = []
      model.traverse(object => {
        if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof MeshStandardMaterial) physicalMaterials.push(material)
        }
      })
      assert.ok(physicalMaterials.length > 0)
      assert.ok(physicalMaterials.every(material => material.envMapIntensity > 0), `${type} material response is outside the Structure fix`)
    } finally { disposeObject(model) }
  }
})
