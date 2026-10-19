import { defineComponent,h,type Component } from 'vue'
import type { Pinia } from 'pinia'
import { provideExecutionCommands,type ExecutionCommands } from '../../src/composables/useExecutionCommands'
import { mountSfc } from './vueSfc'

/** The test host owns the commands just as SingleWorkspaceShell does. */
export function mountExecutionPanel(panel:Component,pinia:Pinia){
  let commands!:ExecutionCommands
  const host=defineComponent({setup(){commands=provideExecutionCommands();return()=>h(panel)}})
  return {...mountSfc(host,pinia),commands}
}
