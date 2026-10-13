import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useExperimentStore } from '../src/stores/experiment'
import type { ExperimentRecord } from '../src/types/lab'
import { parseExperiment } from '../src/services/api/experiments'
import { parseServerEvent } from '../src/services/websocket/events'
import { loadSfc, mountSfc, type HostNode } from './helpers/vueSfc'

beforeEach(() => setActivePinia(createPinia()))

function record(): ExperimentRecord {
  return { schema_version: '1.0', experiment_id: 'e1', circuit_id: 'c1', station_id: 'physical', assignment_id: 'a1',
    mode: 'hardware', state: 'COMPLETE', state_history: ['CREATED', 'COMPLETE'], revision: 10,
    execution_decision: { schema_version: '1.0', decision: 'RUN_NORMAL', reasons: ['Safe executable circuit'] },
    safety_verification: { schema_version: '1.0', status: 'SAFE', issues: [], notes: ['Protection evidence present'] },
    topology_verification: { schema_version: '1.0', status: 'MISMATCH', issues: ['Pin nets differ'],
      missing_components: [{ identity: '74HC08', count: 2 }], unexpected_components: [{ identity: '74HC32', component_id: 'S2' }],
      unknown_components: [{ identity: 'UNKNOWN', component_id: 'S3' }],
      missing_nets: [{ reference_nodes: ['REF_N1'], observed_nodes: [], reference_pins: ['R1.1', 'R2.2'], observed_pins: [] }],
      unexpected_nets: [{ reference_nodes: [], observed_nodes: ['STUDENT_N42'], reference_pins: [], observed_pins: ['S1.1', 'S2.3'] }],
      pin_mapping_differences: [{ reference_component_id: 'R1', observed_component_id: 'S1', pin_id: '1', issue: 'Electrical pin net differs' }] },
    topology_resolution: { schema_version: '1.0', status: 'RESOLVED', component_matches: [],
      endpoint_bindings: [{ endpoint_id: 'output', observed_node_id: 'STUDENT_N42', source: 'COMPONENT_PIN', confidence: 0.9 }], issues: [] },
    functional_verification: { schema_version: '1.0', status: 'FAIL', issues: ['Output differs'],
      expected_signals: [{ signal: 'output', time_ns: 20, value: 1 }], observed_signals: [{ signal: 'output', time_ns: 20, value: 'X' }],
      mismatched_signals: [{ signal: 'output', time_ns: 20, expected: 1, observed: 'X' }, { signal: 'missing', time_ns: 30, expected: 0, observed: null }],
      expected_truth_table: [{ inputs: { A: 1, B: 1 }, outputs: { output: 1 } }],
      observed_truth_table: [{ case_index: 0, inputs: { A: 1, B: 1 }, outputs: { output: 'X' }, time_ns: 20, status: 'FAIL' }] },
    assessment: { schema_version: '1.0', policy: 'FUNCTIONAL_ONLY', status: 'FAIL', topology_evaluated: false, function_evaluated: true, issues: [] },
    capture: null, error_code: null, queue_position: null, lease_expires_at: null }
}

const textOf = (node: HostNode): string => [node.text, ...node.children.map(textOf)].join(' ')
async function inspector(value: ExperimentRecord) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useExperimentStore(); store.activeId = value.experiment_id; store.receive(value)
  return mountSfc(await loadSfc('components/windows/InspectorWindow.vue'), pinia)
}

test('Inspector renders structured teaching evidence and independent SAFE MISMATCH FAIL results', async () => {
  const mounted = await inspector(record())
  try {
    for (const [kind, status] of [['safety', 'SAFE'], ['topology', 'MISMATCH'], ['function', 'FAIL']]) {
      const section = mounted.find('section', 'aria-label', kind + ' verification')
      assert.ok(section, kind + ' evidence section is missing')
      assert.equal(section.props['data-status'], status)
    }
    for (const evidence of ['Protection evidence present', 'Missing component', '74HC08', '2', 'Unexpected component', '74HC32',
      'Unknown component', 'S3', 'Missing net', 'R1.1', 'Unexpected net', 'S2.3', 'Pin mapping difference',
      'Electrical pin net differs', 'STUDENT_N42', '90%', 'Expected signals', 'Observed signals', 'Signal mismatch',
      'No response', 'Expected truth table', 'Observed truth table', 'FUNCTIONAL_ONLY']) {
      assert.ok(mounted.text().includes(evidence), 'missing evidence: ' + evidence)
    }
    const mismatch = mounted.find('table', 'aria-label', 'Signal mismatches')
    assert.ok(mismatch); assert.ok(textOf(mismatch).includes('X')); assert.ok(textOf(mismatch).includes('20'))
  } finally { mounted.app.unmount() }
})

test('SAFE UNKNOWN NO_RESPONSE reports guarded execution independently of grading', async () => {
  const value = record()
  value.topology_verification = { schema_version: '1.0', status: 'UNKNOWN', issues: [] }
  value.functional_verification = { schema_version: '1.0', status: 'NO_RESPONSE', issues: [] }
  value.execution_decision!.decision = 'RUN_GUARDED'
  const mounted = await inspector(value)
  try {
    assert.equal(mounted.find('section', 'aria-label', 'safety verification')?.props['data-status'], 'SAFE')
    assert.equal(mounted.find('section', 'aria-label', 'topology verification')?.props['data-status'], 'UNKNOWN')
    assert.equal(mounted.find('section', 'aria-label', 'function verification')?.props['data-status'], 'NO_RESPONSE')
    assert.ok(mounted.text().includes('RUN_GUARDED')); assert.ok(!mounted.text().includes('BLOCK_SAFETY'))
  } finally { mounted.app.unmount() }
})

test('UNSAFE short displays driver evidence and blocked execution', async () => {
  const value = record()
  value.safety_verification = { schema_version: '1.0', status: 'UNSAFE', issues: ['Short detected'],
    power_shorts: [{ node_ids: ['VCC', 'GND'], message: 'Measured power short' }] }
  value.execution_decision = { schema_version: '1.0', decision: 'BLOCK_SAFETY', reasons: ['Short detected'] }
  const mounted = await inspector(value)
  try {
    assert.equal(mounted.find('section', 'aria-label', 'safety verification')?.props['data-status'], 'UNSAFE')
    for (const text of ['BLOCK_SAFETY', 'Measured power short', 'VCC', 'GND']) assert.ok(mounted.text().includes(text))
  } finally { mounted.app.unmount() }
})

test('ambiguous resolution displays uncertainty without inventing a physical binding', async () => {
  const value = record()
  value.topology_resolution = { schema_version: '1.0', status: 'AMBIGUOUS', endpoint_bindings: [], component_matches: [],
    issues: ['Multiple valid mappings'], confidence: 0.5 }
  value.execution_decision = { schema_version: '1.0', decision: 'BLOCK_UNEXECUTABLE', reasons: ['Required endpoint unresolved'] }
  const mounted = await inspector(value)
  try {
    const resolution = mounted.find('section', 'aria-label', 'Topology resolution')
    assert.ok(resolution); assert.equal(resolution.props['data-status'], 'AMBIGUOUS')
    for (const text of ['Multiple valid mappings', '50%', 'Unresolved locations are not inferred', 'BLOCK_UNEXECUTABLE']) assert.ok(mounted.text().includes(text))
    assert.ok(!textOf(resolution).includes('STUDENT_N42'))
    // A fresh event replaces uncertainty without retaining stale bindings.
    const updated = record(); updated.revision = 11
    useExperimentStore().receive(updated); await nextTick()
    assert.ok(textOf(resolution).includes('STUDENT_N42'))
  } finally { mounted.app.unmount() }
})

test('HTTP and websocket mapping preserve rich results and reject malformed feedback', () => {
  const value = record()
  assert.deepEqual(parseExperiment(value), value)
  const event = parseServerEvent({ type: 'experiment.updated', experiment: value })
  assert.ok(event && event.type === 'experiment.updated'); assert.deepEqual(event.experiment, value)
  const bad = record(); bad.topology_resolution!.endpoint_bindings[0].confidence = 2
  assert.throws(() => parseExperiment(bad))
  assert.equal(parseServerEvent({ type: 'experiment.updated', experiment: bad }), null)
})
