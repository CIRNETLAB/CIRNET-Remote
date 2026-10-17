import type { CircuitGraph } from '../../types/circuit'
import type { CircuitDocument } from '../../types/projects'
import type { RecoveryBinding, RecoveryInput, RecoveryRepository, RecoverySummary } from './recovery'

export interface DocumentSnapshot { draftId:string; name:string; revision:number; graph:CircuitGraph }
/** The editor is the sole graph authority. These methods never expose a second mutable graph. */
export interface DocumentPort {
  /** Adapter guarantees that every nested content edit advances the document revision. */
  revisioned?:true
  read():DocumentSnapshot|null
  readAll():readonly DocumentSnapshot[]
  replace(value:{name:string;graph:CircuitGraph},source:'server'|'recovery'):void
  clearForPrincipal():void
}
export interface ProjectDocumentRepository {
  get(documentId:string,signal:AbortSignal):Promise<CircuitDocument>
  create(projectId:string,value:{name:string;graph:CircuitGraph},signal:AbortSignal):Promise<CircuitDocument>
  save(documentId:string,expectedRevision:number,value:{name:string;graph:CircuitGraph},signal:AbortSignal):Promise<CircuitDocument>
}
export interface SaveBinding extends RecoveryBinding { localDraftId:string }
export interface SaveState {
  principalId:string|null
  phase:'local'|'dirty'|'saving'|'saved'|'conflict'|'offline'|'error'
  dirty:boolean
  binding:SaveBinding|null
  error:string|null
  recoveryError:string|null
}
interface Capture extends DocumentSnapshot { fingerprint:string }
// Object insertion order can change across generated HTTP serializers. Only
// object keys are canonicalized: array order and numeric values stay intact.
const fingerprint=(value:{name:string;graph:CircuitGraph})=>JSON.stringify({name:value.name,graph:value.graph},(_key:string,item:unknown)=>{
  if(item!==null&&typeof item==='object'&&!Array.isArray(item)) {
    const object=item as Record<string,unknown>
    return Object.fromEntries(Object.keys(object).sort().map(key=>[key,object[key]]))
  }
  return item
})
// JSON documents can be Vue proxy views at this port; structuredClone cannot
// clone proxies. Serialization produces an immutable I/O snapshot of that view.
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T
const recoveryFailure='Local recovery could not be stored. Export JSON to preserve changes when browser storage is unavailable or full.'

export class ProjectSaveController {
  private readonly documents:DocumentPort
  private readonly remote:ProjectDocumentRepository
  private readonly recovery:RecoveryRepository
  private readonly onChange:((state:SaveState)=>void)|undefined
  private readonly recoveryDelayMs:number
  private value:SaveState={principalId:null,phase:'local',dirty:false,binding:null,error:null,recoveryError:null}
  private initialized=false
  private epoch=0
  private disposed=false
  private request:AbortController|null=null
  private saving:Promise<boolean>|null=null
  private writingDraftId:string|null=null
  private queued=false
  private savedRevision:number|null=null
  private savedFingerprint:string|null=null
  private recoveryTimer:ReturnType<typeof setTimeout>|null=null

  constructor(options:{documents:DocumentPort;remote:ProjectDocumentRepository;recovery:RecoveryRepository;
    onChange?:(state:SaveState)=>void;recoveryDelayMs?:number}) {
    this.documents=options.documents;this.remote=options.remote;this.recovery=options.recovery;this.onChange=options.onChange
    this.recoveryDelayMs=options.recoveryDelayMs??350
  }
  state():SaveState {return {...this.value,binding:this.value.binding?{...this.value.binding}:null}}
  private emit() {if(!this.disposed) this.onChange?.(this.state())}
  private capture():Capture|null {
    const current=this.documents.read()
    if(!current) return null
    const copy=clone(current)
    return {...copy,fingerprint:fingerprint(copy)}
  }
  private unchanged(previous:Capture|null):boolean {
    const current=this.documents.read()
    return previous===null?current===null:!!current&&previous.draftId===current.draftId&&previous.revision===current.revision&&previous.fingerprint===fingerprint(current)
  }
  private current(epoch:number,principalId:string|null) {return !this.disposed&&epoch===this.epoch&&principalId===this.value.principalId}
  private cancelRequests() {this.request?.abort();this.request=null;this.queued=false;this.saving=null;this.writingDraftId=null}
  private cancelCheckpoint() {if(this.recoveryTimer!==null) clearTimeout(this.recoveryTimer);this.recoveryTimer=null}
  private recoveryInputs():RecoveryInput[] {
    return this.documents.readAll().map(snapshot=>{
      const binding=this.value.binding?.localDraftId===snapshot.draftId?this.value.binding:null
      return clone({draftId:snapshot.draftId,name:snapshot.name,revision:snapshot.revision,graph:snapshot.graph,
        ...(binding?{binding:{documentId:binding.documentId,projectId:binding.projectId,serverRevision:binding.serverRevision}}:{})})
    })
  }
  async setPrincipal(principalId:string|null):Promise<void> {
    if(this.disposed||this.initialized&&principalId===this.value.principalId) return
    const previous=this.value.principalId
    let snapshots:RecoveryInput[]=[]
    try {snapshots=this.recoveryInputs()} catch {this.value.recoveryError=recoveryFailure}
    this.initialized=true;this.epoch++;this.cancelRequests();this.cancelCheckpoint()
    this.savedRevision=null;this.savedFingerprint=null
    this.value={principalId,phase:'local',dirty:false,binding:null,error:null,recoveryError:this.value.recoveryError}
    // No await may occur before this privacy boundary, even if recovery is slow.
    this.documents.clearForPrincipal();this.emit()
    if(previous&&snapshots.length) {
      try {await this.recovery.save(previous,snapshots)}
      catch {this.value.recoveryError=recoveryFailure;this.emit()}
    }
  }
  documentChanged():void {
    if(this.disposed) return
    const current=this.documents.read(),binding=this.value.binding
    if(binding&&binding.localDraftId!==current?.draftId||this.writingDraftId&&this.writingDraftId!==current?.draftId) {
      this.epoch++;this.cancelRequests()
      this.value.binding=null;this.savedRevision=null;this.savedFingerprint=null
      this.value.phase='local';this.value.error=null
    }
    this.value.dirty=!!current&&(!this.value.binding||current.revision!==this.savedRevision||(!this.documents.revisioned&&fingerprint(current)!==this.savedFingerprint))
    if(this.value.phase!=='saving'&&this.value.phase!=='conflict') this.value.phase=this.value.binding?(this.value.dirty?'dirty':'saved'):'local'
    this.emit();this.cancelCheckpoint()
    if(this.value.principalId&&current) this.recoveryTimer=setTimeout(()=>{this.recoveryTimer=null;void this.checkpoint()},this.recoveryDelayMs)
  }
  async checkpoint():Promise<boolean> {
    if(this.disposed||!this.value.principalId) return false
    const principal=this.value.principalId,epoch=this.epoch
    try {
      const snapshots=this.recoveryInputs()
      if(snapshots.length) await this.recovery.save(principal,snapshots)
      if(this.current(epoch,principal)) {this.value.recoveryError=null;this.emit()}
      return true
    } catch {if(this.current(epoch,principal)) {this.value.recoveryError=recoveryFailure;this.emit()}return false}
  }
  private canReplace(discardLocal:boolean):boolean {
    if(this.value.dirty&&discardLocal!==true) {this.value.error='Keep local changes, save a copy, or confirm reload before replacing this document.';this.emit();return false}
    return true
  }
  private fail(error:unknown) {
    const detail=typeof error==='object'&&error!==null?error as {status?:unknown;code?:unknown}:{}
    if(detail.status===409||detail.status===412||detail.code==='REVISION_CONFLICT') {
      this.value.phase='conflict';this.value.error='The server revision changed. Keep local changes, reload after confirmation, or Save As a separate document.'
    } else if(error instanceof TypeError||detail.status===0) {
      this.value.phase='offline';this.value.error='The server could not be reached. Local changes are retained; retry Save when connected.'
    } else {this.value.phase='error';this.value.error=error instanceof Error?error.message:'The document operation could not be completed.'}
    this.value.dirty=!!this.documents.read();this.emit()
  }
  private accept(document:CircuitDocument,captured:Capture) {
    const current=this.documents.read()
    if(!current||current.draftId!==captured.draftId) return false
    this.value.binding={localDraftId:current.draftId,documentId:document.document_id,projectId:document.project_id,serverRevision:document.revision}
    this.savedRevision=captured.revision;this.savedFingerprint=captured.fingerprint
    this.value.dirty=!this.unchanged(captured)||fingerprint(document)!==captured.fingerprint
    this.value.phase=this.value.dirty?'dirty':'saved';this.value.error=null;this.emit();return true
  }
  async open(documentId:string,options:{discardLocal?:true}={}):Promise<boolean> {
    if(this.disposed||!this.value.principalId||!this.canReplace(options.discardLocal===true)) return false
    const captured=this.capture(),principal=this.value.principalId
    this.epoch++;this.cancelRequests();const epoch=this.epoch,request=new AbortController();this.request=request
    this.value.error=null;this.emit()
    try {
      const document=await this.remote.get(documentId,request.signal)
      if(!this.current(epoch,principal)||!this.unchanged(captured)) return false
      this.documents.replace({name:document.name,graph:clone(document.graph)},'server')
      const accepted=this.capture()
      if(!accepted) throw new Error('The editor did not accept the opened document.')
      return this.accept(document,accepted)
    } catch(error) {if(this.current(epoch,principal)&&!request.signal.aborted) this.fail(error);return false}
    finally {if(this.request===request) this.request=null}
  }
  save():Promise<boolean> {
    if(this.disposed||!this.value.principalId) return Promise.resolve(false)
    if(this.saving) {this.queued=true;return this.saving}
    const captured=this.capture(),binding=this.value.binding
    if(!captured||!binding||binding.localDraftId!==captured.draftId) {
      this.value.error='Choose Save As and a project for this local document.';this.emit();return Promise.resolve(false)
    }
    if(this.value.phase==='conflict') return Promise.resolve(false)
    let finish!:(result:boolean)=>void
    const promise=new Promise<boolean>(resolve=>{finish=resolve});this.saving=promise;this.writingDraftId=captured.draftId
    this.epoch++;this.request?.abort()
    const epoch=this.epoch,principal=this.value.principalId
    void this.drain(captured,epoch,principal).then(result=>{
      if(this.saving===promise) {this.saving=null;this.writingDraftId=null}
      finish(result)
    },error=>{if(this.current(epoch,principal)) this.fail(error);if(this.saving===promise) {this.saving=null;this.writingDraftId=null}finish(false)})
    return promise
  }
  private async drain(initial:Capture,epoch:number,principal:string):Promise<boolean> {
    let captured:Capture|null=initial
    while(captured&&this.current(epoch,principal)) {
      const binding=this.value.binding
      if(!binding||binding.localDraftId!==captured.draftId) return false
      this.queued=false
      const request=new AbortController();this.request=request
      this.value.phase='saving';this.value.error=null;this.emit()
      try {
        const document=await this.remote.save(binding.documentId,binding.serverRevision,
          {name:captured.name,graph:clone(captured.graph)},request.signal)
        if(!this.current(epoch,principal)||!this.accept(document,captured)) return false
      } catch(error) {
        if(this.current(epoch,principal)) {
          if(!request.signal.aborted) {this.fail(error);await this.checkpoint()}
          this.queued=false
        }
        return false
      } finally {if(this.request===request) this.request=null}
      if(!this.queued||!this.value.dirty) return true
      captured=this.capture()
    }
    return false
  }
  saveAs(projectId:string):Promise<boolean> {
    if(this.disposed||!this.value.principalId||this.saving) return Promise.resolve(false)
    const captured=this.capture();if(!captured) return Promise.resolve(false)
    this.epoch++;this.request?.abort();this.queued=false
    const epoch=this.epoch,principal=this.value.principalId
    let finish!:(result:boolean)=>void
    const promise=new Promise<boolean>(resolve=>{finish=resolve});this.saving=promise;this.writingDraftId=captured.draftId
    void this.create(projectId,captured,epoch,principal).then(result=>{
      if(this.saving===promise) {this.saving=null;this.writingDraftId=null}
      finish(result)
    },error=>{if(this.current(epoch,principal)) this.fail(error);if(this.saving===promise) {this.saving=null;this.writingDraftId=null}finish(false)})
    return promise
  }
  private async create(projectId:string,captured:Capture,epoch:number,principal:string):Promise<boolean> {
    const request=new AbortController();this.request=request
    this.value.phase='saving';this.value.error=null;this.emit()
    try {
      const document=await this.remote.create(projectId,{name:captured.name,graph:clone(captured.graph)},request.signal)
      if(!this.current(epoch,principal)||!this.accept(document,captured)) return false
      if(this.queued&&this.value.dirty) {
        const latest=this.capture()
        if(latest) return this.drain(latest,epoch,principal)
      }
      return true
    } catch(error) {if(this.current(epoch,principal)&&!request.signal.aborted) {this.fail(error);await this.checkpoint()}return false}
    finally {if(this.request===request) this.request=null}
  }
  async recover(draftId:string,options:{discardLocal?:true}={}):Promise<boolean> {
    if(this.disposed||!this.value.principalId||!this.canReplace(options.discardLocal===true)) return false
    this.epoch++;this.cancelRequests()
    const epoch=this.epoch,principal=this.value.principalId,captured=this.capture()
    try {
      const draft=await this.recovery.load(principal,draftId)
      if(!draft||!this.current(epoch,principal)||!this.unchanged(captured)) return false
      this.documents.replace({name:draft.name,graph:clone(draft.graph)},'recovery')
      const current=this.documents.read();if(!current) return false
      this.value.binding=draft.binding?{...draft.binding,localDraftId:current.draftId}:null
      this.savedRevision=null;this.savedFingerprint=null;this.value.dirty=true
      this.value.phase=this.value.binding?'dirty':'local';this.value.error=null;this.value.recoveryError=null;this.emit();return true
    } catch {if(this.current(epoch,principal)) {this.value.recoveryError='This recovery draft is unavailable, corrupt, or uses an unsupported version.';this.emit()}return false}
  }
  async listRecovery():Promise<RecoverySummary[]> {
    if(this.disposed||!this.value.principalId) return []
    const epoch=this.epoch,principal=this.value.principalId
    try {const rows=await this.recovery.list(principal);return this.current(epoch,principal)?rows:[]}
    catch {if(this.current(epoch,principal)) {this.value.recoveryError='Recovery drafts could not be read from browser storage.';this.emit()}return []}
  }
  async claimGuestRecovery(sourceGuestId:string,confirmed:boolean):Promise<boolean> {
    if(this.disposed||!this.value.principalId||confirmed!==true) return false
    const epoch=this.epoch,principal=this.value.principalId
    try {await this.recovery.claim(sourceGuestId,principal,confirmed);return this.current(epoch,principal)}
    catch {if(this.current(epoch,principal)) {this.value.recoveryError='Guest recovery could not be transferred. Existing drafts have been preserved.';this.emit()}return false}
  }
  async removeRecovery(draftId:string):Promise<boolean> {
    if(this.disposed||!this.value.principalId) return false
    const epoch=this.epoch,principal=this.value.principalId
    try {await this.recovery.remove(principal,draftId);return this.current(epoch,principal)}
    catch {if(this.current(epoch,principal)) {this.value.recoveryError='The recovery draft could not be removed from browser storage.';this.emit()}return false}
  }
  /** Resolve at Run click, outside reactive rendering, against the exact editor authority. */
  currentSavedReference():{document_id:string;revision:number}|null {
    const current=this.documents.read(),binding=this.value.binding
    if(this.disposed||!this.value.principalId||this.value.dirty||!current||!binding||this.saving
        ||binding.localDraftId!==current.draftId||current.revision!==this.savedRevision
        ||fingerprint(current)!==this.savedFingerprint) return null
    return {document_id:binding.documentId,revision:binding.serverRevision}
  }
  /** Confirmed remote deletion leaves the editable document as a local copy. */
  detach():void {
    if(this.disposed) return
    this.epoch++;this.cancelRequests();this.value.binding=null;this.savedRevision=null;this.savedFingerprint=null
    this.value.phase='local';this.value.error=null;this.documentChanged()
  }
  dispose() {this.disposed=true;this.epoch++;this.cancelRequests();this.cancelCheckpoint()}
}
