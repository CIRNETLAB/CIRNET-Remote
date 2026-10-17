import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CircuitGraph } from '../src/contracts/generated/dto'
import { parseEndpoint, resolveEndpoint } from '../src/electrical/endpoints'
import { resolveElectricalNets, assertConnectionAllowed } from '../src/electrical/nets'

function graph(): CircuitGraph { return { schema_version: '1.0', circuit_id: 'nets', modules: [
  { id: 'BB', type: 'BREADBOARD' }, { id: 'BB2', type: 'BREADBOARD' },
  { id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'S2', type: 'DIGITAL_SWITCH' }, { id: 'L', type: 'LED' },
  { id: 'M', type: 'MEMORY' },
], connections: [] } }
const hole = (id: string, board = 'BB') => `${board}.contact:${id}`

test('contact nets union intrinsic strips rails and explicit jumpers without geometry or direction', () => {
  const g = graph()
  g.connections = [
    { source: 'S.OUT', destination: hole('terminal:A:01') },
    { source: hole('terminal:E:01'), destination: hole('terminal:F:02') },
    { source: hole('terminal:J:02'), destination: 'L.IN' },
    { source: hole('rail:top-positive:01'), destination: hole('rail:top-positive:50') },
    { source: hole('terminal:A:01', 'BB2'), destination: hole('terminal:E:01', 'BB2') },
  ]
  const nets = resolveElectricalNets(g)
  assert.equal(nets.endpointNetIds['S.OUT'], nets.endpointNetIds['L.IN'])
  assert.notEqual(nets.endpointNetIds['S.OUT'], nets.endpointNetIds[hole('terminal:A:01', 'BB2')])
  assert.equal(nets.endpointNetIds[hole('rail:top-positive:01')], nets.endpointNetIds[hole('rail:top-positive:50')])
  const swapped = { ...g, modules: [...g.modules].reverse(), connections: [...g.connections].reverse().map(c => ({ source: c.destination, destination: c.source })) }
  assert.deepEqual(resolveElectricalNets(swapped), nets)
  assert.equal(resolveEndpoint(g.modules, hole('terminal:A:01'))?.direction, null)
  assert.equal(parseEndpoint('BB.contact:terminal:A:01')?.kind, 'contact')
  assert.equal(parseEndpoint('BB.bad.extra'), null)
})

test('authoring prevents hidden drivers and bus/contact mistakes atomically while retaining logical rules', () => {
  const g = graph()
  assert.deepEqual(assertConnectionAllowed(g, 'L.IN', 'S.OUT'), { source: 'S.OUT', destination: 'L.IN', reversed: true })
  assert.throws(() => assertConnectionAllowed(g, 'S.OUT', 'S2.OUT'), /output|driver/i)
  assert.throws(() => assertConnectionAllowed(g, 'M.DATA_OUT', hole('terminal:A:01')), /width|scalar/i)
  assert.throws(() => assertConnectionAllowed(g, hole('terminal:A:64'), 'L.IN'), /known|contact/i)
  g.connections.push({ source: 'S.OUT', destination: hole('terminal:A:01') })
  assert.throws(() => assertConnectionAllowed(g, 'S2.OUT', hole('terminal:E:01')), /driver/i)
  assert.throws(() => assertConnectionAllowed(g, hole('terminal:A:01'), 'S.OUT'), /already/i)
  assert.doesNotThrow(() => assertConnectionAllowed(g, hole('terminal:A:01'), hole('terminal:E:01')))
  assert.throws(() => assertConnectionAllowed(g, 'L.IN', 'L.IN'), /different/i)
  assert.equal(resolveEndpoint(g.modules, 'BB.OUT'), null)
})

test('legacy logical input ownership still rejects a second passive terminal connection', () => {
  const g = graph(); g.modules.push({ id: 'R', type: 'RESISTOR' })
  g.connections.push({ source: 'R.A', destination: 'L.IN' })
  assert.throws(() => assertConnectionAllowed(g, 'R.B', 'L.IN'), /driver/i)
})
