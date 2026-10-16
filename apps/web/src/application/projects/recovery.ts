import type { CircuitGraph } from '../../contracts/generated/dto'
import { parseCircuitFile } from '../../domain/document/circuitFile'

export interface RecoveryBinding { documentId:string; projectId:string; serverRevision:number }
export interface RecoveryInput { draftId:string; name:string; revision:number; graph:CircuitGraph; binding?:RecoveryBinding }
export interface RecoveryDraft extends RecoveryInput { format:'netcircuit.recovery'; version:1; principalId:string; updatedAt:number }
export interface RecoverySummary { draftId:string; name:string; revision:number; updatedAt:number; documentId:string|null }
/** update must commit the synchronous transform atomically, including failures. */
export interface RecoveryStorage { read():Promise<unknown[]>; update(change:(rows:unknown[])=>unknown[]):Promise<void> }
export interface RecoveryRepository {
  save(principalId:string,drafts:readonly RecoveryInput[]):Promise<void>
  list(principalId:string):Promise<RecoverySummary[]>
  load(principalId:string,draftId:string):Promise<RecoveryDraft|null>
  remove(principalId:string,draftId:string):Promise<void>
  claim(sourcePrincipalId:string,targetPrincipalId:string,confirmed:boolean):Promise<void>
}
export interface RecoveryLimits {
  maxDraftBytes:number; maxPrincipalBytes:number; maxPrincipalDrafts:number; maxTotalBytes:number; maxTotalDrafts:number; clock:()=>number
}
const DEFAULTS:RecoveryLimits={maxDraftBytes:2_100_000,maxPrincipalBytes:16_800_000,maxPrincipalDrafts:8,
  maxTotalBytes:33_600_000,maxTotalDrafts:32,clock:Date.now}
export class RecoveryError extends Error { constructor(message:string) {super(message);this.name='RecoveryError'} }
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
function identity(value:unknown):asserts value is string {
  if(typeof value!=='string'||!value||value.length>200) throw new RecoveryError('Recovery identity is invalid.')
}
function revision(value:unknown):asserts value is number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0) throw new RecoveryError('Recovery revision is invalid.')
}
function size(value:unknown):number {return new TextEncoder().encode(JSON.stringify(value)).length}
function key(row:unknown) {return object(row)?JSON.stringify([row.principalId,row.draftId]):''}

/** Bounded recovery is local document storage, never an authentication store.
 * Quota failures reject the complete batch, retaining previously committed data.
 * Drafts are never silently evicted from another account to make room.
 */
export class BoundedRecoveryRepository implements RecoveryRepository {
  private readonly limits:RecoveryLimits
  constructor(private readonly storage:RecoveryStorage,limits:Partial<RecoveryLimits>={}) {
    this.limits={...DEFAULTS,...limits}
    for(const name of ['maxDraftBytes','maxPrincipalBytes','maxPrincipalDrafts','maxTotalBytes','maxTotalDrafts'] as const) {
      if(!Number.isSafeInteger(this.limits[name])||this.limits[name]<1) throw new RecoveryError('Recovery bounds must be positive integers.')
    }
  }
  private input(value:unknown):RecoveryInput {
    if(!object(value)) throw new RecoveryError('Recovery document is invalid.')
    identity(value.draftId);revision(value.revision)
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>200) throw new RecoveryError('Recovery document name is invalid.')
    const graph=parseCircuitFile(JSON.stringify(value.graph))
    let binding:RecoveryBinding|undefined
    if(value.binding!==undefined) {
      if(!object(value.binding)) throw new RecoveryError('Recovery binding is invalid.')
      identity(value.binding.documentId);identity(value.binding.projectId);revision(value.binding.serverRevision)
      if(value.binding.serverRevision<1) throw new RecoveryError('Recovery server revision is invalid.')
      binding={documentId:value.binding.documentId,projectId:value.binding.projectId,serverRevision:value.binding.serverRevision}
    }
    return {draftId:value.draftId,name:value.name,revision:value.revision,graph,...(binding?{binding}:{})}
  }
  private decode(value:unknown):RecoveryDraft {
    if(!object(value)||value.format!=='netcircuit.recovery'||value.version!==1) throw new RecoveryError('Recovery format/version is unsupported.')
    identity(value.principalId)
    if(typeof value.updatedAt!=='number'||!Number.isFinite(value.updatedAt)||value.updatedAt<0) throw new RecoveryError('Recovery timestamp is invalid.')
    const result={...this.input(value),format:'netcircuit.recovery' as const,version:1 as const,
      principalId:value.principalId,updatedAt:value.updatedAt}
    if(size(result)>this.limits.maxDraftBytes) throw new RecoveryError('Recovery document exceeds its byte bound.')
    return result
  }
  private checkBounds(rows:unknown[]) {
    if(rows.length>this.limits.maxTotalDrafts||size(rows)>this.limits.maxTotalBytes) throw new RecoveryError('Local recovery exceeds its total storage limit.')
    const accounts=new Map<string,{count:number;bytes:number}>()
    for(const row of rows) {
      if(!object(row)||typeof row.principalId!=='string') throw new RecoveryError('Recovery storage contains an invalid record.')
      const bytes=size(row)
      if(bytes>this.limits.maxDraftBytes) throw new RecoveryError('Recovery document exceeds its byte bound.')
      const account=accounts.get(row.principalId)??{count:0,bytes:0};account.count++;account.bytes+=bytes;accounts.set(row.principalId,account)
      if(account.count>this.limits.maxPrincipalDrafts||account.bytes>this.limits.maxPrincipalBytes) throw new RecoveryError('Recovery exceeds this account storage limit.')
    }
  }
  async save(principalId:string,drafts:readonly RecoveryInput[]) {
    identity(principalId)
    const updatedAt=this.limits.clock()
    const values=drafts.map(value=>this.decode({...this.input(value),format:'netcircuit.recovery',version:1,principalId,updatedAt}))
    if(new Set(values.map(key)).size!==values.length) throw new RecoveryError('Recovery batch contains duplicate drafts.')
    const replacements=new Map(values.map(value=>[key(value),value]))
    await this.storage.update(rows=>{
      for(const row of rows) if(replacements.has(key(row))) this.decode(row)
      const next=[...rows.filter(row=>!replacements.has(key(row))),...values]
      this.checkBounds(next);return next
    })
  }
  async list(principalId:string):Promise<RecoverySummary[]> {
    identity(principalId)
    return (await this.storage.read()).filter(row=>object(row)&&row.principalId===principalId).map(row=>this.decode(row))
      .sort((a,b)=>b.updatedAt-a.updatedAt||a.draftId.localeCompare(b.draftId))
      .map(row=>({draftId:row.draftId,name:row.name,revision:row.revision,updatedAt:row.updatedAt,documentId:row.binding?.documentId??null}))
  }
  async load(principalId:string,draftId:string):Promise<RecoveryDraft|null> {
    identity(principalId);identity(draftId)
    const row=(await this.storage.read()).find(row=>object(row)&&row.principalId===principalId&&row.draftId===draftId)
    return row===undefined?null:this.decode(row)
  }
  async remove(principalId:string,draftId:string) {
    identity(principalId);identity(draftId)
    await this.storage.update(rows=>rows.filter(row=>!object(row)||row.principalId!==principalId||row.draftId!==draftId))
  }
  async claim(sourcePrincipalId:string,targetPrincipalId:string,confirmed:boolean) {
    identity(sourcePrincipalId);identity(targetPrincipalId)
    if(confirmed!==true||sourcePrincipalId===targetPrincipalId) throw new RecoveryError('Explicit guest transfer confirmation is required.')
    await this.storage.update(rows=>{
      const sources=rows.filter(row=>object(row)&&row.principalId===sourcePrincipalId).map(row=>this.decode(row))
      const existing=new Set(rows.filter(row=>object(row)&&row.principalId===targetPrincipalId).map(row=>object(row)?row.draftId:undefined))
      if(sources.some(row=>existing.has(row.draftId))) throw new RecoveryError('Recovery transfer conflicts with an existing account draft.')
      const next=[...rows.filter(row=>!object(row)||row.principalId!==sourcePrincipalId),
        ...sources.map(row=>({...row,principalId:targetPrincipalId,updatedAt:this.limits.clock()}))]
      this.checkBounds(next);return next
    })
  }
}
