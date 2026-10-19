<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCircuitStore } from '../../stores/circuit'
import { useUiStore } from '../../stores/ui'
import { useInstrumentStore } from '../../stores/instrument'
import { MAX_CIRCUIT_FILE_BYTES, parseCircuitFile } from '../../services/files/circuitFile'
import { iconUrl } from '../../data/ribbon'
import WorkbenchIcon from './WorkbenchIcon.vue'
import AccountMenu from '../account/AccountMenu.vue'
import { useProjectStore } from '../../stores/projects'
import { useWorkspaceMessageStore } from '../../stores/workspaceMessages'
import FileMenu from './FileMenu.vue'
import { executeFileCommand, type FileCommand, type FileMenuItem } from './fileCommands'
const circuit = useCircuitStore()
const ui = useUiStore()
const instrument = useInstrumentStore()
const projects=useProjectStore()
const messages = useWorkspaceMessageStore()
const fileInput = ref<HTMLInputElement>()
const error = ref('')
let readVersion = 0, disposed = false
let errorCommand: 'import' | 'export' | null = null
function clearError() { error.value = ''; errorCommand = null; messages.clearSource('file') }
function fileError(reason: unknown, fallback: string, command: 'import' | 'export') {
  errorCommand = command
  error.value = reason instanceof Error ? reason.message : fallback
  messages.setHint('file', error.value, { level: 'error', scope: 'draft' })
  instrument.log(error.value, 'error', { source: 'file', scope: 'draft' })
}
watch(()=>projects.saveState.principalId,()=>{readVersion++;clearError();if(fileInput.value)fileInput.value.value=''}, {flush:'sync'})
const newFile = () => { readVersion++; if (fileInput.value) fileInput.value.value = ''; circuit.createDraft(); clearError() }
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
    clearError()
    messages.publish('file', `Opened ${file.name} locally.`, { scope: 'draft' })
    instrument.log(`Opened ${file.name} locally.`, 'info', { source: 'file', scope: 'draft' })
  } catch (reason) { if (!disposed && version === readVersion) fileError(reason, 'Cannot open circuit file.', 'import') }
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
    // Export does not resolve a failed Import. Keep that actionable error until
    // another import succeeds, New is chosen, or the user dismisses it.
    if (errorCommand === 'export') clearError()
    messages.publish('file', 'Circuit JSON export requested.', { scope: 'draft' })
    instrument.log('Circuit JSON export requested.', 'info', { source: 'file', scope: 'draft' })
  } catch (reason) { fileError(reason, 'Cannot save circuit file.', 'export') }
}
const fileItems = computed<FileMenuItem[]>(() => [
  { id: 'new', label: 'New', disabled: false, shortcut: 'Ctrl+N' },
  { id: 'open', label: 'Open Project', disabled: false, shortcut: 'Ctrl+O', restoreFocus: false },
  { id: 'save', label: 'Save', disabled: !circuit.current || projects.saveState.phase === 'saving', shortcut: 'Ctrl+S', restoreFocus: !!projects.saveState.binding },
  { id: 'saveAs', label: 'Save As', disabled: !circuit.current, restoreFocus: false },
  { id: 'import', label: 'Import', disabled: false, restoreFocus: false },
  { id: 'export', label: 'Export', disabled: !circuit.current },
  { id: 'history', label: 'History', disabled: false, restoreFocus: false },
  { id: 'assignment', label: 'Assignment', disabled: false, restoreFocus: false },
])
function fileCommand(id: FileCommand) {
  executeFileCommand(fileItems.value, id, command => {
    if (command === 'new') newFile()
    if (command === 'open' || command === 'saveAs') ui.openWindow('projects')
    if (command === 'save') { if (projects.saveState.binding) void projects.saveCurrent(); else ui.openWindow('projects') }
    if (command === 'import') fileInput.value?.click()
    if (command === 'export') saveFile()
    if (command === 'history') ui.openWindow('history')
    if (command === 'assignment') ui.openWindow('assignments')
  })
}
function saveServer() { fileCommand('save') }
const focusedTab = ref<'component' | 'run'>(ui.activeRibbonTab)
watch(() => ui.activeRibbonTab, tab => { focusedTab.value = tab })
function selectTab(tab: 'component' | 'run') { focusedTab.value = tab; ui.selectRibbonTab(tab) }
function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  focusedTab.value = event.key === 'Home' ? 'component' : event.key === 'End' ? 'run' : focusedTab.value === 'component' ? 'run' : 'component'
  const tablist = (event.currentTarget as HTMLElement).parentElement
  void nextTick(() => tablist?.querySelector<HTMLButtonElement>(`#workbench-tab-${focusedTab.value}`)?.focus())
}
function shortcuts(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || !(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (!['n', 'o', 's', 'z', 'y'].includes(key)) return
  event.preventDefault()
  if (key === 'n') fileCommand('new')
  if (key === 'o') fileCommand('open')
  if (key === 's') saveServer()
  if (key === 'z') { if (event.shiftKey ? circuit.canRedo : circuit.canUndo) event.shiftKey ? circuit.redo() : circuit.undo() }
  if (key === 'y' && circuit.canRedo) circuit.redo()
}
onMounted(() => window.addEventListener('keydown', shortcuts))
onUnmounted(() => { disposed = true; readVersion++; window.removeEventListener('keydown', shortcuts) })
</script>
<template>
  <header class="app-titlebar">
    <div class="brand" aria-label="net*CIRCUIT Remote"><span class="brand-mark"><img :src="iconUrl('favicon')" alt="net*CIRCUIT Remote" width="38" height="38" /></span><strong>net<span class="brand-circuit">*CIRCUIT</span> <span class="brand-remote">Remote</span></strong></div>
    <div class="header-command-strip">
      <div class="quick-actions" role="group" aria-label="Edit history">
      <button title="Undo (Ctrl+Z)" :disabled="!circuit.canUndo" @click="circuit.undo()"><WorkbenchIcon name="undo" />Undo</button>
      <button title="Redo (Ctrl+Shift+Z)" :disabled="!circuit.canRedo" @click="circuit.redo()"><WorkbenchIcon name="redo" />Redo</button>
      </div>
      <FileMenu :items="fileItems" :dismiss-key="ui.activeRibbonTab" @command="fileCommand" />
      <div class="ribbon-tabs" role="tablist" aria-label="Workbench ribbon" data-workspace-text-input>
        <button id="workbench-tab-component" role="tab" :aria-selected="ui.activeRibbonTab === 'component'" aria-controls="workbench-panel-component" :tabindex="focusedTab === 'component' ? 0 : -1" @focus="focusedTab = 'component'" @click="selectTab('component')" @keydown="tabKey">Component</button>
        <button id="workbench-tab-run" role="tab" :aria-selected="ui.activeRibbonTab === 'run'" aria-controls="workbench-panel-run" :tabindex="focusedTab === 'run' ? 0 : -1" @focus="focusedTab = 'run'" @click="selectTab('run')" @keydown="tabKey">Run</button>
      </div>
    </div>
    <div class="project-title" :title="circuit.current?.name || 'No circuit'"><span class="dirty-dot" v-if="projects.saveState.dirty" aria-label="Unsaved changes" /><span class="project-name">{{ circuit.current?.name || 'No circuit open' }}</span><small>{{ projects.saveState.binding ? 'SERVER · '+projects.saveState.phase : 'LOCAL DRAFT' }}</small></div>
    <AccountMenu />
    <button class="inspector-toggle" title="Open Inspector" aria-label="Open Inspector" @click="ui.openWindow('inspector')"><WorkbenchIcon name="inspector" /><span>Inspector</span></button>
    <input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json" aria-label="Open circuit file" @change="openFile" />
  </header>
</template>
