<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CircuitModule } from '../../types/circuit'
import type { PartDefinition } from '../../data/partCatalog'
import { componentPropertyBounds as bounds, fiveBandResistorCode, normalizeComponentProperties, parseEngineeringQuantity } from '../../data/componentProperties'
const props = defineProps<{ module: CircuitModule; descriptor: PartDefinition }>()
const emit = defineEmits<{ update: [properties: Record<string, unknown>] }>()
const resistor = computed(() => props.module.type === 'RESISTOR_AXIAL')
const capacitor = computed(() => ['CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC'].includes(props.module.type))
const draft = reactive({ value: '', unit: 'Ω', power: '', tolerance: '', voltage: '' })
const error = ref('')
const values = computed(() => ({ ...props.descriptor.editor.defaults, ...normalizeComponentProperties(props.module.type, props.module.properties) }))
const compact = (value: number) => String(Number(value.toPrecision(12)))
function reset() {
  const p = values.value
  if (resistor.value) {
    const resistance = Number(p.resistanceOhms), scale = resistance >= 1e6 ? 1e6 : resistance >= 1e3 ? 1e3 : 1
    draft.unit = scale === 1e6 ? 'MΩ' : scale === 1e3 ? 'kΩ' : 'Ω'; draft.value = compact(resistance / scale)
    draft.power = String(p.powerWatts); draft.tolerance = String(p.tolerancePercent)
  } else if (capacitor.value) {
    const capacitance = Number(p.capacitanceFarads), scale = capacitance >= 1e-3 ? 1e-3 : capacitance >= 1e-6 ? 1e-6 : capacitance >= 1e-9 ? 1e-9 : 1e-12
    draft.unit = scale === 1e-3 ? 'mF' : scale === 1e-6 ? 'µF' : scale === 1e-9 ? 'nF' : 'pF'; draft.value = compact(capacitance / scale)
    draft.voltage = String(p.voltageRatingVolts)
  }
  error.value = ''
}
function readDraft(): Record<string, number> {
  if (resistor.value) return {
    resistanceOhms: parseEngineeringQuantity(`${draft.value} ${draft.unit}`, 'ohm', bounds.resistanceOhms),
    powerWatts: parseEngineeringQuantity(draft.power, 'W', bounds.powerWatts),
    tolerancePercent: parseEngineeringQuantity(draft.tolerance, '%', bounds.tolerancePercent),
  }
  return {
    capacitanceFarads: parseEngineeringQuantity(`${draft.value} ${draft.unit}`, 'F', bounds.capacitanceFarads),
    voltageRatingVolts: parseEngineeringQuantity(draft.voltage, 'V', bounds.voltageRatingVolts),
  }
}
const warning = computed(() => {
  if (!resistor.value) return ''
  try { const p = readDraft(), code = fiveBandResistorCode(p.resistanceOhms!, p.tolerancePercent!); return code.ok ? '' : code.reason } catch { return '' }
})
const readout = computed(() => resistor.value ? `${draft.value} ${draft.unit} · ${draft.power} W · ±${draft.tolerance}%` : `${draft.value} ${draft.unit} / ${draft.voltage} V`)
function update() { try { emit('update', readDraft()); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid design properties.' } }
defineExpose({ readDraft })
watch(() => [props.module.id, JSON.stringify(props.module.properties), props.descriptor.id], reset, { immediate: true })
</script>
<template>
  <section v-if="resistor || capacitor" class="component-property-form" data-workspace-text-input aria-label="Component design properties" @keydown.esc.stop="reset">
    <p class="property-readout">{{ readout }}</p>
    <div class="property-quantity-row"><label>{{ resistor ? 'Resistance' : 'Capacitance' }}<input inputmode="decimal" :aria-label="resistor ? 'Resistance' : 'Capacitance'" :value="draft.value" @input="draft.value = ($event.target as HTMLInputElement).value" /></label><label>Unit<select :aria-label="resistor ? 'Resistance unit' : 'Capacitance unit'" :value="draft.unit" @change="draft.unit = ($event.target as HTMLSelectElement).value"><option v-for="unit in resistor ? ['Ω','kΩ','MΩ'] : ['pF','nF','µF','mF']" :key="unit">{{ unit }}</option></select></label></div>
    <div v-if="resistor" class="property-quantity-row"><label>Power rating (W)<input aria-label="Power rating" inputmode="decimal" :value="draft.power" @input="draft.power = ($event.target as HTMLInputElement).value" /></label><label>Tolerance (%)<input aria-label="Tolerance" inputmode="decimal" :value="draft.tolerance" @input="draft.tolerance = ($event.target as HTMLInputElement).value" /></label></div>
    <label v-else>Rated voltage (V)<input aria-label="Rated voltage" inputmode="decimal" :value="draft.voltage" @input="draft.voltage = ($event.target as HTMLInputElement).value" /></label>
    <p v-if="error" class="property-error" role="alert">{{ error }}</p><p v-if="warning" class="property-warning" role="status">{{ warning }}</p>
    <div class="property-form-actions"><button aria-label="Update component properties" @click="update">Update</button><button aria-label="Cancel component property changes" @click="reset">Cancel</button></div>
    <p class="property-design-note">Design values. Package and pin connections stay fixed.</p>
  </section>
</template>
