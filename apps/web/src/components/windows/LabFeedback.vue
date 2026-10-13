<script setup lang="ts">
import { computed } from 'vue'
import { useExperimentStore } from '../../stores/experiment'

const experiment = useExperimentStore()
const record = computed(() => experiment.active)
const safety = computed(() => record.value?.safety_verification)
const topology = computed(() => record.value?.topology_verification)
const functional = computed(() => record.value?.functional_verification)
const resolution = computed(() => record.value?.topology_resolution)
const safetyGroups = computed(() => [
  ['Power short', safety.value?.power_shorts], ['Hazardous drive conflict', safety.value?.hazardous_drive_conflicts],
  ['Over current risk', safety.value?.over_current_risks], ['Invalid voltage risk', safety.value?.invalid_voltage_risks],
  ['Polarity error', safety.value?.polarity_errors], ['Protection fault', safety.value?.protection_faults],
] as const)
const componentGroups = computed(() => [
  ['Missing component', topology.value?.missing_components], ['Unexpected component', topology.value?.unexpected_components],
  ['Unknown component', topology.value?.unknown_components],
] as const)
const netGroups = computed(() => [
  ['Matched net', topology.value?.matched_nets], ['Missing net', topology.value?.missing_nets],
  ['Unexpected net', topology.value?.unexpected_nets], ['Shorted net', topology.value?.shorted_nets],
] as const)
const pinGroups = computed(() => [
  ['Pin mapping difference', topology.value?.pin_mapping_differences ?? topology.value?.pin_mapping_issues],
  ['Orientation difference', topology.value?.orientation_differences],
] as const)
const signalGroups = computed(() => [
  ['Expected signals', functional.value?.expected_signals], ['Observed signals', functional.value?.observed_signals],
] as const)
const confidence = (value: number | undefined) => value === undefined ? 'Confidence not supplied' : `Confidence ${Math.round(value * 100)}%`
const signalValue = (value: number | string | null) => value === null ? 'No response' : String(value)
const values = (signals: Record<string, number | string | null>) => Object.entries(signals).map(([signal, value]) => `${signal}=${signalValue(value)}`).join(', ')
</script>

<template>
  <div class="lab-feedback" aria-label="Laboratory learning feedback">
    <p>Execution: <strong>{{ record?.execution_decision?.decision ?? '—' }}</strong></p>
    <ul v-if="record?.execution_decision?.reasons.length"><li v-for="(reason, index) in record.execution_decision.reasons" :key="index">{{ reason }}</li></ul>

    <section aria-label="safety verification" :data-status="safety?.status ?? '—'">
      <h3>SAFETY: {{ safety?.status ?? '—' }}</h3>
      <ul v-if="safety?.issues.length"><li v-for="(issue, index) in safety.issues" :key="index">{{ issue }}</li></ul>
      <template v-for="[label, evidence] in safetyGroups" :key="label">
        <ul v-if="evidence?.length"><li v-for="(fault, index) in evidence" :key="index"><strong>{{ label }}</strong>: {{ fault.message ?? 'Driver evidence' }} <code>{{ fault.node_ids.join(', ') }}</code><span v-if="fault.component_id"> · {{ fault.component_id }}</span></li></ul>
      </template>
      <ul v-if="safety?.notes?.length"><li v-for="(note, index) in safety.notes" :key="index">{{ note }}</li></ul>
    </section>

    <section aria-label="topology verification" :data-status="topology?.status ?? '—'">
      <h3>TOPOLOGY: {{ topology?.status ?? '—' }}</h3>
      <ul v-if="topology?.issues.length"><li v-for="(issue, index) in topology.issues" :key="index">{{ issue }}</li></ul>
      <p v-if="topology?.confidence !== undefined">{{ confidence(topology.confidence) }}</p>
      <template v-for="[label, components] in componentGroups" :key="label">
        <ul v-if="components?.length"><li v-for="(component, index) in components" :key="index"><strong>{{ label }}</strong>: {{ component.identity }}<span v-if="component.count !== undefined"> × {{ component.count }}</span><span v-if="component.component_id"> · {{ component.component_id }}</span><span v-if="component.package"> · {{ component.package }}</span><span v-if="component.notes?.length"> · {{ component.notes.join('; ') }}</span></li></ul>
      </template>
      <ul v-if="topology?.matched_components?.length"><li v-for="(match, index) in topology.matched_components" :key="index">Matched component: {{ match.reference_component_id }} → {{ match.observed_component_id }} <span>{{ confidence(match.confidence) }}</span></li></ul>
      <template v-for="[label, nets] in netGroups" :key="label">
        <ul v-if="nets?.length"><li v-for="(net, index) in nets" :key="index"><strong>{{ label }}</strong><span v-if="net.reference_pins.length || net.reference_nodes.length"> · Reference: <code>{{ net.reference_pins.join(', ') }} [{{ net.reference_nodes.join(', ') }}]</code></span><span v-if="net.observed_pins.length || net.observed_nodes.length"> · Observed: <code>{{ net.observed_pins.join(', ') }} [{{ net.observed_nodes.join(', ') }}]</code></span></li></ul>
      </template>
      <template v-for="[label, pins] in pinGroups" :key="label">
        <ul v-if="pins?.length"><li v-for="(pin, index) in pins" :key="index"><strong>{{ label }}</strong>: {{ pin.reference_component_id }} → {{ pin.observed_component_id }}, pin {{ pin.pin_id }} · {{ pin.issue }}<span v-if="pin.reference_node_id"> · Reference node {{ pin.reference_node_id }}</span><span v-if="pin.observed_node_id"> · Observed node {{ pin.observed_node_id }}</span></li></ul>
      </template>
    </section>

    <section aria-label="Topology resolution" :data-status="resolution?.status ?? '—'">
      <h3>Endpoint resolution: {{ resolution?.status ?? '—' }}</h3>
      <p v-if="resolution">{{ confidence(resolution.confidence) }}</p>
      <p v-if="resolution && resolution.status !== 'RESOLVED'">Unresolved locations are not inferred.</p>
      <ul v-if="resolution?.issues.length"><li v-for="(issue, index) in resolution.issues" :key="index">{{ issue }}</li></ul>
      <ul v-if="resolution?.endpoint_bindings.length"><li v-for="binding in resolution.endpoint_bindings" :key="binding.endpoint_id">{{ binding.endpoint_id }} → <code>{{ binding.observed_node_id }}</code> · {{ binding.source }} · {{ confidence(binding.confidence) }}</li></ul>
    </section>

    <section aria-label="function verification" :data-status="functional?.status ?? '—'">
      <h3>FUNCTION: {{ functional?.status ?? '—' }}</h3>
      <ul v-if="functional?.issues.length"><li v-for="(issue, index) in functional.issues" :key="index">{{ issue }}</li></ul>
      <template v-for="[label, signals] in signalGroups" :key="label">
        <div v-if="signals?.length" class="lab-table"><table :aria-label="label"><caption>{{ label }}</caption><thead><tr><th scope="col">Signal</th><th scope="col">Time (ns)</th><th scope="col">Value</th></tr></thead><tbody><tr v-for="(signal, index) in signals" :key="index"><td>{{ signal.signal }}</td><td>{{ signal.time_ns }}</td><td>{{ signal.value }}</td></tr></tbody></table></div>
      </template>
      <div v-if="functional?.mismatched_signals?.length" class="lab-table"><table aria-label="Signal mismatches"><caption>Signal mismatch</caption><thead><tr><th scope="col">Signal / time (ns)</th><th scope="col">Expected</th><th scope="col">Observed</th></tr></thead><tbody><tr v-for="(signal, index) in functional.mismatched_signals" :key="index"><td>{{ signal.signal }} / {{ signal.time_ns }}<span v-if="signal.case_index !== undefined"> · Case {{ signal.case_index + 1 }}</span></td><td>{{ signal.expected }}</td><td>{{ signalValue(signal.observed) }}</td></tr></tbody></table></div>
      <div v-if="functional?.expected_truth_table?.length" class="lab-table"><table aria-label="Expected truth table"><caption>Expected truth table</caption><thead><tr><th scope="col">Case</th><th scope="col">Inputs</th><th scope="col">Expected outputs</th></tr></thead><tbody><tr v-for="(row, index) in functional.expected_truth_table" :key="index"><td>{{ index + 1 }}</td><td>{{ values(row.inputs) }}</td><td>{{ values(row.outputs) }}</td></tr></tbody></table></div>
      <div v-if="functional?.observed_truth_table?.length" class="lab-table"><table aria-label="Observed truth table"><caption>Observed truth table</caption><thead><tr><th scope="col">Case / time (ns)</th><th scope="col">Inputs</th><th scope="col">Observed outputs</th><th scope="col">Result</th></tr></thead><tbody><tr v-for="row in functional.observed_truth_table" :key="row.case_index"><td>{{ row.case_index + 1 }} / {{ row.time_ns }}</td><td>{{ values(row.inputs) }}</td><td>{{ values(row.outputs) }}</td><td>{{ row.status }}</td></tr></tbody></table></div>
      <ul v-if="functional?.timing_results?.length"><li v-for="(timing, index) in functional.timing_results" :key="index">Timing {{ timing.signal }}: expected {{ timing.expected_time_ns }} ns, observed {{ timing.observed_time_ns === null ? 'No response' : timing.observed_time_ns + ' ns' }} · {{ timing.status }}</li></ul>
      <ul v-if="functional?.waveform_comparisons?.length"><li v-for="(waveform, index) in functional.waveform_comparisons" :key="index">Waveform {{ waveform.signal }}: {{ waveform.status }} ({{ waveform.expected.length }} expected / {{ waveform.observed.length }} observed checkpoints)</li></ul>
    </section>

    <section v-if="record?.assessment" aria-label="Assignment assessment"><h3>Assessment: {{ record.assessment.status }}</h3><p>{{ record.assessment.policy }} · Topology evaluated: {{ record.assessment.topology_evaluated ? 'yes' : 'no' }} · Function evaluated: {{ record.assessment.function_evaluated ? 'yes' : 'no' }}</p><ul v-if="record.assessment.issues.length"><li v-for="(issue, index) in record.assessment.issues" :key="index">{{ issue }}</li></ul></section>
  </div>
</template>

<style scoped>
.lab-feedback { font-size: 11px; overflow-wrap: anywhere; }
.lab-feedback section { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-subtle, #40505e); }
.lab-feedback h3 { font-size: 11px; margin: 0 0 6px; }
.lab-feedback ul { padding-left: 18px; margin: 6px 0; }
.lab-feedback li { margin: 4px 0; }
.lab-table { max-width: 100%; overflow-x: auto; margin: 8px 0; }
.lab-table table { width: 100%; border-collapse: collapse; font-size: 10px; }
.lab-table caption { text-align: left; font-weight: 600; margin-bottom: 4px; }
.lab-table th, .lab-table td { padding: 4px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border-subtle, #40505e); }
</style>
