import {test} from 'node:test'
import assert from 'node:assert/strict'
import {FlexiblePlacementController} from '../src/editor/FlexiblePlacementController'
import type {CircuitModule} from '../src/types/circuit'

const modules:CircuitModule[]=[{id:'BB1',type:'BREADBOARD',position:{x:0,y:0,z:0}}]
test('first anchor is draft-only; second exact hole produces one immutable assembly',()=>{
 const c=new FlexiblePlacementController(); c.arm('GENERIC_RESISTOR',1)
 assert.equal(c.choose('BB1','terminal:A:10',modules),null); assert.equal(c.phase,'choose-second-pin')
 const mount=c.choose('BB1','terminal:A:14',modules)!; assert.equal(mount.contacts[0].contactId,'terminal:A:10');assert.equal(mount.contacts[1].contactId,'terminal:A:14');assert.equal(modules.length,1)
})
test('invalid second hole never substitutes a neighbor, and cancel preserves document',()=>{
 const c=new FlexiblePlacementController();c.arm('GENERIC_RESISTOR',1);c.choose('BB1','terminal:A:10',modules)
 assert.equal(c.choose('BB1','terminal:A:10',modules),null);assert.match(c.reason,/distinct/);assert.equal(c.first?.contactId,'terminal:A:10')
 c.cancel();assert.equal(c.phase,'idle')
})

test('automatic placement exposes no manual component bend controls or hints',()=>{
 const c=new FlexiblePlacementController();c.arm('GENERIC_RESISTOR',1);c.choose('BB1','terminal:A:10',modules)
 assert.equal('addBend' in c,false);assert.equal('removeBend' in c,false);assert.doesNotMatch(c.hint,/right.click|backspace|bend/i)
 assert.match(c.hint,/automatically/i)
})