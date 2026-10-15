<script setup lang="ts">
import type { WireRouteMode } from '../../types/circuit'
import { JUMPER_COLORS } from '../../wires/wireVisual'
withDefaults(defineProps<{ color?: string; routeMode?: WireRouteMode; canAdd?: boolean; canRemove?: boolean; hint?: string; layer?: number; canStack?: boolean; canCycleStack?: boolean; canLowerStack?: boolean; canRaiseStack?: boolean }>(), { color: '#d8493f', routeMode: 'FREE', canAdd: false, canRemove: false, hint: '', layer: 0, canStack: false, canCycleStack: false, canLowerStack: false, canRaiseStack: true })
const descriptions: Record<WireRouteMode, string> = {
  FREE: 'Manual path: straight or diagonal runs through your anchors.',
  ORTHOGONAL: 'Right angles: X/Z runs; plugged endpoints stay fixed when editing.',
  AUTO: 'Convenient route: board jumpers use automatic right angles.',
}
const emit = defineEmits<{ color: [value: string]; mode: [value: WireRouteMode]; add: []; remove: []; routeKey: [event: KeyboardEvent]; stack: [action: 'up' | 'down' | 'top']; cycleStack: [] }>()
function routeKey(event: KeyboardEvent) {
  if (event.key === 'Escape' || (['Backspace', 'Delete'].includes(event.key) && (event.target as HTMLElement)?.tagName !== 'SELECT')) emit('routeKey', event)
}
</script>
<template>
  <section class="wire-options contextual-panel" aria-label="Jumper wire options" @pointerdown.stop @keydown.stop="routeKey">
    <div class="wire-options-heading">WIRE <span>JUMPER</span></div>
    <div class="wire-palette" role="group" aria-label="Wire colors">
      <button v-for="swatch in JUMPER_COLORS" :key="swatch.name" :aria-label="swatch.name + ' wire'" :title="swatch.name" :aria-pressed="color === swatch.value" :style="{ '--swatch': swatch.value }" @click="emit('color', swatch.value)" />
    </div>
    <label class="wire-mode-label">Route<select aria-label="Wire route mode" aria-describedby="wire-route-description" :value="routeMode" @change="emit('mode', ($event.target as HTMLSelectElement).value as WireRouteMode)"><option value="FREE">Free · manual</option><option value="ORTHOGONAL">Orthogonal · 90°</option><option value="AUTO">Auto</option></select></label>
    <p id="wire-route-description" class="wire-mode-description">{{ descriptions[routeMode] }}</p>
    <div class="wire-edit-actions"><button aria-label="Add bend to selected segment" :disabled="!canAdd" @click="emit('add')">Add bend</button><button aria-label="Remove selected bend" :disabled="!canRemove" @click="emit('remove')">Remove bend</button></div>
    <div v-if="canStack" class="wire-stack" role="group" aria-label="Wire stack order">
      <div class="wire-stack-heading">Order <span role="status">Priority {{ layer }}</span></div>
      <div class="wire-edit-actions"><button aria-label="Lower wire priority" :disabled="!canLowerStack" @click="emit('stack', 'down')">Down</button><button aria-label="Raise wire priority" :disabled="!canRaiseStack" @click="emit('stack', 'up')">Up</button><button aria-label="Move wire above overlapping wires" :disabled="!canRaiseStack" @click="emit('stack', 'top')">Top</button></div>
      <p class="wire-mode-description">Parallel: lane order · Crossing: over/under</p>
      <button v-if="canCycleStack" class="wire-stack-cycle" aria-label="Select next overlapping wire" @click="emit('cycleStack')">Select next overlapping wire</button>
    </div>
    <p v-if="hint" class="wire-hint" role="status">{{ hint }}</p>
  </section>
</template>
<style scoped>
.wire-options { padding: 12px; border: 1px solid #526170; border-radius: 3px; background: #17212d; box-shadow: 0 3px 12px #0005; color: #d7dce2; z-index: 4; font-size: 11px; pointer-events: auto; }
.wire-options-heading { font-size: 10px; letter-spacing: 1.2px; color: #d9b66f; margin-bottom: 8px; }
.wire-options-heading span { float: right; color: #92a2b2; font-size: 9px; }
.wire-palette { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; justify-items: center; margin: 12px 0 14px; }
.wire-palette button { width: 27px; height: 27px; background: var(--swatch); border: 1px solid #97a0a8; border-radius: 50%; box-shadow: inset 0 1px 2px #fff2, 0 1px 2px #0006; cursor: pointer; padding: 0; }
.wire-palette button:hover { border-color: #e4c378; }
.wire-options button:focus-visible, .wire-mode-label select:focus-visible { outline: 2px solid #cce0ed; outline-offset: 3px; }
.wire-palette button[aria-pressed=true] { outline: 2px solid #e4c378; outline-offset: 2px; }
.wire-mode-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wire-mode-label select { width: 155px; background: #101925; color: #d7dce2; border: 1px solid #526170; padding: 3px 5px; font: inherit; }
.wire-mode-description { margin: 6px 0 0; font-size: 10px; line-height: 1.4; color: #aebccc; }
.wire-edit-actions { display: flex; gap: 6px; margin-top: 8px; }
.wire-edit-actions button { flex: 1; color: #d7dce2; border: 1px solid #526170; background: #243240; padding: 4px; font: inherit; cursor: pointer; }
.wire-edit-actions button:disabled { opacity: .4; cursor: default; }
.wire-stack { border-top: 1px solid #526170; margin-top: 10px; padding-top: 8px; }
.wire-stack-heading { display: flex; justify-content: space-between; color: #d9b66f; }
.wire-stack-heading span { color: #aebccc; }
.wire-stack-cycle { margin-top: 6px; width: 100%; padding: 4px; font: inherit; background: #17212d; border: 1px solid #526170; color: #aebccc; cursor: pointer; }
.wire-hint { margin: 8px 0 0; font-size: 10px; line-height: 1.5; color: #aebccc; }
</style>
