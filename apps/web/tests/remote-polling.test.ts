import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotReconciler } from '../src/services/websocket/reconcile'
import { deferred } from './helpers/capture'

const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve()}
test('automatic fallback polls only after completion, coalesces resync bursts, backs off failures and cancels timers',async()=>{
  const controller=new AbortController(),first=deferred<void>(),scheduled:{callback:()=>void;delay:number;cancelled:boolean}[]=[]
  let calls=0,concurrent=0,maximum=0
  const failures:unknown[]=[]
  const polling=createSnapshotReconciler({signal:controller.signal,automatic:true,intervalMs:3_000,maxDelayMs:12_000,
    schedule(callback,delay){const item={callback,delay,cancelled:false};scheduled.push(item);return item},cancel(timer){timer.cancelled=true},
    async refresh(){maximum=Math.max(maximum,++concurrent);try{calls++;if(calls===1)await first.promise;else if(calls<=3)throw new Error('offline')}finally{concurrent--}},onError:error=>failures.push(error)})
  polling.request();polling.request();polling.request();assert.equal(calls,1);assert.equal(scheduled.length,0)
  first.resolve();await settle();assert.equal(calls,2);assert.equal(maximum,1)
  assert.equal(scheduled.at(-1)?.delay,3_000)
  polling.request();assert.equal(calls,2,'event bursts must respect failure backoff')
  scheduled.at(-1)!.callback();await settle();assert.equal(calls,3);assert.equal(scheduled.at(-1)?.delay,6_000)
  scheduled.at(-1)!.callback();await settle();assert.equal(calls,4);assert.equal(scheduled.at(-1)?.delay,3_000)
  controller.abort();assert.equal(scheduled.at(-1)?.cancelled,true);polling.request();assert.equal(calls,4);assert.equal(failures.length,2)
})
