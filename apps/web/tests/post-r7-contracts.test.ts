import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLab } from '../src/types/labValidation'

const graph = () => ({schema_version:'1.0',scan_id:'s',nodes:[{node_id:'N1'},{node_id:'N2'}],
  connections:[{node_ids:['N1','N2']}],components:[{component_id:'U1',kind:'OBSERVED_PHYSICAL_COMPONENT',
    identity:'74HC08',node_ids:['N1','N2'],pins:[{pin_id:'1',node_id:'N1'},{pin_id:'2',node_id:'N2'}]}],ambiguities:[]})

test('browser validates pin-level evidence and rejects impossible node/pin/opaque observations',()=>{
  assert.deepEqual(parseLab('DetectedTopologyGraph',graph()),graph())
  const missing=graph();missing.components[0].pins[0].node_id='missing'
  const duplicate=graph();duplicate.components[0].pins[1].pin_id='1'
  const opaque=graph();opaque.components[0].kind='OPAQUE_PHYSICAL_COMPONENT'
  const connection=graph();connection.connections[0].node_ids=['N1','N1']
  for(const value of [missing,duplicate,opaque,connection]) assert.throws(()=>parseLab('DetectedTopologyGraph',value))
})

test('browser distinguishes fixed/reference bindings, channel 1 and resolution evidence',()=>{
  assert.deepEqual(parseLab('LabEndpoint',{endpoint_id:'x',role:'INPUT_SOURCE',reference_node_id:'REF_1'}),
    {endpoint_id:'x',role:'INPUT_SOURCE',reference_node_id:'REF_1'})
  assert.throws(()=>parseLab('LabEndpoint',{endpoint_id:'x',role:'INPUT_SOURCE',node_id:'N1',design_port:'X.OUT'}))
  assert.throws(()=>parseLab('LabEndpoint',{endpoint_id:'s',role:'SCOPE',channel:0}))
  assert.doesNotThrow(()=>parseLab('LabEndpoint',{endpoint_id:'s',role:'SCOPE',channel:1}))
  assert.doesNotThrow(()=>parseLab('TopologyResolutionResult',{schema_version:'1.0',status:'PARTIAL',component_matches:[],
    endpoint_bindings:[{endpoint_id:'x',observed_node_id:'STUDENT_N42',source:'COMPONENT_PIN'}],issues:['Some unresolved endpoints']}))
})

test('browser rejects invalid reference CircuitGraph even within a valid assignment envelope',()=>{
  const assignment={schema_version:'1.0',assignment_id:'a',title:'a',lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}
  assert.throws(()=>parseLab('AssignmentDefinition',{...assignment,reference_design_graph:{schema_version:'1.0'}}))
})
