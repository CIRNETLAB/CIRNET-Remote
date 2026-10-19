import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Raycaster, SRGBColorSpace, Vector3, type Material } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { getPartForType, historicalPartCatalog, physicalDescriptorForPart } from '../src/data/partCatalog'
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

// These are material/geometry unit checks. Real depth-buffer stability is
// exercised separately by the browser's WebGL visual regressions.
const assertThinSurface = (material: Material, label: string) => {
  assert.ok(material.polygonOffset && material.polygonOffsetFactor < 0 && material.polygonOffsetUnits < 0, `${label}: a small bias covers both sloping and front-on artwork`)
  assert.ok(material.polygonOffsetFactor >= -1 && material.polygonOffsetUnits >= -2, `${label}: retain the shared modest bias`)
  assert.equal(material.depthTest, true, `${label}: foreground geometry still participates in depth testing`)
}

const sameRayGap = (front: Mesh, backing: Mesh, origin: Vector3, direction: Vector3) => {
  const ray = new Raycaster(origin, direction)
  const frontHit = ray.intersectObject(front, false)[0], backingHit = ray.intersectObject(backing, false)[0]
  assert.ok(frontHit && backingHit, `${front.name}/${backing.name}: both surfaces lie on the same ray`)
  assert.ok(frontHit.distance < backingHit.distance, `${front.name}: authored geometry is in front of its backing`)
  return backingHit.distance - frontHit.distance
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
  const legacyDisplay = historicalPartCatalog.find(part => part.editorType === 'SEGMENT_SC5611EWA' && part.revision === 1)!
  const display = buildComponent({ id: 'display', type: legacyDisplay.editorType, physicalDescriptor: physicalDescriptorForPart(legacyDisplay) })
  try {
    const body = materialOf(display, 'package-body')
    assert.equal(body.roughness, .65); assert.equal(body.metalness, .02); assert.equal(body.envMapIntensity, 1)
  } finally { disposeObject(display) }
})

test('instrument artwork retains normal occlusion and its measured separation from the backing', () => {
  for (const type of ['DC_SUPPLY', 'OSCILLOSCOPE', 'GENERATOR']) {
    const model = buildComponent({ id: type, type })
    try {
      const screen = model.getObjectByName(type === 'DC_SUPPLY' ? 'supply-display' : 'screen') as Mesh<any, MeshBasicMaterial>
      const recess = model.getObjectByName(type === 'DC_SUPPLY' ? 'display-recess' : 'screen_recess') as Mesh
      const legends = model.getObjectByName(type === 'DC_SUPPLY' ? 'front-legends' : 'front_legends') as Mesh<any, MeshBasicMaterial> | undefined
      model.updateMatrixWorld(true)
      const center = screen.getWorldPosition(new Vector3())
      const normal = new Vector3(0, 0, 1).transformDirection(screen.matrixWorld)
      const gap = sameRayGap(screen, recess, center.addScaledVector(normal, 2), normal.negate())
      assert.ok(Math.abs(gap - (type === 'DC_SUPPLY' ? .0015 : .0045)) < 1e-7, `${type}: retain the authored screen and recess geometry, including chassis pitch`)
      assertThinSurface(screen.material, `${type}/screen`)
      assert.equal(screen.material.depthWrite, true, 'opaque screens retain depth ownership')
      if (legends) {
        assertThinSurface(legends.material, `${type}/legends`)
        assert.equal(legends.material.depthWrite, false)
      }
    } finally { disposeObject(model) }
  }
})

test('current and historical Display faces, glyphs and decimal points use owned thin-surface materials', () => {
  for (const type of ['SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA']) {
    const current = getPartForType(type)!, historical = historicalPartCatalog.find(part => part.editorType === type && part.revision === 1)!
    assert.ok(current && historical)
    for (const part of [current, historical]) {
      const model = buildComponent({ id: type, type, physicalDescriptor: physicalDescriptorForPart(part) })
      try {
        model.updateMatrixWorld(true)
        const face = model.getObjectByName('package-display-face') as Mesh<any, MeshStandardMaterial>
        const body = model.getObjectByName('package-body') as Mesh<any, MeshStandardMaterial>
        const label = `${type}/revision-${part.revision}`
        assertThinSurface(face.material, `${label}/face`)
        assert.equal(face.material.depthWrite, true)
        assert.equal(body.material.polygonOffset, false, `${label}: do not bias the whole package`)
        assert.notEqual(face.material, body.material)
        const faceGap = sameRayGap(face, body, new Vector3(0, 3, 0), new Vector3(0, -1, 0))
        assert.ok(Math.abs(faceGap - (part.revision === 1 ? .004 : .001535433)) < 1e-7, `${label}: keep the real pocket and plate thickness`)
        let segments = 0
        model.traverse(object => {
          if (!(object instanceof Mesh) || typeof object.userData.segment !== 'string') return
          assert.ok(object.material instanceof MeshStandardMaterial)
          assertThinSurface(object.material, `${label}/${object.userData.segment}`)
          assert.equal(object.material.depthWrite, true)
          assert.notEqual(object.material, face.material)
          const origin = object.getWorldPosition(new Vector3()); origin.y = 3
          const glyphGap = sameRayGap(object, face, origin, new Vector3(0, -1, 0))
          assert.ok(Math.abs(glyphGap - (part.revision === 1 ? .0027 : .001535433)) < 1e-7, `${label}: keep glyph and decimal-point heights`)
          segments++
        })
        assert.equal(segments, 8 * part.package.digits!, `${label}: include every decimal point`)
      } finally { disposeObject(model) }
    }
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
        assertThinSurface(artwork.material, `${type}/artwork`)
        assert.equal(artwork.name, 'breadboard-artwork')
        assert.equal(artwork.material.depthWrite, true)
        assert.equal(deck.material.polygonOffset, false, 'bias the owned artwork, not the ABS deck')
        model.updateMatrixWorld(true)
        const gap = sameRayGap(artwork, deck, new Vector3(.045, 3, type === 'BREADBOARD_100' ? 0 : .3), new Vector3(0, -1, 0))
        assert.ok(Math.abs(gap - .002) < 1e-7, 'artwork clearance includes the transformed extrusion bevel')
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
