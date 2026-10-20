import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync,mkdirSync,mkdtempSync,writeFileSync,rmSync } from 'node:fs'
import { dirname,resolve,relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const gate=resolve('scripts/check-boundaries.mjs')
function audit(files:Record<string,string>) {
  const workspace=resolve('.test-build/boundary-fixtures');mkdirSync(workspace,{recursive:true})
  const directory=mkdtempSync(resolve(workspace,'case-'))
  try {
    for(const [file,contents] of Object.entries(files)) {
      const target=resolve(directory,file);assert.ok(!relative(directory,target).startsWith('..'))
      mkdirSync(dirname(target),{recursive:true});writeFileSync(target,contents)
    }
    return spawnSync(process.execPath,[gate,directory],{encoding:'utf8'})
  } finally {
    assert.ok(relative(workspace,directory).startsWith('case-'))
    rmSync(directory,{recursive:true,force:true})
  }
}
test('the executable AST dependency gate is available to developers and CI',()=>{
  assert.equal(existsSync(gate),true,'Web dependency boundary gate has not been implemented')
})
test('pure document dependencies may cross pure barrels and use locally named document values',()=>{
  const result=audit({'domain/document.ts':"import {copy} from '../rules/index'; export const run=()=>{const document={value:1};return copy(document.value)}",
    'rules/index.ts':"export {copy} from './copy'",'rules/copy.ts':'export const copy=(value:number)=>value'})
  assert.equal(result.status,0,result.stderr+result.stdout)
})
test('core imports are checked transitively through type-only barrels',()=>{
  const result=audit({'domain/document.ts':"import type {Port} from '../ports/index'; export type Document=Port",
    'ports/index.ts':"export type {Ref as Port} from 'vue'"})
  assert.equal(result.status,1,result.stderr+result.stdout)
  assert.match(result.stdout,/domain\/document.ts.*ports\/index.ts.*vue/)
})
test('renderer transport dependencies are rejected through local re-exports',()=>{
  const result=audit({'three/Renderer.ts':"import {run} from '../presentation/index'; export {run}",
    'presentation/index.ts':"export {run} from '../services/api/experiments'",'services/api/experiments.ts':'export const run=()=>0'})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/renderer.*services\/api\/experiments/i)
})
test('direct global network and DOM access cannot enter a pure core',()=>{
  const result=audit({'domain/document.ts':"export function bad(){fetch('/api');return document.body}"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/fetch/);assert.match(result.stdout,/document/)
})
test('a nonliteral dynamic import cannot conceal a core dependency',()=>{
  const result=audit({'domain/document.ts':"export const load=(path:string)=>import(path)"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/dynamic import/i)
})
test('an unresolved relative source dependency fails closed instead of ending traversal',()=>{
  const result=audit({'domain/document.ts':"export {save} from '../services/api/missing'"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/unresolved relative source/i)
})
test('runtime store cycles are found while pure type references remain legal',()=>{
  const failed=audit({'stores/experiment.ts':"import {instrument} from './instrument';export const experiment=()=>instrument()",
    'stores/instrument.ts':"import {experiment} from './experiment';export const instrument=()=>experiment()"})
  assert.equal(failed.status,1,failed.stderr+failed.stdout);assert.match(failed.stdout,/store cycle.*experiment.*instrument/i)
  const passed=audit({'stores/a.ts':"import type {B} from './b';export interface A {b:B}",
    'stores/b.ts':"import type {A} from './a';export interface B {a:A}"})
  assert.equal(passed.status,0,passed.stderr+passed.stdout)
})
test('browser imports cannot reach a private hardware/RPC client',()=>{
  const result=audit({'components/View.vue':"<script setup lang='ts'>import {client} from '../services/hardware_client';client()</script>",
    'services/hardware_client.ts':"import {Socket} from 'node:net';export const client=()=>new Socket()"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/browser.*hardware_client/i)
})
test('renderer code cannot bypass transport ports with direct network globals or packages',()=>{
  for(const source of ["export const load=()=>fetch('/api/experiments')","export const load=()=>new WebSocket('ws://localhost')","import client from 'axios';export {client}"]) {
    const result=audit({'three/Renderer.ts':source})
    assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/renderer/)
  }
})
test('nonliteral dynamic imports reachable from a store cannot hide a runtime cycle',()=>{
  const result=audit({'stores/a.ts':"const path='./b';export const load=()=>import(path)",
    'stores/b.ts':"import {load} from './a';export {load}"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/store.*dynamic import/i)
})
test('computed browser-global access is checked in a pure core',()=>{
  const result=audit({'domain/document.ts':"export const load=()=>globalThis['fetch']('/api')"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/core.*fetch/)
})
test('legacy unprefixed Node transport modules cannot enter a browser',()=>{
  const result=audit({'services/client.ts':"import {connect} from 'net';export {connect}"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/browser.*net/)
})

test('Vue union literals, comments and template text are not imports',()=>{
  const result=audit({'components/Title.vue':`<script setup lang="ts">type Action='import' | 'export'; // import 'invented'
    const label="from 'invented'"</script><template>import 'invented'</template>`})
  assert.equal(result.status,0,result.stderr+result.stdout)
})

test('every application controller is covered by core dependency policy',()=>{
  for(const name of ['experimentLifecycle.ts','remoteConnection.ts','remotePolling.ts','labApplication.ts','assignments/authoring.ts','instruments/commands.ts']) {
    const result=audit({['application/'+name]:"export {ref} from 'vue'"})
    assert.equal(result.status,1,`${name}: ${result.stderr}${result.stdout}`)
    assert.match(result.stdout,/core.*vue/)
  }
})

test('an unlisted external transport package cannot bypass the pure core through a different package name',()=>{
  const result=audit({'application/remotePolling.ts':"import request from 'cross-fetch'; export const load=()=>request('/api')"})
  assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/core.*cross-fetch/)
  const pure=audit({'domain/json.ts':"export {parse} from 'lossless-json'"})
  assert.equal(pure.status,0,pure.stderr+pure.stdout)
})
