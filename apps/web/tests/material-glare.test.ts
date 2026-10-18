import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { CAMERA_FAR, CAMERA_NEAR } from '../src/config/workbenchViewport'
import { createSceneManager } from '../src/three/SceneManager'
import { addBreadboardHousing, BREADBOARD_PLASTIC_COLOR } from '../src/three/BreadboardHousing'
import { getBreadboardTopology } from '../src/electrical/BreadboardTopology'
import { boardContactMechanics } from '../src/geometry/BreadboardMechanicalProfile'

const materialOf = (model: ReturnType<typeof buildComponent>, name: string) => {
  const object = model.getObjectByName(name)
  assert.ok(object instanceof Mesh, name)
  assert.ok(object.material instanceof MeshStandardMaterial, name)
  return object.material
}

test('a complete 360 degree Orbit preserves instrument assemblies, screen resources and graph state', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const graph = { schema_version: '1.0' as const, circuit_id: 'orbit-visuals', modules: ['DC_SUPPLY', 'OSCILLOSCOPE', 'GENERATOR'].map((type, index) => ({ id: type, type, position: { x: index * 5, y: 0, z: 0 }, properties: type === 'DC_SUPPLY' ? { voltage: 5, power_on: false } : {} })), connections: [] }
  const before = JSON.stringify(graph)
  try {
    manager.resize(1280, 720); manager.syncGraph(graph); manager.setZoom(50)
    const direction = manager.cameraDirection().clone(), radius = manager.camera.position.distanceTo(manager.target())
    const resources: { mesh: Mesh; geometry: Mesh['geometry']; material: Mesh['material']; position: number[] }[] = []
    for (const model of manager.models.values()) model.traverse(object => { if (object instanceof Mesh) resources.push({ mesh: object, geometry: object.geometry, material: object.material, position: object.position.toArray() }) })
    for (let step = 0; step < 36; step++) {
      manager.orbit(10)
      assert.ok(manager.camera.projectionMatrix.elements.every(Number.isFinite))
      assert.ok(Math.abs(manager.camera.position.distanceTo(manager.target()) - radius) < 1e-8)
      for (const record of resources) {
        assert.ok(record.mesh.geometry === record.geometry && record.mesh.material === record.material, 'Orbit does not reallocate screens or model resources')
        assert.deepEqual(record.mesh.position.toArray(), record.position)
      }
    }
    assert.ok(manager.cameraDirection().distanceTo(direction) < 1e-8, 'the existing Orbit gesture completes one full turn')
    assert.equal(JSON.stringify(graph), before)
  } finally { manager.dispose() }
})

test('paint and plastic have broad dielectric highlights while actual metal keeps its reflection', () => {
  for (const [type, coats, metals] of [
    ['DC_SUPPLY', ['supply-enclosure', 'supply-bezel', 'supply-front', 'control-strip', 'knob-body', 'switch-rocker'], ['knob-collar', 'case-screw']],
    ['OSCILLOSCOPE', ['enclosure', 'front_bezel', 'ch1_position_body'], ['ch1_bnc_barrel', 'case_fasteners']],
    ['GENERATOR', ['enclosure', 'front_bezel', 'encoder_cap'], ['ch1_output_barrel', 'case_fasteners']],
  ] as const) {
    const model = buildComponent({ id: type, type })
    try {
      for (const name of coats) {
        const material = materialOf(model, name)
        assert.equal(material.metalness, 0, `${type}/${name}: coating is a dielectric, including paint on metal`)
        assert.ok(material.roughness >= .78, `${type}/${name}: suppress a narrow orbit-dependent specular lobe`)
        assert.ok(material.envMapIntensity > 0 && material.envMapIntensity <= .35, `${type}/${name}: retain a restrained studio response`)
      }
      for (const name of metals) {
        const material = materialOf(model, name)
        assert.ok(material.metalness >= .65, `${type}/${name}: exposed metal remains metallic`)
        assert.ok(material.roughness <= .4, `${type}/${name}: exposed metal retains its authored finish`)
        assert.ok(material.envMapIntensity > 0, `${type}/${name}: keep reflected studio light`)
      }
      const screen = model.getObjectByName(type === 'DC_SUPPLY' ? 'supply-display' : 'screen') as Mesh
      assert.ok(screen.material instanceof MeshBasicMaterial)
      assert.equal(screen.material.toneMapped, false, 'screen artwork remains independent of coating response')
    } finally { disposeObject(model) }
  }
})

test('package coating response is softened without changing silver lead finish or Display', () => {
  for (const type of ['TRANSISTOR_2N3904', 'SN74HC08N', 'BUZZER_PS1240', 'TOGGLE_SWITCH_200MSP1']) {
    const model = buildComponent({ id: type, type })
    try {
      const body = materialOf(model, 'package-body')
      assert.equal(body.metalness, 0, type)
      assert.ok(body.roughness >= .78 && body.envMapIntensity > 0 && body.envMapIntensity <= .35, type)
      const lead = materialOf(model, 'lead-metal')
      assert.equal(lead.metalness, .86); assert.equal(lead.roughness, .29); assert.equal(lead.envMapIntensity, .85)
    } finally { disposeObject(model) }
  }
  for (const type of ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC', 'DIODE_1N4148', 'ZENER_1N4733A', 'LED_LTL307EE']) {
    const model = buildComponent({ id: type, type })
    try {
      const body = materialOf(model, 'package-body')
      assert.equal(body.metalness, 0, type)
      assert.ok(body.roughness >= .12 && body.roughness <= .5, `${type}: upgraded finish has controlled sheen`)
      const lead = materialOf(model, 'lead-metal')
      assert.equal(lead.metalness, .86); assert.equal(lead.roughness, .29); assert.equal(lead.envMapIntensity, .85)
    } finally { disposeObject(model) }
  }
  const display = buildComponent({ id: 'display', type: 'SEGMENT_SC5611EWA' })
  try {
    const body = materialOf(display, 'package-body')
    assert.equal(body.roughness, .65); assert.equal(body.metalness, .02); assert.equal(body.envMapIntensity, 1)
  } finally { disposeObject(display) }
})

test('instrument screen and printed surfaces keep a depth bias where their real gaps collapse in a 24-bit buffer', () => {
  const levels = 2 ** 24 - 1
  for (const type of ['DC_SUPPLY', 'OSCILLOSCOPE', 'GENERATOR']) {
    const model = buildComponent({ id: type, type })
    try {
      const screen = model.getObjectByName(type === 'DC_SUPPLY' ? 'supply-display' : 'screen') as Mesh<any, MeshBasicMaterial>
      const recess = model.getObjectByName(type === 'DC_SUPPLY' ? 'display-recess' : 'screen_recess') as Mesh
      const legends = model.getObjectByName(type === 'DC_SUPPLY' ? 'front-legends' : 'front_legends') as Mesh<any, MeshBasicMaterial> | undefined
      recess.geometry.computeBoundingBox()
      const front = new Vector3(0, 0, recess.geometry.boundingBox!.max.z).applyMatrix4(recess.matrixWorld)
      const center = screen.getWorldPosition(new Vector3())
      let collisions = 0
      for (const distance of [24, 30, 36]) for (const degrees of [-65, -30, 0, 30, 65]) {
        const angle = degrees * Math.PI / 180
        const camera = new PerspectiveCamera(42, 16 / 9, CAMERA_NEAR, CAMERA_FAR)
        camera.position.copy(center).addScaledVector(new Vector3(Math.sin(angle), .15, Math.cos(angle)).normalize(), distance)
        camera.lookAt(center); camera.updateMatrixWorld(true)
        const depth = (point: Vector3) => (point.clone().project(camera).z * .5 + .5) * levels
        const screenDepth = depth(center), backingDepth = depth(front)
        if (Math.round(screenDepth) === Math.round(backingDepth)) collisions++
        // Polygon offset is a depth-buffer adjustment, not a camera or geometry
        // change. A negative units bias ensures the authored surface wins even
        // when the screen and recessed case round to the same depth value.
        const units = screen.material.polygonOffset ? screen.material.polygonOffsetUnits : 0
        assert.ok(Math.round(screenDepth + units) < Math.round(backingDepth), `${type}: stable screen separation at ${distance}/${degrees}`)
      }
      assert.ok(collisions > 0, `${type}: reproduce insufficient geometric separation before the material bias`)
      assert.ok(screen.material.polygonOffset && screen.material.polygonOffsetUnits <= -2)
      assert.equal(screen.material.depthTest, true, 'other geometry still occludes the screen naturally')
      if (legends) {
        assert.ok(legends.material.polygonOffset && legends.material.polygonOffsetUnits <= -2, `${type}: printed controls need the same sub-pixel separation`)
        assert.equal(legends.material.depthWrite, false)
        const button = model.getObjectByName(type === 'OSCILLOSCOPE' ? 'auto_set_button' : 'waveform_button') as Mesh
        button.geometry.computeBoundingBox()
        const buttonFront = new Vector3(0, 0, button.geometry.boundingBox!.max.z).applyMatrix4(button.matrixWorld)
        const printPoint = legends.worldToLocal(buttonFront.clone()); printPoint.z = 0; legends.localToWorld(printPoint)
        assert.ok(printPoint.distanceTo(buttonFront) < .0011, `${type}: reproduce the near-coplanar printed button face`)
        const camera = new PerspectiveCamera(42, 16 / 9, CAMERA_NEAR, CAMERA_FAR)
        camera.position.copy(printPoint).addScaledVector(new Vector3(0, .15, 1).normalize(), 30)
        camera.lookAt(printPoint); camera.updateMatrixWorld(true)
        const printDepth = (printPoint.project(camera).z * .5 + .5) * levels
        const buttonDepth = (buttonFront.project(camera).z * .5 + .5) * levels
        assert.equal(Math.round(printDepth), Math.round(buttonDepth), `${type}: printed face rounds to the same depth as its button`)
        assert.ok(Math.round(printDepth + legends.material.polygonOffsetUnits) < Math.round(buttonDepth))
      }
    } finally { disposeObject(model) }
  }
})

test('all Breadboards use neutral off-white artwork in sRGB and preserve rail and coordinate ink', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const fills: string[] = [], strokes: string[] = [], ink: string[] = []
  const context = {
    fillStyle: '', strokeStyle: '', fillRect() { fills.push(this.fillStyle) }, strokeRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes.push(this.strokeStyle) },
    fillText() { ink.push(this.fillStyle) },
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { return { getContext: () => context } } } })
  try {
    for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
      const firstFill = fills.length
      const model = buildComponent({ id: type, type })
      try {
        const deck = model.children.find(o => o.userData.breadboardDeck) as Mesh<any, MeshStandardMaterial>
        const color = deck.material.color.clone().convertLinearToSRGB().toArray()
        assert.ok(Math.max(...color) <= .86 && Math.min(...color) >= .79, `${type}: neutral off-white leaves highlight headroom`)
        assert.ok(Math.max(...color) - Math.min(...color) <= .02, `${type}: avoid a blue or yellow cast`)
        assert.equal(deck.material.metalness, 0); assert.ok(deck.material.roughness >= .9)
        const artwork = model.children.find(o => o instanceof Mesh && o.material instanceof MeshStandardMaterial && o.material.map) as Mesh<any, MeshStandardMaterial>
        assert.ok(artwork?.material.map)
        assert.equal(artwork.material.map.colorSpace, SRGBColorSpace, 'canvas color pixels need the same conversion as material colors')
        assert.equal(fills[firstFill], `#${deck.material.color.getHexString()}`, 'artwork and untextured deck share one off-white color')
      } finally { disposeObject(model) }
    }
    assert.ok(strokes.includes('#dc2626') && strokes.includes('#0284c7'), 'keep the original red and blue rail ink')
    assert.ok(ink.includes('#0f172a'), 'keep coordinate ink contrast')
    assert.ok(!fills.includes('#fafbfc'), 'the artwork must not repaint the off-white deck nearly pure white')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else delete (globalThis as { document?: unknown }).document
  }
})

test('color variants preserve every new-mechanics Breadboard vertex, normal, UV, index and contact transform', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    let expected: string | undefined
    for (const color of [BREADBOARD_PLASTIC_COLOR, '#ece8df', '#9ea5a9']) {
      const model = new Group(), hash = createHash('sha256')
      addBreadboardHousing(model, type, color, null); model.updateMatrixWorld(true)
      try {
        const deck = model.children.find(object => object.userData.breadboardDeck) as Mesh
        assert.equal((deck.material as MeshStandardMaterial).color.getHexString(), color.slice(1))
        const sockets = model.children.find(object => object.userData.breadboardSockets) as InstancedMesh
        const contact = getBreadboardTopology(type)!.contacts[0]!, mechanics = boardContactMechanics(type, contact.contactId), matrix = new Matrix4()
        sockets.getMatrixAt(0, matrix)
        const position = sockets.geometry.getAttribute('position')
        const floor = Math.min(...Array.from({ length: position.count }, (_, index) => new Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix).y))
        assert.ok(Math.abs(floor-mechanics.floor.y) < 1e-7, 'the color comparison uses the new 3.5 mm cavity')
        model.traverse(object => {
          if (!(object instanceof Mesh)) return
          for (const key of Object.keys(object.geometry.attributes).sort()) {
            const array = object.geometry.attributes[key]!.array
            hash.update(key); hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
          }
          if (object.geometry.index) { const array = object.geometry.index.array; hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) }
          hash.update(JSON.stringify(object.matrix.elements))
          if (object instanceof InstancedMesh) { const array = object.instanceMatrix.array; hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) }
        })
        const digest = hash.digest('hex')
        if (expected === undefined) expected = digest
        else assert.equal(digest, expected, `${type}/${color}`)
      } finally { disposeObject(model) }
    }
  }
})
