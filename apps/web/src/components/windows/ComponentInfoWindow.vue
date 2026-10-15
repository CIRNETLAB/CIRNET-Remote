<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useCircuitStore } from '../../stores/circuit'
import { useUiStore } from '../../stores/ui'
import { libraryComponents, iconUrl } from '../../data/ribbon'
import { getDefinition } from '../../data/editorCatalog'
import { getPartForType } from '../../data/partCatalog'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const workspace = useWorkspaceStore(), circuit = useCircuitStore(), ui = useUiStore()
const header = ref<HTMLElement>()
const window = computed(() => ui.windows.find((entry) => entry.kind === 'component-info'))
const selected = computed(() => circuit.graph?.modules.find((module) => module.id === workspace.selectedModuleId))
const type = computed(() => selected.value?.type)
const definition = computed(() => type.value ? getDefinition(type.value) : undefined)
const part = computed(() => type.value ? getPartForType(type.value) : undefined)
const simulationState = computed(() => selected.value && circuit.physicalStates?.[selected.value.id])
const item = computed(() => libraryComponents.find((entry) => entry.type === type.value))
const name = computed(() => definition.value?.name || item.value?.name || type.value || 'Component')
const introductions: Record<string, string> = {
  GENERATOR: 'L1571979 two-channel bench function generator with independent CH1/CH2 displays, six screen keys, a function keypad, encoder and inclined support. CH1 Output, CH2 Output and Sync / Counter are visual BNC connectors. Place, select, move and rotate the instrument on the work surface.',
  OSCILLOSCOPE: 'A silver bench oscilloscope with a charcoal front, two inclined stands and Horizontal, Trigger and independent CH1/CH2 Vertical controls. The screen shows a waveform preview; CH1, CH2 and Trig Out are visual BNC connectors. Place, select, move and rotate the complete instrument on the work surface.',
  BREADBOARD: 'A solderless work surface with two terminal fields, a recessed IC channel and separate rail strips. Arrange modular boards and components before connecting logical ports.',
  BREADBOARD_630: 'A terminal strip with two fields of contacts separated by a recessed IC channel. Combine it with rail strips to organize a circuit on the work surface.',
  BREADBOARD_100: 'A narrow power rail strip for arranging a modular breadboard assembly. Place it alongside a terminal board to extend the work surface.',
  POWER_SUPPLY: 'An upright metal bench supply with a vertical V/A/W display, Vcc and Gnd posts and a power switch. In Select, drag Voltage (0–15 V) or Ampe (0–5 A) to adjust local setpoints; click I/O to toggle visual power. The W readout awaits measured output.',
}
const description = computed(() => type.value && introductions[type.value] || item.value?.description || (definition.value ? definition.value.visualOnly ? 'A visual work surface for arranging circuit components. Add another board and choose its position on the surface.' : 'An editor component with named logical ports. Arrange it on the surface before connecting its ports.' : 'An imported component. Its original properties are retained; no model contract is available for adding another instance.'))
const note = computed(() => part.value ? (part.value.simulation.status === 'supported' ? 'Physical package with declared pinout and a bounded virtual model.' : 'Physical package: place and wire. Simulation is not implemented for this part.') : type.value === 'GENERATOR' ? 'Visual instrument. Screen values and waveforms are illustrative; DDS output and device control are not connected yet.' : type.value === 'OSCILLOSCOPE' ? 'Visual instrument. Knob pivots and screen texture are ready for integration; signal acquisition and control behavior are not connected yet.' : definition.value?.visualOnly ? 'Visual structure. Placement creates no electrical source or connection.' : definition.value ? 'Editor model with named logical ports. Physical pin mapping and execution support are separate.' : 'This entry has no placeable editor model yet.')
function add() { if (definition.value && type.value) { workspace.armPlacement(type.value); ui.activeRibbonGroup = null } }
function remove() { if (selected.value) { circuit.removeModule(selected.value.id); ui.closeWindow('component-info') } }
function close() { ui.closeWindow('component-info'); void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus()) }
// Explicit window activation receives focus; automatic selection remains on canvas.
watch(() => window.value?.activation, (activation) => { if (activation) void nextTick(() => header.value?.focus()) })
</script>
<template>
  <aside v-if="window?.open && selected && !workspace.wireOptionsActive" class="component-information contextual-panel" aria-labelledby="component-information-title" :style="{ zIndex: window.z }" @pointerdown="ui.focusWindow('component-info')" @focusin="ui.focusWindow('component-info')" @keydown.esc.stop.prevent="close">
    <header ref="header" class="component-information-header" tabindex="0">
      <WorkbenchIcon name="chip" /><strong id="component-information-title">Component Info</strong>
      <button aria-label="Close Component Info" @click="close"><WorkbenchIcon name="close" /></button>
    </header>
    <div class="component-information-content">
      <div class="component-information-art"><img v-if="item?.icon" :src="iconUrl(item.icon)" :alt="name + ' preview'" width="250" height="110" /><WorkbenchIcon v-else :name="item?.glyph || 'chip'" /></div>
      <div class="component-information-heading"><small>INFORMATION</small><h2>{{ name }}</h2></div>
      <p class="component-information-introduction">{{ description }}</p>
      <p class="component-information-note">{{ note }}</p>
      <template v-if="part"><p>{{ part.partNumber }} · {{ part.package.id }} · {{ part.package.pins.length }} pins</p><p>{{ simulationState?.state || (part.simulation.status === 'supported' ? 'Ready for virtual evaluation' : 'Place / wire only · simulation unsupported') }}{{ simulationState?.reason ? ': ' + simulationState.reason : '' }}</p><p v-if="selected.mount">Mounted on {{ selected.mount.boardId }}</p><a :href="part.datasheet.url" target="_blank" rel="noopener noreferrer">Pinout / datasheet</a></template>
    </div>
    <footer class="component-information-footer"><button class="delete-btn" :aria-label="'Delete ' + name" @click="remove"><WorkbenchIcon name="delete" /> Delete</button><button :disabled="!definition" :aria-label="'Add ' + name" @click="add">Add <span aria-hidden="true">+</span></button></footer>
  </aside>
</template>
