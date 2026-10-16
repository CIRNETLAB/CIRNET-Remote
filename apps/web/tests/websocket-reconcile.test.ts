import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotReconciler } from '../src/services/websocket/reconcile'
import { deferred } from './helpers/capture'

test('snapshot resync coalesces a burst and never overlaps in-flight refreshes', async () => {
  const first=deferred<void>(),second=deferred<void>(),controller=new AbortController()
  let calls=0,concurrent=0,maximum=0
  const failures:unknown[]=[]
  const resync=createSnapshotReconciler({signal:controller.signal,onError:error=>failures.push(error),async refresh(signal) {
    assert.equal(signal,controller.signal);maximum=Math.max(maximum,++concurrent)
    await (++calls===1?first.promise:second.promise);concurrent--
  }})
  resync.request();resync.request();resync.request()
  assert.equal(calls,1)
  first.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(calls,2)
  second.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(maximum,1);assert.deepEqual(failures,[])
})

test('snapshot resync exposes refresh failures and stops retries after disposal', async () => {
  const controller=new AbortController(),failure=new Error('snapshot unavailable'),failures:unknown[]=[]
  let calls=0
  const resync=createSnapshotReconciler({signal:controller.signal,onError:error=>failures.push(error),async refresh() { calls++;throw failure }})
  resync.request();await Promise.resolve();await Promise.resolve()
  assert.deepEqual(failures,[failure])
  controller.abort();resync.request();await Promise.resolve()
  assert.equal(calls,1)
})
