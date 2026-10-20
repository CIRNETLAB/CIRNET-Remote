import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLab } from '../src/types/labValidation'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { parseMemoryImage } from '../src/services/files/memoryImage'
import type { CaptureMetadata } from '../src/types/lab'
import { ApiError, createApiClient } from '../src/services/api/client'
import type { ContractMap } from '../src/contracts/generated/dto'
import type { ValidationProfile } from '../src/contracts/validation'
import conformance from '../../../contracts/fixtures/conformance.json'
import diagnostics from '../../../contracts/fixtures/diagnostics.json'

const graph = (number: string, location = 'metadata') => location === 'metadata'
  ? `{"schema_version":"1.0","circuit_id":"precision","modules":[],"connections":[],"metadata":{"value":${number}}}`
  : `{"schema_version":"1.0","circuit_id":"precision","modules":[{"id":"L","type":"LED","position":{"x":${number}}}],"connections":[]}`

test('shared canonical diagnostics preserve code, JSON Pointer and profile',()=>{
  for(const item of diagnostics.cases) {
    const name=item.contract as keyof ContractMap,profile=item.profile as ValidationProfile
    if(item.valid){assert.deepEqual(parseLab(name,item.value,profile),item.value);continue}
    assert.throws(()=>parseLab(name,item.value,profile),(error:unknown)=>{
      const issues=(error as {issues?:{code:string;path:string;profile:string}[]}).issues
      return !!issues?.some(issue=>issue.code===item.issue?.code&&issue.path===item.issue.path&&issue.profile===profile)
    },item.id)
  }
})

test('editor import rejects numeric schema versions without coercion', () => {
  assert.throws(() => parseCircuitFile('{"schema_version":1.1,"circuit_id":"numeric-version","modules":[],"connections":[]}'))
})

test('editor import rejects integer literals whose value would be rounded by JSON.parse', () => {
  for (const literal of ['9007199254740993', '-9007199254740993', '9007199254740993e0', '9007199254740993.0']) {
    for (const location of ['metadata', 'position']) assert.throws(() => parseCircuitFile(graph(literal, location)), /precision|represent|integer/i)
  }
  const safe = parseCircuitFile(graph('9007199254740991'))
  assert.equal(safe.metadata?.value, 9007199254740991)
})

test('editor import preserves decimal values and finite extreme floating rotation', () => {
  const value = parseCircuitFile('{"schema_version":"1.0","circuit_id":"finite","modules":[{"id":"L","type":"LED","rotation":1.7976931348623157e308,"position":{"x":0.125}}],"connections":[]}')
  assert.equal(value.modules[0].rotation, Number.MAX_VALUE)
  assert.equal(value.modules[0].position?.x, 0.125)
  assert.throws(() => parseCircuitFile(graph('1e309', 'position')))
})

test('generated graph validation preserves opaque extensions while enforcing mount conditionals', () => {
  const input = { schema_version: '1.0', circuit_id: 'opaque', modules: [{ id: 'U', type: 'future', extension: { revision: 2 } }], connections: [], metadata: { futureVisual: { version: 12 } } }
  assert.deepEqual(parseLab('CircuitGraph', input), input)
  assert.throws(() => parseLab('CircuitGraph', { ...input, modules: [{ id: 'U', type: 'future', mount: {}, position: { x: 1 } }] }))
})

test('canonical wire visual validation preserves legacy point extension fields', () => {
  const visual = { version: 1, color: '#71b3ce', routeMode: 'FREE', thickness: 0.036,
    controlPoints: [{ space: 'world', position: { x: 1, y: 0.3, z: 2, annotation: { retained: true } }, future: 'keep' }] }
  assert.deepEqual(parseLab('WireVisual', visual, 'editor'), visual)
})

test('contract failures provide structured paths and remain independent of HTTP error classes', () => {
  assert.throws(() => parseLab('LabEndpoint', { endpoint_id: 's', role: 'SCOPE', channel: 0 }), (error: unknown) => {
    assert.ok(error instanceof Error)
    const failure = error as Error & { code?: string; issues?: { path: string; profile: string; code: string; severity: string }[] }
    assert.equal(failure.name, 'ContractValidationError')
    assert.equal(failure.code, 'INVALID_RESPONSE')
    assert.ok(failure.issues?.some(issue => issue.path === '/channel' && issue.profile && issue.code && issue.severity === 'error'))
    return true
  })
})

test('generated memory shape and data-length semantics reject malformed images without coercion', () => {
  assert.deepEqual(parseMemoryImage('{"version":"1.0","word_bits":8,"depth":2,"data":[0,255]}'), { version: '1.0', word_bits: 8, depth: 2, data: [0, 255] })
  for (const value of [
    '{"version":"1.0","word_bits":8,"depth":2,"data":[0]}',
    '{"version":"1.0","word_bits":8,"depth":1,"data":[true]}',
    '{"version":"1.0","word_bits":8,"depth":1,"data":["0"]}',
  ]) assert.throws(() => parseMemoryImage(value))
})

test('HTTP adapter preserves structured contract failures as invalid responses', async () => {
  const client = createApiClient({ fetcher: async () => new Response('{"endpoint_id":"s","role":"SCOPE","channel":0}', { headers: { 'Content-Type': 'application/json' } }) })
  await assert.rejects(client.request('/endpoint', { parse: value => parseLab('LabEndpoint', value) }), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'INVALID_RESPONSE')
    assert.ok(error.detail && typeof error.detail === 'object' && 'issues' in error.detail)
    return true
  })
})

test('browser contract registry reports unsupported private contracts explicitly', () => {
  assert.throws(() => Reflect.apply(parseLab, undefined, ['InstrumentationExecutionPlan', {}]), (error: unknown) =>
    error instanceof Error && error.name === 'ContractValidationError' && 'issues' in error &&
    Array.isArray(error.issues) && error.issues.some(issue => issue.code === 'UNKNOWN_CONTRACT'))
})

for (const entry of conformance.cases) {
  if('visibility' in entry&&entry.visibility==='internal') continue
  test(`shared conformance: ${entry.id}`, () => {
    const name = entry.contract as keyof ContractMap, profile = entry.profile as ValidationProfile
    const before = structuredClone(entry.value)
    if (entry.valid) {
      assert.deepEqual(parseLab(name, entry.value, profile), before)
      assert.deepEqual(entry.value, before, 'validation must not normalize its input')
    } else {
      assert.throws(() => parseLab(name, entry.value, profile), (error: unknown) => {
        assert.ok(error instanceof Error && error.name === 'ContractValidationError')
        if ('issue' in entry && entry.issue) {
          const failure = error as Error & { issues: { code: string; path: string; profile: string }[] }
          assert.ok(failure.issues.some(issue => issue.code === entry.issue.code && issue.path === entry.issue.path && issue.profile === profile), JSON.stringify(failure.issues))
        }
        return true
      })
    }
  })
}

// Compile-time regressions: names determine DTOs; callers cannot choose a wire shape.
function parserTypes(value: unknown) {
  const endpoint = parseLab('LabEndpoint', value)
  const identity: string = endpoint.endpoint_id
  // @ts-expect-error Unknown public contract names cannot bypass validation.
  parseLab('NotAContract', value)
  // @ts-expect-error Private execution plans are not browser contracts.
  parseLab('InstrumentationExecutionPlan', value)
  // @ts-expect-error Internal station routing maps are not browser contracts.
  parseLab('StationCapabilities', value)
  // @ts-expect-error A caller cannot select a DTO unrelated to the contract name.
  parseLab<CaptureMetadata>('GeneratorConfiguration', value)
  // @ts-expect-error A typed HTTP result requires a runtime parser.
  createApiClient().request<CaptureMetadata>('/capture')
  return identity
}
void parserTypes
