import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Box3, BoxGeometry, Color, Group, Light, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, Vector3 } from 'three'
import * as thumbnails from '../src/three/PackageThumbnails'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { updatePackageAppearance } from '../src/three/PackageModel'
import { getPartForType } from '../src/data/partCatalog'
import { subduedBodyColor } from '../src/three/package/PackageMaterials'
import { createSceneManager } from '../src/three/SceneManager'

function framing() {
  const api = thumbnails as unknown as {
    getRenderedModelBounds?: (model: Group) => Box3
    fitPackageThumbnailCamera?: (model: Group, camera: OrthographicCamera, aspect: number) => void
  }
  assert.equal(typeof api.getRenderedModelBounds, 'function', 'framing must inspect rendered geometry rather than hidden pick volumes')
  assert.equal(typeof api.fitPackageThumbnailCamera, 'function', 'the production camera fit must be directly verifiable')
  return api as Required<typeof api>
}

test('framing excludes invisible pick volumes and overlays, but keeps visible lead and coating geometry', () => {
  const { getRenderedModelBounds } = framing(), model = new Group()
  const body = new Mesh(new BoxGeometry(2, 1, 1), new MeshBasicMaterial())
  const lead = new Mesh(new BoxGeometry(.1, 2, .1), new MeshBasicMaterial()); lead.position.set(1.5, -1, 0)
  lead.userData.selectionSurface = false
  const hidden = new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial({ visible: false }))
  const invisible = new Mesh(new BoxGeometry(150, 150, 150), new MeshBasicMaterial({ transparent: true, opacity: 0 }))
  const hiddenParent = new Group(); hiddenParent.visible = false; hiddenParent.add(new Mesh(new BoxGeometry(200, 200, 200), new MeshBasicMaterial()))
  const overlay = new Group(); overlay.userData.pinLabel = true; overlay.position.set(50, 50, 50); overlay.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial()))
  model.add(body, lead, hidden, invisible, hiddenParent, overlay)
  try {
    const expected = new Box3().setFromObject(body).union(new Box3().setFromObject(lead)), actual = getRenderedModelBounds(model)
    assert.ok(actual.min.distanceTo(expected.min) < 1e-7)
    assert.ok(actual.max.distanceTo(expected.max) < 1e-7)
  } finally { disposeObject(model) }
})

test('the production fit centers and contains short, tall, long and detailed models including their leads', () => {
  const { fitPackageThumbnailCamera } = framing()
  for (const type of ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC', 'BUZZER_PS1240', 'DC_SUPPLY']) {
    const model = buildComponent({ id: 'preview', type }), camera = new OrthographicCamera()
    // Nonzero translation/yaw exposes fits that assume an origin-centered part.
    model.position.set(7, -2, 4); model.rotation.y = .63
    try {
      for (const aspect of [4 / 3, 2.1]) {
        fitPackageThumbnailCamera(model, camera, aspect)
        const projected = new Box3()
        model.traverseVisible(object => {
          if (!(object instanceof Mesh)) return
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          if (!materials.some(material => material.visible && (!material.transparent || material.opacity > 0))) return
          object.geometry.computeBoundingBox()
          const box = object.geometry.boundingBox!
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            projected.expandByPoint(new Vector3(x, y, z).applyMatrix4(object.matrixWorld).project(camera))
          }
        })
        assert.ok(Math.max(Math.abs(projected.min.x), Math.abs(projected.max.x), Math.abs(projected.min.y), Math.abs(projected.max.y)) <= .88, `${type} has padding around the entire rendered silhouette`)
        assert.ok(Math.abs(projected.getCenter(new Vector3()).x) < 1e-6, `${type} is centered horizontally in projected space`)
        assert.ok(Math.abs(projected.getCenter(new Vector3()).y) < 1e-6, `${type} is centered vertically in projected space`)
        assert.ok(projected.min.z >= -1 && projected.max.z <= 1, `${type} is not near/far clipped`)
      }
    } finally { disposeObject(model) }
  }
})

test('Component Info preview containment removes intrinsic grid minimum overflow at small and large viewports', async () => {
  const css = await readFile('src/style.css', 'utf8')
  const wrapper = css.match(/\.component-thumbnail\s*\{([^}]+)\}/)?.[1] ?? ''
  const image = css.match(/\.component-thumbnail img\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(wrapper, /min-width:\s*0/)
  assert.match(wrapper, /min-height:\s*0/)
  assert.match(wrapper, /display:\s*flex/)
  assert.match(image, /min-height:\s*0/)
  assert.match(image, /object-fit:\s*contain/)
  const preview = css.match(/\.component-information-art:has\(\.component-thumbnail\)\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(preview, /height:\s*clamp\(/, 'preview remains bounded and responsive at 1280×720 and 1920×1080')
  assert.doesNotMatch(image, /cover/)
})

test('thumbnail direct lighting matches the actual Workbench scene instead of introducing brighter highlights', () => {
  assert.equal(typeof thumbnails.createPackageThumbnailScene, 'function')
  const preview = thumbnails.createPackageThumbnailScene()
  const workspace = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const lights = (scene: typeof preview) => scene.children.filter((object): object is Light => object instanceof Light).map(light => ({ type: light.type, color: light.color.getHexString(), intensity: light.intensity, position: light.position.toArray() }))
  try {
    assert.deepEqual(lights(preview), lights(workspace.scene))
    assert.equal(preview.environmentIntensity, .55)
  } finally { workspace.dispose() }
})

test('resistor coating uses mandatory #4A90E2 albedo, diode uses charcoal epoxy and five bands keep updating in place', () => {
  const resistor = buildComponent({ id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 1000, tolerancePercent: 1 } })
  const diode = buildComponent({ id: 'D1', type: 'DIODE_1N4148' })
  try {
    const coating = (resistor.getObjectByName('package-body') as Mesh<any, MeshStandardMaterial>).material
    assert.equal(coating.color.getHexString(), new Color('#4A90E2').getHexString())
    assert.equal((diode.getObjectByName('package-body') as Mesh<any, MeshStandardMaterial>).material.color.getHexString(), new Color('#1b1e22').getHexString())
    const bands = Array.from({ length: 5 }, (_, i) => resistor.getObjectByName(`package-resistor-band-${i}`) as Mesh<any, MeshStandardMaterial>)
    const before = bands.map(band => band.material.color.getHexString())
    updatePackageAppearance(resistor, { id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 4700, tolerancePercent: 2 } }, getPartForType('RESISTOR_AXIAL')!)
    assert.equal((resistor.getObjectByName('package-body') as Mesh).material, coating)
    assert.notDeepEqual(bands.map(band => band.material.color.getHexString()), before)
    assert.deepEqual(bands.map(band => band.material.color.getHexString()), ['e9c83e', '824986', '1c1d20', '704725', 'bb3728'])
  } finally { disposeObject(resistor); disposeObject(diode) }
})
