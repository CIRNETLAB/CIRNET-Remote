import {contactOccupied,getMechanicalProfile,solveFlexibleMount,supportsFlexiblePlacement,type FlexibleSolution} from '../electrical/flexibleGeometry'
import {getBreadboardContact} from '../electrical/BreadboardTopology'
import type {CircuitModule,FlexibleMountV1,Point3} from '../types/circuit'

/** Pure draft state. Only choose's successful second anchor may become a command. */
export class FlexiblePlacementController {
 phase:'idle'|'choose-first-pin'|'choose-second-pin'='idle'
 type='';epoch=0;first:{boardId:string;contactId:string}|null=null
 bends:Point3[]=[];reason='';solution:FlexibleSolution|null=null
 arm(type:string,epoch:number){this.cancel();if(supportsFlexiblePlacement(type)){this.type=type;this.epoch=epoch;this.phase='choose-first-pin'}}
 cancel(){this.phase='idle';this.first=null;this.bends=[];this.solution=null;this.reason=''}
 hover(boardId:string,contactId:string,modules:CircuitModule[]){
  if(!this.first)return null
  if(boardId!==this.first.boardId){this.reason='Choose the second hole on the same breadboard.';this.solution=null;return null}
  const result=solveFlexibleMount(this.type,boardId,this.first.contactId,contactId,modules,{bends:this.bends,previous:this.solution?.mount??undefined})
  this.solution=result;this.reason=contactId===this.first.contactId?'Choose the second hole (distinct from pin A / +).':result.reason;return result
 }
 choose(boardId:string,contactId:string,modules:CircuitModule[]):FlexibleMountV1|null{
  if(this.phase==='idle')return null
  const board=modules.find(m=>m.id===boardId)
  if(!board||!getBreadboardContact(board.type,contactId)){this.reason='Choose an existing breadboard hole.';return null}
  if(!this.first){
   if(contactOccupied(modules,boardId,contactId)){this.reason='A physical hole is already occupied.';return null}
   this.first={boardId,contactId};this.phase='choose-second-pin';this.reason='';return null
  }
  const solution=this.hover(boardId,contactId,modules)
  return solution?.valid&&solution.mount?structuredClone(solution.mount):null
 }
 addBend(point:Point3){const profile=getMechanicalProfile(this.type),reserved=profile?.strategy==='radial'?2:1;if(this.first&&profile&&this.bends.length<profile.maxControlsPerLead-reserved&&Object.values(point).every(Number.isFinite))this.bends.push({...point});else if(this.first)this.reason='Maximum authored bend count reached.'}
 removeBend(){this.bends.pop();this.solution=null;this.reason=''}
 get hint(){return this.reason||(this.phase==='choose-first-pin'?'Choose pin A / + hole. Escape cancels.':this.phase==='choose-second-pin'?'Choose pin B / − hole. Right-click: bend · Backspace: remove bend · Escape: cancel.':'')}
}
