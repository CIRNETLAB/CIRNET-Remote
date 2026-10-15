<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ribbonGroups, libraryComponents, iconUrl, type LibraryComponent } from '../../data/ribbon'
import { searchComponents } from '../../data/componentSearch'
import { getPartForType } from '../../data/partCatalog'
import ComponentThumbnail from './ComponentThumbnail.vue'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { getDefinition } from '../../data/editorCatalog'
import { useDrawerMotion } from '../../composables/useDrawerMotion'
import { createFrameTask } from '../../composables/frameTasks'
const ui = useUiStore()
const workspace = useWorkspaceStore()
const root = ref<HTMLElement>()
const drawer = ref<HTMLElement>()
const collapseToggle = ref<HTMLButtonElement>()
const collapseLabel = computed(() => ui.componentToolbarCollapsed ? 'Expand Components' : 'Collapse Components')
const expandedHeight = computed(() => ui.componentOverlayHeight)
const motion = useDrawerMotion({ collapsed: () => ui.componentToolbarCollapsed, drawer: () => drawer.value })
const active = computed(() => !ui.componentToolbarCollapsed ? ribbonGroups.find((group) => group.id === ui.activeRibbonGroup) : undefined)
const paletteStyle = ref({ left: '10px', width: '250px' })
const query = ref('')
const searchInput = ref<HTMLInputElement>()
const results = computed(() => searchComponents(query.value, query.value.trim() ? libraryComponents : active.value?.items ?? []))
let resizeObserver: ResizeObserver | undefined
function anchorPalette() {
  if (!active.value) return
  const bounds = root.value?.getBoundingClientRect()
  const trigger = root.value?.querySelector<HTMLButtonElement>(`[data-group="${ui.activeRibbonGroup}"]`)?.getBoundingClientRect()
  if (!bounds || !trigger || !active.value) return
  const width = Math.max(0, Math.min(query.value.trim() ? 680 : Math.max(280, 26 + active.value.items.length * 128), 680, bounds.width - 20))
  const left = Math.max(10, Math.min(trigger.left - bounds.left, bounds.width - width - 10))
  const next = { left: `${left}px`, width: `${width}px` }
  if (next.left !== paletteStyle.value.left || next.width !== paletteStyle.value.width) paletteStyle.value = next
}
const paletteTask = createFrameTask(anchorPalette)
watch(active, () => { query.value = ''; if (active.value) paletteTask.schedule(); else paletteTask.cancel() }, { flush: 'post' })
watch(query, () => paletteTask.schedule())
watch(() => ui.componentToolbarCollapsed, (collapsed) => {
  if (collapsed && root.value?.contains(document.activeElement) && document.activeElement !== collapseToggle.value) {
    void nextTick(() => collapseToggle.value?.focus())
  }
})
function choose(item: LibraryComponent) {
  // The palette will disappear. Retain a stable keyboard return target first.
  root.value?.querySelector?.<HTMLButtonElement>(`[data-group="${ui.activeRibbonGroup}"]`)?.focus()
  if (item.window) ui.openWindow(item.window)
  else if (item.type === 'JUMPER') workspace.setTool('wire')
  else if (getDefinition(item.type)) workspace.armPlacement(item.type)
  else { workspace.preview(item.type); workspace.editError = item.name + ' has no placeable editor model yet.' }
  ui.activeRibbonGroup = null
}
function drag(event: DragEvent, item: LibraryComponent) {
  if (!getDefinition(item.type) || !event.dataTransfer) { event.preventDefault(); return }
  event.dataTransfer.setData('application/x-netcircuit-component', item.type)
  event.dataTransfer.effectAllowed = 'copy'
  workspace.armPlacement(item.type)
}
function outside(event: PointerEvent) { if (event.target instanceof Node && !root.value?.contains(event.target)) ui.activeRibbonGroup = null }
function clearSearch() { query.value = ''; searchInput.value?.focus?.() }
function escape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !ui.activeRibbonGroup) return
  if (query.value) clearSearch()
  else { root.value?.querySelector?.<HTMLButtonElement>(`[data-group="${ui.activeRibbonGroup}"]`)?.focus(); ui.activeRibbonGroup = null }
}
function searchKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); escape(event) }
  else if (event.key === 'ArrowDown') { event.preventDefault(); root.value?.querySelector?.<HTMLButtonElement>('.palette-items button')?.focus() }
  else if (event.key === 'Enter' && results.value.length === 1) { event.preventDefault(); choose(results.value[0]!) }
}
function gridKey(event: KeyboardEvent) {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return
  const buttons = [...(root.value?.querySelectorAll?.<HTMLButtonElement>('.palette-items button') ?? [])]
  const index = buttons.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  const columns = Math.max(1, Math.round((buttons[0]?.parentElement?.clientWidth ?? 120) / 128))
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns)
  event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus()
}
onMounted(() => {
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
  resizeObserver = new ResizeObserver(() => { if (active.value) paletteTask.schedule() }); if (root.value) resizeObserver.observe(root.value)
})
onUnmounted(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); resizeObserver?.disconnect(); paletteTask.cancel() })
</script>
<template>
  <div ref="root" class="component-panel" data-workspace-text-input :class="{ 'is-collapsed': ui.componentToolbarCollapsed, 'is-reduced-motion': motion.reducedMotion.value }" :data-drawer-occupied="motion.occupied.value" :style="{ height: expandedHeight + 'px', '--ribbon-toggle-offset': ui.componentToolbarCollapsed ? '0px' : ui.workbenchSize.width / 2 - 22 + 'px' }">
    <div ref="drawer" class="component-drawer" :inert="ui.componentToolbarCollapsed" :aria-hidden="ui.componentToolbarCollapsed" @transitionend="motion.transitionEnd">
    <section id="component-toolbar" class="component-ribbon" aria-label="Component library">
    <div id="component-families" class="ribbon-scroll" role="toolbar" aria-label="Component families" @scroll="paletteTask.schedule">
      <button v-for="group in ribbonGroups" :key="group.id" :data-group="group.id" :aria-expanded="ui.activeRibbonGroup === group.id" aria-controls="ribbon-palette" :class="{ active: ui.activeRibbonGroup === group.id }" @click="ui.toggleRibbon(group.id)">
        <span class="ribbon-art"><img v-if="group.icon" :src="iconUrl(group.icon)" alt="" width="44" height="44" /><WorkbenchIcon v-else :name="group.glyph || 'chip'" /></span>
        <span class="ribbon-label">{{ group.label }}</span><WorkbenchIcon class="ribbon-chevron" name="chevron" />
      </button>
    </div>
    </section>
  <div v-if="active" id="ribbon-palette" class="ribbon-palette" :style="paletteStyle" :aria-label="active.label + ' components'">
   <div class="palette-heading"><strong>{{ query.trim() ? 'Search results' : active.label }}</strong><small>{{ results.length }} components</small></div>
   <div class="palette-search"><input ref="searchInput" aria-label="Search components" placeholder="Search code, alias or function…" type="search" :value="query" @input="query = ($event.target as HTMLInputElement).value" @keydown.stop="searchKey" /><button aria-label="Clear component search" :disabled="!query" @click="clearSearch">Clear</button></div>
   <p v-if="!results.length" class="palette-empty" role="status">No components match “{{ query }}”.</p>
   <div class="palette-items" @keydown="gridKey"><button v-for="item in results" :key="item.type" :title="item.description" :data-component-type="item.type" :draggable="!!getDefinition(item.type)" @dragstart="drag($event, item)" @click="choose(item)"><span class="palette-art"><ComponentThumbnail v-if="getPartForType(item.type)" :type="item.type" :alt="item.name + ' preview'" /><img v-else-if="item.icon" :src="iconUrl(item.icon)" alt="" width="58" height="58" /><WorkbenchIcon v-else :name="item.glyph || 'chip'" /></span><strong>{{ item.name }}</strong><small>{{ item.support || (item.window ? 'Open window' : getDefinition(item.type) ? 'Place component' : item.type === 'JUMPER' ? 'Connect ports' : 'Model unavailable') }}</small></button></div>
    </div>
    </div>
    <button ref="collapseToggle" class="toolbar-collapse-toggle ribbon-collapse-toggle" :aria-label="collapseLabel" :title="collapseLabel" :aria-expanded="!ui.componentToolbarCollapsed" aria-controls="component-toolbar" @click="ui.toggleComponentToolbar()"><WorkbenchIcon name="chevron" /></button>
  </div>
</template>
