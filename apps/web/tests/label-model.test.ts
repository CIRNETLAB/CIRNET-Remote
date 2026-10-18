import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Mesh, Sprite, type CanvasTexture, type MeshBasicMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { updateLabelModel } from '../src/three/LabelModel'
import { createLabelTextureCache } from '../src/three/LabelTextCache'
import { defaultLabelProperties } from '../src/data/labelProperties'
import { MM_TO_WORLD } from '../src/data/partCatalog'

test('Label is a 0.1mm board-plane sheet with a dedicated renderer and no electrical ports or billboard', () => {
  const group = buildComponent({ id: 'N', type: 'LABEL', position: { x: 1, y: .34, z: 2 }, rotation: 37, properties: { text: 'Điện áp 5 V' } })
  try {
    const plate = group.getObjectByName('label-sheet') as Mesh
    assert.ok(plate?.isMesh, 'explicit label renderer must replace the fallback box')
    plate.geometry.computeBoundingBox(); const bounds = plate.geometry.boundingBox!
    assert.ok(Math.abs((bounds.max.y - bounds.min.y) / MM_TO_WORLD - .1) < 1e-5)
    assert.ok((bounds.max.x - bounds.min.x) / MM_TO_WORLD <= 60.00001)
    assert.ok((bounds.max.z - bounds.min.z) / MM_TO_WORLD <= 25.00001)
    assert.equal(group.rotation.y, 37 * Math.PI / 180)
    group.traverse(object => { assert.equal(object instanceof Sprite, false); assert.notEqual(object.userData.kind, 'port') })
    assert.equal((group.getObjectByName('label-text') as Mesh).material instanceof Object, true)
    assert.equal(((group.getObjectByName('label-text') as Mesh).material as MeshBasicMaterial).depthTest, true)
  } finally { disposeObject(group) }
})

test('Label text updates keep the same model and sheet material while resizing only owned geometry', () => {
  const module = { id: 'N', type: 'LABEL', properties: { text: 'Hello' } }, group = buildComponent(module)
  try {
    const sheet = group.getObjectByName('label-sheet') as Mesh, material = sheet.material, before = sheet.geometry
    let disposed = 0; before.addEventListener('dispose', () => disposed++)
    updateLabelModel(group, { ...module, properties: { text: 'Ghi chú tiếng Việt\nNhiều dòng', fontSizeMm: 6 } })
    assert.equal(group.getObjectByName('label-sheet'), sheet); assert.equal(sheet.material, material)
    assert.equal(disposed, 1); assert.notEqual(sheet.geometry, before)
    assert.equal(group.userData.labelText, 'Ghi chú tiếng Việt\nNhiều dòng')
    const size = new Box3().setFromObject(group).getSize(sheet.position.clone())
    assert.ok(size.x / MM_TO_WORLD <= 60.00001); assert.ok(size.z / MM_TO_WORLD <= 25.00001)
  } finally { disposeObject(group) }
})

test('multiline Unicode label bitmaps are bounded, shared while leased and disposed after the final owner', () => {
  const painted: string[] = [], canvases: { width: number; height: number }[] = []
  const createCanvas = () => {
    const canvas = { width: 0, height: 0, getContext() { return context } }, context = {
      font: '', fillStyle: '', textAlign: '', textBaseline: '', clearRect() {},
      measureText(text: string) { return { width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)?.[1] ?? 100) * .6 } },
      fillText(text: string) { painted.push(text) },
    }
    canvases.push(canvas); return canvas as unknown as HTMLCanvasElement
  }
  const cache = createLabelTextureCache({ createCanvas, maxEntries: 2 }), properties = { ...defaultLabelProperties, text: 'Điện áp ≤ 5 V\nDòng điện' }
  const a = cache.acquire(properties), b = cache.acquire(properties)
  assert.equal(a.texture, b.texture); assert.ok(a.texture)
  assert.ok(painted.includes('Điện áp ≤ 5 V')); assert.ok(painted.includes('Dòng điện'))
  for (const canvas of canvases) { assert.ok(canvas.width <= 1024); assert.ok(canvas.height <= 1024) }
  let disposed = 0; (a.texture as CanvasTexture).addEventListener('dispose', () => disposed++)
  a.release(); assert.equal(disposed, 0)
  b.release(); assert.equal(disposed, 1); assert.equal(cache.size, 0)
  b.release(); assert.equal(disposed, 1)
})

test('long labels auto-fit the full text into the maximum sheet and do not grow an unbounded bitmap cache', () => {
  const cache = createLabelTextureCache({ createCanvas: () => null, maxEntries: 2 })
  const leases = Array.from({ length: 5 }, (_, i) => cache.acquire({ ...defaultLabelProperties, text: String(i) + 'W'.repeat(255), fontSizeMm: 6 }))
  for (const lease of leases) {
    assert.ok(lease.layout.widthMm <= 60); assert.ok(lease.layout.heightMm <= 25)
    assert.equal(lease.layout.lines.join('\n').length, 256); lease.release()
  }
  assert.ok(cache.size <= 2)
})
