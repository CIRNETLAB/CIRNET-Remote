import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseLab,ContractValidationError} from '../src/contracts/validation'
import corpus from '../../../contracts/fixtures/instrument-control-conformance.json'

for(const entry of corpus.cases)test(`instrument acknowledgement shared ${entry.id}`,()=>{
  const name=entry.contract
  assert.ok(name==='InstrumentCommandRecord'||name==='InstrumentControlAccess')
  if(entry.valid)assert.deepEqual(parseLab(name,entry.value),entry.value)
  else assert.throws(()=>parseLab(name,entry.value),error=>error instanceof ContractValidationError&&error.issues.some(issue=>issue.code===entry.code&&issue.path===entry.path))
})
