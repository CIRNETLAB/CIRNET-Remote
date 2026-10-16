import { toRaw } from 'vue'

/** Pinia's browser action tracking adds proxy contexts; resources belong to the underlying store. */
export class StoreScopeMap<T> extends WeakMap<object,T> {
  override get(owner:object):T|undefined{return super.get(toRaw(owner))}
  override has(owner:object):boolean{return super.has(toRaw(owner))}
  override set(owner:object,value:T):this{super.set(toRaw(owner),value);return this}
  override delete(owner:object):boolean{return super.delete(toRaw(owner))}
}
