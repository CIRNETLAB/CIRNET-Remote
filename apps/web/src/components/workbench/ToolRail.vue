<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDrawerMotion } from '../../composables/useDrawerMotion'
import { useWorkspaceStore, type WorkspaceTool } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import type { WindowKind } from '../../types/windows'
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
const tools: { id: WorkspaceTool; name: string }[] = [
  { id: 'select', name: 'Select' }, { id: 'wire', name: 'Wire' },
  { id: 'move', name: 'Move' }, { id: 'rotate', name: 'Rotate' },
]
const launchers: { name: string; icon: string; window: WindowKind }[] = [
  { name: 'Power Supply', icon: 'power-supply', window: 'power-supply' },
  { name: 'Probe', icon: 'probe', window: 'monitor' },
  { name: 'Scope', icon: 'scope', window: 'oscilloscope' },
  { name: 'Function Generator', icon: 'generator', window: 'generator' },
]
</script>
<template>
  <div ref="root" class="tools-panel" :class="{ 'is-collapsed': ui.toolsSidebarCollapsed, 'is-reduced-motion': motion.reducedMotion.value }" :data-drawer-occupied="motion.occupied.value" :style="{ width: expandedWidth + 'px', '--tools-offset': ui.toolsSidebarCollapsed ? '-' + expandedWidth + 'px' : '0px' }">
  <div ref="drawer" class="tools-drawer" :inert="ui.toolsSidebarCollapsed" :aria-hidden="ui.toolsSidebarCollapsed" @transitionend="motion.transitionEnd">
  <aside id="tools-sidebar" class="tool-rail" aria-label="Workspace tools">
    <div class="rail-label">TOOLS</div>
    <div id="editing-tools" role="toolbar" aria-label="Editing tools" aria-orientation="vertical">
      <button v-for="tool in tools" :key="tool.id" :aria-label="tool.name" :aria-pressed="workspace.tool === tool.id" :title="tool.name + (tool.id === 'wire' ? ' · connect holes and ports' : ' · edit graph')" @click="workspace.setTool(tool.id)"><WorkbenchIcon :name="tool.id" /><span>{{ tool.name }}</span></button>
      <button v-for="launcher in launchers" :key="launcher.window" class="instrument-launcher" :aria-label="launcher.name" :title="'Open ' + launcher.name" @click="ui.openWindow(launcher.window)"><WorkbenchIcon :name="launcher.icon" /><span>{{ launcher.name }}</span></button>
    </div>
    <span class="rail-bottom">XZ</span>
  </aside>
  </div>
    <button ref="collapseToggle" class="toolbar-collapse-toggle rail-collapse-toggle" :aria-label="collapseLabel" :title="collapseLabel" :aria-expanded="!ui.toolsSidebarCollapsed" aria-controls="tools-sidebar" @click="ui.toggleToolsSidebar()"><WorkbenchIcon name="chevron" /></button>
  </div>
</template>
<style scoped>
.tool-rail button.instrument-launcher { height: 57px; gap: 3px; padding: 4px 0; }
.instrument-launcher span { font-size: 8px; line-height: 11px; text-align: center; }
</style>
