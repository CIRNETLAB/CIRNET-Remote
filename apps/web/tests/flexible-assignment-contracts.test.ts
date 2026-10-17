import {test} from 'node:test'
import assert from 'node:assert/strict'
import corpus from '../../../contracts/fixtures/assignment-v2-conformance.json'
import {parseLab,ContractValidationError} from '../src/contracts/validation'
import type {ContractMap} from '../src/contracts/generated/dto'

for(const item of corpus.cases)test(`assignment 2.0 parity: ${item.id}`,()=>{
 if(item.valid)assert.deepEqual(parseLab(item.contract as keyof ContractMap,item.value),item.value)
 else assert.throws(()=>parseLab(item.contract as keyof ContractMap,item.value),(error:unknown)=>{
  assert.ok(error instanceof ContractValidationError)
  if('code' in item){assert.equal(error.issues[0]!.code,item.code);assert.equal(error.issues[0]!.path,item.path)}
  return true
 })
})
