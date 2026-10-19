import { defineStore } from 'pinia'
import type { WindowKind } from '../types/windows'

export interface MessageOptions {
  level?: 'info' | 'warning' | 'error'
  scope?: 'session' | 'draft'
  window?: WindowKind
}
export interface WorkspaceMessage {
  id: number
  source: string
  text: string
  level: 'info' | 'warning' | 'error'
  scope: 'session' | 'draft'
  kind: 'event' | 'hint'
  time: number
  active: boolean
  window?: WindowKind
}
const severity={info:1,warning:2,error:3}
function matches(message:WorkspaceMessage,text:string,options:MessageOptions){
  return message.text===text&&message.level===(options.level??'info')&&message.scope===(options.scope??'draft')&&message.window===options.window
}

/** Workspace presentation only: resolving a message never changes execution
 * admission, document contents or the editor's active operation. */
export const useWorkspaceMessageStore=defineStore('workspace-messages',{
  state:()=>({events:[] as WorkspaceMessage[],hints:{} as Record<string,WorkspaceMessage>,nextId:1,principalKey:'',draftId:null as string|null}),
  getters:{
    current(state):WorkspaceMessage|null {
      const candidates=[...state.events,...Object.values(state.hints)].filter(message=>message.active)
      candidates.sort((a,b)=>severity[b.level]-severity[a.level]||b.id-a.id)
      return candidates[0]??null
    },
  },
  actions:{
    setScope(principal:string|null,epoch:number,draft:string|null){
      const key=JSON.stringify([principal,epoch])
      if(key!==this.principalKey){this.events=[];this.hints={};this.principalKey=key}
      else if(draft!==this.draftId){
        this.events=this.events.filter(message=>message.scope==='session')
        for(const [source,message] of Object.entries(this.hints))if(message.scope==='draft')delete this.hints[source]
      }
      this.draftId=draft
    },
    publish(source:string,text:string,options:MessageOptions={}):number|null {
      text=text.trim();if(!text)return null
      const repeated=this.events.find(message=>message.active&&message.source===source&&matches(message,text,options))
      if(repeated)return repeated.id
      const message:WorkspaceMessage={id:this.nextId++,source,text,level:options.level??'info',scope:options.scope??'draft',kind:'event',time:Date.now(),active:true,...(options.window?{window:options.window}:{})}
      this.events.push(message)
      if(this.events.length>60)this.events.splice(0,this.events.length-60)
      return message.id
    },
    setHint(source:string,text:string,options:MessageOptions={}){
      text=text.trim();if(!text){delete this.hints[source];return}
      const previous=this.hints[source]
      if(previous&&matches(previous,text,options))return
      this.hints[source]={id:this.nextId++,source,text,level:options.level??'info',scope:options.scope??'draft',kind:'hint',time:Date.now(),active:true,...(options.window?{window:options.window}:{})}
    },
    clearSource(source:string){
      delete this.hints[source]
      for(const message of this.events)if(message.source===source)message.active=false
    },
    dismiss(id:number){
      for(const message of [...this.events,...Object.values(this.hints)])if(message.id===id)message.active=false
    },
  },
})
