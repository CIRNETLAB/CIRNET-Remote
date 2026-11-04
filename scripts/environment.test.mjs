import {test} from 'node:test'
import assert from 'node:assert/strict'
import {exportEnvironment} from './environment.mjs'

test('current empty settings take precedence and aliases do not mutate caller input',()=>{
  const input=Object.freeze({NETCIRCUIT_INTERFACE_ROOT:'old',CIRNET_INTERFACE_ROOT:'',PATH:'unchanged'})
  const selected=exportEnvironment(input)
  assert.equal(selected.CIRNET_INTERFACE_ROOT,'')
  assert.equal(selected.NETCIRCUIT_INTERFACE_ROOT,'')
  assert.equal(input.NETCIRCUIT_INTERFACE_ROOT,'old')
  assert.equal(selected.PATH,'unchanged')
})

test('old-only settings are exported to both prefixes for released child tools',()=>{
  assert.deepEqual(exportEnvironment({NETCIRCUIT_E2E_DATA_DIR:'external'}),{
    CIRNET_E2E_DATA_DIR:'external',NETCIRCUIT_E2E_DATA_DIR:'external'})
})
