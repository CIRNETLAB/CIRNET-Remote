import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {stopOwnedBackend} from './e2e-lifecycle.mjs'

function ownedProcess(exitCode){
 const source=exitCode===null
  ? "process.stdin.resume();setInterval(()=>{},1000);console.log('ready')"
  : `process.stdin.resume();process.stdin.on('end',()=>process.exit(${exitCode}));console.log('ready')`
 const child=spawn(process.execPath,['-e',source],{stdio:'pipe',windowsHide:true})
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))})
 const ready=new Promise((resolve,reject)=>{child.stdout.once('data',()=>resolve());child.once('error',reject);child.once('exit',()=>reject(new Error('The owned child exited before readiness.')))})
 return {child,closed,ready}
}

test('owned E2E shutdown delivers EOF and accepts only a successful real process exit',async()=>{
 const owned=ownedProcess(0)
 try {await owned.ready;assert.equal(await stopOwnedBackend(owned),0);assert.equal(owned.child.exitCode,0)}
 finally {if(owned.child.exitCode===null&&!owned.child.killed)owned.child.kill();await owned.closed}
})

test('a real API process that exits nonzero after EOF cannot pass the browser gate',async()=>{
 const owned=ownedProcess(7)
 try {await owned.ready;await assert.rejects(stopOwnedBackend(owned),/E2E API exited with status 7/);assert.equal(owned.child.exitCode,7)}
 finally {if(owned.child.exitCode===null&&!owned.child.killed)owned.child.kill();await owned.closed}
})

test('an unresponsive owned E2E process is killed after its existing bounded EOF grace',async()=>{
 const owned=ownedProcess(null)
 let reaped=false;void owned.closed.then(()=>{reaped=true})
 try {await owned.ready;await assert.rejects(stopOwnedBackend(owned,{timeoutMs:50}),/shutdown bound/);assert.equal(owned.child.killed,true);assert.equal(reaped,true,'The shutdown helper must await its owned child exit after killing it.')}
 finally {if(owned.child.exitCode===null&&!owned.child.killed)owned.child.kill();await owned.closed}
})

test('an unobserved child exit after kill reports a bounded reap failure',async()=>{
 let killed=false,ended=false
 const owned={child:{stdin:{end(){ended=true}},kill(){killed=true;return true}},closed:new Promise(()=>{})}
 await assert.rejects(stopOwnedBackend(owned,{timeoutMs:10,reapTimeoutMs:10}),/could not be reaped/)
 assert.equal(ended,true);assert.equal(killed,true)
})

