import {test} from 'node:test'
import assert from 'node:assert/strict'
import {FlexiblePlacementController} from '../src/editor/FlexiblePlacementController'
import type {CircuitModule} from '../src/types/circuit'
import {getBreadboardContact} from '../src/electrical/BreadboardTopology'
const modules:CircuitModule[]=[{id:'BB1',type:'BREADBOARD',position:{x:0,y:0,z:0}}]
test('first anchor and bends are draft-only; second exact hole produces one immutable assembly',()=>{
 const c=new FlexiblePlacementController(); c.arm('GENERIC_RESISTOR',1)
 assert.equal(c.choose('BB1','terminal:A:10',modules),null); assert.equal(c.phase,'choose-second-pin')
 const mount=c.choose('BB1','terminal:A:14',modules)!; assert.equal(mount.contacts[0].contactId,'terminal:A:10');assert.equal(mount.contacts[1].contactId,'terminal:A:14');assert.equal(modules.length,1)
})
test('invalid second hole never substitutes a neighbor, and backspace/cancel preserve document',()=>{
 const c=new FlexiblePlacementController();c.arm('GENERIC_RESISTOR',1);c.choose('BB1','terminal:A:10',modules)
 assert.equal(c.choose('BB1','terminal:A:10',modules),null);assert.match(c.reason,/distinct/);assert.equal(c.first?.contactId,'terminal:A:10')
 c.addBend({x:0,y:1,z:0});assert.equal(c.bends.length,1);c.removeBend();assert.equal(c.bends.length,0);c.cancel();assert.equal(c.phase,'idle')
})

test('a manually authored bend survives the second click as minimal board-local intent',()=>{
 const c=new FlexiblePlacementController();c.arm('GENERIC_RESISTOR',1);c.choose('BB1','terminal:A:10',modules)
 const preview=c.hover('BB1','terminal:A:18',modules)!,contact=getBreadboardContact('BREADBOARD','terminal:C:17')!,bend={x:contact.localPosition[0],y:preview.mount!.bodyPose.position.y,z:contact.localPosition[2]}
 c.addBend(bend);const mount=c.choose('BB1','terminal:A:18',modules)
 assert.ok(mount,c.reason);assert.deepEqual(mount.leads[1].controlPoints[0],bend)
})
