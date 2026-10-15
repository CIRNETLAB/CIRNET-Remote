import test from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, MeshStandardMaterial } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import { parseExecutionPresentationResult, type ExecutionPresentationAdapter } from '../src/services/execution/presentation'
import type { CircuitGraph } from '../src/types/circuit'

test('an execution adapter can drive the existing renderer result channel without an engine or electrical frontend logic', async () => {
  const graph: CircuitGraph = { schema_version: '1.1', circuit_id: 'adapter', modules: [{ id: 'D1', type: 'LED_LTL307EE' }], connections: [] }
  const adapter: ExecutionPresentationAdapter = async () => parseExecutionPresentationResult({ device_states: { D1: { state: 'ON' } }, pin_values: { 'D1.A': 1 }, diagnostics: ['Externally observed state'] })
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.syncGraph(graph)
    const lens = manager.models.get('D1')!.getObjectByName('package-body') as Mesh<any, MeshStandardMaterial>
    assert.equal(lens.material.emissiveIntensity, 0)
    const result = await adapter(graph)
    manager.setSimulationStates(result.device_states)
    assert.ok(lens.material.emissiveIntensity > 0)
    assert.equal(result.pin_values['D1.A'], 1)
    assert.deepEqual(result.diagnostics, ['Externally observed state'])
    manager.setSimulationStates(null)
    assert.equal(lens.material.emissiveIntensity, 0)
  } finally { manager.dispose() }
})

test('presentation result parser rejects malformed states and nonfinite reported values', () => {
  for (const value of [null, {}, { device_states: { D1: { state: 1 } }, pin_values: {}, diagnostics: [] },
    { device_states: { D1: { state: 'ON', currentAmps: Infinity } }, pin_values: {}, diagnostics: [] },
    { device_states: {}, pin_values: {}, diagnostics: [true] }]) assert.throws(() => parseExecutionPresentationResult(value))
})
