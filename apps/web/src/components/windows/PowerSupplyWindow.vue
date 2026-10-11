<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCircuitStore } from '../../stores/circuit'
import { useWorkspaceStore } from '../../stores/workspace'
import { supplyControlValue, supplyControlMaximum, type SupplyControl } from '../../three/PowerSupplyModel'
import { SUPPLY_THEME } from '../../data/instrumentVisuals'
const circuit = useCircuitStore(), workspace = useWorkspaceStore()
const selected = computed(() => circuit.graph?.modules.find(module => module.id === workspace.selectedModuleId && module.type === 'POWER_SUPPLY'))
const voltage = computed(() => supplyControlValue(selected.value?.properties, 'voltage_v') as number)
const current = computed(() => supplyControlValue(selected.value?.properties, 'current_limit_a') as number)
const on = computed(() => !!selected.value && supplyControlValue(selected.value.properties, 'power_on') === true)
const error = ref('')
watch(() => selected.value?.id, () => { error.value = '' })
const controls = [{ key: 'voltage_v', label: 'Voltage', input: 'Voltage setpoint', unit: 'V' }, { key: 'current_limit_a', label: 'Current / Ampe', input: 'Current limit', unit: 'A' }] as const
const value = (key: SupplyControl) => supplyControlValue(selected.value?.properties, key) as number
function update(key: SupplyControl, next: number | boolean) {
  if (!selected.value) return
  try { circuit.updateModuleProperties(selected.value.id, { [key]: next }); error.value = '' }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
function change(key: SupplyControl, event: Event) {
  const input = event.target as HTMLInputElement
  // Native controls commit on change (one graph/history action per drag), and
  // always read back canonical state after validation. No shadow setpoint state.
  update(key, input.value.trim() ? Number(input.value) : NaN)
  input.value = selected.value ? String(value(key)) : ''
}
</script>
<template>
  <div class="supply-instrument" :style="{ '--supply-voltage': SUPPLY_THEME.voltage, '--supply-current': SUPPLY_THEME.current, '--supply-bezel': SUPPLY_THEME.bezel, '--supply-panel': SUPPLY_THEME.panel }">
    <div class="supply-faceplate">
      <header class="supply-header"><div><strong>net<span>*CIRCUIT</span></strong><small>POWER BENCH SUPPLY</small></div><span class="supply-status">{{ selected ? selected.id : 'NO SUPPLY SELECTED' }}</span></header>
      <div class="supply-front">
        <div class="supply-display" :class="{ 'is-off': !on }" aria-label="Local supply settings; no measured telemetry">
          <template v-if="selected && on"><small>LOCAL SETPOINTS</small><div class="supply-reading"><b>{{ voltage.toFixed(2) }}</b><span>V</span></div><div class="supply-reading current"><b>{{ current.toFixed(2) }}</b><span>A</span></div><div class="supply-reading"><b>—</b><span>W</span></div><small>POWER MEASUREMENT UNAVAILABLE</small></template>
          <div v-else class="supply-screen-empty"><strong>{{ selected ? 'DISPLAY OFF' : 'NO SUPPLY SELECTED' }}</strong><span>{{ selected ? 'Setpoints retained in circuit' : 'Select a Power Supply in the workspace' }}</span></div>
        </div>
        <fieldset :disabled="!selected" class="supply-controls" aria-label="Local supply setpoint controls"><legend class="visually-hidden">Local configuration only</legend>
          <div v-for="control in controls" :key="control.key" class="supply-control" :style="{ '--knob-angle': (value(control.key) / supplyControlMaximum(control.key) * 270 - 135) + 'deg' }"><strong>{{ control.label }}</strong><div class="supply-knob" aria-hidden="true"><i /></div><input type="range" :aria-label="control.key === 'voltage_v' ? 'Voltage knob' : 'Current knob'" min="0" :max="supplyControlMaximum(control.key)" step="0.01" :value="value(control.key)" @change="change(control.key, $event)" /><label><span class="visually-hidden">{{ control.input }}</span><input type="number" :aria-label="control.input" min="0" :max="supplyControlMaximum(control.key)" step="0.01" :value="selected ? value(control.key) : ''" @change="change(control.key, $event)" /><span>{{ control.unit }}</span></label><small>0 – {{ supplyControlMaximum(control.key) }} {{ control.unit }}</small></div>
        </fieldset>
      </div>
      <div class="supply-connections"><div class="supply-power"><span>POWER</span><button type="button" role="switch" aria-label="Power switch" :aria-checked="on" :disabled="!selected" title="Toggle local supply power state" @click="update('power_on', !on)"><span>I</span><span>O</span></button><small>{{ selected ? (on ? 'ON' : 'OFF') : '—' }}</small></div><div class="supply-terminal"><i aria-hidden="true" /><strong>Vcc</strong><small>Visual terminal</small></div><div class="supply-terminal ground"><i aria-hidden="true" /><strong>Gnd</strong><small>Visual terminal</small></div></div>
      <p v-if="error" role="alert" class="supply-error">{{ error }}</p>
      <footer class="supply-footer"><span>LOCAL SETPOINTS · NO TELEMETRY</span><small>Configuration is saved in Circuit Graph. Physical output is not connected.</small></footer>
    </div>
  </div>
</template>
<style scoped>
.supply-instrument { container-type: inline-size; min-width: 0; color: #d5e0e5; }
.supply-faceplate { padding: 9px; border: 2px solid #66747c; border-radius: 7px; background: var(--supply-bezel); box-shadow: inset 0 0 0 1px #131b21; }
.supply-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }.supply-header > div { display: grid; gap: 3px; }.supply-header strong { font-size: 13px; }.supply-header strong span { color: #20d4ee; }.supply-header small { font: 9px Consolas, monospace; color: #aebdc6; letter-spacing: .5px; }.supply-status { font: 9px Consolas, monospace; padding: 6px; border: 1px solid #6c7b84; border-radius: 3px; overflow-wrap: anywhere; }
.supply-front { display: grid; grid-template-columns: minmax(0, 1fr) 132px; gap: 12px; }.supply-display { min-width: 0; min-height: 280px; padding: 10px 18px; border: 4px solid #161e23; border-radius: 6px; background: #060b10; box-shadow: 0 0 0 1px #637079; }.supply-display.is-off { background: #000; }.supply-display > small { display: block; color: #6f8c9e; font: 8px Consolas, monospace; letter-spacing: .5px; }.supply-reading { display: flex; align-items: baseline; justify-content: space-between; padding: 12px 0; color: var(--supply-voltage); font: 18px Consolas, monospace; }.supply-reading b { font-size: 46px; font-weight: 400; letter-spacing: 1px; }.supply-reading.current { color: var(--supply-current); }.supply-screen-empty { min-height: 248px; display: flex; flex-direction: column; justify-content: center; gap: 12px; text-align: center; }.supply-screen-empty strong { font: 11px Consolas, monospace; color: #8099a8; }.supply-screen-empty span { font-size: 10px; line-height: 1.7; color: #607c8b; }
.supply-controls { display: grid; align-content: start; gap: 10px; min-width: 0; margin: 0; padding: 8px; border: 1px solid #5d6971; border-radius: 4px; background: var(--supply-panel); }.supply-control { display: grid; justify-items: center; gap: 4px; min-width: 0; }.supply-control strong { font-size: 10px; font-weight: 400; }.supply-control small { font: 8px Consolas, monospace; color: #8fa6b4; }.supply-knob { position: relative; width: 50px; height: 50px; border-radius: 50%; border: 1px solid #7e8e97; padding: 5px; background: repeating-conic-gradient(#7d8e98 0deg 2deg, #1a232b 2deg 18deg); }.supply-knob i { display: block; height: 100%; border: 2px solid #101820; border-radius: 50%; background: radial-gradient(circle at 30% 25%, #52616a, #222c34 75%); transform: rotate(var(--knob-angle)); }.supply-knob i::after { content: ''; display: block; width: 2px; height: 11px; margin: 3px auto; background: #e0e8ec; }.supply-control > input { width: 100%; height: 14px; padding: 0; accent-color: #9baeb9; cursor: ew-resize; }.supply-control label { display: flex; flex-direction: row; align-items: center; gap: 5px; width: 100%; }.supply-control label input { padding: 4px 5px; font: 11px Consolas, monospace; }.supply-control label > span:last-child { font-size: 10px; }
.supply-connections { display: flex; align-items: center; justify-content: space-around; gap: 10px; padding: 10px 0 8px; }.supply-power { display: flex; align-items: center; gap: 7px; font: 9px Consolas, monospace; }.supply-power button { display: flex; flex-direction: column; justify-content: space-around; width: 29px; height: 42px; padding: 3px; border: 3px solid #101820; background: #8d2a23; font-size: 11px; box-shadow: inset 0 2px 2px #eb7064; }.supply-power button[aria-checked=true] { background: #e44335; box-shadow: inset 0 -2px 2px #752017; }.supply-power button:disabled { opacity: .5; }.supply-terminal { display: grid; grid-template-columns: 30px auto; align-items: center; column-gap: 7px; }.supply-terminal i { grid-row: span 2; width: 28px; height: 28px; border: 5px solid #f04c3d; border-radius: 50%; background: #080d12; box-shadow: inset 0 0 0 2px #9eadaf; }.supply-terminal.ground i { border-color: #657079; }.supply-terminal strong { font-size: 11px; }.supply-terminal small { font-size: 8px; color: #91a5b2; }
.supply-footer { display: grid; gap: 5px; padding-top: 8px; border-top: 1px solid #56636c; font: 8px Consolas, monospace; color: #a7bac5; }.supply-footer small { font: 9px/1.5 'Segoe UI', sans-serif; color: #8ca4b3; }.supply-error { margin: 6px 0; font-size: 10px; color: #ffad99; }
@container (max-width: 440px) { .supply-faceplate { padding: 8px; }.supply-front { grid-template-columns: minmax(0, 1fr); gap: 10px; }.supply-display { min-height: 240px; }.supply-screen-empty { min-height: 210px; }.supply-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }.supply-connections { flex-wrap: wrap; }.supply-terminal small { display: none; } }
</style>
