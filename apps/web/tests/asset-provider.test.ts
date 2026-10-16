import { test,mock } from 'node:test'
import assert from 'node:assert/strict'
import { AssetProvider, type AssetDescriptor } from '../src/application/assets/AssetProvider'

const descriptor:AssetDescriptor={url:'/owned.glb',revision:'revision-1',maxBytes:2_000_000}
function deferred<T>() {let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}

test('asset references deduplicate load/decode but isolate instance resources and dispose exactly once',async()=>{
  const pending=deferred<{id:number}>(),disposed:number[]=[];let loads=0,serial=1
  const provider=new AssetProvider({load:async()=>{loads++;return pending.promise},clone:()=>({id:++serial}),dispose:(resource:{id:number})=>disposed.push(resource.id)})
  const first=provider.acquire(descriptor),second=provider.acquire(descriptor)
  pending.resolve({id:1});const [one,two]=await Promise.all([first.ready,second.ready])
  assert.equal(loads,1);assert.notEqual(one,two)
  first.release();first.release();assert.deepEqual(disposed,[one.id])
  second.release();assert.deepEqual(disposed,[one.id,two.id,1]);provider.dispose();assert.equal(disposed.length,3)
})

test('one cancelled consumer cannot abort another; final cancellation aborts and late decode is disposed',async()=>{
  const pending=deferred<{id:number}>(),disposed:number[]=[];let signal!:AbortSignal
  const provider=new AssetProvider({load:async(_asset,request)=>{signal=request;return pending.promise},clone:(resource:{id:number})=>({...resource}),dispose:(resource:{id:number})=>disposed.push(resource.id)})
  const first=provider.acquire(descriptor),second=provider.acquire(descriptor)
  const cancelled=assert.rejects(first.ready,/cancel/i);first.release();await cancelled
  assert.equal(signal.aborted,false)
  const last=assert.rejects(second.ready,/cancel/i);second.release();await last;assert.equal(signal.aborted,true)
  pending.resolve({id:9});await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.deepEqual(disposed,[9]);provider.dispose()
})

test('revision changes load a separate asset and provider disposal cancels active consumers',async()=>{
  const loads:string[]=[],disposed:string[]=[]
  const provider=new AssetProvider({load:async(asset)=>{loads.push(asset.revision);return {id:asset.revision}},clone:(value:{id:string})=>({...value}),dispose:(value:{id:string})=>disposed.push(value.id)})
  const first=provider.acquire(descriptor),second=provider.acquire({...descriptor,revision:'revision-2'})
  await Promise.all([first.ready,second.ready]);assert.deepEqual(loads,['revision-1','revision-2'])
  provider.dispose();assert.deepEqual(disposed.sort(),['revision-1','revision-1','revision-2','revision-2'])
  assert.throws(()=>provider.acquire(descriptor),/disposed/i)
})

test('failed asset loads are visible and can be retried; cache/reference bounds reject excess work',async()=>{
  let calls=0
  const provider=new AssetProvider({load:async()=>{calls++;if(calls===1) throw new Error('decode failed');return 4},clone:(value:number)=>value,dispose:()=>{}},{maxEntries:1,maxReferences:1})
  const first=provider.acquire(descriptor);await assert.rejects(first.ready,/decode failed/);first.release()
  const retry=provider.acquire(descriptor);assert.equal(await retry.ready,4)
  assert.throws(()=>provider.acquire({...descriptor,revision:'other'}),/bound|limit/i)
  retry.release();provider.dispose()
})

test('failed loads automatically release reference budgets and abort listeners without a caller release',async()=>{
  let calls=0
  const provider=new AssetProvider({load:async()=>{calls++;if(calls===1)throw new Error('actual decode error');return 2},clone:(value:number)=>value,dispose:()=>{}},{maxReferences:1})
  const request=new AbortController(),remove=mock.method(request.signal,'removeEventListener')
  const failed=provider.acquire(descriptor,request.signal);await assert.rejects(failed.ready,/actual decode error/)
  assert.equal(remove.mock.callCount(),1)
  const retry=provider.acquire(descriptor);assert.equal(await retry.ready,2)
  failed.release();retry.release();provider.dispose();remove.mock.restore()
})

test('a stricter byte bound cannot borrow an asset admitted under a larger bound',async()=>{
  const bounds:number[]=[]
  const provider=new AssetProvider({load:async(asset)=>{bounds.push(asset.maxBytes);if(asset.maxBytes<3)throw new Error('byte bound');return 3},clone:(value:number)=>value,dispose:()=>{}})
  const relaxed=provider.acquire(descriptor);await relaxed.ready
  const strict=provider.acquire({...descriptor,maxBytes:1})
  await assert.rejects(strict.ready,/byte bound/);assert.deepEqual(bounds,[descriptor.maxBytes,1])
  relaxed.release();provider.dispose()
})
