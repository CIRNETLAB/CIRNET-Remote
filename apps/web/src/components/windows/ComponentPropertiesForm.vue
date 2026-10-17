<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CircuitModule } from '../../types/circuit'
import { componentDesignTransition, type PartDefinition } from '../../data/partCatalog'
import type { ComponentParameter } from '../../data/componentParameters'
import { validParameterValue } from '../../data/componentParameters'
import { engineeringInput, fiveBandResistorCode, normalizeComponentProperties, parseEngineeringQuantity, type EngineeringUnit } from '../../data/componentProperties'
const props = defineProps<{ module?: CircuitModule; type?: string; properties?: Record<string, unknown>; contextKey?: string | number; descriptor: PartDefinition }>()
const emit = defineEmits<{ update: [properties: Record<string, unknown>] }>()
const type = computed(() => props.type ?? props.module?.type ?? props.descriptor.editorType)
const source = computed(() => props.properties ?? props.module?.properties)
const parameters = computed(() => props.descriptor.editor.parameters)
const draft = reactive<Record<string, { text: string; unit: string; checked: boolean }>>({})
const error = ref('')
const unitFor = (parameter: ComponentParameter): EngineeringUnit | undefined => parameter.unit ?? ({ resistanceOhms: 'ohm', capacitanceFarads: 'F', powerWatts: 'W', tolerancePercent: '%', voltageRatingVolts: 'V' } as Record<string, EngineeringUnit>)[parameter.key]
const units = (parameter: ComponentParameter) => unitFor(parameter) === 'ohm' ? ['Ω', 'kΩ', 'MΩ'] : unitFor(parameter) === 'F' ? ['pF', 'nF', 'µF', 'mF'] : unitFor(parameter) === 'A' ? ['A', 'mA', 'µA', 'nA'] : [unitFor(parameter) ?? '']
const exponents: Record<string, number> = { 'Ω': 0, 'kΩ': 3, 'MΩ': 6, pF: -12, nF: -9, 'µF': -6, mF: -3, A: 0, mA: -3, 'µA': -6, nA: -9 }
const label = (parameter: ComponentParameter) => ({ resistanceOhms: 'Resistance', capacitanceFarads: 'Capacitance', powerWatts: type.value === 'RESISTOR_AXIAL' ? 'Power rating' : 'Max power', voltageRatingVolts: 'Rated voltage', tolerancePercent: 'Tolerance' } as Record<string, string>)[parameter.key] ?? parameter.label
const unitLabel = (parameter: ComponentParameter) => `${label(parameter)} unit`
function reset() {
  const values = { ...props.descriptor.editor.defaults, ...normalizeComponentProperties(type.value, source.value) }
  for (const key of Object.keys(draft)) delete draft[key]
  for (const parameter of parameters.value) {
    const value = values[parameter.key], unit = unitFor(parameter)
    const selectedUnit: string = unit === 'ohm' ? Number(value) >= 1e6 ? 'MΩ' : Number(value) >= 1e3 ? 'kΩ' : 'Ω'
      : unit === 'F' ? Number(value) >= 1e-3 ? 'mF' : Number(value) >= 1e-6 ? 'µF' : Number(value) >= 1e-9 ? 'nF' : 'pF'
      : unit === 'A' ? Number(value) === 0 || Number(value) >= 1 ? 'A' : Number(value) >= 1e-3 ? 'mA' : Number(value) >= 1e-6 ? 'µA' : 'nA' : unit ?? ''
    draft[parameter.key] = { text: typeof value === 'number' && unit ? engineeringInput(value, exponents[selectedUnit] ?? 0) : String(value ?? ''), unit: selectedUnit, checked: value === true }
  }
  error.value = ''
}
function readDraft(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const parameter of parameters.value) {
    const entry = draft[parameter.key]!, unit = unitFor(parameter)
    const value = parameter.kind === 'boolean' ? entry.checked : parameter.kind === 'number' || parameter.kind === 'integer'
      ? parseEngineeringQuantity(entry.text + (unit ? ' ' + entry.unit : ''), unit ?? 'V', parameter) : entry.text
    if (!validParameterValue(parameter, value)) throw new Error(`Invalid ${label(parameter)}.`)
    result[parameter.key] = value
  }
  const target = componentDesignTransition(type.value, result)
  normalizeComponentProperties(target.type, result)
  return result
}
const warning = computed(() => {
  if (!parameters.value.some(parameter => parameter.key === 'resistanceOhms')) return ''
  try { const p = readDraft(), code = fiveBandResistorCode(Number(p.resistanceOhms), Number(p.tolerancePercent ?? 1)); return code.ok ? '' : code.reason } catch { return '' }
})
function update() { try { const patch = readDraft(); emit('update', patch); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid design properties.' } }
defineExpose({ readDraft })
watch(() => [props.module?.id, props.contextKey, props.descriptor.id, source.value], reset, { immediate: true, deep: true })
</script>
<template>
  <section v-if="parameters.length" class="component-property-form" data-workspace-text-input aria-label="Component design properties" @keydown.esc.stop="reset">
    <template v-for="advanced in [false, true]" :key="String(advanced)">
      <component :is="advanced ? 'details' : 'div'" v-if="parameters.some(parameter => !!parameter.advanced === advanced)" :class="advanced ? 'property-advanced' : 'property-fields'">
        <summary v-if="advanced">Advanced</summary>
        <label v-for="parameter in parameters.filter(parameter => !!parameter.advanced === advanced)" :key="parameter.key" class="property-field">
          <span>{{ label(parameter) }}</span>
          <select v-if="parameter.kind === 'enum'" :aria-label="label(parameter)" :value="draft[parameter.key]?.text" @change="draft[parameter.key]!.text = ($event.target as HTMLSelectElement).value"><option v-for="option in parameter.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
          <span v-else-if="parameter.kind === 'color'" class="property-colors"><button v-for="option in parameter.options" :key="option.value" type="button" :aria-label="option.label + ' LED'" :aria-pressed="draft[parameter.key]?.text.toLowerCase() === option.value.toLowerCase()" :title="option.label" :style="{ backgroundColor: option.value }" @click="draft[parameter.key]!.text = option.value" /><input type="color" :aria-label="label(parameter)" :value="draft[parameter.key]?.text" @input="draft[parameter.key]!.text = ($event.target as HTMLInputElement).value" /></span>
          <input v-else-if="parameter.kind === 'boolean'" type="checkbox" :aria-label="label(parameter)" :checked="draft[parameter.key]?.checked" @change="draft[parameter.key]!.checked = ($event.target as HTMLInputElement).checked" />
          <span v-else class="property-value-unit"><input :aria-label="label(parameter)" :inputmode="parameter.kind === 'string' ? 'text' : 'decimal'" :value="draft[parameter.key]?.text" @input="draft[parameter.key]!.text = ($event.target as HTMLInputElement).value" /><select v-if="units(parameter).length > 1" :aria-label="unitLabel(parameter)" :value="draft[parameter.key]?.unit" @change="draft[parameter.key]!.unit = ($event.target as HTMLSelectElement).value"><option v-for="unit in units(parameter)" :key="unit">{{ unit }}</option></select><span v-else class="property-unit">{{ unitFor(parameter) }}</span></span>
        </label>
      </component>
    </template>
    <p v-if="error" class="property-error" role="alert">{{ error }}</p><p v-if="warning" class="property-warning" role="status">{{ warning }}</p>
    <div class="property-form-actions"><button aria-label="Update component properties" @click="update">Update</button></div>
  </section>
</template>
