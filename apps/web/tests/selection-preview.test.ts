import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import type { CircuitConnection, CircuitGraph, WireIdentity } from '../src/types/circuit'
import { createSceneManager } from '../src/three/SceneManager'
import { createSelectionPreview } from '../src/three/SelectionPreview'

function fixture() {
  const wire = (source: string, destination: string, layer: number, anchors: [number, number][]): CircuitConnection => ({
    source: `BB.contact:terminal:A:${source}`, destination: `BB.contact:terminal:J:${destination}`,
    metadata: { wireVisual: { version: 1, color: '#8656a8', routeMode: 'FREE', thickness: .052, layer,
      controlPoints: anchors.map(([x, z]) => ({ space: 'world', position: { x, y: .8, z } })),
    } },
  })
  const base = wire('01', '63', 0, [[-3, 0], [3, 0]])
  const first = wire('20', '20', 1, [[-1, -1], [-1, 1]])
  const second = wire('40', '40', 2, [[1, -1], [1, 1]])
  const candidate: CircuitGraph = { schema_version: '1.1', circuit_id: 'preview-layout', modules: [
    { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } },
    { id: 'COPY', type: 'CLOCK', position: { x: 0, y: 0, z: 3.6 }, rotation: 0, properties: { frequency_hz: 1000 } },
  ], connections: [base, first, second] }
  return { candidate, base, first, second, selection: { moduleIds: ['COPY'], wires: [first, second] } }
}

function scene() {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1000, 700)
  manager.camera.position.set(0, 12, 0); manager.camera.lookAt(0, 0, 0)
  return manager
}

function wireMesh(root: Object3D, wire: WireIdentity) {
  let found: Mesh | undefined
  root.traverse(node => {
    if (node instanceof Mesh && node.userData.kind === 'wire' && !node.userData.wireTerminal && node.userData.source === wire.source && node.userData.destination === wire.destination) found = node
  })
  assert.ok(found, `missing wire mesh ${wire.source} -> ${wire.destination}`)
  return found
}

test('selected ghost wires retain committed crossing geometry while unselected context wires stay hidden', () => {
  const { candidate, base, first, second, selection } = fixture()
  const preview = createSelectionPreview(), actual = scene(), filtered = scene()
  const before = JSON.stringify(candidate)
  try {
    actual.syncGraph(candidate)
    filtered.syncGraph({ ...candidate, connections: [first, second] })
    preview.show(candidate, selection, true)
    assert.equal(wireMesh(preview.root, base).visible, false, 'committed context affects layout without appearing in the ghost')
    for (const wire of [first, second]) {
      const ghost = wireMesh(preview.root, wire), committed = wireMesh(actual.wires, wire), missingContext = wireMesh(filtered.wires, wire)
      assert.equal(ghost.visible, true)
      assert.deepEqual(ghost.geometry.getAttribute('position').array, committed.geometry.getAttribute('position').array, 'ghost tube matches the complete candidate after commit')
      assert.notDeepEqual(ghost.geometry.getAttribute('position').array, missingContext.geometry.getAttribute('position').array, 'fixture detects layout that omits the crossing committed wire')
      assert.ok(actual.wireRoute(wire)!.renderPoints!.some(point => Math.abs(point.z) < .05 && point.y > .85), 'selected crossing receives a local bridge above the .8 baseline')
    }
    assert.equal(JSON.stringify(candidate), before, 'rendering does not change candidate graph data')
  } finally { preview.dispose(); actual.dispose(); filtered.dispose() }
})

test('selection ghosts do not register models or alter committed picking and wire records', () => {
  const { candidate, base, selection } = fixture(), manager = scene(), preview = createSelectionPreview()
  const committed: CircuitGraph = { ...candidate, modules: candidate.modules.filter(module => module.id !== 'COPY'), connections: [base] }
  const before = JSON.stringify(committed)
  try {
    manager.syncGraph(committed)
    const point = manager.project(new Vector3(0, 0, 3.6))
    assert.equal(manager.pick(point.x, point.y), null)
    preview.show(candidate, selection, true); manager.scene.add(preview.root)
    assert.equal(preview.root.userData.ignorePick, true)
    assert.deepEqual([...manager.models.keys()], ['BB'])
    assert.equal(manager.wires.children.length, 1)
    assert.equal(manager.pick(point.x, point.y), null, 'visible ghost bodies remain outside committed picking')
    assert.equal(manager.wireRoute(selection.wires[0]), null, 'ghost connections stay outside committed routing records')
    assert.equal(JSON.stringify(committed), before)
  } finally { preview.dispose(); manager.dispose() }
})

test('pose and validity updates reuse ghost geometry and clear releases owned model and wire resources once', () => {
  const { candidate, first, selection } = fixture(), preview = createSelectionPreview(), parent = new Group()
  parent.add(preview.root)
  try {
    preview.show(candidate, selection, true)
    const model = preview.root.children.find(child => child.userData.id === 'COPY') as Group
    assert.ok(model)
    const body = model.children.find(child => child instanceof Mesh && child.userData.selectionSurface) as Mesh
    const wire = wireMesh(preview.root, first), geometry = body.geometry, wireGeometry = wire.geometry
    const material = body.material as MeshStandardMaterial
    let modelDisposals = 0, materialDisposals = 0, wireDisposals = 0
    geometry.addEventListener('dispose', () => modelDisposals++)
    material.addEventListener('dispose', () => materialDisposals++)
    wireGeometry.addEventListener('dispose', () => wireDisposals++)
    const moved: CircuitGraph = { ...candidate, modules: candidate.modules.map(module => module.id === 'COPY' ? { ...module, position: { x: 1, y: .25, z: 3 }, rotation: 90 } : module) }
    preview.show(moved, selection, false)
    assert.equal(preview.root.children.find(child => child.userData.id === 'COPY'), model)
    assert.equal(body.geometry, geometry); assert.equal(wire.geometry, wireGeometry)
    assert.deepEqual(model.position.toArray(), [1, .25, 3]); assert.equal(model.rotation.y, Math.PI / 2)
    assert.equal(material.color.getHexString(), 'ff5959')
    assert.equal((wire.material as MeshStandardMaterial).color.getHexString(), 'ff5959')
    assert.equal(material.opacity, .42); assert.equal(material.depthWrite, false)
    assert.equal(preview.root.userData.valid, false)
    assert.deepEqual([modelDisposals, materialDisposals, wireDisposals], [0, 0, 0])
    preview.clear()
    assert.equal(preview.root.visible, false); assert.equal(model.parent, null)
    assert.deepEqual([modelDisposals, materialDisposals, wireDisposals], [1, 1, 1])
    preview.clear(); preview.dispose()
    assert.equal(preview.root.parent, null)
    assert.deepEqual([modelDisposals, materialDisposals, wireDisposals], [1, 1, 1], 'repeated cleanup cannot dispose released resources again')
  } finally { preview.dispose() }
})
