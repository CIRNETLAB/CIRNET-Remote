<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FileCommand, FileMenuItem } from './fileCommands'

const props = defineProps<{ items: readonly FileMenuItem[]; dismissKey?: string }>()
const emit = defineEmits<{ command: [id: FileCommand] }>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const open = ref(false)
const position = ref({ left: '0px', top: '0px' })
function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (rect) position.value = { left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`, top: `${rect.bottom + 4}px` }
}
function enabledButtons() { return Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []) }
async function show(last = false) {
  open.value = true
  place()
  await nextTick()
  const buttons = enabledButtons()
  ;(last ? buttons.at(-1) : buttons[0])?.focus()
}
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
function activate(item: FileMenuItem) {
  if (item.disabled) return
  close(item.restoreFocus !== false)
  emit('command', item.id)
}
function triggerKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); event.stopPropagation(); void show(event.key === 'ArrowUp')
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault(); event.stopPropagation(); close(true)
  }
}
function menuKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && ['n', 'o', 's', 'z', 'y'].includes(event.key.toLowerCase())) { close(); return }
  // The marker on both menu and trigger also isolates the editor's capture listener.
  event.stopPropagation()
  const buttons = enabledButtons(), index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  let next: number | undefined
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
  if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = buttons.length - 1
  if (next !== undefined) { event.preventDefault(); buttons[next]?.focus() }
  if (event.key === 'Escape') { event.preventDefault(); close(true) }
  if (event.key === 'Tab') {
    event.preventDefault()
    // Teleport must not make Tab jump to the end of body: exit relative to File.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
      .filter(element => !menu.value?.contains(element) && !element.matches(':disabled, [tabindex="-1"], [type="hidden"]') && element.getClientRects().length > 0)
    const current = candidates.indexOf(trigger.value!)
    const destination = candidates[current + (event.shiftKey ? -1 : 1)]
    close()
    ;(destination ?? trigger.value)?.focus()
  }
}
function outside(event: PointerEvent) {
  const target = event.target as Node | null
  if (open.value && !trigger.value?.contains(target) && !menu.value?.contains(target)) close()
}
function focusOutside(event: FocusEvent) {
  const target = event.target as Node | null
  if (open.value && !trigger.value?.contains(target) && !menu.value?.contains(target)) close()
}
watch(() => props.dismissKey, () => close())
onMounted(() => {
  if (typeof document === 'undefined') return
  document.addEventListener('pointerdown', outside)
  document.addEventListener('focusin', focusOutside)
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
})
onUnmounted(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('focusin', focusOutside)
  window.removeEventListener('resize', place)
  window.removeEventListener('scroll', place, true)
})
</script>
<template>
  <button id="workbench-file-trigger" ref="trigger" class="file-menu-trigger" aria-haspopup="menu" :aria-expanded="open" aria-controls="workbench-file-menu" data-workspace-text-input @click="open ? close() : show()" @keydown="triggerKey">File <span aria-hidden="true">▾</span></button>
  <Teleport v-if="open" to="body">
    <div id="workbench-file-menu" ref="menu" class="file-menu" role="menu" aria-labelledby="workbench-file-trigger" :style="position" data-workspace-text-input @keydown="menuKey">
      <button v-for="item in items" :key="item.id" role="menuitem" tabindex="-1" :aria-label="item.label" :disabled="item.disabled" :aria-disabled="item.disabled" @click="activate(item)"><span>{{ item.label }}</span><small v-if="item.shortcut" aria-hidden="true">{{ item.shortcut }}</small></button>
    </div>
  </Teleport>
</template>
<style scoped>
.file-menu { position: fixed; z-index: 1500; width: 232px; padding: 5px; background: var(--panel, #202830); color: var(--text, #edf3f7); border: 1px solid var(--border, #45515e); box-shadow: 0 8px 22px #0008; max-height: calc(100dvh - 65px); overflow-y: auto; }
.file-menu button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 32px; padding: 6px 10px; border: 0; border-radius: 2px; background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit; }
.file-menu button:hover:not(:disabled), .file-menu button:focus-visible { background: var(--hover, #354857); outline: 1px solid var(--accent, #5cc8ef); outline-offset: -1px; }
.file-menu button:disabled { opacity: .4; cursor: default; }
.file-menu small { color: inherit; opacity: .65; margin-left: 20px; font-size: 11px; }
</style>
