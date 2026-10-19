<script setup lang="ts">
import { computed,nextTick,ref,watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useDrawerMotion } from '../../composables/useDrawerMotion'
import ComponentRibbon from './ComponentRibbon.vue'
import RunRibbonPanel from './RunRibbonPanel.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
const ui=useUiStore(),drawer=ref<HTMLElement>(),collapseToggle=ref<HTMLButtonElement>()
const motion=useDrawerMotion({collapsed:()=>ui.componentToolbarCollapsed,drawer:()=>drawer.value})
const collapseLabel=computed(()=>ui.componentToolbarCollapsed?'Expand Ribbon':'Collapse Ribbon')
watch(()=>ui.componentToolbarCollapsed,collapsed=>{
  if(collapsed&&drawer.value?.contains(document.activeElement))void nextTick(()=>collapseToggle.value?.focus())
})
watch(()=>ui.activeRibbonTab,tab=>{
  if(drawer.value?.contains(document.activeElement))void nextTick(()=>document.getElementById('workbench-tab-'+tab)?.focus())
})
</script>
<template>
  <div class="component-panel" data-workspace-text-input :class="{'is-collapsed':ui.componentToolbarCollapsed,'is-reduced-motion':motion.reducedMotion.value}" :data-drawer-occupied="motion.occupied.value" :style="{height:ui.componentOverlayHeight+'px','--ribbon-toggle-offset':ui.componentToolbarCollapsed?'0px':ui.workbenchSize.width/2-22+'px'}">
    <div id="workbench-ribbon" ref="drawer" class="component-drawer" :inert="ui.componentToolbarCollapsed" :aria-hidden="ui.componentToolbarCollapsed" @transitionend="motion.transitionEnd">
      <section v-show="ui.activeRibbonTab==='component'" id="workbench-panel-component" class="ribbon-tab-panel" role="tabpanel" aria-labelledby="workbench-tab-component" :aria-hidden="ui.activeRibbonTab!=='component'" :inert="ui.activeRibbonTab!=='component'"><ComponentRibbon /></section>
      <section v-show="ui.activeRibbonTab==='run'" id="workbench-panel-run" class="ribbon-tab-panel" role="tabpanel" aria-labelledby="workbench-tab-run" :aria-hidden="ui.activeRibbonTab!=='run'" :inert="ui.activeRibbonTab!=='run'"><RunRibbonPanel /></section>
    </div>
    <button ref="collapseToggle" class="toolbar-collapse-toggle ribbon-collapse-toggle" :aria-label="collapseLabel" :title="collapseLabel" :aria-expanded="!ui.componentToolbarCollapsed" aria-controls="workbench-ribbon" @click="ui.toggleComponentToolbar()"><WorkbenchIcon name="chevron" /></button>
  </div>
</template>
