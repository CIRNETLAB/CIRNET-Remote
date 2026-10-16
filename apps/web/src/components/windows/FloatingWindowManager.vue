<script setup lang="ts">
import { useUiStore } from '../../stores/ui'
import FloatingWindow from './FloatingWindow.vue'
import OscilloscopeWindow from './OscilloscopeWindow.vue'
import GeneratorWindow from './GeneratorWindow.vue'
import PowerSupplyWindow from './PowerSupplyWindow.vue'
import SignalMonitorWindow from './SignalMonitorWindow.vue'
import ComponentInfoWindow from './ComponentInfoWindow.vue'
import InspectorWindow from './InspectorWindow.vue'
import HexEditorWindow from './HexEditorWindow.vue'
import ProjectManagerWindow from './ProjectManagerWindow.vue'
import AssignmentWindow from './AssignmentWindow.vue'
import ExperimentHistoryWindow from './ExperimentHistoryWindow.vue'
const ui = useUiStore()
const bodies = { assignments:AssignmentWindow,history:ExperimentHistoryWindow,projects:ProjectManagerWindow,oscilloscope: OscilloscopeWindow, generator: GeneratorWindow, 'power-supply': PowerSupplyWindow, monitor: SignalMonitorWindow, inspector: InspectorWindow, 'hex-editor': HexEditorWindow }
</script>
<template><div class="floating-window-manager" aria-label="Workspace windows"><ComponentInfoWindow /><template v-for="window in ui.windows" :key="window.kind"><FloatingWindow v-if="window.open && window.kind !== 'component-info'" :window="window"><component :is="bodies[window.kind]" /></FloatingWindow></template></div></template>
