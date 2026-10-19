<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { paletteGroups, type PaletteCard } from '../../data/paletteCatalog'
import ComponentThumbnail from './ComponentThumbnail.vue'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { createFrameTask } from '../../composables/frameTasks'
import { refreshThumbnailVisibility } from '../../composables/thumbnailVisibility'
const ui = useUiStore()
const workspace = useWorkspaceStore()
const root = ref<HTMLElement>()
const paletteItems = ref<HTMLElement>()
const visible = computed(() => ui.activeRibbonTab === 'component' && !ui.componentToolbarCollapsed)
const active = computed(() => visible.value ? paletteGroups.find((group) => group.id === ui.activeRibbonGroup) : undefined)
const paletteStyle = ref({ left: '10px', width: '250px' })
const query = ref('')
const searchInput = ref<HTMLInputElement>()
const searchEnabled = computed(() => active.value?.id === 'logic' || active.value?.id === 'arithmetic')
const results = computed(() => {
  const group = active.value
  return group ? group.searchIndex.search(searchEnabled.value ? query.value : '').map(item => group.cards.get(item.type)!) : []
})
let resizeObserver: ResizeObserver | undefined
let listening = false
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
watch(query, () => { if (paletteItems.value) paletteItems.value.scrollTop = 0; if(active.value)paletteTask.schedule();else paletteTask.cancel() })
watch(results, () => { if(active.value)refreshThumbnailVisibility(paletteItems.value) }, { flush: 'post' })
function choose(card: PaletteCard) {
  if(!visible.value)return
  const { item } = card
  // The palette will disappear. Retain a stable keyboard return target first.
  root.value?.querySelector?.<HTMLButtonElement>(`[data-group="${ui.activeRibbonGroup}"]`)?.focus()
  if (item.window) ui.openWindow(item.window)
  else if (item.type === 'JUMPER') workspace.setTool('wire')
  else if (card.placeable) { workspace.armPlacement(item.type); ui.openWindow('component-info', { activate: false }) }
  else { workspace.preview(item.type); workspace.editError = item.name + ' has no placeable editor model yet.' }
  ui.activeRibbonGroup = null
}
function drag(event: DragEvent, card: PaletteCard) {
  const { item } = card
  if (!visible.value || !card.placeable || !event.dataTransfer) { event.preventDefault(); return }
  event.dataTransfer.setData('application/x-netcircuit-component', item.type)
  event.dataTransfer.effectAllowed = 'copy'
  workspace.armPlacement(item.type)
  ui.openWindow('component-info', { activate: false })
}
function outside(event: PointerEvent) { if (visible.value && event.target instanceof Node && !root.value?.contains(event.target)) ui.activeRibbonGroup = null }
function clearSearch() { query.value = ''; searchInput.value?.focus?.() }
function escape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !ui.activeRibbonGroup) return
  if(!visible.value)return
  event.preventDefault();event.stopPropagation()
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
function synchronizeVisibility(){
  if(visible.value&&!listening){document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);listening=true}
  else if(!visible.value&&listening){document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);listening=false}
  resizeObserver?.disconnect()
  if(visible.value&&root.value)resizeObserver?.observe(root.value)
  if(!visible.value)paletteTask.cancel()
}
watch(visible,synchronizeVisibility,{flush:'post'})
onMounted(() => { resizeObserver = new ResizeObserver(() => { if (active.value) paletteTask.schedule() });synchronizeVisibility() })
onUnmounted(() => { if(listening){document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape)}resizeObserver?.disconnect(); paletteTask.cancel() })
</script>
<template>
  <div ref="root" class="component-library-content" data-workspace-text-input>
    <section id="component-toolbar" class="component-ribbon" aria-label="Component library">
    <div id="component-families" class="ribbon-scroll" role="toolbar" aria-label="Component families" @scroll="paletteTask.schedule">
      <button v-for="group in paletteGroups" :key="group.id" :data-group="group.id" :aria-expanded="ui.activeRibbonGroup === group.id" aria-controls="ribbon-palette" :class="{ active: ui.activeRibbonGroup === group.id }" @click="ui.toggleRibbon(group.id)">
        <span class="ribbon-art"><img v-if="group.iconSrc" :src="group.iconSrc" alt="" width="44" height="44" /><WorkbenchIcon v-else :name="group.glyph || 'chip'" /></span>
        <span class="ribbon-label">{{ group.label }}</span><WorkbenchIcon class="ribbon-chevron" name="chevron" />
      </button>
    </div>
    </section>
  <div v-if="active" id="ribbon-palette" class="ribbon-palette" :style="paletteStyle" :aria-label="active.label + ' components'">
   <div class="palette-heading"><strong>{{ query.trim() ? 'Search results' : active.label }}</strong><small>{{ results.length }} components</small></div>
   <div v-if="searchEnabled" class="palette-search"><input ref="searchInput" aria-label="Search components" placeholder="Search code, alias or function…" type="search" :value="query" @input="query = ($event.target as HTMLInputElement).value" @keydown.stop="searchKey" /><button aria-label="Clear component search" :disabled="!query" @click="clearSearch">Clear</button></div>
   <p v-if="!results.length" class="palette-empty" role="status">No components match “{{ query }}”.</p>
   <div ref="paletteItems" class="palette-items" @keydown="gridKey"><button v-for="card in results" :key="card.item.type" :title="card.item.description" :data-component-type="card.item.type" :draggable="card.placeable" @dragstart="drag($event, card)" @click="choose(card)"><span class="palette-art"><ComponentThumbnail v-if="card.thumbnail" :type="card.item.type" :alt="card.item.name + ' preview'" lazy :visibility-root="paletteItems" :fallback-icon="card.iconSrc" /><img v-else-if="card.iconSrc" :src="card.iconSrc" alt="" width="58" height="58" /><WorkbenchIcon v-else :name="card.item.glyph || 'chip'" /></span><strong>{{ card.item.name }}</strong><small>{{ card.support }}</small></button></div>
    </div>
  </div>
</template>
