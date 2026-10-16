import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseBitAssignments,parseAuthoringDefinition,copyReferenceDesign } from '../src/application/assignments/authoring'
import type { AssignmentDefinition,CircuitGraph } from '../src/contracts/generated/dto'
const definition:AssignmentDefinition={schema_version:'1.0',assignment_id:'and-lab',title:'AND exercise',lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}
test('assignment bit fields accept explicit binary values and reject duplicate or ambiguous inputs',()=>{
  assert.deepEqual(parseBitAssignments('x=0, Y.IN=1'),{x:0,'Y.IN':1})
  for(const text of ['x=true','x=2','x=0,x=1','missing','x=','x=0,'])assert.throws(()=>parseBitAssignments(text))
})
test('authoring definition parser validates the public contract and preserves nested reference metadata without rounding integers',()=>{
  const value={...definition,reference_design_graph:{schema_version:'1.0',circuit_id:'reference',modules:[],connections:[],metadata:{unknown:{keep:true}}}}
  assert.deepEqual(parseAuthoringDefinition(JSON.stringify(value)),value)
  assert.throws(()=>parseAuthoringDefinition(JSON.stringify({...definition,schema_version:1})))
  assert.throws(()=>parseAuthoringDefinition('{"schema_version":"1.0","assignment_id":"a","title":"A","lab_endpoints":[],"assessment_policy":"FUNCTIONAL_ONLY","expected_behavior":{"expected_signals":[{"signal":"y","time_ns":9007199254740993,"value":1}]}}'))
})
test('using the editor design as an instructor reference takes an independent validated snapshot',()=>{
  const graph:CircuitGraph={schema_version:'1.0',circuit_id:'student-editor',modules:[],connections:[],metadata:{nested:{value:1}}}
  const snapshot=copyReferenceDesign(definition,graph)
  ;(graph.metadata!.nested as {value:number}).value=2
  assert.equal(((snapshot.reference_design_graph!.metadata as {nested:{value:number}}).nested).value,1)
  assert.deepEqual(definition.lab_endpoints,[]);assert.equal(definition.reference_design_graph,undefined)
  assert.throws(()=>copyReferenceDesign(definition,{...graph,modules:[{id:'duplicate',type:'LED'},{id:'duplicate',type:'LED'}]}))
})
