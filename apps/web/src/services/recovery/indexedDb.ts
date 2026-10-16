import { BoundedRecoveryRepository, type RecoveryLimits, type RecoveryStorage } from '../../application/projects/recovery'

interface StoredRow { key:string; value:unknown }
const STORE='drafts'
const VERSION=1
const rowKey=(value:unknown,index:number)=>{
  const row=value as {principalId?:unknown;draftId?:unknown}|null
  return row&&typeof row.principalId==='string'&&typeof row.draftId==='string'
    ?JSON.stringify([row.principalId,row.draftId]):'unrecognized:'+index
}

/** Browser adapter. Construction is lazy; unsupported storage fails on I/O.
 * Every mutation is one read/write transaction, including the bounds transform.
 * A successful put request is not a durability acknowledgement: only complete is.
 */
export class IndexedDbRecoveryStorage implements RecoveryStorage {
  private connection:Promise<IDBDatabase>|null=null
  private readonly factory:()=>IDBFactory|undefined
  private readonly name:string
  constructor(options:{databaseName?:string;factory?:()=>IDBFactory|undefined}={}) {
    this.name=options.databaseName??'netcircuit-document-recovery'
    this.factory=options.factory??(()=>globalThis.indexedDB)
  }
  private open():Promise<IDBDatabase> {
    if(this.connection) return this.connection
    const factory=this.factory()
    if(!factory) return Promise.reject(new Error('IndexedDB recovery is unavailable in this browser.'))
    const connection=new Promise<IDBDatabase>((resolve,reject)=>{
      let settled=false
      const request=factory.open(this.name,VERSION)
      const fail=(error:unknown)=>{if(!settled) {settled=true;reject(error)}}
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'key'})
      }
      request.onerror=()=>fail(request.error??new Error('IndexedDB recovery could not be opened.'))
      request.onblocked=()=>fail(new Error('IndexedDB recovery is blocked by another tab.'))
      request.onsuccess=()=>{
        const database=request.result
        if(settled) {database.close();return}
        settled=true
        database.onversionchange=()=>{database.close();if(this.connection===connection) this.connection=null}
        resolve(database)
      }
    })
    this.connection=connection
    void connection.catch(()=>{if(this.connection===connection) this.connection=null})
    return connection
  }
  private async transaction(write:boolean,change?:(rows:unknown[])=>unknown[]):Promise<unknown[]> {
    const database=await this.open()
    return new Promise<unknown[]>((resolve,reject)=>{
      let failure:unknown,result:unknown[]=[]
      const transaction=database.transaction(STORE,write?'readwrite':'readonly')
      transaction.oncomplete=()=>resolve(result)
      transaction.onabort=()=>reject(failure??transaction.error??new Error('IndexedDB recovery transaction was aborted.'))
      transaction.onerror=()=>{failure??=transaction.error??new Error('IndexedDB recovery transaction failed.')}
      const store=transaction.objectStore(STORE),request=store.getAll()
      request.onsuccess=()=>{
        try {
          const rows=(request.result as StoredRow[]).map(row=>row.value)
          result=change?change(rows):rows
          if(write) {
            store.clear()
            result.forEach((value,index)=>store.put({key:rowKey(value,index),value} satisfies StoredRow))
          }
        } catch(error) {failure=error;transaction.abort()}
      }
    })
  }
  read():Promise<unknown[]> {return this.transaction(false)}
  async update(change:(rows:unknown[])=>unknown[]):Promise<void> {await this.transaction(true,change)}
}

export function createIndexedDbRecoveryRepository(options:{databaseName?:string;factory?:()=>IDBFactory|undefined;limits?:Partial<RecoveryLimits>}={}) {
  return new BoundedRecoveryRepository(new IndexedDbRecoveryStorage(options),options.limits)
}
