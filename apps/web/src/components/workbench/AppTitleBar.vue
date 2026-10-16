<script setup lang="ts">
import { onMounted, onUnmounted, ref,watch } from 'vue'
import { useCircuitStore } from '../../stores/circuit'
import { useUiStore } from '../../stores/ui'
import { useInstrumentStore } from '../../stores/instrument'
import { MAX_CIRCUIT_FILE_BYTES, parseCircuitFile } from '../../services/files/circuitFile'
import { iconUrl } from '../../data/ribbon'
import WorkbenchIcon from './WorkbenchIcon.vue'
import AccountMenu from '../account/AccountMenu.vue'
import { useProjectStore } from '../../stores/projects'
const circuit = useCircuitStore()
const ui = useUiStore()
const instrument = useInstrumentStore()
const projects=useProjectStore()
const fileInput = ref<HTMLInputElement>()
const error = ref('')
let readVersion = 0, disposed = false
watch(()=>projects.saveState.principalId,()=>{readVersion++;error.value='';if(fileInput.value)fileInput.value.value=''}, {flush:'sync'})
const newFile = () => { readVersion++; if (fileInput.value) fileInput.value.value = ''; circuit.createDraft(); error.value = '' }
async function openFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const version = ++readVersion
  try {
    if (file.size > MAX_CIRCUIT_FILE_BYTES) throw new Error('Circuit file is too large (maximum 2 MB).')
    const contents = await file.text()
    if (disposed || version !== readVersion) return
    circuit.importGraph(parseCircuitFile(contents))
    error.value = ''
    instrument.log(`Opened ${file.name} locally.`)
  } catch (reason) { if (!disposed && version === readVersion) error.value = reason instanceof Error ? reason.message : 'Cannot open circuit file.' }
  finally { if (version === readVersion) input.value = '' }
}
function saveFile() {
  if (!circuit.current) return
  try {
    const url = URL.createObjectURL(new Blob([circuit.exportGraph()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${circuit.current.name.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 80) || 'circuit'}.json`
    document.body.append(link)
    try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0) }
    error.value = ''
    instrument.log('Circuit JSON export requested.')
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'Cannot save circuit file.' }
}
function saveServer(){if(projects.saveState.binding)void projects.saveCurrent();else ui.openWindow('projects')}
function shortcuts(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]') || !(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (!['n', 'o', 's', 'z', 'y'].includes(key)) return
  event.preventDefault()
  if (key === 'n') newFile()
  if (key === 'o') ui.openWindow('projects')
  if (key === 's') saveServer()
  if (key === 'z') event.shiftKey ? circuit.redo() : circuit.undo()
  if (key === 'y') circuit.redo()
}
onMounted(() => window.addEventListener('keydown', shortcuts))
onUnmounted(() => { disposed = true; readVersion++; window.removeEventListener('keydown', shortcuts) })
</script>
<template>
  <header class="app-titlebar">
    <div class="brand" aria-label="net*CIRCUIT Remote"><span class="brand-mark"><img :src="iconUrl('favicon')" alt="net*CIRCUIT Remote" width="38" height="38" /></span><strong>net<span class="brand-circuit">*CIRCUIT</span> <span class="brand-remote">Remote</span></strong></div>
    <div class="file-actions" role="toolbar" aria-label="File actions">
      <button title="New circuit (Ctrl+N)" @click="newFile"><WorkbenchIcon name="new" />New</button>
      <button title="Open Project Manager (Ctrl+O)" aria-label="Open Project Manager" @click="ui.openWindow('projects')"><WorkbenchIcon name="open" />Projects</button>
      <button title="Save server document (Ctrl+S)" aria-label="Save current server document" :disabled="!circuit.current || projects.saveState.phase==='saving'" @click="saveServer"><WorkbenchIcon name="save" />Save</button>
      <button title="Save as another server document" aria-label="Open Save As" :disabled="!circuit.current" @click="ui.openWindow('projects')">Save As</button>
      <button title="Import Circuit Graph JSON" @click="fileInput?.click()">Import JSON</button>
      <button title="Export Circuit Graph JSON" aria-label="Export circuit JSON" :disabled="!circuit.current" @click="saveFile">Export JSON</button>
      <button aria-label="Open Assignments" @click="ui.openWindow('assignments')">Assignments</button>
      <button aria-label="Open History and Queue" @click="ui.openWindow('history')">History</button>
      <span class="toolbar-divider" />
      <button title="Undo (Ctrl+Z)" :disabled="!circuit.canUndo" @click="circuit.undo()"><WorkbenchIcon name="undo" />Undo</button>
      <button title="Redo (Ctrl+Shift+Z)" :disabled="!circuit.canRedo" @click="circuit.redo()"><WorkbenchIcon name="redo" />Redo</button>
    </div>
    <div class="project-title" :title="circuit.current?.name || 'No circuit'"><span class="dirty-dot" v-if="projects.saveState.dirty" aria-label="Unsaved changes" />{{ circuit.current?.name || 'No circuit open' }}<small>{{ projects.saveState.binding ? 'SERVER · '+projects.saveState.phase : 'LOCAL DRAFT' }}</small></div>
    <AccountMenu />
    <button class="inspector-toggle" title="Open Inspector" aria-label="Open Inspector" @click="ui.openWindow('inspector')"><WorkbenchIcon name="inspector" /><span>Inspector</span></button>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json" aria-label="Open circuit file" @change="openFile" />
  </header>
  <div v-if="error" class="file-error" role="alert">{{ error }}<button aria-label="Dismiss file error" @click="error = ''"><WorkbenchIcon name="close" /></button></div>
</template>
