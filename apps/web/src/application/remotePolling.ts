export interface RemotePollingOptions<Timer> {
  signal:AbortSignal
  refresh(signal:AbortSignal):Promise<void>
  onError(error:unknown):void
  automatic?:boolean
  intervalMs?:number
  maxDelayMs?:number
  schedule?:(callback:()=>void,delay:number)=>Timer
  cancel?:(timer:Timer)=>void
}

/** One request at a time, one coalesced follow-up, and completion-based fallback. */
export function createRemotePolling<Timer=ReturnType<typeof setTimeout>>(options:RemotePollingOptions<Timer>) {
  const schedule=options.schedule??((callback,delay)=>setTimeout(callback,delay) as Timer)
  const cancel=options.cancel??(timer=>clearTimeout(timer as ReturnType<typeof setTimeout>))
  const interval=options.intervalMs??3_000,maximum=options.maxDelayMs??30_000
  let running=false,pending=false,closed=false,timer:Timer|null=null,failures=0,backingOff=false
  const stopped=()=>closed||options.signal.aborted
  function clearTimer(){if(timer!==null){cancel(timer);timer=null}}
  function later(delay:number){clearTimer();if(!stopped())timer=schedule(()=>{timer=null;backingOff=false;pending=true;void drain()},delay)}
  async function drain(){
    if(running||stopped())return
    running=true
    try {
      while(pending&&!stopped()){
        pending=false
        try{await options.refresh(options.signal);failures=0;backingOff=false}
        catch(error){
          if(!stopped()){
            options.onError(error);failures++;pending=false;backingOff=options.automatic===true
            if(options.automatic)later(Math.min(maximum,interval*2**Math.min(failures-1,10)))
          }
          return
        }
      }
      if(options.automatic&&!stopped())later(interval)
    }finally{running=false}
  }
  function dispose(){if(closed)return;closed=true;pending=false;clearTimer();options.signal.removeEventListener('abort',dispose)}
  options.signal.addEventListener('abort',dispose,{once:true})
  if(options.signal.aborted)dispose()
  return {request(){if(stopped())return;pending=true;if(!running&&!backingOff){clearTimer();void drain()}},dispose}
}
