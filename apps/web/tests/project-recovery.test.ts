import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoundedRecoveryRepository, type RecoveryStorage, type RecoveryInput } from '../src/application/projects/recovery'
import { IndexedDbRecoveryStorage } from '../src/services/recovery/indexedDb'

class Storage implements RecoveryStorage {
  rows:unknown[]=[];fail=false
  async read() {return structuredClone(this.rows)}
  async update(change:(rows:unknown[])=>unknown[]) {const next=change(structuredClone(this.rows));if(this.fail) throw new Error('quota');this.rows=structuredClone(next)}
}
const draft=(id='draft',value=1):RecoveryInput=>({draftId:id,name:'Owned circuit',revision:3,
  graph:{schema_version:'1.1',circuit_id:'preserved-id',modules:[],connections:[],metadata:{value,custom:{untouched:true}}},
  binding:{documentId:'server-doc',projectId:'project',serverRevision:8}})

test('versioned recovery roundtrips only document fields and partitions every read by principal',async()=>{
  const storage=new Storage(),repository=new BoundedRecoveryRepository(storage,{clock:()=>123})
  const original=draft();await repository.save('alice',[{...original,csrf_token:'do-not-store',capture:{safety:'do-not-store'}} as RecoveryInput])
  original.graph.metadata={changed:true}
  assert.deepEqual(await repository.list('bob'),[]);assert.equal(await repository.load('bob','draft'),null)
  const restored=await repository.load('alice','draft')
  assert.equal(restored?.version,1);assert.equal(restored?.graph.circuit_id,'preserved-id')
  assert.deepEqual(restored?.graph.metadata,{value:1,custom:{untouched:true}})
  assert.equal(restored?.binding?.serverRevision,8);assert.equal(JSON.stringify(storage.rows).includes('do-not-store'),false)
})

test('entry/count/global byte bounds fail atomically and preserve previous recovery',async()=>{
  const storage=new Storage(),repository=new BoundedRecoveryRepository(storage,{maxPrincipalDrafts:1,maxTotalDrafts:2,maxDraftBytes:1000,maxTotalBytes:1500})
  await repository.save('alice',[draft()]);const before=structuredClone(storage.rows)
  await assert.rejects(repository.save('alice',[draft('second')]),/bound|limit/i);assert.deepEqual(storage.rows,before)
  const tooBig=draft();tooBig.graph.metadata={padding:'x'.repeat(1001)}
  await assert.rejects(repository.save('alice',[tooBig]),/bound|limit/i);assert.deepEqual(storage.rows,before)
  storage.fail=true;await assert.rejects(repository.save('alice',[draft('draft',2)]),/quota/)
  assert.deepEqual(storage.rows,before)
})

test('corrupt/future-version recovery is surfaced without deleting or returning its graph',async()=>{
  const storage=new Storage(),repository=new BoundedRecoveryRepository(storage)
  await repository.save('alice',[draft()]);const original=structuredClone(storage.rows)
  ;(storage.rows[0] as {version:number}).version=99
  await assert.rejects(repository.load('alice','draft'),/version|format/i);assert.equal((storage.rows[0] as {version:number}).version,99)
  storage.rows=original;(storage.rows[0] as {graph:unknown}).graph={schema_version:'1.1'}
  await assert.rejects(repository.load('alice','draft'));assert.equal(storage.rows.length,1)
})

test('guest transfer requires explicit confirmation and never overwrites a target principal draft',async()=>{
  const storage=new Storage(),repository=new BoundedRecoveryRepository(storage)
  await repository.save('guest',[draft()]);await repository.save('alice',[draft('draft',2)])
  await assert.rejects(repository.claim('guest','alice',false),/confirm/i)
  await assert.rejects(repository.claim('guest','alice',true),/conflict/i)
  assert.equal((await repository.load('guest','draft'))?.graph.metadata?.value,1)
  await repository.remove('alice','draft');await repository.claim('guest','alice',true)
  assert.deepEqual(await repository.list('guest'),[])
  assert.equal((await repository.load('alice','draft'))?.graph.metadata?.value,1)
})

test('IndexedDB is lazy and fails visibly when browser storage is unavailable',async()=>{
  let calls=0
  const storage=new IndexedDbRecoveryStorage({factory:()=>{calls++;return undefined}})
  assert.equal(calls,0)
  await assert.rejects(storage.read(),/unavailable/);assert.equal(calls,1)
})

test('IndexedDB put acknowledgement waits for transaction completion and propagates abort',async()=>{
  let complete!:(event:Event)=>void,abort!:(event:Event)=>void,getSuccess!:(event:Event)=>void
  const transaction={oncomplete:null,onabort:null,onerror:null,error:new Error('quota transaction abort'),
    objectStore:()=>({getAll:()=>{const request={result:[],onsuccess:null as ((event:Event)=>void)|null};
      queueMicrotask(()=>{getSuccess=request.onsuccess!});return request},clear:()=>undefined,put:()=>undefined})}
  const database={transaction:()=>{queueMicrotask(()=>{complete=transaction.oncomplete!;abort=transaction.onabort!});return transaction},close:()=>undefined,onversionchange:null}
  const factory={open:()=>{const request={result:database,onsuccess:null as ((event:Event)=>void)|null};
    queueMicrotask(()=>request.onsuccess?.(new Event('success')));return request}}
  const storage=new IndexedDbRecoveryStorage({factory:()=>factory as unknown as IDBFactory})
  let settled=false
  const write=storage.update(()=>[{principalId:'alice',draftId:'draft'}]).then(()=>{settled=true})
  for(let tick=0;tick<5;tick++) await Promise.resolve()
  getSuccess(new Event('success'));await Promise.resolve();assert.equal(settled,false)
  complete(new Event('complete'));await write;assert.equal(settled,true)
  const failure=storage.update(()=>[])
  for(let tick=0;tick<5;tick++) await Promise.resolve()
  getSuccess(new Event('success'));abort(new Event('abort'))
  await assert.rejects(failure,/quota transaction abort/)
})
