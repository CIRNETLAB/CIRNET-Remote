// A transport context distinguishes this tab from other viewers. It grants no authority.
let identity:string|undefined
export function controlClientId():string {
  return identity??=globalThis.crypto.randomUUID()
}
