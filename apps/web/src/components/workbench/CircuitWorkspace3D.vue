<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { WebGLRenderer } from 'three'
import { createSceneManager, type OrientationAxis } from '../../three/SceneManager'
import { useWorkspaceStore } from '../../stores/workspace'
import { useCircuitStore } from '../../stores/circuit'
import { useUiStore } from '../../stores/ui'
import WorkspaceNavigator from './WorkspaceNavigator.vue'
import WireOptions from './WireOptions.vue'
import { useCircuitEditor } from '../../composables/useCircuitEditor'
import { observeElementSize } from '../../composables/frameTasks'
const workspace = useWorkspaceStore()
const circuit = useCircuitStore()
const ui = useUiStore()
const host = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const graphicsError = ref('')
const axes = ref<OrientationAxis[]>([])
const cameraQuaternion = ref<[number, number, number, number]>([0, 0, 0, 1])
let manager: ReturnType<typeof createSceneManager> | undefined
let observer: ReturnType<typeof observeElementSize> | undefined
let drawerObserver: MutationObserver | undefined
let contextLost = false
let obstaclesDirty = true
const editor = useCircuitEditor(canvas, () => manager)
function visibility() { if (contextLost || document.hidden) editor.cancel(); manager?.suspend(contextLost || document.hidden) }
function updateGizmoObstacles() {
  if (!obstaclesDirty) return
  const origin = host.value?.getBoundingClientRect(), stage = host.value?.parentElement
  if (manager && origin && stage) {
    obstaclesDirty = false
    const layout = stage.closest('.workbench-layout') ?? stage
    const obstacles = [...layout.querySelectorAll('.component-information, .floating-window, .workspace-navigator, .wire-options')].map((element) => {
      const r = element.getBoundingClientRect(); return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top }
    })
    // Reserve the entire swept area, using known sizes rather than measuring
    // a transformed drawer on every animation frame.
    if (layout.querySelector('.component-panel[data-drawer-occupied=true]')) obstacles.push({ left: 0, top: 0, right: ui.viewport.width, bottom: ui.componentOverlayHeight })
    if (layout.querySelector('.tools-panel[data-drawer-occupied=true]')) obstacles.push({ left: 0, top: 0, right: ui.toolsOverlayWidth + 36, bottom: ui.viewport.height })
    // Edge buttons also move while their own drawer is closed. Reserve their
    // complete corridors so cached rectangles cannot lag behind a transition.
    obstacles.push({ left: 0, top: 0, right: ui.viewport.width, bottom: 36 })
    obstacles.push({ left: 4, top: ui.viewport.height / 2 - 14, right: 32, bottom: ui.viewport.height / 2 + ui.componentOverlayHeight / 2 + 14 })
    manager.setGizmoObstacles(obstacles)
  }
}
function invalidateObstacles() { obstaclesDirty = true; manager?.requestRender() }
function rendered() {
  editor.updatePorts()
  if (manager) {
    const next = manager.orientationAxes()
    if (next.some((axis, index) => axis.label !== axes.value[index]?.label || axis.x !== axes.value[index]?.x || axis.y !== axes.value[index]?.y || axis.depth !== axes.value[index]?.depth)) axes.value = next
    const q = manager.cameraQuaternion()
    if (q[0] !== cameraQuaternion.value[0] || q[1] !== cameraQuaternion.value[1] || q[2] !== cameraQuaternion.value[2] || q[3] !== cameraQuaternion.value[3]) {
      cameraQuaternion.value = q
    }
  }
}
function size(width: number, height: number) { obstaclesDirty = true; editor.cancel(); manager?.resize(width, height); ui.setViewport(width, height) }
function lost(event: Event) { event.preventDefault(); contextLost = true; visibility(); graphicsError.value = 'Graphics context interrupted. Waiting for recovery…' }
function restored() { contextLost = false; graphicsError.value = ''; visibility(); editor.sync(); obstaclesDirty = true; manager?.requestRender() }
onMounted(() => {
  let renderer: WebGLRenderer | undefined
  try {
    renderer = new WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    manager = createSceneManager({ renderer, canvas: canvas.value, onBeforeRender: updateGizmoObstacles, onRender: rendered, onZoomChange: (percent) => workspace.setZoom(percent) })
    manager.setZoom(workspace.zoom)
    editor.sync(); visibility()
  } catch { if (manager) manager.dispose(); else renderer?.dispose(); manager = undefined; graphicsError.value = '3D graphics unavailable. Edit graph coordinates and ports using Inspector.' }
  if (host.value) observer = observeElementSize(host.value, size)
  drawerObserver = new MutationObserver(invalidateObstacles)
  host.value?.closest('.workbench-layout')?.querySelectorAll('.component-panel, .tools-panel').forEach((panel) => drawerObserver?.observe(panel, { attributes: true, attributeFilter: ['data-drawer-occupied'] }))
  canvas.value?.addEventListener('webglcontextlost', lost)
  canvas.value?.addEventListener('webglcontextrestored', restored)
  document.addEventListener('visibilitychange', visibility)
})
watch(() => workspace.zoom, (zoom) => { if (manager && Math.abs(manager.zoomPercent() - zoom) > 0.02) { editor.cancel(); manager.setZoom(zoom) } })
watch(() => workspace.fitRequest, () => { editor.cancel(); manager?.fitCircuit() })
// Component Info can change height on selection without changing window state.
watch([() => ui.windows, () => circuit.graph?.modules.find((module) => module.id === workspace.selectedModuleId)?.type], invalidateObstacles, { deep: true, flush: 'post' })
watch([() => ui.drawerInsets.left, () => ui.drawerInsets.top, () => ui.componentOverlayHeight, () => ui.toolsOverlayWidth], invalidateObstacles, { flush: 'post' })
watch([() => workspace.tool, () => workspace.selectedWire, () => workspace.placementType, () => workspace.zoomAreaActive, () => editor.wireRouting.hint.value], invalidateObstacles, { flush: 'post' })
onUnmounted(() => { observer?.disconnect(); drawerObserver?.disconnect(); manager?.dispose(); canvas.value?.removeEventListener('webglcontextlost', lost); canvas.value?.removeEventListener('webglcontextrestored', restored); document.removeEventListener('visibilitychange', visibility) })
</script>
<template>
  <div ref="host" :class="['circuit-workspace', { 'is-dragging': editor.dragging.value || editor.wireRouting.editing.value, 'is-zoom-area': workspace.zoomAreaActive, 'is-wiring': workspace.tool === 'wire' && !workspace.placementType, 'can-grab': editor.hoveredHandle.value || editor.hoveredControl.value || editor.wireRouting.editing.value || (['select', 'move'].includes(workspace.tool) && !workspace.placementType) }]" @dragover.prevent @drop="editor.drop">
    <canvas ref="canvas" tabindex="0" :title="editor.controlHint.value" aria-label="Three-dimensional circuit workspace" aria-describedby="editor-help" @pointerdown.capture="editor.pointerDown" @pointermove="editor.pointerMove" @pointerup="editor.pointerUp" @pointercancel="editor.pointerCancel" @lostpointercapture="editor.lostPointerCapture" @keydown="editor.keydown" @dblclick="editor.wireRouting.doubleClick" @contextmenu.capture="editor.contextMenu" @pointerleave="editor.pointerLeave" />
    <WireOptions v-if="(workspace.tool === 'wire' || workspace.selectedWire) && !workspace.placementType && !workspace.zoomAreaActive" :style="{ left: (ui.toolsSidebarCollapsed ? 44 : ui.toolsOverlayWidth + 44) + 'px' }" :color="editor.wireRouting.color.value" :route-mode="editor.wireRouting.routeMode.value" :can-add="editor.wireRouting.canAdd.value" :can-remove="editor.wireRouting.canRemove.value" :hint="editor.wireRouting.hint.value" @color="editor.wireRouting.setColor" @mode="editor.wireRouting.setRouteMode" @add="editor.wireRouting.addBend" @remove="editor.wireRouting.removeSelectedBend" @route-key="editor.wireRouting.keydown" />
    <div v-if="editor.zoomAreaRect.value" class="zoom-area-rectangle" :style="{ left: editor.zoomAreaRect.value.left + 'px', top: editor.zoomAreaRect.value.top + 'px', width: editor.zoomAreaRect.value.width + 'px', height: editor.zoomAreaRect.value.height + 'px' }" aria-hidden="true" />
    <p v-if="workspace.zoomAreaActive" class="zoom-area-notice" role="status">Drag an area to zoom · Right click or Esc to cancel</p>
    <span class="visually-hidden">In Select, drag the power supply Voltage or Ampe knob up/right to increase its setting, down/left to decrease. Voltage gently snaps to 3, 3.3, 5, 6, 9, 12 and 15 V. Hold Shift for fine adjustment without snapping. Click the I/O rocker to turn the screen on or completely off. Release to finish; Escape cancels a knob adjustment.</span>
    <span id="editor-help" class="visually-hidden">Click to select or place. A placement preview follows the pointer on X/Z without holding a mouse button and keeps its rotation. Its gizmo offers X, Z, free X/Z and Rotate Y; hovering or dragging a handle pauses pointer following. Move away from the handle to continue following. Click outside the gizmo to place the full pose in one Undo step; right click or Escape cancels placement. After placement, Move allows body dragging and the selected object's full gizmo also includes Delete. Drag a highlighted handle, release to finish or Escape to cancel. In Select, left drag on a model or empty surface pans; a click selects. Right drag orbits, middle drag pans, wheel dollies. XYZ axes follow the camera. R rotates, Delete removes, arrows move a selection. Wire: choose a color, click a hole or port, right click for corners, then click the final endpoint. Select a wire to drag bends/segments; double-click a segment to add a bend. Delete removes a selected bend or the last draft bend; Escape cancels the wire draft; Alt bypasses snap. View tools and Workspace Object Snap are at the status bar's right. Zoom To Area: drag a rectangle, then release to frame it; right click or Escape cancels.</span>
    <div v-if="!circuit.graph?.modules.length && !workspace.placementType" class="workspace-empty"><span class="empty-cross">+</span><p>Your next circuit starts here.</p><span>Drag a component from the ribbon.<br />Connect holes and ports to build your circuit.</span></div>
    <div class="scene-ports"><button v-for="port in editor.ports.value" :key="port.endpoint" :class="['port-anchor', port.direction, { pending: workspace.pendingPort === port.endpoint }]" :style="{ left: port.x + 'px', top: port.y + 'px' }" :aria-label="'Connect port ' + port.endpoint" @click.stop="editor.connect(port.endpoint)">{{ port.endpoint.split('.')[1] }}</button></div>
    <details class="scene-inventory"><summary>Components ({{ circuit.graph?.modules.length || 0 }})</summary><div><button v-for="module in circuit.graph?.modules" :key="module.id" :aria-pressed="workspace.selectedModuleId === module.id" @click="editor.selectModule(module.id)">{{ module.id }}</button><button @click="ui.openWindow('inspector')">Open Inspector</button></div></details>
    <p v-if="workspace.editError" class="editor-error" role="alert">{{ workspace.editError }}<button @click="workspace.editError = ''">Dismiss</button></p>
    <p v-if="graphicsError" class="graphics-notice" role="status">{{ graphicsError }}</p>
    <p v-if="workspace.placementType" class="placement-notice">Preview follows pointer · X/Z/XZ/Rotate Y to adjust · Click to place · Right click or Esc to cancel</p>
    <WorkspaceNavigator
      :axes="axes"
      :camera-quaternion="cameraQuaternion"
      @orbit="(degrees, pitch) => { editor.cancel(); manager?.orbit(degrees, pitch) }"
      @pan="(horizontal, forward) => { editor.cancel(); manager?.pan(horizontal, forward) }"
      @set-view="(direction) => { editor.cancel(); manager?.setViewOrientation(direction) }"
      @reset-view="() => { editor.cancel(); manager?.resetView() }"
    />
  </div>
</template>
