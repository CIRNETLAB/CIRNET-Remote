<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
const props = withDefaults(defineProps<{ x: number; y: number; viewportWidth: number; viewportHeight: number; canPaste: boolean; canEditSelection?: boolean }>(), { canEditSelection: true })
const emit = defineEmits<{ action: [action: 'delete' | 'duplicate' | 'paste' | 'move']; close: [restoreFocus: boolean] }>()
const menu = ref<HTMLElement>(), active = ref(0)
const actions = ['move', 'duplicate', 'paste', 'delete'] as const
const style = computed(() => {
  const width = Math.max(0, Math.min(160, props.viewportWidth - 16)), height = Math.min(148, props.viewportHeight - 16)
  return { left: `${Math.max(8, Math.min(props.x, props.viewportWidth - width - 8))}px`, top: `${Math.max(8, Math.min(props.y, props.viewportHeight - height - 8))}px`, width: `${width}px`, maxHeight: `${Math.max(0, props.viewportHeight - 16)}px` }
})
function focus(index: number) { active.value = index; void nextTick(() => menu.value?.querySelector?.<HTMLButtonElement>(`[data-action="${actions[index]}"]`)?.focus?.()) }
function keydown(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === 'Escape') { event.preventDefault(); emit('close', true); return }
  if (event.key === 'Tab') { emit('close', false); return }
  const enabled = actions.flatMap((action, index) => (action === 'paste' ? props.canPaste : props.canEditSelection) ? [index] : [])
  if (!enabled.length) return
  const index = Math.max(0, enabled.indexOf(active.value))
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    focus(event.key === 'Home' ? enabled[0]! : event.key === 'End' ? enabled.at(-1)! : enabled[(index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]!)
  }
}
function outside(event: Event) { if (!menu.value?.contains?.(event.target as Node)) emit('close', false) }
onMounted(() => { document.addEventListener('pointerdown', outside, true); focus(props.canEditSelection ? 0 : 2) })
onUnmounted(() => document.removeEventListener('pointerdown', outside, true))
</script>
<template>
  <div ref="menu" class="wire-context-menu" role="menu" aria-label="Selection actions" :style="style" data-workspace-text-input @keydown="keydown" @pointerdown.stop @contextmenu.stop.prevent @wheel.stop>
    <button v-for="(action, index) in actions" :key="action" role="menuitem" :data-action="action" :aria-label="action[0].toUpperCase() + action.slice(1) + ' selection'" :disabled="action === 'paste' ? !canPaste : !canEditSelection" :tabindex="active === index ? 0 : -1" @focus="active = index" @click="emit('action', action)">{{ action[0].toUpperCase() + action.slice(1) }}</button>
  </div>
</template>
<style scoped>
.wire-context-menu { position: absolute; z-index: 80; box-sizing: border-box; padding: 7px; overflow: auto; border: 1px solid #4c6276; border-radius: 5px; background: #1a2937; box-shadow: 0 4px 14px #0006; }
.wire-context-menu button { display: block; width: 100%; height: 32px; padding: 5px 10px; border: 0; border-radius: 3px; text-align: left; color: #d9e5ec; background: transparent; }
.wire-context-menu button:hover, .wire-context-menu button:focus-visible { background: #31515b; outline: 1px solid #7fb2bf; }
.wire-context-menu button:disabled { opacity: .45; cursor: default; }
</style>
