import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRemoteSessionScope } from '../src/services/session/remoteScope'
import { controlClientId } from '../src/services/session/controlClient'

test('session replacement aborts and closes prior remote work before clearing state and reconnecting',()=>{
  const events:string[]=[],signals:AbortSignal[]=[]
  const scope=createRemoteSessionScope({reset(){events.push('reset')},connect(signal){
    signals.push(signal);events.push('connect')
    return()=>{assert.equal(signal.aborted,true);events.push('close')}
  }})
  scope.replace(true);scope.replace(true)
  assert.deepEqual(events,['reset','connect','close','reset','connect'])
  assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false)
  scope.replace(false)
  assert.deepEqual(events.slice(-2),['close','reset']);assert.equal(signals[1].aborted,true)
  scope.dispose()
})

test('disposing a remote session invalidates its pending requests and cannot reconnect later',()=>{
  let connections=0,resets=0,signal:AbortSignal|undefined
  const scope=createRemoteSessionScope({reset(){resets++},connect(current){connections++;signal=current;return()=>{}}})
  scope.replace(true);scope.dispose();scope.replace(true)
  assert.equal(signal?.aborted,true);assert.equal(connections,1);assert.equal(resets,2)
})

test('the control client identity is stable in memory and is a nonsecret UUID',()=>{
  assert.match(controlClientId(),/^[a-f0-9-]{36}$/)
  assert.equal(controlClientId(),controlClientId())
})
