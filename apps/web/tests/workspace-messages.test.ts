import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceMessageStore } from '../src/stores/workspaceMessages'

function setup(){setActivePinia(createPinia());const messages=useWorkspaceMessageStore();messages.setScope('first',1,'draft-one');return messages}

test('an actionable error wins over success events and context hints until resolved',()=>{
  const messages=setup()
  messages.publish('save','Server revision conflicts.',{level:'error',window:'projects'})
  messages.publish('success','Export requested.')
  messages.setHint('placement','Click to place.')
  assert.equal(messages.current?.text,'Server revision conflicts.')
  assert.equal(messages.current?.window,'projects')
  messages.clearSource('save');assert.equal(messages.current?.text,'Click to place.')
  messages.setHint('placement','');assert.equal(messages.current?.text,'Export requested.')
})

test('unchanged hints do not replay, dismissal holds and resolved hints disappear immediately',()=>{
  const messages=setup()
  messages.setHint('area','Drag an area.')
  const id=messages.current!.id
  for(let count=0;count<100;count++)messages.setHint('area','Drag an area.')
  assert.equal(messages.current!.id,id);assert.equal(messages.events.length,0)
  messages.dismiss(id);messages.setHint('area','Drag an area.');assert.equal(messages.current,null)
  messages.setHint('area','');messages.setHint('area','Drag a different area.')
  assert.notEqual(messages.current!.id,id)
  messages.clearSource('area');assert.equal(messages.current,null)
})

test('draft changes clear document messages while session messages survive until principal scope changes',()=>{
  const messages=setup()
  messages.publish('connection','Disconnected.',{scope:'session',level:'warning'})
  messages.setHint('editor','Private draft error.',{level:'error'})
  messages.setScope('first',1,'draft-two');assert.equal(messages.current?.text,'Disconnected.')
  messages.setScope('second',2,'draft-two');assert.equal(messages.current,null);assert.equal(messages.events.length,0)
  messages.publish('session','Same principal, new epoch.',{scope:'session'})
  messages.setScope('second',3,'draft-two');assert.equal(messages.current,null)
})

test('message history is bounded and repeated identical events are deduplicated',()=>{
  const messages=setup()
  const id=messages.publish('file','Opened file.')
  assert.equal(messages.publish('file','Opened file.'),id);assert.equal(messages.events.length,1)
  for(let count=0;count<100;count++)messages.publish('event-'+count,'Event '+count)
  assert.ok(messages.events.length<=60);assert.equal(messages.current?.text,'Event 99')
  assert.ok(Number.isFinite(messages.current?.time))
})

test('a later informational event from the same source does not silently resolve an error',()=>{
  const messages=setup()
  messages.publish('console','Control was denied.',{level:'error',scope:'session'})
  messages.publish('console','Connection established.',{scope:'session'})
  assert.equal(messages.current?.text,'Control was denied.')
  messages.dismiss(messages.current!.id);assert.equal(messages.current?.text,'Connection established.')
})

test('an older informational connection hint cannot hide a fresh file result',()=>{
  const messages=setup()
  messages.setHint('connection','Event connection established.',{scope:'session'})
  messages.publish('file','Export requested.')
  assert.equal(messages.current?.text,'Export requested.')
  messages.setHint('placement','Click to place.')
  assert.equal(messages.current?.text,'Click to place.')
  messages.clearSource('placement')
  assert.equal(messages.current?.text,'Export requested.')
})
