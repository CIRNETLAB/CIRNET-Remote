import test from 'node:test'
import assert from 'node:assert/strict'
import {browserPendingObservations} from '../src/services/recovery/pendingObservations'

test('browser tracking requires actual Web Locks and performs storage reads only inside its exclusive callback',async()=>{
 const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
 let raw:string|null=null,held=false,reads=0
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{assert.equal(held,true);reads++;return raw},setItem:(_key:string,value:string)=>{assert.equal(held,true);raw=value}}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}})
  const scope=browserPendingObservations.scope('alice')
  await assert.rejects(scope.begin({kind:'create',key:'unsupported'}) as Promise<void>,/requires Web Locks/)
  assert.equal(reads,0);assert.equal(raw,null)
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name:string,options:{mode:string},action:()=>void)=>{
   assert.equal(name,'netcircuit.pending-observations.v1');assert.equal(options.mode,'exclusive');held=true
   try{action()}finally{held=false}
  }}}})
  await scope.begin({kind:'create',key:'supported'});await scope.unknown('supported');await scope.complete('supported');await scope.forget('supported')
  assert.equal(reads,4);assert.equal(raw,'[]')
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name:string,options:{ifAvailable?:boolean},action:(lock:null)=>void)=>{
   assert.equal(options.ifAvailable,true);action(null)
  }}}})
  await assert.rejects(scope.begin({kind:'stop',key:'stop',experimentId:'e1'},{ifAvailable:true}) as Promise<void>,/lock is unavailable/)
  await assert.rejects(scope.complete('stop',{ifAvailable:true}) as Promise<void>,/lock is unavailable/)
  assert.equal(reads,4,'contested Stop tracking must not read outside a granted lock')
 }finally{
  if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else Reflect.deleteProperty(globalThis,'navigator')
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage')
 }
})
