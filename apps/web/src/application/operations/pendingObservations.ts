/** Local identities are observation hints, never credentials or replayable intent. */
export interface ObservationIdentity {kind:'create'|'run'|'stop'|'generator';key:string;experimentId?:string;channel?:1|2}
export interface PendingObservation extends ObservationIdentity {principalId:string;createdAt:number;expiresAt:number;status:'pending'|'unknown'|'accepted'}
export interface ObservationMutationOptions {ifAvailable?:true}
export interface ObservationStorage {
 read():string|null
 write(value:string):void
 /** The adapter must hold its cross-context exclusive lock for the entire callback. */
 transaction?(action:()=>void,options?:ObservationMutationOptions):Promise<void>
}
export interface PendingObservationScope {
 list():PendingObservation[]
 begin(identity:ObservationIdentity,options?:ObservationMutationOptions):void|Promise<void>
 unknown(key:string,options?:ObservationMutationOptions):void|Promise<void>
 complete(key:string,options?:ObservationMutationOptions):void|Promise<void>
 forget(key:string,options?:ObservationMutationOptions):void|Promise<void>
}
interface Limits {maxRecords:number;maxPrincipalRecords:number;maxBytes:number;maxAgeMs:number;clock():number}
const defaults:Limits={maxRecords:64,maxPrincipalRecords:32,maxBytes:65_536,maxAgeMs:86_400_000,clock:Date.now}
const failure=()=>new Error('Browser operation tracking is unavailable or full. Restore browser storage before sending another command; no command was replayed.')
const identity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
function valid(value:unknown):value is PendingObservation {
 if(!object(value)||!identity(value.principalId)||!identity(value.key)||!['create','run','stop','generator'].includes(String(value.kind))||!['pending','unknown','accepted'].includes(String(value.status)))return false
 if(typeof value.createdAt!=='number'||!Number.isSafeInteger(value.createdAt)||value.createdAt<0||typeof value.expiresAt!=='number'||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=value.createdAt)return false
 if(value.experimentId!==undefined&&!identity(value.experimentId)||value.kind!=='create'&&!identity(value.experimentId))return false
 if(value.kind==='generator'&&value.channel!==1&&value.channel!==2||value.kind!=='generator'&&value.channel!==undefined)return false
 return Object.keys(value).every(key=>['kind','key','experimentId','channel','principalId','createdAt','expiresAt','status'].includes(key))
}

/** One bounded local registry, independently scoped to the verified principal.
 * Quota failure preserves all existing records; it never silently evicts another
 * pending operation. Expired and explicitly forgotten records remove only hints. */
export class PendingObservationLedger {
 private readonly limits:Limits
 constructor(private readonly storage:ObservationStorage,limits:Partial<Limits>={}){
  this.limits={...defaults,...limits}
  for(const key of ['maxRecords','maxPrincipalRecords','maxBytes','maxAgeMs'] as const)if(!Number.isSafeInteger(this.limits[key])||this.limits[key]<1)throw failure()
 }
 private read():PendingObservation[]{
  try{
   const raw=this.storage.read();if(raw===null)return []
   if(raw.length>this.limits.maxBytes||new TextEncoder().encode(raw).length>this.limits.maxBytes)throw failure()
   const rows:unknown=JSON.parse(raw)
   if(!Array.isArray(rows)||rows.length>this.limits.maxRecords||!rows.every(valid))throw failure()
   const keys=new Set<string>()
   for(const row of rows){const key=JSON.stringify([row.principalId,row.key]);if(keys.has(key))throw failure();keys.add(key)}
   return rows.filter(row=>row.expiresAt>this.limits.clock())
  }catch{throw failure()}
 }
 private write(rows:PendingObservation[]){
  const raw=JSON.stringify(rows),counts=new Map<string,number>()
  for(const row of rows){const count=(counts.get(row.principalId)??0)+1;counts.set(row.principalId,count);if(count>this.limits.maxPrincipalRecords)throw new Error('Browser operation tracking limit reached. Reconcile or forget an existing local item before sending another command.')}
  if(rows.length>this.limits.maxRecords||new TextEncoder().encode(raw).length>this.limits.maxBytes)throw new Error('Browser operation tracking limit reached. Reconcile or forget an existing local item before sending another command.')
  try{this.storage.write(raw)}catch{throw failure()}
 }
 private mutate(action:()=>void,options?:ObservationMutationOptions):void|Promise<void>{
  return this.storage.transaction?this.storage.transaction(action,options):action()
 }
 scope(principalId:string):PendingObservationScope {
  if(!identity(principalId))throw failure()
  const remove=(key:string,options?:ObservationMutationOptions)=>this.mutate(()=>this.write(this.read().filter(row=>row.principalId!==principalId||row.key!==key)),options)
  return {
   list:()=>this.read().filter(row=>row.principalId===principalId).map(row=>({...row})),
   begin:(input,options)=>this.mutate(()=>{
    const row:PendingObservation={kind:input.kind,key:input.key,...(input.experimentId?{experimentId:input.experimentId}:{}),...(input.channel?{channel:input.channel}:{}),
     principalId,createdAt:this.limits.clock(),expiresAt:this.limits.clock()+this.limits.maxAgeMs,status:'pending'}
    if(!valid(row))throw failure()
    const rows=this.read()
    if(rows.some(existing=>existing.principalId===principalId&&existing.key===row.key))throw failure()
    this.write([...rows,row])
   },options),
   unknown:(key,options)=>this.mutate(()=>this.write(this.read().map(row=>row.principalId===principalId&&row.key===key?{...row,status:'unknown'}:row)),options),
   complete:remove,forget:remove,
  }
 }
}
