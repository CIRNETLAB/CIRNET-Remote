import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Sprite, Vector2, Vector3 } from 'three'
import { buildComponent, disposeObject, portAnchor } from '../src/three/ComponentModel'
import { addPackageModel, applyPackageSimulation, setPackagePinHighlight } from '../src/three/PackageModel'
import * as packageModel from '../src/three/PackageModel'
import { partCatalog, type PartDefinition } from '../src/data/partCatalog'
import { createSceneManager } from '../src/three/SceneManager'
import { solveMounting } from '../src/electrical/mounting'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import type { CircuitModule } from '../src/contracts/generated/dto'

test('SN74HC08N renders fourteen separate metal leads on the physical PDIP rows', () => {
  const model = buildComponent({ id: 'U1', type: 'SN74HC08N' })
  try {
    const leads = model.children.filter(child => child.userData.physicalLead)
    assert.equal(leads.length, 14, 'the package has a lead for every physical pin, including VCC and GND')
    assert.deepEqual(leads.map(lead => lead.userData.pinId), Array.from({ length: 14 }, (_, i) => String(i + 1)))
    for (const lead of leads) lead.traverse(object => {
      if (!(object instanceof Mesh)) return
      assert.ok(object.material instanceof MeshStandardMaterial)
      assert.ok(object.material.metalness > .7)
      assert.equal(object.material.emissive.getHex(), 0, 'metal does not emit its own light')
      assert.ok(new Box3().setFromObject(object).min.y >= -.00001)
    })
    const pin1 = portAnchor('SN74HC08N', { id: '1', direction: 'input' })
    const pin7 = portAnchor('SN74HC08N', { id: '7', direction: 'input' })
    const pin8 = portAnchor('SN74HC08N', { id: '8', direction: 'output' })
    const pin14 = portAnchor('SN74HC08N', { id: '14', direction: 'input' })
    for (const [actual, expected] of [[pin1, [-.39, 0, .195]], [pin7, [.39, 0, .195]], [pin8, [.39, 0, -.195]], [pin14, [-.39, 0, -.195]]] as const) {
      assert.ok(actual.distanceTo(new Vector3(...expected)) < 1e-9, 'numbering follows top view, not logical input/output order')
    }
    assert.ok(model.getObjectByName('package-notch'))
    assert.ok(model.getObjectByName('package-pin1-marker'))
    assert.ok(new Box3().setFromObject(model.getObjectByName('package-body')!).max.x < .6, 'body dimensions follow 2.54mm breadboard pitch')
  } finally { disposeObject(model) }
})

test('physical pin targets remain raycastable without visible spheres or an ID banner', () => {
  const model = buildComponent({ id: 'U1', type: 'SN74HC08N' })
  try {
    const pickers = model.children.filter(child => child.userData.pinTarget) as Mesh[]
    assert.equal(pickers.length, 14)
    assert.ok(!model.children.some(child => child instanceof Sprite))
    for (const target of pickers) {
      assert.equal(target.visible, true, 'picking still traverses the target')
      const material = target.material as MeshStandardMaterial
      assert.equal(material.visible, false, 'render traversal never draws the hit volume')
      assert.ok(!target.userData.selectionSurface)
    }
    model.updateMatrixWorld(true)
    const pin = pickers.find(target => target.userData.endpoint === 'U1.1')!
    const ray = new Raycaster(pin.position.clone().add(new Vector3(0, 1, 0)), new Vector3(0, -1, 0))
    assert.ok(ray.intersectObject(pin).length > 0)
  } finally { disposeObject(model) }
})

test('physical LED has A/K leads and cathode marker while legacy LED keeps IN', () => {
  const physical = buildComponent({ id: 'D1', type: 'LED_LTL307EE' })
  const legacy = buildComponent({ id: 'L1', type: 'LED' })
  try {
    assert.deepEqual(physical.children.filter(child => child.userData.pinTarget).map(child => child.userData.endpoint), ['D1.A', 'D1.K'])
    assert.equal(physical.children.filter(child => child.userData.physicalLead).length, 2)
    assert.ok(physical.getObjectByName('package-cathode-marker'))
    assert.deepEqual(legacy.children.filter(child => child.userData.kind === 'port').map(child => child.userData.endpoint), ['L1.IN'])
  } finally { disposeObject(physical); disposeObject(legacy) }
})

// These fixtures isolate package rendering from registry enumeration. In particular,
// sharing an axial envelope must never turn a diode into a resistor visually.
function axialPart(kind: 'resistor' | 'diode'): PartDefinition {
  return {
    id: `test-${kind}`, revision: 1, editorType: 'TEST_AXIAL', name: kind, manufacturer: 'Test', partNumber: kind === 'resistor' ? 'R-1K' : '1N4148',
    datasheet: { url: 'https://example.test/datasheet', title: 'Fixture' }, function: kind,
    package: { id: 'axial-fixture', revision: 1, family: 'axial', bodyMm: { x: 6.3, y: 2.3, z: 2.3 }, leadDiameterMm: .6, standoffMm: 2,
      pins: [{ id: 'A', number: '1', name: 'A', role: 'passive', positionMm: { x: -5.08, y: 0, z: 0 } }, { id: kind === 'resistor' ? 'B' : 'K', number: '2', name: kind === 'resistor' ? 'B' : 'K', role: 'passive', positionMm: { x: 5.08, y: 0, z: 0 } }],
      footprint: { id: 'axial-fixture', revision: 1, pitchMm: 2.54, mountable: true } },
    simulation: { model: kind, status: 'unsupported' },
    editor: { family: 'passive', visual: 'package', color: '#333333', defaults: {}, parameters: [] },
  }
}

test('formed axial leads reach both socket tips while resistor bands follow the cylindrical body', () => {
  const model = new Group(); addPackageModel(model, { id: 'R1', type: 'TEST_AXIAL' }, axialPart('resistor'))
  try {
    const body = model.getObjectByName('package-body') as Mesh
    assert.ok(body.geometry.getAttribute('normal'), 'formed coating has surface normals')
    assert.equal(model.children.filter(child => child.userData.resistorBand).length, 5)
    const bounds = new Box3().setFromObject(body)
    assert.ok(bounds.max.x < .17 && bounds.min.x > -.17, 'lead forming does not stretch the body to the pin span')
    for (const id of ['A', 'B']) {
      const lead = model.getObjectByName(`package-lead-${id}`)!
      const box = new Box3().setFromObject(lead)
      assert.ok(box.min.y >= -1e-8 && box.min.y < 1e-8)
      assert.ok(box.max.y > bounds.min.y)
    }
  } finally { disposeObject(model) }
})

test('resistor paint bands read canonical resistanceOhms and encode three digits plus multiplier and tolerance', () => {
  const model = new Group(); addPackageModel(model, { id: 'R1', type: 'TEST_AXIAL', properties: { resistanceOhms: 220, tolerancePercent: 1 } }, axialPart('resistor'))
  try {
    const colors = [0, 1, 2, 3, 4].map(i => ((model.getObjectByName(`package-resistor-band-${i}`) as Mesh).material as MeshStandardMaterial).color.getHexString())
    assert.deepEqual(colors, ['bb3728', 'bb3728', '1c1d20', '1c1d20', '704725'])
  } finally { disposeObject(model) }
})

test('axial diode has a cathode band instead of resistor color bands', () => {
  const model = new Group(); addPackageModel(model, { id: 'D1', type: 'TEST_AXIAL' }, axialPart('diode'))
  try {
    assert.ok(model.getObjectByName('package-cathode-marker'))
    assert.equal(model.children.filter(child => child.userData.resistorBand).length, 0)
  } finally { disposeObject(model) }
})

test('diode cathode band follows the canonical cathode side when the lead frame is reversed', () => {
  const part = axialPart('diode')
  part.package.pins[0]!.positionMm.x = 5.08; part.package.pins[1]!.positionMm.x = -5.08
  const model = new Group(); addPackageModel(model, { id: 'D1', type: 'TEST_AXIAL' }, part)
  try { assert.ok(model.getObjectByName('package-cathode-marker')!.position.x < 0) } finally { disposeObject(model) }
})

test('package hover and light output are driven explicitly and do not alter metallic leads', () => {
  const model = buildComponent({ id: 'D1', type: 'LED_LTL307EE' })
  try {
    setPackagePinHighlight(model, 'K')
    assert.equal(model.getObjectByName('package-pin-highlight-K')?.visible, true)
    assert.equal(model.getObjectByName('package-pin-highlight-A')?.visible, false)
    setPackagePinHighlight(model, null)
    assert.equal(model.getObjectByName('package-pin-highlight-K')?.visible, false)
    const lens = model.getObjectByName('package-body') as Mesh<any, MeshStandardMaterial>
    applyPackageSimulation(model, { status: 'SUPPORTED', ledOn: true })
    assert.ok(lens.material.emissiveIntensity > 0)
    applyPackageSimulation(model, { status: 'UNPOWERED', ledOn: false })
    assert.equal(lens.material.emissiveIntensity, 0)
    for (const lead of model.children.filter(child => child.userData.physicalLead)) lead.traverse(object => {
      if (object instanceof Mesh) assert.equal((object.material as MeshStandardMaterial).emissive.getHex(), 0)
    })
  } finally { disposeObject(model) }
})

function familyPart(family: PartDefinition['package']['family'], visualVariant?: string): PartDefinition {
  const part = axialPart('resistor')
  part.package.family = family; part.package.bodyMm = { x: 6, y: 6, z: 5 }
  part.function = visualVariant ?? family
  if (visualVariant) Object.assign(part.package, { visualVariant })
  return part
}

test('capacitor variants show the cylinder polarity stripe only on the polarized package', () => {
  const polarized = familyPart('radial-capacitor', 'polarized'); polarized.package.polarized = true
  const ceramic = familyPart('radial-capacitor', 'ceramic'); ceramic.package.polarized = false
  const first = new Group(), second = new Group()
  addPackageModel(first, { id: 'C1', type: 'TEST' }, polarized); addPackageModel(second, { id: 'C2', type: 'TEST' }, ceramic)
  try {
    const sleeve = first.getObjectByName('package-body') as Mesh
    assert.ok(sleeve.geometry.getAttribute('normal'))
    assert.ok(first.getObjectByName('package-capacitor-lid'))
    assert.ok(first.getObjectByName('package-capacitor-vent-1'))
    assert.ok(first.getObjectByName('package-polarity-stripe'))
    assert.ok(!second.getObjectByName('package-polarity-stripe'))
    assert.ok(second.getObjectByName('package-ceramic-disc'))
  } finally { disposeObject(first); disposeObject(second) }
})

test('TO-92 uses a flat-faced molded body instead of a generic logic box', () => {
  const model = new Group(); addPackageModel(model, { id: 'Q1', type: 'TEST' }, familyPart('to92'))
  try {
    assert.ok((model.getObjectByName('package-body') as Mesh).geometry instanceof ExtrudeGeometry)
    assert.ok(model.getObjectByName('package-flat-face'))
  } finally { disposeObject(model) }
})

test('DIP switch renders four independent actuators while tactile switch renders one plunger', () => {
  const dip = new Group(), tactile = new Group()
  addPackageModel(dip, { id: 'SW1', type: 'TEST', properties: { value: 5 } }, familyPart('switch', 'dip-switch'))
  addPackageModel(tactile, { id: 'SW2', type: 'TEST' }, familyPart('switch', 'push-button'))
  try {
    assert.equal(dip.children.filter(child => child.userData.switchActuator).length, 4)
    assert.equal(tactile.children.filter(child => child.userData.switchActuator).length, 1)
    assert.ok(tactile.getObjectByName('package-switch-cover'))
  } finally { disposeObject(dip); disposeObject(tactile) }
})

test('physical switch actuators follow their declared contact control properties', () => {
  const dip = buildComponent({ id: 'SW1', type: 'DIP_SWITCH_A6D4100', properties: { position0: true, position1: false, position2: true, position3: false } })
  const released = buildComponent({ id: 'SW2', type: 'PUSH_BUTTON_B3F1000', properties: { pressed: false } }), pressed = buildComponent({ id: 'SW3', type: 'PUSH_BUTTON_B3F1000', properties: { pressed: true } })
  try {
    assert.ok(dip.getObjectByName('package-switch-actuator-0')!.position.z < 0)
    assert.ok(dip.getObjectByName('package-switch-actuator-1')!.position.z > 0)
    assert.ok(dip.getObjectByName('package-switch-actuator-2')!.position.z < 0)
    assert.ok(dip.getObjectByName('package-switch-actuator-3')!.position.z > 0)
    assert.ok(pressed.getObjectByName('package-switch-actuator')!.position.y < released.getObjectByName('package-switch-actuator')!.position.y)
  } finally { disposeObject(dip); disposeObject(released); disposeObject(pressed) }
})

test('physical SPDT toggle has a silver bushing and one lever whose throw follows its state', () => {
  const first = buildComponent({ id: 'SW1', type: 'TOGGLE_SWITCH_200MSP1', properties: { state: false } }), second = buildComponent({ id: 'SW2', type: 'TOGGLE_SWITCH_200MSP1', properties: { state: true } })
  try {
    const bushing = first.getObjectByName('package-switch-bushing') as Mesh<any, MeshStandardMaterial>
    assert.ok(bushing, 'threaded metal bushing is separate from the switch housing')
    assert.ok(bushing.material.metalness > .7)
    const firstLever = first.getObjectByName('package-switch-lever')!, secondLever = second.getObjectByName('package-switch-lever')!
    assert.ok(firstLever.rotation.z > 0)
    assert.ok(secondLever.rotation.z < 0)
    assert.equal(first.children.filter(child => child.userData.physicalLead).length, 3)
  } finally { disposeObject(first); disposeObject(second) }
})

test('seven-segment digit geometry does not invent or remove canonical physical pins', () => {
  for (const digits of [1, 2, 4]) {
    const part = familyPart('seven-segment'); part.package.digits = digits; part.package.bodyMm.x = 12 * digits
    const model = new Group(); addPackageModel(model, { id: 'DS1', type: 'TEST' }, part)
    try {
      assert.equal(model.children.filter(child => child.userData.segment).length, 8 * digits)
      assert.equal(model.children.filter(child => child.userData.physicalLead).length, 2, 'pins come from the fixture pinout, independently of digit count')
    } finally { disposeObject(model) }
  }
})

test('simulated segment illumination can light one segment without lighting its neighbours', () => {
  const model = new Group(), part = familyPart('seven-segment'); part.package.digits = 1
  addPackageModel(model, { id: 'DS1', type: 'TEST' }, part)
  try {
    applyPackageSimulation(model, { status: 'SUPPORTED', segments: ['0.a'] })
    const a = model.getObjectByName('package-digit-0-a') as Mesh<any, MeshStandardMaterial>, b = model.getObjectByName('package-digit-0-b') as Mesh<any, MeshStandardMaterial>
    assert.ok(a.material.emissiveIntensity > 0)
    assert.equal(b.material.emissiveIntensity, 0)
  } finally { disposeObject(model) }
})

test('disposing one package cannot dispose resources owned by another live package', () => {
  const first = buildComponent({ id: 'U1', type: 'SN74HC08N' }), second = buildComponent({ id: 'U2', type: 'SN74HC08N' })
  let disposed = 0
  second.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.addEventListener('dispose', () => disposed++)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => material.addEventListener('dispose', () => disposed++))
  })
  try { disposeObject(first); assert.equal(disposed, 0) } finally { disposeObject(second) }
})

test('source banana terminals place the actual pick point on their visible posts', () => {
  const model = buildComponent({ id: 'PS1', type: 'DC_SUPPLY' })
  try {
    for (const id of ['PLUS', 'MINUS']) {
      const terminal = model.getObjectByName(`supply-socket-opening-${id}`)!
      const target = model.getObjectByName(`package-pin-target-${id}`)!
      assert.ok(terminal.getWorldPosition(new Vector3()).distanceTo(target.position) < 1e-10, 'rendered endpoint coincides with the exposed binding post opening')
      const body = new Box3().setFromObject(model.getObjectByName('supply-enclosure')!)
      assert.ok(!body.containsPoint(target.position), 'body cannot hide the only source wiring target')
    }
  } finally { disposeObject(model) }
})

test('mounted DIP pin hit volumes remain pickable above real sockets in top and oblique views', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 2, y: .2, z: -1 }, rotation: 37 }
  const desired = moduleLocalToWorld({ x: 0, y: .309, z: 0 }, board), candidate = solveMounting('SN74HC08N', desired, 37, [board])!
  try {
    assert.ok(candidate.valid)
    manager.resize(1200, 900)
    manager.syncGraph({ schema_version: '1.1', circuit_id: 'pick-physical', modules: [board, { id: 'U1', type: 'SN74HC08N', mount: candidate.mount }], connections: [] })
    for (const [camera, pins] of [[{ x: 0, y: 5, z: 0 }, Array.from({ length: 14 }, (_, i) => String(i + 1))], [{ x: 0, y: 3, z: 3 }, ['1', '2', '3', '4', '5', '6', '7']]] as const) {
      const worldCamera = moduleLocalToWorld(camera, board)
      manager.camera.position.set(worldCamera.x, worldCamera.y, worldCamera.z); manager.camera.lookAt(desired.x, desired.y, desired.z); manager.camera.updateMatrixWorld()
      for (const pin of pins) {
        const endpoint = `U1.${pin}`, projected = manager.project(manager.endpointPosition(endpoint)!)
        const debugRay = new Raycaster(); debugRay.setFromCamera(new Vector2(projected.x / 1200 * 2 - 1, 1 - projected.y / 900 * 2), manager.camera)
        const firstHits = debugRay.intersectObjects([...manager.models.values()], true).slice(0, 4).map(hit => ({ name: hit.object.name, kind: hit.object.userData.kind, distance: hit.distance, pos: hit.point.toArray() }))
        assert.equal(manager.pickEndpoint(projected.x, projected.y)?.endpoint, endpoint, `${endpoint} is reachable from ${camera.z === 0 ? 'top' : 'front oblique'}: ${JSON.stringify(firstHits)}`)
      }
    }
  } finally { manager.dispose() }
})

test('every declared lab package builds its exact pin set and a package-specific body', () => {
  for (const part of partCatalog) {
    const model = buildComponent({ id: 'P1', type: part.editorType, properties: { ...part.editor.defaults } })
    try {
      assert.ok(model.getObjectByName(part.editor.visual === 'supply' ? 'supply-enclosure' : 'package-body'), part.editorType)
      if (part.editor.visual !== 'supply') assert.deepEqual(model.children.filter(child => child.userData.physicalLead).map(child => child.userData.pinId), part.package.pins.map(pin => pin.id), part.editorType)
      assert.equal(model.children.filter(child => child.userData.pinTarget).length, part.package.pins.length)
      assert.equal(model.userData.definitionId, part.id)
      if (part.package.family === 'buzzer') assert.ok(model.getObjectByName('package-buzzer-opening'))
    } finally { disposeObject(model) }
  }
})

test('formed round and rectangular leads have one continuous surface through the bend', () => {
  for (const type of ['SN74HC08N', 'RESISTOR_AXIAL', 'CAPACITOR_CERAMIC']) {
    const model = buildComponent({ id: 'P1', type })
    try {
      for (const lead of model.children.filter(child => child.userData.physicalLead)) {
        const surfaces: Mesh[] = []; lead.traverse(object => { if (object instanceof Mesh) surfaces.push(object) })
        assert.equal(surfaces.length, 1, `${type}.${lead.userData.pinId} must not have capped cylinders/boxes meeting at a knee`)
        const geometry = surfaces[0]!.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
        assert.ok(positions.count > 40, 'bend is sampled rather than two straight primitives')
        for (let i = 0; i < normals.count; i++) assert.ok(Math.abs(new Vector3().fromBufferAttribute(normals, i).length() - 1) < .00001)
        // Every triangle belongs to the same connected surface, including through
        // the fillet. Weld positions only for this topology observation.
        const index = geometry.index, vertices = Array.from({ length: positions.count }, (_, i) => [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => n.toFixed(7)).join(','))
        const neighbours = new Map<string, Set<string>>()
        for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
          const keys = [0, 1, 2].map(j => vertices[index ? index.getX(i + j) : i + j]!)
          for (const key of keys) { const edges = neighbours.get(key) ?? new Set<string>(); keys.forEach(other => edges.add(other)); neighbours.set(key, edges) }
        }
        const seen = new Set<string>(), pending = [vertices[0]!]
        while (pending.length) { const key = pending.pop()!; if (seen.has(key)) continue; seen.add(key); neighbours.get(key)?.forEach(next => { if (!seen.has(next)) pending.push(next) }) }
        assert.equal(seen.size, neighbours.size, 'surface is connected without detached knee caps')
      }
    } finally { disposeObject(model) }
  }
})

test('LED shell is one continuous transmissive resin lens whose light still comes from the result adapter', () => {
  const model = buildComponent({ id: 'D1', type: 'LED_LTL307EE' })
  try {
    const shells: Mesh[] = []; model.traverse(object => { if (object instanceof Mesh && object.userData.ledLens) shells.push(object) })
    assert.equal(shells.length, 1, 'dome and barrel share a continuous molded shell')
    const shell = shells[0]!, material = shell.material as MeshStandardMaterial
    assert.equal(material.transparent, true)
    assert.equal(material.opacity, 1)
    assert.ok(material.roughness <= .4, 'resin lens has smooth finish')
    applyPackageSimulation(model, { ledOn: true }); assert.ok(material.emissiveIntensity > 0)
    applyPackageSimulation(model, null); assert.equal(material.emissiveIntensity, 0)
  } finally { disposeObject(model) }
})

test('DIP ribbon is wide along the pin row and its softened body stays inside the verified envelope', () => {
  const descriptor = partCatalog.find(part => part.editorType === 'SN74HC08N')!, model = buildComponent({ id: 'U1', type: 'SN74HC08N' })
  try {
    const body = new Box3().setFromObject(model.getObjectByName('package-body')!)
    assert.ok(body.max.x <= descriptor.package.bodyMm.x * .13 / 2.54 / 2 + 1e-6)
    assert.ok(body.max.z <= descriptor.package.bodyMm.z * .13 / 2.54 / 2 + 1e-6)
    const lead = model.getObjectByName('package-lead-1')!, surface = lead.children[0] as Mesh, positions = surface.geometry.getAttribute('position'), tip = new Box3()
    for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getY(i)) < 1e-7) tip.expandByPoint(new Vector3().fromBufferAttribute(positions, i))
    const section = tip.getSize(new Vector3())
    assert.ok(section.x > section.z * 2, 'ribbon has its wide face along the X pin row, rather than edge-on')
  } finally { disposeObject(model) }
})

test('DIP marking shows only its short code and discrete rendering needs no execution or manufacturer profile', () => {
  const dip = buildComponent({ id: 'U1', type: 'SN74HC08N' }), descriptor = axialPart('diode')
  const lean = { ...descriptor } as Partial<PartDefinition>; delete lean.simulation; delete lean.manufacturer; delete lean.datasheet
  const diode = new Group()
  try {
    addPackageModel(diode, { id: 'D1', type: 'TEST_AXIAL' }, lean as PartDefinition)
    assert.ok(diode.getObjectByName('package-cathode-marker'))
    assert.equal(dip.getObjectByName('package-marking')?.userData.text, '74HC08')
  } finally { disposeObject(dip); disposeObject(diode) }
})

test('display segments stay above their dark face with positive depth clearance for 1, 2 and 4 digits', () => {
  for (const digits of [1, 2, 4]) {
    const descriptor = familyPart('seven-segment'); descriptor.package.digits = digits; descriptor.package.bodyMm.x = 12 * digits
    const model = new Group(); addPackageModel(model, { id: 'DS1', type: 'TEST' }, descriptor)
    try {
      const face = model.getObjectByName('package-display-face') as Mesh<any, MeshStandardMaterial>
      assert.ok(face.material.color.getHSL({ h: 0, s: 0, l: 0 }).l < .15, 'off face is dark')
      const faceBounds = new Box3().setFromObject(face)
      for (const segment of model.children.filter(child => child.userData.segment) as Mesh<any, MeshStandardMaterial>[]) {
        assert.ok(new Box3().setFromObject(segment).min.y >= faceBounds.max.y + .0008, 'segment and face cannot compete for the same depth')
        assert.equal(segment.material.depthTest, true); assert.equal(segment.material.depthWrite, true)
        assert.equal(segment.material.transparent, false); assert.equal(segment.material.emissiveIntensity, 0)
      }
    } finally { disposeObject(model) }
  }
})

test('R/C property appearance updates in place and keeps other instances and all lead resources intact', () => {
  const update = (packageModel as unknown as { updatePackageAppearance?: (group: Group, module: CircuitModule, descriptor: PartDefinition) => void }).updatePackageAppearance
  assert.equal(typeof update, 'function', 'package appearance has a dedicated in-place update')
  const descriptor = axialPart('resistor'), first = new Group(), second = new Group()
  addPackageModel(first, { id: 'R1', type: 'TEST', properties: { resistanceOhms: 330 } }, descriptor)
  addPackageModel(second, { id: 'R2', type: 'TEST', properties: { resistanceOhms: 330 } }, descriptor)
  const resources = (model: Group) => { const list: unknown[] = []; model.traverse(object => { if (object instanceof Mesh) list.push(object, object.geometry, object.material, (object.material as MeshStandardMaterial).map) }); return list }
  try {
    const before = resources(first), peer = resources(second)
    for (const [ohms, colors] of [[1000, ['704725', '1c1d20', '1c1d20', '704725', '704725']], [4700, ['e9c83e', '824986', '1c1d20', '704725', '704725']]] as const) {
      update!(first, { id: 'R1', type: 'TEST', properties: { resistanceOhms: ohms, tolerancePercent: 1 } }, descriptor)
      assert.deepEqual(resources(first), before, 'property updates do not allocate model resources')
      assert.deepEqual([0, 1, 2, 3, 4].map(i => ((first.getObjectByName(`package-resistor-band-${i}`) as Mesh).material as MeshStandardMaterial).color.getHexString()), colors)
      assert.equal(first.userData.appearance.resistanceOhms, ohms)
    }
    assert.deepEqual(resources(second), peer)
    assert.equal(second.userData.appearance.resistanceOhms, 330)
    update!(first, { id: 'R1', type: 'TEST', properties: { resistanceOhms: 1234 } }, descriptor)
    assert.ok(first.userData.appearance.warning, 'unrepresentable resistance is explicit rather than silently rounded')
    assert.ok(first.children.filter(child => child.userData.resistorBand).every(band => !band.visible))
  } finally { disposeObject(first); disposeObject(second) }
})

test('generic capacitor marking updates capacitance and rating without changing its polarity or geometry', () => {
  const update = (packageModel as unknown as { updatePackageAppearance?: (group: Group, module: CircuitModule, descriptor: PartDefinition) => void }).updatePackageAppearance
  assert.equal(typeof update, 'function')
  const descriptor = familyPart('radial-capacitor'); descriptor.package.polarized = true
  const model = new Group(); addPackageModel(model, { id: 'C1', type: 'TEST', properties: { capacitanceFarads: 47e-6, voltageRatingVolts: 25 } }, descriptor)
  try {
    const body = model.getObjectByName('package-body'), stripe = model.getObjectByName('package-polarity-stripe'), marking = model.getObjectByName('package-property-marking')!
    assert.equal(marking.userData.text, '47 µF / 25 V')
    update!(model, { id: 'C1', type: 'TEST', properties: { capacitanceFarads: 100e-9, voltageRatingVolts: 50 } }, descriptor)
    assert.equal(marking.userData.text, '100 nF / 50 V')
    assert.equal(model.getObjectByName('package-body'), body); assert.equal(model.getObjectByName('package-polarity-stripe'), stripe)
  } finally { disposeObject(model) }
})

test('electrolytic value marking follows the sleeve curvature instead of floating across the can', () => {
  const model = buildComponent({ id: 'C1', type: 'CAPACITOR_ELECTROLYTIC' }), descriptor = partCatalog.find(part => part.editorType === 'CAPACITOR_ELECTROLYTIC')!
  try {
    const radius = Math.min(descriptor.package.bodyMm.x, descriptor.package.bodyMm.z) * .13 / 2.54 / 2
    const marking = model.getObjectByName('package-property-marking') as Mesh, positions = marking.geometry.getAttribute('position')
    model.updateMatrixWorld(true)
    for (let i = 0; i < positions.count; i++) {
      const point = marking.localToWorld(new Vector3().fromBufferAttribute(positions, i)), distance = Math.hypot(point.x, point.z)
      assert.ok(distance > radius && distance < radius + .001, 'printed value hugs the can with a small depth clearance')
    }
  } finally { disposeObject(model) }
})
