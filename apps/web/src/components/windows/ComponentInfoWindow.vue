<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useCircuitStore } from '../../stores/circuit'
import { useUiStore } from '../../stores/ui'
import { libraryComponents, iconUrl } from '../../data/ribbon'
import { getDefinition } from '../../data/editorCatalog'
import { componentAddType, componentDesignTransition, componentDisplayName, getPartForType, getPartForModule } from '../../data/partCatalog'
import domains from '../../data/signalPortCatalog.json'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import ComponentPropertiesForm from './ComponentPropertiesForm.vue'
import ComponentThumbnail from '../workbench/ComponentThumbnail.vue'
import { supportsFlexiblePlacement } from '../../electrical/flexibleGeometry'
const workspace = useWorkspaceStore(), circuit = useCircuitStore(), ui = useUiStore()
const header = ref<HTMLElement>()
const propertyForm = ref<InstanceType<typeof ComponentPropertiesForm>>()
const window = computed(() => ui.windows.find(entry => entry.kind === 'component-info'))
const selected = computed(() => circuit.graph?.modules.find(module => module.id === workspace.selectedModuleId))
const isDraft = computed(() => !!workspace.placementType)
const type = computed(() => workspace.placementType ?? selected.value?.type)
const properties = computed(() => isDraft.value ? workspace.placementProperties ?? undefined : selected.value?.properties)
const contextKey = computed(() => isDraft.value ? `draft:${workspace.placementEpoch}` : `module:${selected.value?.id}`)
const definition = computed(() => type.value ? getDefinition(type.value) : undefined)
const part = computed(() => isDraft.value && type.value ? getPartForType(type.value) : selected.value ? getPartForModule(selected.value) : undefined)
const canRebuild = computed(() => !isDraft.value && !!selected.value && (!!getPartForType(selected.value.type)?.package.shape || supportsFlexiblePlacement(selected.value.type)))
const rebuildPreview = computed(() => workspace.componentGeometryPreview?.id === selected.value?.id ? workspace.componentGeometryPreview : null)
const simulationState = computed(() => !isDraft.value && selected.value && circuit.physicalStates?.[selected.value.id])
const item = computed(() => libraryComponents.find(entry => entry.type === type.value))
const name = computed(() => part.value ? componentDisplayName(part.value.editorType) : definition.value?.name ?? item.value?.name ?? type.value ?? 'Component')
const unavailable = computed(() => type.value && domains.components.find(entry => entry.type === type.value)?.execution === 'UNAVAILABLE')
const deleteHint = computed(() => {
  const count=circuit.graph?.modules.filter(module=>module.mount?.kind==='breadboard-flexible'&&module.mount.boardId===selected.value?.id).length??0
  return count?`Delete this board and its ${count} flexible assemblies together. Undo restores all.`:'Delete component'
})
function updateProperties(patch: Record<string, unknown>) {
  if (!type.value) return
  try {
    const target = componentDesignTransition(type.value, patch)
    if (isDraft.value) workspace.updatePlacementProperties(patch, target.type)
    else if (selected.value) {
      if (target.type !== type.value) circuit.changeComponentDesign(selected.value.id, target.type, patch, target.pinMap)
      else circuit.updateModuleProperties(selected.value.id, patch)
    }
    workspace.editError = ''
  } catch (cause) { workspace.editError = cause instanceof Error ? cause.message : 'Invalid design properties.' }
}
function add() {
  if (!definition.value || !type.value) return
  try {
    const patch = propertyForm.value?.readDraft() ?? {}
    const target = componentDesignTransition(componentAddType(type.value), patch)
    const next = { ...getDefinition(target.type)?.defaults, ...properties.value, ...patch }
    workspace.armPlacement(target.type, next); ui.activeRibbonGroup = null
  } catch (cause) { workspace.editError = cause instanceof Error ? cause.message : 'Invalid design properties.' }
}
function remove() { if (!isDraft.value && selected.value) { circuit.removeModule(selected.value.id); ui.closeWindow('component-info') } }
function cancelRebuild() { workspace.componentGeometryPreview = null }
function previewRebuild() {
  if (!selected.value) return
  cancelRebuild()
  try { workspace.componentGeometryPreview = circuit.previewComponentGeometry(selected.value.id); workspace.editError = '' }
  catch (cause) { workspace.editError = cause instanceof Error ? cause.message : 'Component geometry does not fit.' }
}
function applyRebuild() {
  if (!selected.value || !rebuildPreview.value) return
  const id = selected.value.id, preview = rebuildPreview.value
  cancelRebuild()
  try { circuit.rebuildComponentGeometry(id, preview); workspace.editError = '' }
  catch (cause) { workspace.editError = cause instanceof Error ? cause.message : 'Component geometry does not fit.' }
}
function close() { cancelRebuild(); ui.closeWindow('component-info'); void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus()) }
watch(() => [circuit.graphRevision, circuit.activeId, workspace.selectedModuleId, workspace.tool, workspace.placementEpoch, window.value?.open], cancelRebuild, {flush:'sync'})
onUnmounted(cancelRebuild)
watch(() => window.value?.activation, activation => { if (activation) void nextTick(() => header.value?.focus()) })
</script>
<template>
  <aside v-if="window?.open && type && !workspace.wireOptionsActive" class="component-information contextual-panel" aria-labelledby="component-information-title" :style="{ zIndex: window.z }" @pointerdown="ui.focusWindow('component-info')" @focusin="ui.focusWindow('component-info')" @keydown.esc.stop.prevent="close">
    <header ref="header" class="component-information-header" tabindex="0"><WorkbenchIcon name="chip" /><strong id="component-information-title">Component Info</strong><button aria-label="Close Component Info" @click="close"><WorkbenchIcon name="close" /></button></header>
    <div class="component-information-content">
      <div class="component-information-art"><ComponentThumbnail v-if="part" :type="type" :properties="properties" :module="isDraft ? undefined : selected" :modules="circuit.graph?.modules" :alt="name + ' preview'" :lazy="false" priority="high" /><img v-else-if="item?.icon" :src="iconUrl(item.icon)" :alt="name + ' preview'" width="250" height="110" /><WorkbenchIcon v-else :name="item?.glyph || 'chip'" /></div>
      <div class="component-information-heading"><h2>{{ name }}</h2></div>
      <ComponentPropertiesForm v-if="part && part.editor.parameters.length" ref="propertyForm" :type="type" :properties="properties" :context-key="contextKey" :descriptor="part" @update="updateProperties" />
      <p v-if="workspace.editError" role="alert" class="property-error">{{ workspace.editError }}</p>
      <p v-else-if="simulationState && ['ERROR', 'UNSUPPORTED'].includes(simulationState.state)" class="component-information-status" role="status">{{ simulationState.reason || simulationState.state }}</p>
      <p v-else-if="unavailable" class="component-information-status">Execution model unavailable.</p>
      <p v-else-if="definition?.visualOnly" class="component-information-status">Visual component.</p>
      <div v-if="canRebuild" class="component-geometry-rebuild">
        <template v-if="rebuildPreview"><p role="status">Preview: updated body and leads. Placement and pin bindings are preserved.</p><button aria-label="Apply rebuilt component geometry" @click="applyRebuild">Apply geometry</button><button aria-label="Cancel component geometry rebuild" @click="cancelRebuild">Cancel</button></template>
        <button v-else aria-label="Rebuild component geometry" @click="previewRebuild">Rebuild component geometry</button>
      </div>
      <template v-if="part"><details class="component-pinout"><summary>Pinout · {{ part.package.pins.length }} pins</summary><label class="show-pins-toggle"><input type="checkbox" :checked="workspace.showPins" @change="workspace.showPins = ($event.target as HTMLInputElement).checked" />Show pins</label><ol><li v-for="pin in part.package.pins" :key="pin.id"><b>{{ pin.number }}</b><span>{{ pin.name }}</span><small>{{ pin.role }}{{ pin.outputType ? ' · ' + pin.outputType : '' }}</small></li></ol></details></template>
    </div>
    <footer class="component-information-footer"><button class="delete-btn" :disabled="isDraft || !selected" :title="deleteHint" :aria-label="'Delete ' + name" @click="remove"><WorkbenchIcon name="delete" /> Delete</button><button :disabled="!definition" :aria-label="'Add ' + name" @click="add">Add <span aria-hidden="true">+</span></button></footer>
  </aside>
</template>
