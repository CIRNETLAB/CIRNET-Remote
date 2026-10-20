import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {expectEventConnection} from './workbench-ui'

test('two same-origin tabs serialize pending observations through real Web Locks without losing or resurrecting identities',async({page,context})=>{
 await page.goto('/');await expectEventConnection(page)
 const second=await context.newPage();await second.goto('/');await expectEventConnection(second)
 const session=await(await context.request.get('/api/auth/session')).json(),principalId=session.principal.principal_id
 expect(typeof principalId).toBe('string')
 const keys:string[]=[randomUUID(),randomUUID()],lock='netcircuit.pending-observations.v1'
 await page.evaluate(name=>{
  const target=globalThis as typeof globalThis&{releaseObservationLock?:()=>void;observationLockHeld?:boolean}
  void navigator.locks.request(name,()=>new Promise<void>(resolve=>{target.releaseObservationLock=resolve;target.observationLockHeld=true}))
 },lock)
 await expect.poll(()=>page.evaluate(()=>(globalThis as typeof globalThis&{observationLockHeld?:boolean}).observationLockHeld)).toBe(true)
 const mutate=(tab:Page,key:string,kind:'begin'|'unknown'|'complete')=>tab.evaluate(async input=>{
  const path='/src/services/recovery/pendingObservations.ts'
  const {browserPendingObservations}=await import(path),scope=browserPendingObservations.scope(input.principalId)
  if(input.kind==='begin')await scope.begin({kind:'create',key:input.key})
  else await scope[input.kind](input.key)
 },{principalId,key,kind})
 const firstWrite=mutate(page,keys[0],'begin'),secondWrite=mutate(second,keys[1],'begin')
 await expect.poll(()=>page.evaluate(async name=>(await navigator.locks.query()).pending?.filter(item=>item.name===name).length,lock)).toBe(2)
 await page.evaluate(()=>(globalThis as typeof globalThis&{releaseObservationLock?:()=>void}).releaseObservationLock!())
 await Promise.all([firstWrite,secondWrite])
 const localKeys=()=>page.evaluate(id=>JSON.parse(localStorage.getItem('netcircuit.pending-observations.v1')??'[]').filter((row:{principalId:string})=>row.principalId===id).map((row:{key:string})=>row.key),principalId)
 expect(await localKeys()).toEqual(expect.arrayContaining(keys))
 await mutate(page,keys[0],'complete');await mutate(second,keys[0],'unknown')
 expect(await localKeys()).not.toContain(keys[0]);expect(await localKeys()).toContain(keys[1])
 await mutate(second,keys[1],'complete')
 expect((await localKeys()).filter((key:string)=>keys.includes(key))).toEqual([])
 await second.close()
})
