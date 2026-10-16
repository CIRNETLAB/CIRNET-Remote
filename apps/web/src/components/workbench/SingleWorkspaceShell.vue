<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useLabConnection } from '../../composables/useLabConnection'
import { useLabNavigation } from '../../composables/useLabNavigation'
import { useProjectWorkspace } from '../../composables/useProjectWorkspace'
import { useCircuitStore } from '../../stores/circuit'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import { observeElementSize } from '../../composables/frameTasks'
import AppTitleBar from './AppTitleBar.vue'
import ComponentRibbon from './ComponentRibbon.vue'
import ToolRail from './ToolRail.vue'
import CircuitWorkspace3D from './CircuitWorkspace3D.vue'
import SimulationStatusBar from './SimulationStatusBar.vue'
import FloatingWindowManager from '../windows/FloatingWindowManager.vue'
const circuit = useCircuitStore(), workspace = useWorkspaceStore()
const ui = useUiStore(), layout = ref<HTMLElement>()
let layoutObserver: ReturnType<typeof observeElementSize> | undefined
onMounted(() => {
  if (layout.value) layoutObserver = observeElementSize(layout.value, ui.setWorkbenchSize)
})
onUnmounted(() => layoutObserver?.disconnect())
if (!circuit.current && !circuit.drafts.length) { circuit.createDraft('Untitled circuit'); circuit.past = [] }
watch(() => circuit.activeId, () => workspace.clearSelection())
useLabConnection()
useProjectWorkspace()
useLabNavigation()
</script>
<template><div class="single-workspace-shell"><a class="skip-link" href="#workspace">Skip to workspace</a><AppTitleBar /><div ref="layout" class="workbench-layout" :style="{ '--drawer-top': ui.drawerInsets.top + 'px', '--drawer-left': ui.drawerInsets.left + 'px' }"><ComponentRibbon /><div class="workbench-body"><ToolRail /><main id="workspace" class="workspace-stage" tabindex="-1" aria-label="Circuit workbench"><CircuitWorkspace3D /><FloatingWindowManager /></main></div></div><SimulationStatusBar /></div></template>
