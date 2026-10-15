<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { CircuitModule } from '../../types/circuit'
import { defaultLeadProperties, parseLeadQuantity, readLeadProperties, validateLeadProperties, type LeadForm } from '../../data/leadProperties'
const props = defineProps<{ module: CircuitModule }>()
const emit = defineEmits<{ update: [properties: Record<string, unknown>]; preview: [properties: Record<string, unknown> | null] }>()
const editing = ref(false), error = ref('')
const draft = reactive({ form: 'formed90' as LeadForm, length: '0', lift: '0' })
function resetTo(properties = readLeadProperties(props.module.properties)) { draft.form = properties.leadForm; draft.length = String(properties.leadLengthMm); draft.lift = String(properties.bodyLiftMm); error.value = '' }
function start() { resetTo(); editing.value = true }
function cancel() { editing.value = false; resetTo(); emit('preview', null) }
function reset() { resetTo(defaultLeadProperties) }
function chooseForm(value: string) { draft.form = value as LeadForm; if (value === 'straight') draft.length = '0' }
function readDraft(): Record<string, unknown> {
  if (!editing.value) return {}
  const value = { leadForm: draft.form, leadLengthMm: parseLeadQuantity(draft.length, 'leadLengthMm'), bodyLiftMm: parseLeadQuantity(draft.lift, 'bodyLiftMm') }
  const errors = validateLeadProperties(props.module.type, value)
  if (errors.length) throw new Error(errors.join(' '))
  return value
}
const preview = computed(() => { if (!editing.value) return null; try { return readDraft() } catch { return null } })
watch(preview, value => emit('preview', value))
watch(() => [props.module.id, JSON.stringify(props.module.properties)], () => { editing.value = false; resetTo(); emit('preview', null) }, { immediate: true })
function update() { try { const value = readDraft(); emit('update', value); editing.value = false; emit('preview', null); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid lead shape.' } }
onBeforeUnmount(() => emit('preview', null))
defineExpose({ readDraft })
</script>
<template>
  <section class="component-property-form component-lead-form" data-workspace-text-input aria-label="Lead appearance" @keydown.esc.stop.prevent="cancel">
    <button v-if="!editing" aria-label="Edit leads" @click="start">Edit Leads</button>
    <template v-else>
      <label>Lead form<select aria-label="Lead form" :value="draft.form" @change="chooseForm(($event.target as HTMLSelectElement).value)"><option value="straight">Straight</option><option value="formed90">90° formed</option><option value="offset-s">Offset / S-bend</option></select></label>
      <div class="property-quantity-row"><label>Extra lead length (mm)<input aria-label="Extra lead length" inputmode="decimal" :disabled="draft.form === 'straight'" :value="draft.length" @input="draft.length = ($event.target as HTMLInputElement).value" /></label><label>Body lift (mm)<input aria-label="Body lift" inputmode="decimal" :value="draft.lift" @input="draft.lift = ($event.target as HTMLInputElement).value" /></label></div>
      <p class="property-design-note">Preview above. Extra length 0–4 mm; lift 0–6 mm. Contacts stay fixed. Move a pin to another hole using normal placement validation.</p>
      <p v-if="error" role="alert" class="property-error">{{ error }}</p>
      <div class="property-form-actions"><button aria-label="Update lead shape" @click="update">Update</button><button aria-label="Reset lead shape" @click="reset">Reset</button><button aria-label="Cancel lead changes" @click="cancel">Cancel</button></div>
    </template>
  </section>
</template>
