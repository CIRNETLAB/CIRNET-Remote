<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { normalizeLabelProperties } from '../../data/labelProperties'

const props = defineProps<{ properties?: Record<string, unknown>; contextKey?: string | number; placing?: boolean }>()
const emit = defineEmits<{ update: [properties: Record<string, unknown>]; cancel: [] }>()
const input = ref<HTMLTextAreaElement>(), error = ref('')
const draft = reactive({ text: '', fontSizeMm: 3, textColor: '#20252A', backgroundColor: '#FAFAF7' })
function reset() {
  const values = normalizeLabelProperties(props.properties)
  Object.assign(draft, { text: values.text, fontSizeMm: values.fontSizeMm, textColor: values.textColor, backgroundColor: values.backgroundColor })
  error.value = ''
}
function readDraft() {
  const value = normalizeLabelProperties({ ...props.properties, ...draft })
  return { text: value.text, fontSizeMm: value.fontSizeMm, textColor: value.textColor, backgroundColor: value.backgroundColor }
}
function update() { try { emit('update', readDraft()); error.value = '' } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Invalid label.' } }
function escape() { if (props.placing) emit('cancel'); else reset() }
function focusText() { input.value?.focus(); input.value?.select() }
watch(() => [props.contextKey, props.properties], reset, { immediate: true, deep: true })
watch(() => [props.contextKey, props.placing], () => { if (props.placing) void nextTick(focusText) }, { immediate: true })
defineExpose({ readDraft, focusText })
</script>
<template>
  <section class="component-property-form label-properties" aria-label="Label properties" data-workspace-text-input @keydown.esc.stop.prevent="escape">
    <label class="property-field"><span>Text</span><textarea ref="input" v-model="draft.text" aria-label="Label text" rows="4" spellcheck="false" /></label>
    <small>{{ Array.from(draft.text).length }} / 256 · Up to 4 lines</small>
    <label class="property-field"><span>Font size (mm)</span><input v-model.number="draft.fontSizeMm" aria-label="Label font size" type="number" min="2" max="6" step="0.5" /></label>
    <label class="property-field"><span>Text color</span><input v-model="draft.textColor" aria-label="Label text color" type="color" /></label>
    <label class="property-field"><span>Background</span><input v-model="draft.backgroundColor" aria-label="Label background color" type="color" /></label>
    <p v-if="error" role="alert" class="property-error">{{ error }}</p>
    <div class="property-form-actions"><button :aria-label="placing ? 'Preview Label' : 'Update Label'" @click="update">{{ placing ? 'Preview' : 'Update' }}</button></div>
  </section>
</template>
<style scoped>
.label-properties textarea { width: 100%; min-height: 5em; resize: vertical; font: inherit; color: inherit; background: var(--input-background, #172331); border: 1px solid #405267; border-radius: 3px; padding: 6px; box-sizing: border-box; }
.label-properties small { color: #a3b2c1; }
</style>
