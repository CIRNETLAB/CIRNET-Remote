import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PointerGestureSession } from '../src/editor/PointerGestureSession'

test('pointer ownership is exclusive and completion can commit only once for the admitted draft',()=>{
  const session=new PointerGestureSession()
  assert.equal(session.begin(7,'draft-a'),true);assert.equal(session.begin(8,'draft-a'),false)
  assert.equal(session.owns(8,'draft-a'),false);assert.equal(session.complete(8,'draft-a'),false)
  assert.equal(session.complete(7,'draft-a'),true);assert.equal(session.complete(7,'draft-a'),false)
  assert.equal(session.active,false)
})

test('draft replacement and cancellation cannot commit stale preview state or retain pointer ownership',()=>{
  const session=new PointerGestureSession();session.begin(2,'old')
  assert.equal(session.owns(2,'new'),false);assert.equal(session.complete(2,'new'),false)
  assert.equal(session.active,false);assert.equal(session.begin(3,null),true)
  assert.equal(session.cancel(),3);assert.equal(session.cancel(),null);assert.equal(session.complete(3,null),false)
})
