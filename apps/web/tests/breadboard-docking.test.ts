import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Raycaster, Vector3 } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { snapPosition } from '../src/composables/useCircuitEditor'
import type { CircuitModule } from '../src/contracts/generated/dto'
import { getBreadboardGeometrySpec } from '../src/geometry/BreadboardGeometrySpec'
import { breadboardBodiesOverlap, isMechanicalBreadboardDock } from '../src/geometry/breadboardDocking'
import { createSceneManager } from '../src/three/SceneManager'

const types = ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100'] as const
const depths = [2.66, 1.86, .52]
const directions = [new Vector3(0, 0, -1), new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(-1, 0, 0)]
const up = new Vector3(0, 1, 0)

// Raycast the production housing rather than asserting its catalog center spacing.
function seam(a: ReturnType<typeof buildComponent>, b: ReturnType<typeof buildComponent>, normal: Vector3, tangent: Vector3, sample: number, y: number) {
  const origin = a.position.clone().addScaledVector(tangent, sample).setY(y)
  const aHit = new Raycaster(origin.clone().addScaledVector(normal, 20), normal.clone().negate()).intersectObject(a, true)[0]
  const bHit = new Raycaster(origin.clone().addScaledVector(normal, -20), normal).intersectObject(b, true)[0]
  assert.ok(aHit && bHit, 'both real housing surfaces must be present')
  return { a: aHit.point, b: bHit.point, gap: bHit.point.clone().sub(aHit.point).dot(normal) }
}

test('docked housing straight edges leave at most a tiny seam at body and near-deck heights in every direction', () => {
  for (const rotation of [0, 90, 180, 270]) {
    for (const direction of directions) {
      for (let first = 0; first < types.length; first++) for (let second = 0; second < types.length; second++) {
        const normal = direction.clone().applyAxisAngle(up, rotation * Math.PI / 180)
        const tangent = new Vector3(direction.z === 0 ? 0 : 1, 0, direction.z === 0 ? 1 : 0).applyAxisAngle(up, rotation * Math.PI / 180)
        const distance = direction.z === 0 ? 9 : (depths[first] + depths[second]) / 2
        const fixed: CircuitModule = { id: 'A', type: types[first], rotation, position: { x: 0, y: 0, z: 0 } }
        const raw = normal.clone().multiplyScalar(distance + .1).addScaledVector(tangent, .1)
        const position = snapPosition(raw, true, [fixed], types[second], null, 0, rotation)
        const a = buildComponent(fixed), b = buildComponent({ id: 'B', type: types[second], rotation, position })
        try {
          for (const y of [.04, .2, .327]) {
            const result = seam(a, b, normal, tangent, direction.z === 0 ? .235 : 1, y)
            assert.ok(result.gap >= -2e-6 && result.gap <= .002, `${types[first]}/${types[second]}, yaw ${rotation}, side ${direction.toArray()}, y ${y}: gap ${result.gap}`)
          }
        } finally { disposeObject(a); disposeObject(b) }
      }
    }
  }
})

test('incompatible quarter-turned joints cannot be treated as an AABB mechanical dock', () => {
  const fixed: CircuitModule = { id: 'A', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }
  for (const rotation of [90, 180, 270]) {
    const position = snapPosition({ x: 0, z: rotation === 180 ? 2.66 : 5.83 }, true, [fixed], 'BREADBOARD', null, 0, rotation)
    const a = buildComponent(fixed), b = buildComponent({ id: 'B', type: 'BREADBOARD', rotation, position })
    try {
      for (const sample of [-.185, -.15, 0, .15, .185]) {
        const { gap } = seam(a, b, new Vector3(0, 0, 1), new Vector3(1, 0, 0), sample, .2)
        assert.ok(gap >= -2e-6, `yaw ${rotation} must not push a mismatched tab into plastic: ${gap}`)
      }
    } finally { disposeObject(a); disposeObject(b) }
  }
})

test('a 2-column 3-row breadboard cluster has uniform horizontal and vertical rendered seams without drift', () => {
  const modules: CircuitModule[] = [], models: ReturnType<typeof buildComponent>[] = []
  try {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const position = snapPosition({ x: col * 9 + .1, z: row * 2.66 + .1 }, true, modules, 'BREADBOARD')
      const module = { id: `${row}-${col}`, type: 'BREADBOARD', position }
      modules.push(module); models.push(buildComponent(module))
      assert.deepEqual(position, { x: col * 9, y: 0, z: row * 2.66 })
    }
    for (let row = 0; row < 3; row++) {
      const { gap } = seam(models[row * 2], models[row * 2 + 1], new Vector3(1, 0, 0), new Vector3(0, 0, 1), .7, .327)
      assert.ok(gap >= -2e-6 && gap <= .002, `vertical seam ${row}: ${gap}`)
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const { gap } = seam(models[row * 2 + col], models[(row + 1) * 2 + col], new Vector3(0, 0, 1), new Vector3(1, 0, 0), 1, .327)
      assert.ok(gap >= -2e-6 && gap <= .002, `horizontal seam ${row}/${col}: ${gap}`)
    }
  } finally { models.forEach(disposeObject) }
})

test('all mating keys retain small clearance without any plastic intersection along the seam', () => {
  for (const direction of directions) for (const type of types) {
    const fixed: CircuitModule = { id: 'A', type, position: { x: 0, y: 0, z: 0 } }
    const distance = direction.z === 0 ? 9 : depths[types.indexOf(type)]
    const position = snapPosition(direction.clone().multiplyScalar(distance + .1), true, [fixed], type)
    const incoming: CircuitModule = { id: 'B', type, position }, a = buildComponent(fixed), b = buildComponent(incoming)
    try {
      assert.equal(isMechanicalBreadboardDock(fixed, incoming), true)
      assert.equal(breadboardBodiesOverlap(fixed, incoming), false)
      assert.deepEqual(a.userData.selectionProfile, getBreadboardGeometrySpec(type)!.outline.map(p => [p.x, p.z]))
      const tangent = new Vector3(direction.z === 0 ? 0 : 1, 0, direction.z === 0 ? 1 : 0)
      const centers = direction.z === 0 ? [0] : [-2.7, 0, 2.7]
      for (const center of centers) for (const offset of [0, -.185, -.159, -.125, .125, .159, .185]) for (const y of [.04, .2, .327]) {
        const { gap } = seam(a, b, direction, tangent, center + offset, y)
        assert.ok(gap >= -2e-6 && gap < .006, `${type}/${direction.toArray()}/${center + offset}/${y}: ${gap}`)
      }
    } finally { disposeObject(a); disposeObject(b) }
  }
})

test('mechanical docking follows both local frames at arbitrary yaw, rejects mismatched joints and another occupied board', () => {
  const normal = new Vector3(0, 0, 1).applyAxisAngle(up, 37 * Math.PI / 180)
  const fixed: CircuitModule = { id: 'A', type: 'BREADBOARD_630', rotation: 37, position: { x: 1, y: 0, z: 2 } }
  const raw = normal.clone().multiplyScalar(1.19 + .1).add(new Vector3(1, 0, 2))
  const position = snapPosition(raw, true, [fixed], 'BREADBOARD_100', null, 0, 37)
  const incoming: CircuitModule = { id: 'B', type: 'BREADBOARD_100', rotation: 37, position }
  assert.equal(isMechanicalBreadboardDock(fixed, incoming), true)
  assert.equal(breadboardBodiesOverlap(fixed, incoming), false)
  assert.deepEqual(snapPosition(position, true, [fixed], incoming.type, null, 0, 37), position, 'a valid dock cannot be pushed away by its joint envelope')
  assert.equal(isMechanicalBreadboardDock(fixed, { ...incoming, rotation: 127 }), false)
  const snapshot = JSON.stringify([fixed, incoming])
  const another = { id: 'C', type: incoming.type, rotation: 37, position: snapPosition(raw, true, [fixed, incoming], incoming.type, null, 0, 37) }
  assert.equal(breadboardBodiesOverlap(another, incoming), false)
  assert.equal(breadboardBodiesOverlap(another, fixed), false)
  assert.equal(JSON.stringify([fixed, incoming]), snapshot)
})

test('docking via an axis handle preserves the locked coordinate even near the mating tolerance', () => {
  const fixed = { id: 'A', type: 'BREADBOARD_630', position: { x: 0, y: 0, z: 0 } }
  const position = snapPosition({ x: 8.9, z: .0001 }, true, [fixed], fixed.type, null, 0, 0, 'x')
  assert.equal(position.z, .0001)
  assert.equal(position.x, 9)
  assert.equal(breadboardBodiesOverlap(fixed, { id: 'B', type: fixed.type, position }), false)
})

test('real housing seam edges remain below one pixel in TOP and oblique camera views', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1100, 720)
  const modules: CircuitModule[] = []
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) modules.push({ id: `${row}-${col}`, type: 'BREADBOARD', position: snapPosition({ x: col * 9 + .1, z: row * 2.66 + .1 }, true, modules, 'BREADBOARD') })
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'cluster', modules, connections: [] }); manager.fitCircuit()
    const models = [...manager.models.values()]
    for (const view of ['TOP', 'TOP-FRONT', 'TOP-BACK-RIGHT']) {
      manager.setViewOrientation(view, false)
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const edge = seam(models[row * 2 + col], models[(row + 1) * 2 + col], new Vector3(0, 0, 1), new Vector3(1, 0, 0), 1, .327)
        const a = manager.project(edge.a), b = manager.project(edge.b)
        assert.ok(a.visible && b.visible)
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .15, `${view}: horizontal rendered seam stays subpixel`)
      }
      for (let row = 0; row < 3; row++) {
        const edge = seam(models[row * 2], models[row * 2 + 1], new Vector3(1, 0, 0), new Vector3(0, 0, 1), .7, .327)
        const a = manager.project(edge.a), b = manager.project(edge.b)
        assert.ok(a.visible && b.visible)
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .15, `${view}: vertical rendered seam stays subpixel`)
      }
    }
  } finally { manager.dispose() }
})

test('an imported fractional pose and non-quarter yaw retain exact mating planes after snapping', () => {
  const fixed: CircuitModule = { id: 'A', type: 'BREADBOARD_630', rotation: 37, position: { x: 1.234567, y: 0, z: 2.345678 } }
  const incoming: CircuitModule = { id: 'B', type: fixed.type, rotation: 37, position: snapPosition({ x: 2.4141244453780146, z: 3.9110035996926937 }, true, [fixed], fixed.type, null, 0, 37) }
  const a = buildComponent(fixed), b = buildComponent(incoming)
  try {
    const normal = new Vector3(0, 0, 1).applyAxisAngle(up, 37 * Math.PI / 180), tangent = new Vector3(1, 0, 0).applyAxisAngle(up, 37 * Math.PI / 180)
    const { gap } = seam(a, b, normal, tangent, 1, .2)
    assert.ok(gap >= -2e-6 && gap <= .002, `mating position rounding cannot move plastic through its neighbor: ${gap}`)
  } finally { disposeObject(a); disposeObject(b) }
})

test('far pointer-follow over 500 settled boards stays within a CPU frame budget', (t) => {
  const modules: CircuitModule[] = Array.from({ length: 500 }, (_, i) => ({ id: `B${i}`, type: types[i % 3], position: { x: i % 20 * 12, y: 0, z: Math.floor(i / 20) * 4 } }))
  const samples: number[] = []
  for (let i = 0; i < 17; i++) {
    const start = performance.now()
    const position = snapPosition({ x: 500, z: 500 }, true, modules, 'BREADBOARD')
    const elapsed = performance.now() - start
    assert.deepEqual(position, { x: 500, y: 0, z: 500 })
    if (i >= 5) samples.push(elapsed)
  }
  const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]
  t.diagnostic(`500 settled boards: ${median.toFixed(2)} ms pointer CPU median`)
  assert.ok(median < 16, `far pointer-follow must not rebuild all candidate housing geometry: ${median.toFixed(2)} ms CPU median`)
})

test('settled housing geometry responds to in-place move, rotate and type changes', () => {
  const fixed = { id: 'A', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
  const moving = { id: 'B', type: 'BREADBOARD', position: { x: 0, y: 0, z: 2.66 }, rotation: 0 }
  assert.equal(isMechanicalBreadboardDock(fixed, moving), true)
  moving.position.z = 0
  assert.equal(breadboardBodiesOverlap(fixed, moving), true)
  moving.position.z = 2.66; moving.rotation = 90
  assert.equal(breadboardBodiesOverlap(fixed, moving), true)
  moving.rotation = 0; moving.type = 'BREADBOARD_100'; moving.position.z = 1.59
  assert.equal(isMechanicalBreadboardDock(fixed, moving), true)
  assert.equal(breadboardBodiesOverlap(fixed, moving), false)
})

test('a constrained axis keeps its transverse coordinate and exact rotated mating plane', () => {
  const fixed: CircuitModule = { id: 'A', type: 'BREADBOARD_630', rotation: 37, position: { x: 1.234567, y: 0, z: 2.345678 } }
  const normal = new Vector3(1, 0, 0).applyAxisAngle(up, 37 * Math.PI / 180), tangent = new Vector3(0, 0, 1).applyAxisAngle(up, 37 * Math.PI / 180)
  const raw = new Vector3(fixed.position!.x, 0, fixed.position!.z).addScaledVector(normal, 9)
  raw.x += .1; raw.z += .0001
  const position = snapPosition(raw, true, [fixed], fixed.type, null, 0, 37, 'x')
  assert.equal(position.z, raw.z)
  const a = buildComponent(fixed), b = buildComponent({ id: 'B', type: fixed.type, rotation: 37, position })
  try {
    const { gap } = seam(a, b, normal, tangent, .7, .2)
    assert.ok(gap >= -2e-6 && gap <= .002, `axis locking cannot move a tilted mating plane into plastic: ${gap}`)
  } finally { disposeObject(a); disposeObject(b) }
})
