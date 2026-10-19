import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {effectScope,nextTick,reactive} from 'vue'
import {useWorkspaceSceneMessages} from '../src/composables/useWorkspaceSceneMessages'
import {useWorkspaceMessageStore} from '../src/stores/workspaceMessages'

test('unrecovered local graphics status survives account rotation without replaying private events',async()=>{
  setActivePinia(createPinia())
  const messages=useWorkspaceMessageStore(),state=reactive({graphics:'3D graphics unavailable. Use Inspector.',zoom:false})
  messages.setScope('guest',1,'draft-a')
  const scope=effectScope()
  scope.run(()=>useWorkspaceSceneMessages({graphics:()=>state.graphics,zoomArea:()=>state.zoom,marquee:()=>false,selectionPreview:()=>'',placement:()=>'',wire:()=>''}))
  try{
    const first=messages.current!.id
    messages.publish('private','Old account detail',{scope:'session'})
    messages.setScope('user',2,'draft-b');await nextTick()
    assert.equal(messages.current?.source,'graphics');assert.equal(messages.current?.text,state.graphics)
    assert.ok(messages.current!.id>first);assert.equal(messages.events.length,0)
    messages.setScope('user',3,'draft-b');await nextTick()
    assert.equal(messages.current?.text,state.graphics)
    state.graphics='';await nextTick();assert.equal(messages.current,null)
  }finally{scope.stop()}
})

test('scene context hints update once, resolve with tool state and clean up on disposal',async()=>{
  setActivePinia(createPinia())
  const messages=useWorkspaceMessageStore(),state=reactive({zoom:true,preview:'Selection preview',placement:'Place the component'})
  messages.setScope('owner',1,'draft')
  const scope=effectScope()
  scope.run(()=>useWorkspaceSceneMessages({graphics:()=>'',zoomArea:()=>state.zoom,marquee:()=>false,selectionPreview:()=>state.preview,placement:()=>state.placement,wire:()=>''}))
  await nextTick()
  const id=messages.hints.placement!.id
  state.placement='Place the component';await nextTick();assert.equal(messages.hints.placement!.id,id)
  state.zoom=false;state.preview='';state.placement='';await nextTick()
  assert.equal(messages.current,null);assert.equal(messages.events.length,0)
  state.zoom=true;await nextTick();assert.equal(useWorkspaceMessageStore().current?.source,'zoom-area')
  scope.stop();assert.equal(messages.current,null)
})
