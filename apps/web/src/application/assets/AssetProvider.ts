export interface AssetDescriptor { url:string; revision:string; maxBytes:number }
export interface AssetLoader<T> { load(asset:AssetDescriptor,signal:AbortSignal):Promise<T>; clone(template:T):T; dispose(resource:T):void }
export interface AssetLease<T> { ready:Promise<T>; release():void }
interface Consumer<T> { released:boolean; instance?:T; hasInstance:boolean; resolve:(resource:T)=>void; reject:(error:unknown)=>void; removeAbort:()=>void }
interface Entry<T> { key:string; controller:AbortController; consumers:Set<Consumer<T>>; loaded:boolean; template?:T }
const cancelled=()=>new Error('Asset acquisition was cancelled.')

/** Shared immutable templates; every consumer receives an independently owned clone. */
export class AssetProvider<T> {
  private entries=new Map<string,Entry<T>>()
  private references=0
  private closed=false
  private readonly maxEntries:number
  private readonly maxReferences:number
  constructor(private readonly loader:AssetLoader<T>,options:{maxEntries?:number;maxReferences?:number}={}) {
    this.maxEntries=options.maxEntries??4;this.maxReferences=options.maxReferences??32
    if(!Number.isSafeInteger(this.maxEntries)||this.maxEntries<1||!Number.isSafeInteger(this.maxReferences)||this.maxReferences<1) throw new Error('Asset bounds must be positive integers.')
  }
  acquire(asset:AssetDescriptor,signal?:AbortSignal):AssetLease<T> {
    if(this.closed) throw new Error('The asset provider is disposed.')
    if(!asset.url||!asset.revision||!Number.isSafeInteger(asset.maxBytes)||asset.maxBytes<1) throw new Error('Asset descriptor is invalid.')
    const key=JSON.stringify([asset.url,asset.revision,asset.maxBytes])
    let entry=this.entries.get(key)
    if(this.references>=this.maxReferences||!entry&&this.entries.size>=this.maxEntries) throw new Error('Asset reference/cache limit exceeded.')
    if(!entry) {
      entry={key,controller:new AbortController(),consumers:new Set(),loaded:false};this.entries.set(key,entry)
      let loading:Promise<T>
      try {loading=this.loader.load({...asset},entry.controller.signal)} catch(error) {loading=Promise.reject(error)}
      const current=entry
      void loading.then(template=>{
        if(this.closed||this.entries.get(key)!==current||!current.consumers.size) {this.loader.dispose(template);return}
        current.template=template;current.loaded=true
        for(const consumer of current.consumers) this.deliver(current,consumer)
      },error=>{
        if(this.entries.get(key)===current) this.entries.delete(key)
        for(const consumer of [...current.consumers]) {
          consumer.reject(error)
          this.release(current,consumer)
        }
      })
    }
    let resolve!:(value:T)=>void,reject!:(error:unknown)=>void
    const ready=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
    const consumer:Consumer<T>={released:false,hasInstance:false,resolve,reject,removeAbort:()=>{}}
    entry.consumers.add(consumer);this.references++
    const release=()=>this.release(entry!,consumer)
    if(signal) {signal.addEventListener('abort',release,{once:true});consumer.removeAbort=()=>signal.removeEventListener('abort',release)}
    if(signal?.aborted) release()
    else if(entry.loaded) this.deliver(entry,consumer)
    return {ready,release}
  }
  private deliver(entry:Entry<T>,consumer:Consumer<T>) {
    if(consumer.released||consumer.hasInstance) return
    try {consumer.instance=this.loader.clone(entry.template as T);consumer.hasInstance=true;consumer.resolve(consumer.instance)}
    catch(error) {consumer.reject(error);this.release(entry,consumer)}
  }
  private release(entry:Entry<T>,consumer:Consumer<T>) {
    if(consumer.released) return
    consumer.released=true;consumer.removeAbort();entry.consumers.delete(consumer);this.references--
    if(consumer.hasInstance) this.loader.dispose(consumer.instance as T)
    else consumer.reject(cancelled())
    if(!entry.consumers.size) {
      if(this.entries.get(entry.key)===entry) this.entries.delete(entry.key)
      entry.controller.abort()
      if(entry.loaded) {this.loader.dispose(entry.template as T);entry.loaded=false;entry.template=undefined}
    }
  }
  dispose() {
    if(this.closed) return
    this.closed=true
    for(const entry of [...this.entries.values()]) for(const consumer of [...entry.consumers]) this.release(entry,consumer)
    this.entries.clear()
  }
}
