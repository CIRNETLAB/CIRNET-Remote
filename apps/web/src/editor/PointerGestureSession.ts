/** Pointer/draft ownership is independent of Vue, rendering and graph/history. */
export class PointerGestureSession {
  private owner:{pointer:number;draft:string|null}|null=null
  get active() {return this.owner!==null}
  begin(pointer:number,draft:string|null):boolean {
    if(this.owner||!Number.isSafeInteger(pointer)) return false
    this.owner={pointer,draft};return true
  }
  owns(pointer:number,draft:string|null):boolean {return this.owner?.pointer===pointer&&this.owner.draft===draft}
  complete(pointer:number,draft:string|null):boolean {
    if(this.owner?.pointer!==pointer) return false
    const admitted=this.owner.draft===draft;this.owner=null;return admitted
  }
  cancel():number|null {const pointer=this.owner?.pointer??null;this.owner=null;return pointer}
}
