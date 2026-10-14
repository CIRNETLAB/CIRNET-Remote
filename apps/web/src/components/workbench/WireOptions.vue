<script setup lang="ts">
import type { WireRouteMode } from '../../types/circuit'
import { JUMPER_COLORS } from '../../wires/wireVisual'
withDefaults(defineProps<{ color?: string; routeMode?: WireRouteMode; canAdd?: boolean; canRemove?: boolean; hint?: string }>(), { color: '#d8493f', routeMode: 'AUTO', canAdd: false, canRemove: false, hint: '' })
const emit = defineEmits<{ color: [value: string]; mode: [value: WireRouteMode]; add: []; remove: [] }>()
</script>
<template>
  <section class="wire-options" aria-label="Jumper wire options" @pointerdown.stop @keydown.stop>
    <div class="wire-options-heading">WIRE <span>JUMPER</span></div>
    <div class="wire-palette" role="group" aria-label="Wire colors">
      <button v-for="swatch in JUMPER_COLORS" :key="swatch.name" :aria-label="swatch.name + ' wire'" :title="swatch.name" :aria-pressed="color === swatch.value" :style="{ '--swatch': swatch.value }" @click="emit('color', swatch.value)" />
    </div>
    <label class="wire-mode-label">Route<select aria-label="Wire route mode" :value="routeMode" @change="emit('mode', ($event.target as HTMLSelectElement).value as WireRouteMode)"><option value="AUTO">Auto</option><option value="ORTHOGONAL">Orthogonal</option><option value="FREE">Free</option></select></label>
    <div class="wire-edit-actions"><button aria-label="Add bend to selected segment" :disabled="!canAdd" @click="emit('add')">Add bend</button><button aria-label="Remove selected bend" :disabled="!canRemove" @click="emit('remove')">Remove bend</button></div>
    <p v-if="hint" class="wire-hint" role="status">{{ hint }}</p>
  </section>
</template>
<style scoped>
.wire-options { position: absolute; bottom: 42px; width: 250px; max-width: calc(100% - 70px); padding: 10px; border: 1px solid #526170; background: #17212d; color: #d7dce2; z-index: 4; font-size: 11px; }
.wire-options-heading { font-size: 10px; letter-spacing: 1.2px; color: #d9b66f; margin-bottom: 8px; }
.wire-options-heading span { float: right; color: #92a2b2; font-size: 9px; }
.wire-palette { display: flex; gap: 7px; margin-bottom: 10px; }
.wire-palette button { width: 22px; height: 22px; background: var(--swatch); border: 1px solid #77838c; border-radius: 2px; cursor: pointer; padding: 0; }
.wire-palette button[aria-pressed=true] { outline: 2px solid #e4c378; outline-offset: 2px; }
.wire-mode-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wire-mode-label select { width: 155px; background: #101925; color: #d7dce2; border: 1px solid #526170; padding: 3px 5px; font: inherit; }
.wire-edit-actions { display: flex; gap: 6px; margin-top: 8px; }
.wire-edit-actions button { flex: 1; color: #d7dce2; border: 1px solid #526170; background: #243240; padding: 4px; font: inherit; cursor: pointer; }
.wire-edit-actions button:disabled { opacity: .4; cursor: default; }
.wire-hint { margin: 8px 0 0; font-size: 10px; line-height: 1.5; color: #aebccc; }
</style>
