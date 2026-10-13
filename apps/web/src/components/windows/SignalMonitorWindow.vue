<script setup lang="ts">
import { computed } from 'vue'
import { useInstrumentStore } from '../../stores/instrument'
import { instrumentThemeStyle } from '../../data/instrumentVisuals'
import { useExperimentStore } from '../../stores/experiment'
import { useCircuitStore } from '../../stores/circuit'
import { useStationStore } from '../../stores/station'
import { digitalTrace, formatTime } from '../../services/waveforms/digital'
const instrument = useInstrumentStore()
const experiment=useExperimentStore(), circuit=useCircuitStore(), station=useStationStore()
const capture=computed(()=>instrument.capture?.available?instrument.capture:null)
const traces=computed(()=>instrument.monitor.channels.map((signal,index)=>({signal,...digitalTrace(capture.value?.samples??[],signal,capture.value?.duration_ns??0,index)})))
const canRun=computed(()=>station.canExecute&&!experiment.busy&&(station.mode==='simulation'?!!circuit.graph:!!experiment.assignmentId))
function runPause() {return experiment.canStop?experiment.stop():experiment.run(circuit.graph,station.executionTarget,{signals:instrument.captureSignals,duration_ns:instrument.captureDurationNs})}
const rowCount = computed(() => Math.max(4, instrument.monitor.channels.length))
const plotHeight = computed(() => Math.max(200, rowCount.value * 36))
</script>
<template>
  <div class="logic-instrument" :style="instrumentThemeStyle">
    <div class="logic-analyzer">
      <header class="logic-header"><div><span class="logic-device">DIGITAL / 01</span><h2>Logic Analyzer</h2></div><div class="logic-status"><span>{{ capture ? capture.source + ' · CAPTURED' : 'NO CAPTURE SOURCE' }}</span><span>Trigger <b>—</b></span></div></header>
      <fieldset :disabled="!canRun && !experiment.canStop" class="logic-controls" aria-label="Logic analyzer controls" :title="canRun ? 'Run using backend lifecycle' : 'Capture is not connected'">
        <legend class="visually-hidden">{{ canRun || experiment.canStop ? 'Capture controls' : 'Capture controls unavailable' }}</legend>
        <label>Time Base<select v-model="instrument.monitor.timeScale" disabled title="Use capture duration in Inspector"><option>1 ms</option></select></label>
        <label>Trigger<select disabled title="Trigger acquisition is unavailable"><option>Not configured</option></select></label>
        <button type="button" @click="runPause"><span aria-hidden="true">▶</span> Run / Pause</button>
      </fieldset>
      <div class="logic-capture">
        <aside class="logic-channels" aria-label="Logic analyzer channels"><div class="logic-column-heading">Channels <span>{{ instrument.monitor.channels.length }}</span></div><div v-if="!instrument.monitor.channels.length" class="logic-channels-empty"><i aria-hidden="true">＋</i><strong>No channels configured</strong><span>Signal inputs will appear here</span></div><ol v-else><li v-for="(channel, index) in instrument.monitor.channels" :key="index"><i aria-hidden="true" /><span :title="channel">{{ channel }}</span><small>{{ capture ? traces[index]?.last : '—' }}</small></li></ol></aside>
        <div class="logic-timeline">
          <div class="logic-time-markers" :aria-label="capture ? 'Observed capture time axis' : 'Configured time axis in divisions; no acquired timestamps'"><span v-for="n in 6" :key="n">{{ capture ? formatTime((n - 1) * capture.duration_ns / 5) : (n - 1) * 2 }}<small>{{ !capture && n === 6 ? ' div' : '' }}</small></span></div>
          <div class="logic-plot" :style="{ minHeight: plotHeight + 'px' }">
            <svg :viewBox="'0 0 600 ' + plotHeight" preserveAspectRatio="none" role="img" :aria-label="capture ? 'Observed digital event traces' : 'Empty signal monitor; no acquired traces'"><line v-for="n in 11" :key="'x' + n" :x1="(n - 1) * 60" :x2="(n - 1) * 60" y1="0" :y2="plotHeight" /><line v-for="n in rowCount" :key="'y' + n" x1="0" x2="600" :y1="n * 36" :y2="n * 36" class="logic-row-guide" /><g v-if="capture"><g v-for="trace in traces" :key="trace.signal"><path :d="trace.path" :data-signal="trace.signal" class="observed-trace" /><path :d="trace.unknown" class="unknown-trace" /><text v-if="trace.unknown" x="4" :y="instrument.monitor.channels.indexOf(trace.signal) * 36 + 18" class="unknown-label">X</text></g></g></svg>
            <div v-if="!capture" class="logic-empty"><span aria-hidden="true">▥</span><strong>NO TRACE DATA</strong><small>Waiting for digital capture</small></div>
          </div>
          <div class="logic-axis-caption">{{ capture ? formatTime(capture.duration_ns) + ' capture' : instrument.monitor.timeScale + ' / div' }} <span>{{ capture ? 'Observed event timestamps' : 'Configured axis · no samples' }}</span></div>
        </div>
      </div>
      <footer class="logic-measurements" aria-label="Digital capture measurements"><span>Samples <b>{{ capture?.sample_count ?? '—' }}</b></span><span>Duration <b>{{ capture ? formatTime(capture.duration_ns) : '—' }}</b></span><span>Edges <b>{{ capture ? traces.reduce((sum,t)=>sum+t.edges,0) : '—' }}</b></span><span>Trigger time <b>—</b></span></footer>
      <div class="logic-footer"><i aria-hidden="true" /><span>{{ capture ? 'Capture ' + capture.capture_id : 'Capture not connected' }}</span><small>net*CIRCUIT · Signal Monitor</small></div>
    </div>
  </div>
</template>
<style scoped>
.observed-trace { fill:none; stroke:#70d9b2; stroke-width:1.5; vector-effect:non-scaling-stroke; }
.unknown-trace { fill:none; stroke:#c0a778; stroke-dasharray:3 3; stroke-width:1; }
.unknown-label { fill:#c0a778; font:8px Consolas,monospace; }
.logic-instrument { container-type: inline-size; min-width: 0; color: #d5e2e8; }
.logic-analyzer { min-width: 0; border: 1px solid #4f687a; border-radius: 5px; background: #14222d; overflow: hidden; }
.logic-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; background: #233440; border-bottom: 1px solid #40596a; }
.logic-device { font: 8px Consolas, monospace; letter-spacing: .7px; color: #92b0c0; }.logic-header h2 { margin: 3px 0 0; font-size: 13px; font-weight: 500; }
.logic-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; font: 9px Consolas, monospace; color: #9db5c2; }.logic-status > span:first-child { padding: 5px 6px; border: 1px solid #547180; border-radius: 3px; color: #c2d2db; font-size: 8px; }.logic-status b { font-weight: normal; }
.logic-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; min-width: 0; margin: 0; padding: 10px 12px; border: none; border-bottom: 1px solid #40596a; background: #1b2c38; }
.logic-controls label { display: flex; flex-direction: row; align-items: center; gap: 6px; font-size: 9px; color: #aec1ce; }.logic-controls select { width: auto; max-width: 100%; min-width: 65px; padding: 5px 7px; font-size: 10px; opacity: 1; }.logic-controls button { margin-left: auto; min-height: 28px; padding: 5px 9px; border-color: #487281; background: #27434e; color: #a8ced7; font-size: 10px; opacity: 1; cursor: pointer; }.logic-controls:disabled button { cursor: not-allowed; }.logic-controls button span { margin-right: 4px; }
.logic-capture { display: grid; grid-template-columns: 146px minmax(0, 1fr); min-width: 0; }
.logic-channels { min-width: 0; border-right: 1px solid #40596a; background: #192b36; }
.logic-column-heading { display: flex; align-items: center; justify-content: space-between; height: 30px; padding: 0 10px; border-bottom: 1px solid #40596a; font-size: 10px; color: #b4cbd5; }.logic-column-heading > span { font: 9px Consolas, monospace; color: #7d9aa8; }
.logic-channels-empty { display: flex; flex-direction: column; gap: 10px; align-items: center; padding: 37px 10px 20px; text-align: center; }.logic-channels-empty i { font-style: normal; font-size: 23px; color: #5c8597; }.logic-channels-empty strong { font-size: 10px; font-weight: 400; line-height: 1.6; color: #adc3ce; }.logic-channels-empty > span { font-size: 9px; line-height: 1.6; color: #7996a6; }
.logic-channels ol { list-style: none; padding: 0; margin: 0; }.logic-channels li { display: flex; gap: 7px; align-items: center; height: 36px; padding: 0 10px; border-bottom: 1px solid #2c414e; font: 10px Consolas, monospace; }.logic-channels li i { width: 3px; height: 14px; flex-shrink: 0; border-radius: 2px; background: var(--instrument-ch2); }.logic-channels li:nth-child(even) i { background: var(--instrument-ch1); }.logic-channels li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.logic-channels li small { margin-left: auto; color: #91aab9; }
.logic-timeline { display: flex; flex-direction: column; min-width: 0; background: var(--instrument-screen); }
.logic-time-markers { display: flex; justify-content: space-between; align-items: center; height: 30px; padding: 0 7px; border-bottom: 1px solid #40596a; font: 9px Consolas, monospace; color: #93adba; }.logic-time-markers small { font: inherit; color: inherit; }
.logic-plot { position: relative; flex: 1; }
.logic-plot svg { position: absolute; width: 100%; height: 100%; }.logic-plot line { stroke: #29404e; stroke-width: 1; vector-effect: non-scaling-stroke; }.logic-plot .logic-row-guide { stroke: #243744; stroke-dasharray: 3 5; }
.logic-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; text-align: center; color: #9eb8c6; }.logic-empty > span { font-size: 26px; color: #4e7287; background: var(--instrument-screen); }.logic-empty strong { font: 10px Consolas, monospace; letter-spacing: 1px; background: #050b10e8; padding: 4px 6px; }.logic-empty small { font-size: 10px; color: #7898ac; padding-inline: 5px; }
.logic-axis-caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; padding: 6px 8px; font: 8px/12px Consolas, monospace; border-top: 1px solid #334955; color: #89a6b5; }.logic-axis-caption span { color: #6e8e9f; }
.logic-measurements { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 10px 12px; border-top: 1px solid #40596a; background: #1a2c38; font: 9px/12px Consolas, monospace; color: #95b1c1; }.logic-measurements b { padding-left: 5px; font-weight: normal; color: #c2d4df; }
.logic-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; font-size: 9px; color: #95b1c1; }.logic-footer i { width: 5px; height: 5px; border-radius: 50%; background: #6a8390; }.logic-footer small { margin-left: auto; font-size: 8px; color: #708fa0; }
@container (max-width: 460px) { .logic-header { flex-wrap: wrap; }.logic-status { justify-content: flex-start; }.logic-controls { gap: 8px; }.logic-controls label { flex: 1 1 100px; flex-direction: column; align-items: start; }.logic-controls select { width: 100%; }.logic-controls button { margin-left: 0; }.logic-capture { grid-template-columns: 100px minmax(0, 1fr); }.logic-column-heading { padding-inline: 7px; }.logic-channels-empty { padding-inline: 7px; }.logic-channels li { padding-inline: 7px; }.logic-measurements { gap: 7px 12px; }.logic-footer small { flex-basis: 100%; margin-left: 11px; } }
</style>
