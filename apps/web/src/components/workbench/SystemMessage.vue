<script setup lang="ts">
import { computed,nextTick,ref } from 'vue'
import { useWorkspaceMessageStore } from '../../stores/workspaceMessages'
import { useUiStore } from '../../stores/ui'
import WorkbenchIcon from './WorkbenchIcon.vue'
const messages=useWorkspaceMessageStore(),ui=useUiStore()
const current=computed(()=>messages.current),expanded=ref(false),details=ref<HTMLElement>(),toggle=ref<HTMLButtonElement>()
const prefix=computed(()=>current.value?.level==='error'?'Error: ':current.value?.level==='warning'?'Notice: ':'')
async function readDetails(){expanded.value=!expanded.value;if(expanded.value)await nextTick(()=>details.value?.focus())}
function closeDetails(){expanded.value=false;toggle.value?.focus()}
function dismiss(){if(current.value)messages.dismiss(current.value.id)}
</script>
<template>
  <div class="system-message" data-workspace-text-input>
    <span class="system-message-text" role="status" aria-live="polite" aria-atomic="true" :title="current?.level==='error'?'':prefix+(current?.text??'Ready.')">{{ current?.level==='error'?'':prefix+(current?.text??'Ready.') }}</span>
    <span class="system-message-text" role="alert" aria-live="assertive" aria-atomic="true" :title="current?.level==='error'?prefix+current.text:''">{{ current?.level==='error'?prefix+current.text:'' }}</span>
    <button ref="toggle" aria-label="Read full system message" :aria-expanded="expanded" aria-controls="system-message-details" title="Read full system message and recent messages" @click="readDetails"><WorkbenchIcon name="inspector" /></button>
    <button v-if="current?.window" :aria-label="'Open '+current.window+' for system message'" title="Open related window" @click="ui.openWindow(current.window)"><WorkbenchIcon name="open" /></button>
    <button v-if="current" aria-label="Dismiss system message" title="Dismiss this message" @click="dismiss"><WorkbenchIcon name="close" /></button>
    <section v-if="expanded" id="system-message-details" ref="details" class="system-message-details" tabindex="-1" aria-label="System message details" @keydown.esc.stop.prevent="closeDetails">
      <header><strong>System messages</strong><button aria-label="Close system message details" @click="closeDetails"><WorkbenchIcon name="close" /></button></header>
      <p>{{ prefix }}{{ current?.text??'Ready.' }}</p>
      <ol aria-label="Recent system messages"><li v-for="message in [...messages.events].reverse()" :key="message.id">{{ message.level==='error'?'Error: ':message.level==='warning'?'Notice: ':'' }}{{ message.text }}</li></ol>
    </section>
  </div>
</template>
<style scoped>
.system-message { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 4px; color: #fff; opacity: 1; }
.system-message-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; opacity: 1; }
.system-message-text:empty { flex: 0 0 0; }
.system-message button { flex: 0 0 22px; width: 22px; min-height: 24px; display: grid; place-items: center; padding: 3px; background: transparent; border-color: transparent; color: #fff; opacity: 1; }
.system-message button svg { width: 13px; height: 13px; }
.system-message-details { position: absolute; bottom: calc(100% + 12px); left: 0; z-index: 80; width: min(600px, calc(100vw - 24px)); max-height: min(360px, 60vh); overflow: auto; padding: 12px; border: 1px solid var(--line); background: #182330; box-shadow: 0 5px 20px #0008; font-size: 12px; color: #fff; opacity: 1; }
.system-message-details header { display: flex; align-items: center; justify-content: space-between; }
.system-message-details p, .system-message-details li, .system-message-details strong { color: #fff; opacity: 1; overflow-wrap: anywhere; white-space: pre-wrap; }
.system-message-details li { margin-block: 6px; }
.system-message-details ol { padding-left: 18px; }
</style>
