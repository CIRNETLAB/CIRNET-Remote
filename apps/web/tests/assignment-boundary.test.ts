import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseLab,ContractValidationError} from '../src/contracts/validation'

const definition=()=>({schema_version:'1.0',assignment_id:'a',title:'Assignment',lab_endpoints:[{endpoint_id:'source',role:'INPUT_SOURCE'}],assessment_policy:'FUNCTIONAL_ONLY'})
test('authoring definition wrappers apply shared endpoint semantics with prefixed paths',()=>{
  const value=definition();value.lab_endpoints.push({...value.lab_endpoints[0]!})
  assert.throws(()=>parseLab('AssignmentAuthoringCreate',{definition:value}),error=>error instanceof ContractValidationError&&error.issues[0]?.code==='DUPLICATE_ID'&&error.issues[0].path==='/definition/lab_endpoints/1/endpoint_id')
})
test('authoring document identities and published selections cannot contradict their definition',()=>{
  const value={schema_version:'1.0',assignment_id:'a',title:'Assignment',owner_id:'owner',revision:2,published:true,published_revision:3,feedback_policy:'observed_only',created_at:1,updated_at:1,definition:definition()}
  assert.throws(()=>parseLab('AssignmentAuthoringDocument',value),/published revision/i)
  value.published_revision=2;value.definition.assignment_id='other'
  assert.throws(()=>parseLab('AssignmentAuthoringDocument',value),/identity/i)
})
