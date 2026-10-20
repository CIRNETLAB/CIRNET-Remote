import test from 'node:test'
import assert from 'node:assert/strict'
import { PendingObservationLedger,type ObservationStorage } from '../src/application/operations/pendingObservations'

function fixture(limits={}) {
  let value:string|null=null,now=Date.now()
  const storage:ObservationStorage={read:()=>value,write:next=>{value=next}}
  const ledger=new PendingObservationLedger(storage,{clock:()=>now,...limits})
  return {ledger,storage,raw:()=>value,advance:(milliseconds:number)=>{now+=milliseconds}}
}
test('observation ledger persists minimal principal-scoped identities across reload and account changes',()=>{
  const h=fixture(),alice=h.ledger.scope('alice'),bob=h.ledger.scope('bob')
  alice.begin({kind:'run',key:'request-1',experimentId:'e1'})
  alice.unknown('request-1')
  assert.equal(alice.list()[0]?.status,'unknown');assert.deepEqual(bob.list(),[])
  const reloaded=new PendingObservationLedger(h.storage).scope('alice')
  assert.equal(reloaded.list()[0]?.key,'request-1')
  const raw=JSON.parse(h.raw()!)
  assert.deepEqual(Object.keys(raw[0]).sort(),['createdAt','experimentId','expiresAt','key','kind','principalId','status'].sort())
  assert.doesNotMatch(h.raw()!,/cookie|csrf|approval|configuration|circuit_graph/)
  alice.complete('request-1');assert.deepEqual(alice.list(),[])
})
test('quota and expiry are bounded, terminal cleanup and forgetting affect only local tracking',()=>{
  const h=fixture({maxPrincipalRecords:1,maxRecords:2,maxAgeMs:100}),alice=h.ledger.scope('alice'),bob=h.ledger.scope('bob')
  alice.begin({kind:'create',key:'a'})
  assert.throws(()=>alice.begin({kind:'run',key:'b',experimentId:'e1'}),/limit/)
  bob.begin({kind:'stop',key:'b',experimentId:'e2'})
  alice.forget('a');assert.equal(bob.list().length,1)
  alice.begin({kind:'create',key:'c'});h.advance(101)
  assert.deepEqual(alice.list(),[]);assert.deepEqual(bob.list(),[])
  alice.begin({kind:'create',key:'d'});assert.equal(alice.list().length,1)
})
test('storage failure and corrupt or oversized data fail explicitly without leaking raw contents',()=>{
  const failed=new PendingObservationLedger({read:()=>null,write:()=>{throw new Error('private storage failure')}}).scope('alice')
  assert.throws(()=>failed.begin({kind:'create',key:'a'}),/tracking|storage/i)
  for(const raw of ['{private graph', 'x'.repeat(70_000)]){
    const scope=new PendingObservationLedger({read:()=>raw,write:()=>{}}).scope('alice')
    assert.throws(()=>scope.list(),/tracking|storage/i)
  }
})

test('shared storage transactions serialize cross-tab identities and cannot resurrect a completed record',async()=>{
  let value:string|null=null,reads=0
  const queue:Array<()=>void>=[]
  const storage:ObservationStorage={read:()=>{reads++;return value},write:next=>{value=next},
    transaction:action=>new Promise<void>((resolve,reject)=>queue.push(()=>{try{action();resolve()}catch(error){reject(error)}}))}
  const first=new PendingObservationLedger(storage).scope('alice'),second=new PendingObservationLedger(storage).scope('alice')
  const a=first.begin({kind:'create',key:'a'}),b=second.begin({kind:'create',key:'b'})
  assert.equal(reads,0,'no tab may read a stale snapshot while waiting for its exclusive transaction')
  queue.shift()!();await a;queue.shift()!();await b
  assert.deepEqual(first.list().map(row=>row.key),['a','b'])
  const unknown=second.unknown('a'),complete=first.complete('a'),later=second.begin({kind:'create',key:'c'})
  queue.shift()!();await unknown;queue.shift()!();await complete;queue.shift()!();await later
  assert.deepEqual(first.list().map(row=>row.key),['b','c'])
  const staleUnknown=second.unknown('a');queue.shift()!();await staleUnknown
  assert.deepEqual(first.list().map(row=>row.key),['b','c'],'a later unknown update must not recreate an acknowledged identity')
  const forgotten=first.forget('b');queue.shift()!();await forgotten
  assert.deepEqual(second.list().map(row=>row.key),['c'])
})
