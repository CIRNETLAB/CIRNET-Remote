import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultLabelProperties, normalizeLabelProperties, validateLabelProperties } from '../src/data/labelProperties'
import { normalizeComponentProperties, validateComponentProperties } from '../src/data/componentProperties'
import { classifyGraph } from '../src/electrical/signalDomains'
import { parseLab } from '../src/contracts/validation'

test('labels retain Vietnamese and literal markup as bounded plain text without electrical domain', () => {
  const properties = normalizeLabelProperties({ text: 'Điện trở < 1 kΩ\nhttps://example.test/ chỉ là chữ', boardId: 'B' })
  assert.equal(properties.fontSizeMm, 3)
  assert.deepEqual(validateLabelProperties(properties), [])
  assert.deepEqual(normalizeComponentProperties('LABEL', { ...properties }), properties)
  assert.equal(defaultLabelProperties.text, 'Hello')
  const classification = classifyGraph({ schema_version: '1.2', circuit_id: 'label', modules: [{ id: 'B', type: 'BREADBOARD' }, { id: 'L', type: 'LABEL', properties: { ...properties } }], connections: [] })
  assert.equal(classification.kind, 'DIGITAL'); assert.deepEqual(classification.unsupported_components, [])
})

test('label bounds count Unicode codepoints and reject extra fields, controls, lines and invalid colors', () => {
  assert.equal(normalizeLabelProperties({ text: '😀'.repeat(256) }).text, '😀'.repeat(256))
  for (const patch of [{ text: '😀'.repeat(257) }, { text: '1\n2\n3\n4\n5' }, { text: 'x\r' }, { text: 'x\0' }, { version: 2 }, { fontSizeMm: 1.99 }, { fontSizeMm: 6.01 }, { fontSizeMm: true }, { textColor: 'red' }, { backgroundColor: '#fff' }, { paddingMm: 2 }, { boardId: '' }, { widthMm: 99 }, { html: '<b>bad</b>' }]) {
    assert.ok(validateLabelProperties({ ...defaultLabelProperties, ...patch }).length)
    assert.ok(validateComponentProperties('LABEL', { ...defaultLabelProperties, ...patch }).length)
    assert.throws(() => normalizeLabelProperties(patch))
  }
  assert.notEqual(normalizeLabelProperties({}), normalizeLabelProperties({}))
})

test('Label graph semantics reject stale associations, physical mounting and fake electrical ports', () => {
  const graph = { schema_version: '1.2' as const, circuit_id: 'label-semantics', modules: [{ id: 'B', type: 'BREADBOARD' }, { id: 'L', type: 'LABEL', properties: { ...defaultLabelProperties, boardId: 'B' } }], connections: [] }
  assert.deepEqual(parseLab('AnySupportedCircuitGraph', graph), graph)
  for (const change of ['board', 'port', 'mount', 'physicalDescriptor', 'font']) {
    const candidate = structuredClone(graph) as { schema_version: '1.2'; circuit_id: string; modules: Record<string, unknown>[]; connections: { source: string; destination: string }[] }
    if (change === 'board') candidate.modules[1]!.properties = { ...defaultLabelProperties, boardId: 'missing' }
    else if (change === 'port') candidate.connections.push({ source: 'L.OUT', destination: 'B.contact:terminal:a:1' })
    else if (change === 'font') candidate.modules[1]!.properties = { ...defaultLabelProperties, fontSizeMm: 7 }
    else candidate.modules[1]![change] = {}
    assert.throws(() => parseLab('AnySupportedCircuitGraph', candidate))
    assert.throws(() => classifyGraph(candidate as unknown as Parameters<typeof classifyGraph>[0]))
  }
})

test('Label board associations support every canonical board and the historical 830 alias', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_830', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const graph = { schema_version: '1.2' as const, circuit_id: 'label-board', modules: [{ id: 'B', type }, { id: 'L', type: 'LABEL', properties: { ...defaultLabelProperties, boardId: 'B' } }], connections: [] }
    assert.deepEqual(parseLab('AnySupportedCircuitGraph', graph), graph)
  }
})

test('Label preserves unknown, unavailable digital, analog and mixed classifications', () => {
  for (const modules of [[{ id: 'U', type: 'NO_MODEL' }], [{ id: 'G', type: 'SN7400N' }], [{ id: 'C', type: 'CAPACITOR_CERAMIC' }], [{ id: 'C', type: 'CAPACITOR_CERAMIC' }, { id: 'D', type: 'DIGITAL_SWITCH' }]]) {
    const original = { schema_version: '1.2' as const, circuit_id: 'unsupported-note', modules, connections: [] }
    const annotated = { ...original, modules: [...modules, { id: 'L', type: 'LABEL', properties: { ...defaultLabelProperties } }] }
    assert.deepEqual(classifyGraph(annotated), classifyGraph(original))
  }
})
