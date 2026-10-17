import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ceramicDiscGeometry,ledShellGeometry } from '../src/three/package/PackageShapes'

test('LED flange stays inside the declared package envelope',()=>{
  const geometry=ledShellGeometry(2.5,8.6,.4)
  try{
    geometry.computeBoundingBox()
    const bounds=geometry.boundingBox!
    assert.ok(bounds.max.x<=2.5+1e-6&&bounds.min.x>=-2.5-1e-6,'flange must fit declared diameter')
    assert.ok(bounds.max.z<=2.5+1e-6&&bounds.min.z>=-2.5-1e-6)
    assert.ok(bounds.max.y<=8.6+1e-6&&bounds.min.y>=-1e-6)
  }finally{geometry.dispose()}
})

test('ceramic dipped rim and bevel stay inside the rigid body envelope',()=>{
  const geometry=ceramicDiscGeometry(5,5,2)
  try{
    geometry.computeBoundingBox()
    const bounds=geometry.boundingBox!
    for(const axis of ['x','y','z'] as const){
      const half=axis==='z'?1:2.5
      assert.ok(bounds.max[axis]<=half+1e-6&&bounds.min[axis]>=-half-1e-6,`${axis} rim extends past envelope`)
    }
  }finally{geometry.dispose()}
})
