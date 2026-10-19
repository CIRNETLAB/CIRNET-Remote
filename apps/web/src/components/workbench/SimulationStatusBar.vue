<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { useCircuitStore } from '../../stores/circuit'
import { useWorkspaceStore } from '../../stores/workspace'
import { ZOOM_STEP } from '../../config/workbenchViewport'
import WorkbenchIcon from './WorkbenchIcon.vue'
import SystemMessage from './SystemMessage.vue'
const circuit=useCircuitStore(),workspace=useWorkspaceStore()
// Absorb numerical pose noise at the real camera limits.
const zoomOutDisabled=computed(()=>workspace.zoom<=workspace.minZoom+Math.max(1,workspace.minZoom)*1e-10)
const zoomInDisabled=computed(()=>workspace.zoom>=workspace.maxZoom-Math.max(1,workspace.maxZoom)*1e-10)
function zoomToArea() {
  workspace.toggleZoomArea()
  if (workspace.zoomAreaActive) void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus())
}
function marqueeSelect() {
  workspace.toggleMarquee()
  if (workspace.marqueeActive) void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus())
}
</script>
<template>
  <footer class="simulation-statusbar" aria-label="Workspace status">
    <SystemMessage />
    <div class="status-viewport-tools" role="toolbar" aria-label="Workspace view controls">
      <label class="snap-toggle" title="Workspace Object Snap: align placement and movement to 0.5-unit spacing, dock modular breadboards and snap gizmo rotation to 15 degrees."><input v-model="workspace.snap" type="checkbox" aria-label="Workspace Object Snap" aria-describedby="workspace-snap-help" />Object Snap</label>
      <button aria-label="Zoom Out" title="Zoom Out" :disabled="zoomOutDisabled" @click="workspace.stepZoom(-ZOOM_STEP)"><WorkbenchIcon name="minus" /></button>
      <output aria-label="Workspace magnification">{{ Math.round(workspace.zoom * 100) / 100 }}%</output>
      <button aria-label="Zoom In" title="Zoom In" :disabled="zoomInDisabled" @click="workspace.stepZoom(ZOOM_STEP)"><WorkbenchIcon name="plus" /></button>
      <button aria-label="Marquee Select" title="Marquee Select" :aria-pressed="workspace.marqueeActive" @click="marqueeSelect"><WorkbenchIcon name="marquee-select" /></button>
      <button aria-label="Zoom To View Entire Circuit" title="Zoom To View Entire Circuit" :disabled="!circuit.graph?.modules.length" @click="workspace.fitEntireCircuit()"><WorkbenchIcon name="reset" /></button>
      <button aria-label="Zoom To Area" title="Zoom To Area" :aria-pressed="workspace.zoomAreaActive" @click="zoomToArea"><WorkbenchIcon name="zoom-area" /></button>
    </div>
    <span id="workspace-snap-help" class="visually-hidden">Workspace Object Snap aligns placement and movement to 0.5-unit spacing, docks modular breadboards during free movement and snaps gizmo rotation to 15 degrees. Turn off for fine positioning and continuous rotation.</span>
  </footer>
</template>
