export function createRemoteSessionScope(options:{reset():void;connect(signal:AbortSignal):()=>void}) {
  let current:{controller:AbortController;close:()=>void}|null=null,disposed=false
  function clear() {
    const previous=current;current=null
    if(previous) {previous.controller.abort();previous.close()}
    options.reset()
  }
  return {
    replace(enabled:boolean) {
      if(disposed) return
      clear()
      if(enabled) {
        const controller=new AbortController()
        current={controller,close:options.connect(controller.signal)}
      }
    },
    dispose() {if(!disposed) {disposed=true;clear()}},
  }
}
