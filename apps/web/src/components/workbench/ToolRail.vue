<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDrawerMotion } from '../../composables/useDrawerMotion'
import { useWorkspaceStore, type WorkspaceTool } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import WorkbenchIcon from './WorkbenchIcon.vue'
const workspace = useWorkspaceStore()
const ui = useUiStore()
const root = ref<HTMLElement>()
const drawer = ref<HTMLElement>()
const collapseToggle = ref<HTMLButtonElement>()
const collapseLabel = computed(() => ui.toolsSidebarCollapsed ? 'Expand Tools' : 'Collapse Tools')
const expandedWidth = computed(() => ui.toolsOverlayWidth)
const motion = useDrawerMotion({ collapsed: () => ui.toolsSidebarCollapsed, drawer: () => drawer.value })
watch(() => ui.toolsSidebarCollapsed, (collapsed) => {
  if (collapsed && root.value?.contains(document.activeElement) && document.activeElement !== collapseToggle.value) void nextTick(() => collapseToggle.value?.focus())
})
const tools: { id: WorkspaceTool; name: string }[] = ['select', 'wire', 'move', 'rotate', 'delete', 'scope', 'probe'].map((id) => ({ id: id as WorkspaceTool, name: id[0].toUpperCase() + id.slice(1) }))
function select(tool: WorkspaceTool) {
  workspace.setTool(tool)
  if (tool === 'scope') ui.openWindow('oscilloscope')
  if (tool === 'probe') ui.openWindow('monitor')
}
</script>
<template>
  <div ref="root" class="tools-panel" :class="{ 'is-collapsed': ui.toolsSidebarCollapsed, 'is-reduced-motion': motion.reducedMotion.value }" :data-drawer-occupied="motion.occupied.value" :style="{ width: expandedWidth + 'px', '--tools-offset': ui.toolsSidebarCollapsed ? '-' + expandedWidth + 'px' : '0px' }">
  <div ref="drawer" class="tools-drawer" :inert="ui.toolsSidebarCollapsed" :aria-hidden="ui.toolsSidebarCollapsed" @transitionend="motion.transitionEnd">
  <aside id="tools-sidebar" class="tool-rail" aria-label="Workspace tools">
    <div class="rail-label">TOOLS</div>
    <div id="editing-tools" role="toolbar" aria-label="Editing tools" aria-orientation="vertical">
      <button v-for="tool in tools" :key="tool.id" :aria-label="tool.name" :aria-pressed="workspace.tool === tool.id" :title="tool.name + (['scope', 'probe'].includes(tool.id) ? ' · open instrument' : ' · edit logical graph')" @click="select(tool.id)"><WorkbenchIcon :name="tool.id" /><span>{{ tool.name }}</span></button>
    </div>
    <span class="rail-bottom">XZ</span>
  </aside>
  </div>
    <button ref="collapseToggle" class="toolbar-collapse-toggle rail-collapse-toggle" :aria-label="collapseLabel" :title="collapseLabel" :aria-expanded="!ui.toolsSidebarCollapsed" aria-controls="tools-sidebar" @click="ui.toggleToolsSidebar()"><WorkbenchIcon name="chevron" /></button>
  </div>
</template>
