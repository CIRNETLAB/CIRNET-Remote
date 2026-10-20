import {PendingObservationLedger,type ObservationStorage} from '../../application/operations/pendingObservations'
const key='netcircuit.pending-observations.v1'
/** Browser adapter remains lazy so unsupported storage produces a visible error
 * at the tracking boundary before a command is dispatched. */
const storage:ObservationStorage={
 read:()=>globalThis.localStorage.getItem(key),write:value=>globalThis.localStorage.setItem(key,value),
 async transaction(action,options){
  const locks=globalThis.navigator?.locks
  if(!locks?.request)throw new Error('Browser operation tracking requires Web Locks. Use a supported secure browser context before sending another command; no command was replayed.')
  await locks.request(key,{mode:'exclusive',...(options?.ifAvailable?{ifAvailable:true}:{})},lock=>{
   if(options?.ifAvailable&&!lock)throw new Error('Browser operation tracking lock is unavailable. Stop remains available; its server response determines the outcome.')
   action()
  })
 },
}
export const browserPendingObservations=new PendingObservationLedger(storage)
