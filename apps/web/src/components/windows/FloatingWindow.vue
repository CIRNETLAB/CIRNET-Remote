<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { windowDefinitions, type WorkspaceWindow } from '../../types/windows'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps<{ window: WorkspaceWindow }>()
const ui = useUiStore()
const root = ref<HTMLElement>()
const header = ref<HTMLElement>()
let opener: HTMLElement | null = null
let drag: { x: number; y: number; left: number; top: number; pointer: number } | null = null
function start(event: PointerEvent) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
  event.preventDefault()
  header.value?.focus()
  header.value?.setPointerCapture(event.pointerId)
  drag = { x: event.clientX, y: event.clientY, left: props.window.x, top: props.window.y, pointer: event.pointerId }
}
function move(event: PointerEvent) { if (drag && drag.pointer === event.pointerId) ui.moveWindow(props.window.kind, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y) }
function end() { drag = null }
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); ui.closeWindow(props.window.kind) }
  if (event.target !== header.value) return
  const offset = event.shiftKey ? 30 : 10
  const directions: Record<string, [number, number]> = { ArrowLeft: [-offset, 0], ArrowRight: [offset, 0], ArrowUp: [0, -offset], ArrowDown: [0, offset] }
  const delta = directions[event.key]
  if (delta) { event.preventDefault(); ui.moveWindow(props.window.kind, props.window.x + delta[0], props.window.y + delta[1]) }
}
function activate() {
  const focused = document.activeElement
  if (focused instanceof HTMLElement && !root.value?.contains(focused)) opener = focused
  void nextTick(() => header.value?.focus())
}
onMounted(activate)
watch(() => props.window.activation, activate)
onBeforeUnmount(() => {
  end()
  if (root.value?.contains(document.activeElement) && opener?.isConnected) {
    // A toolbar can be collapsed while its instrument window is still open.
    const target = !opener.closest('[inert]') && opener.getClientRects().length ? opener : opener.closest('.component-panel, .tools-panel')?.querySelector<HTMLButtonElement>('.toolbar-collapse-toggle')
    target?.focus()
  }
})
</script>
<template>
  <section ref="root" class="floating-window" role="dialog" :aria-labelledby="'window-title-' + window.kind" :style="{ left: window.x + 'px', top: window.y + 'px', width: window.width + 'px', height: window.height + 'px', zIndex: window.z }" @pointerdown="ui.focusWindow(window.kind)" @focusin="ui.focusWindow(window.kind)" @keydown="key">
    <header ref="header" class="floating-header" tabindex="0" :aria-label="windowDefinitions[window.kind].title + ' window. Drag or use arrow keys to move; Escape to close.'" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end"><span class="window-grip" aria-hidden="true">⠿</span><strong :id="'window-title-' + window.kind">{{ windowDefinitions[window.kind].title }}</strong><button :aria-label="'Close ' + windowDefinitions[window.kind].title" @click="ui.closeWindow(window.kind)"><WorkbenchIcon name="close" /></button></header>
    <div class="floating-body"><slot /></div>
  </section>
</template>
