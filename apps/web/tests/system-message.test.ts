import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { effectScope,nextTick } from 'vue'
import { loadSfc,mountSfc,dispatch,type HostNode } from './helpers/vueSfc'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useWorkspaceMessageStore } from '../src/stores/workspaceMessages'
import { useWorkspaceMessages } from '../src/composables/useWorkspaceMessages'

const component=loadSfc('components/workbench/SystemMessage.vue')

test('dismissing an editor error changes presentation only and source resolution permits a new occurrence',async()=>{
 const pinia=createPinia(),workspace=useWorkspaceStore(pinia),messages=useWorkspaceMessageStore(pinia)
 const scope=effectScope();scope.run(()=>useWorkspaceMessages())
 const view=mountSfc(await component,pinia)
 try{
  workspace.editError='Unsafe edit.';await nextTick()
  dispatch(view.find('button','aria-label','Dismiss system message'),'onClick');await nextTick()
  assert.equal(workspace.editError,'Unsafe edit.')
  assert.equal(messages.current,null)
  workspace.editError='';workspace.editError='Unsafe edit.';await nextTick()
  assert.equal(useWorkspaceMessageStore(pinia).current?.text,'Unsafe edit.')
 }finally{view.app.unmount();scope.stop()}
})

test('persistent status and alert nodes update text without remounting or moving focus',async()=>{
 const pinia=createPinia(),messages=useWorkspaceMessageStore(pinia),focused:HostNode[]=[]
 const view=mountSfc(await component,pinia,null,node=>{(node as HostNode&{focus:()=>void}).focus=()=>focused.push(node)})
 try{
  const status=view.find('span','role','status'),alert=view.find('span','role','alert')
  assert.ok(status);assert.ok(alert)
  messages.setHint('editor','Denied.',{level:'error'});await nextTick()
  assert.equal(view.find('span','role','alert'),alert)
  assert.equal(alert.text,'Error: Denied.')
  assert.equal(status.text,'')
  messages.clearSource('editor');messages.publish('file','Exported.');await nextTick()
  assert.equal(view.find('span','role','status'),status)
  assert.equal(status.text,'Exported.');assert.equal(alert.text,'')
  assert.equal(focused.length,0)
 }finally{view.app.unmount()}
})

test('full hint text remains keyboard readable after the hint resolves and Escape returns focus',async()=>{
 const pinia=createPinia(),messages=useWorkspaceMessageStore(pinia),focused:HostNode[]=[]
 const view=mountSfc(await component,pinia,null,node=>{(node as HostNode&{focus:()=>void}).focus=()=>focused.push(node)})
 try{
  messages.setHint('placement','Click to place <script>literal text</script>.');await nextTick()
  const toggle=view.find('button','aria-label','Read full system message')
  dispatch(toggle,'onClick');await nextTick();await nextTick()
  const details=view.find('section','aria-label','System message details')
  assert.equal(focused.at(-1),details)
  assert.ok(view.text().includes('<script>literal text</script>'))
  assert.equal(view.all().some(node=>node.tag==='script'),false)
  messages.clearSource('placement');await nextTick()
  assert.equal(view.find('button','aria-label','Read full system message'),toggle)
  const escape=details.props.onKeydown as (event:unknown)=>void
  escape({key:'Escape',stopPropagation(){},preventDefault(){}});await nextTick()
  assert.equal(focused.at(-1),toggle)
  assert.equal(view.find('section','aria-label','System message details'),undefined)
 }finally{view.app.unmount()}
})
