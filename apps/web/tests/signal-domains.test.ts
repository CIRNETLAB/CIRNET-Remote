import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainsCompatible, classifyGraph, validateSignalDomains } from '../src/electrical/signalDomains'
import type { CircuitGraph } from '../src/types/circuit'
import type { SignalDomain } from '../src/contracts/generated/dto'
import corpus from '../../../contracts/fixtures/signal-domains-conformance.json'
import { parseLab,ContractValidationError } from '../src/contracts/validation'

const graph=(type:string):CircuitGraph=>({schema_version:'1.1',circuit_id:'domains',modules:[{id:'U',type}],connections:[]})

test('clock compatibility is explicit and MIXED/unknown never grant direct compatibility',()=>{
  assert.equal(domainsCompatible('CLOCK','DIGITAL'),true)
  assert.equal(domainsCompatible('MIXED','DIGITAL'),false)
  assert.equal(domainsCompatible(undefined,'DIGITAL'),false)
  assert.equal(domainsCompatible('ANALOG','DIGITAL'),false)
})

test('known DC keeps its bounded dispatcher while unknown annotations cannot create a model',()=>{
  assert.equal(classifyGraph(graph('DC_SUPPLY')).kind,'DC_DIGITAL')
  assert.equal(classifyGraph(graph('CAPACITOR_CERAMIC')).kind,'ANALOG')
  const unknown=graph('NO_MODEL')
  unknown.modules[0]!.signal_domains={version:'1.0',ports:{OUT:'DIGITAL'}}
  assert.deepEqual(classifyGraph(unknown),{schema_version:'1.0',kind:'UNKNOWN',domains:[],unsupported_components:['U']})
})

test('recognized namespace cannot relabel catalog domains; unknown future metadata stays preserved',()=>{
  const value=graph('CLOCK')
  value.modules[0]!.signal_domains={version:'1.0',ports:{OUT:'ANALOG'}}
  assert.throws(()=>validateSignalDomains('CircuitGraph',value),/relabel/)
  value.modules[0]!.signal_domains={version:'2.0',custom:true}
  const before=JSON.stringify(value)
  validateSignalDomains('CircuitGraph',value)
  assert.equal(JSON.stringify(value),before)
  assert.throws(()=>classifyGraph(value),/version/)
})

test('shared corpus has identical browser classification and namespace issue paths',()=>{
  for(const item of corpus.compatibility)assert.equal(domainsCompatible(item.source as SignalDomain??undefined,item.destination as SignalDomain),item.compatible)
  for(const item of corpus.classification) {
    const value:CircuitGraph={schema_version:'1.1',circuit_id:'corpus',modules:item.modules,connections:[]}
    const before=JSON.stringify(value)
    assert.deepEqual(classifyGraph(value),{schema_version:'1.0',kind:item.kind,domains:item.domains,unsupported_components:item.unsupported_components},item.name)
    assert.equal(JSON.stringify(value),before)
  }
  for(const item of corpus.invalid_namespaces) {
    const value=graph(item.type);value.modules[0]!.signal_domains=item.namespace
    assert.throws(()=>parseLab('CircuitGraph',value,'structural'),error=>error instanceof ContractValidationError&&error.issues[0]?.code===item.code&&error.issues[0]?.path===item.path)
  }
})
