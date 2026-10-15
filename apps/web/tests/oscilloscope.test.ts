import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three'
import { createPinia, setActivePinia } from 'pinia'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { getDefinition } from '../src/data/editorCatalog'
import { ribbonGroups } from '../src/data/ribbon'
import { useCircuitStore } from '../src/stores/circuit'
import { createSceneManager } from '../src/three/SceneManager'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Texture } from 'three'
import { assertSupportedChassis } from './helpers/instrument-chassis'

const knobs = ['time_div_knob', 'horizontal_position', 'trigger_level', 'ch1_volts_div', 'ch1_position', 'ch2_volts_div', 'ch2_position']
const buttons = ['run_stop_button', 'auto_set_button', 'single_button', 'default_button', 'trigger_source_button', 'trigger_mode_button', 'trigger_slope_button', 'trigger_menu_button', 'power_button']
const connectors = ['ch1_bnc', 'ch2_bnc', 'trig_out_bnc']
const feet = ['tilt_foot_left', 'tilt_foot_right']

test('two-channel scope is placeable from Instruments, with no fabricated electrical/acquisition contract', () => {
  const definition = getDefinition('OSCILLOSCOPE')
  assert.ok(definition, 'Oscilloscope must have an editor definition')
  assert.equal(definition.family, 'instruments'); assert.equal(definition.visualOnly, true)
  assert.deepEqual(definition.ports, []); assert.deepEqual(definition.parameters, [])
  const item = ribbonGroups.find((g) => g.id === 'instruments')!.items.find((i) => i.type === 'OSCILLOSCOPE')!
  assert.equal(item.window, undefined, 'palette selection places the model')
  setActivePinia(createPinia())
  const store = useCircuitStore(); store.createDraft()
  const id = store.placeModule('OSCILLOSCOPE', { x: 2, y: 0, z: -1 })
  store.moveModule(id, { x: 4, y: 0, z: 3 }); store.rotateModule(id)
  assert.equal(store.graph!.modules[0].rotation, 90)
  store.undo(); store.undo(); assert.deepEqual(store.graph!.modules[0].position, { x: 2, y: 0, z: -1 })
  assert.deepEqual(store.graph!.connections, [])
})

test('scope has centered local knob pivots, independent screen, three BNCs and a bounded mesh budget', () => {
  const model = buildComponent({ id: 'SCOPE', type: 'OSCILLOSCOPE' })
  try {
    for (const name of knobs) {
      const pivot = model.getObjectByName(name)
      assert.ok(pivot instanceof Group, name)
      const body = pivot.getObjectByName(`${name}_body`) as Mesh
      assert.ok(body instanceof Mesh)
      assert.equal(body.position.x, 0); assert.equal(body.position.y, 0)
      const before = body.getWorldPosition(new Vector3())
      pivot.rotation.z = 0.6; model.updateMatrixWorld(true)
      assert.ok(body.getWorldPosition(new Vector3()).distanceTo(before) < 1e-8, 'turning a knob must not orbit its center')
    }
    for (const name of buttons) assert.ok(model.getObjectByName(name), name)
    const screen = model.getObjectByName('screen') as Mesh
    assert.ok(screen.geometry instanceof PlaneGeometry)
    assert.ok(screen.material instanceof MeshBasicMaterial && !screen.material.toneMapped)
    assert.ok(model.getObjectByName('brand_owl')); assert.ok(model.getObjectByName('front_legends'))
    let bnc = 0, triangles = 0, meshes = 0
    model.traverse((node) => {
      if (connectors.includes(node.name)) bnc++
      if (node instanceof Mesh) { meshes++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3 }
    })
    assert.equal(bnc, 3)
    assert.ok(triangles < 25000, `${triangles} triangles`); assert.ok(meshes < 100, `${meshes} meshes`)
    const bounds = new Box3().setFromObject(model, true)
    assert.ok(Math.abs(bounds.min.y) < 0.001, 'origin sits on the work surface')
    // Catalog height describes the unpitched layout. Pitch adds the projected
    // depth and rear-pad clearance; the complete supported model stays below 4.
    assert.ok(bounds.max.y <= 4)
    assert.ok(Math.abs(bounds.min.x + bounds.max.x) < 0.01, 'base centered on X')
    assert.deepEqual(model.position.toArray(), [0, 0, 0]); assert.deepEqual(model.scale.toArray(), [1, 1, 1])
  } finally { disposeObject(model) }
})

test('reference front layout has a silver case, wide screen, complete controls, aligned BNCs and two inclined feet', () => {
  const model = buildComponent({ id: 'SCOPE', type: 'OSCILLOSCOPE' })
  try {
    const mesh = (name: string) => { const node = model.getObjectByName(name); assert.ok(node instanceof Mesh, name); return node }
    const shell = mesh('enclosure').material as MeshStandardMaterial
    assert.equal(shell.color.getHexString(), 'a1aab4')
    assert.equal(shell.metalness, 0, 'the powder coating is dielectric even though its substrate is metal')
    assert.ok(shell.roughness >= .8, 'paint has a broad reflection rather than a travelling highlight')
    assert.equal((mesh('front_bezel').material as MeshStandardMaterial).color.getHexString(), '30383e')
    assert.equal(model.name, 'net_circuit_oscilloscope_2ch')
    const screen = mesh('screen'), bounds = new Box3().setFromObject(screen)
    assert.ok(bounds.getSize(new Vector3()).x / bounds.getSize(new Vector3()).y > 1.55, 'screen matches the wide reference display')
    assert.ok(bounds.max.x < 0.9, 'display stays left of the control bank')
    const stack = ['auto_set_button', 'run_stop_button', 'single_button', 'default_button'].map(mesh)
    for (let i = 1; i < stack.length; i++) {
      assert.equal(stack[i].position.x, stack[0].position.x)
      assert.ok(new Box3().setFromObject(stack[i]).max.y < new Box3().setFromObject(stack[i - 1]).min.y, 'stacked buttons cannot overlap')
    }
    const mode = mesh('trigger_mode_button'), source = mesh('trigger_source_button'), slope = mesh('trigger_slope_button'), menu = mesh('trigger_menu_button')
    assert.equal(mode.position.x, slope.position.x); assert.equal(source.position.x, menu.position.x)
    assert.equal(mode.position.y, source.position.y); assert.equal(slope.position.y, menu.position.y)
    assert.ok(mode.position.x < source.position.x && slope.position.y < mode.position.y)
    const ports = connectors.map((name) => model.getObjectByName(name)!)
    ports.forEach((port) => { assert.ok(port); assert.equal(port.position.y, ports[0].position.y); assert.ok(port.position.y < bounds.min.y) })
    assert.ok(ports[0].position.x < ports[1].position.x && ports[1].position.x < ports[2].position.x)
    assert.equal(ports[0].userData.channel, 1); assert.equal(ports[1].userData.channel, 2)
    assert.equal(ports[2].userData.channel, undefined, 'Trig Out must not invent a third input channel')
    assert.equal(ports[2].userData.role, 'trigger-output')
    assert.ok(mesh('power_button').position.x < ports[0].position.x)
    assert.ok(mesh('power_led').position.x > mesh('power_button').position.x)
    for (const name of feet) {
      const foot = mesh(name)
      assert.ok(Math.abs(foot.rotation.x) > 0.2, 'front stand visibly inclines')
      assert.ok(foot.position.z > 0, 'stand supports the front of the case')
      assert.equal(foot.userData.selectionSurface, true, 'selection gold contour includes the stand silhouettes')
    }
    let count = 0
    model.traverse((node) => { if (/^(foot_|tilt_foot_)/.test(node.name)) count++ })
    assert.equal(count, 2, 'no leftover cylindrical feet')
    const definition = getDefinition('OSCILLOSCOPE')!
    assert.deepEqual(definition.size, [6, 3.8, 2.8]); assert.equal(definition.color, '#a1aab4')
  } finally { disposeObject(model) }
})

test('scope participates in the existing selected-object transform gizmo after graph movement/yaw', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'scope', modules: [{ id: 'SCOPE', type: 'OSCILLOSCOPE', position: { x: 3, y: 0, z: 2 }, rotation: 45 }], connections: [] })
    manager.highlight('SCOPE')
    assert.ok(manager.gizmoHandlePosition('xz')); assert.ok(manager.gizmoHandlePosition('rotate-y'))
    const model = manager.models.get('SCOPE')!
    assert.ok(model.getObjectByName('screen'))
    assert.deepEqual(model.position.toArray(), [3, 0, 2]); assert.equal(model.rotation.y, Math.PI / 4)
  } finally { manager.dispose() }
})

test('delivered GLB and glTF round-trip through GLTFLoader with all controls and embedded PNGs', async () => {
  const folder = new URL('../public/models/oscilloscope-2ch/', import.meta.url)
  const bytes = await readFile(new URL('oscilloscope-2ch.glb', folder))
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.ok(bytes.length < 1500000, 'WebGL asset stays below 1.5 MB')
  const jsonLength = bytes.readUInt32LE(12)
  const glb = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const bin = bytes.subarray(28 + jsonLength)
  for (const view of glb.bufferViews) assert.ok(view.byteOffset + view.byteLength <= bin.length)
  assert.equal(glb.images.length, 3)
  for (const image of glb.images) {
    assert.equal(image.mimeType, 'image/png'); assert.equal(image.uri, undefined)
    const view = glb.bufferViews[image.bufferView]
    assert.equal(bin.subarray(view.byteOffset, view.byteOffset + 8).toString('hex'), '89504e470d0a1a0a')
  }
  const gltf = JSON.parse(await readFile(new URL('oscilloscope-2ch.gltf', folder), 'utf8'))
  const binary = await readFile(new URL(gltf.buffers[0].uri, folder))
  assert.equal(binary.length, gltf.buffers[0].byteLength)
  for (const image of gltf.images) assert.ok((await readFile(new URL(image.uri, folder))).length > 0)
  gltf.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`
  // Node has no GPU/image decoder: validate PNG payloads above, then use the real
  // Three loader for geometry, material slots, transforms and node hierarchy.
  const progress = Object.getOwnPropertyDescriptor(globalThis, 'ProgressEvent')
  if (!progress) Object.defineProperty(globalThis, 'ProgressEvent', { configurable: true, value: class extends Event { constructor(type: string, init: ProgressEventInit) { super(type); Object.assign(this, init) } } })
  const loader = new GLTFLoader().register(() => ({ name: 'TEST_PNG_DECODER', loadTexture: () => Promise.resolve(new Texture()) }))
  try { for (const input of [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), JSON.stringify(gltf)]) {
    const loaded = await loader.parseAsync(input, '')
    try {
      const root = loaded.scene.getObjectByName('net_circuit_oscilloscope_2ch')!
      assert.ok(root); assert.deepEqual(root.position.toArray(), [0, 0, 0]); assert.deepEqual(root.scale.toArray(), [1, 1, 1])
      assertSupportedChassis(root)
      for (const name of [...knobs, ...buttons, ...connectors, ...feet, 'screen', 'power_led']) assert.ok(root.getObjectByName(name), name)
      assert.equal(((root.getObjectByName('enclosure') as Mesh).material as MeshStandardMaterial).color.getHexString(), 'a1aab4')
      const ports = connectors.map((name) => root.getObjectByName(name)!)
      ports.forEach((port) => assert.equal(port.position.y, ports[0].position.y))
      const screen = root.getObjectByName('screen') as Mesh<any, MeshBasicMaterial>
      assert.ok(screen.material instanceof MeshBasicMaterial); assert.ok(screen.material.map)
      const positions = screen.geometry.getAttribute('position'), uv = screen.geometry.getAttribute('uv')
      for (let i = 0; i < positions.count; i++) assert.equal(uv.getY(i), positions.getY(i) > 0 ? 0 : 1, 'exported image top maps to the top of the screen')
      for (const name of knobs) {
        const pivot = root.getObjectByName(name)!, body = root.getObjectByName(`${name}_body`)!
        assert.equal(body.parent, pivot); assert.deepEqual(body.position.toArray(), [0, 0, 0])
      }
    } finally { disposeObject(loaded.scene) }
  } } finally { if (!progress) Reflect.deleteProperty(globalThis, 'ProgressEvent') }
})
