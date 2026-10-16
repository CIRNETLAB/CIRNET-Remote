<script setup lang="ts">
import { useInstrumentStore } from '../../stores/instrument'
import { instrumentThemeStyle, SCOPE_KEYS, SCOPE_LABELS, SCOPE_SECTIONS } from '../../data/instrumentVisuals'
import AnalogCaptureView from './AnalogCaptureView.vue'
import InstrumentDial from './InstrumentDial.vue'
import { computed } from 'vue'
import { useStationStore } from '../../stores/station'
const instrument = useInstrumentStore()
const station=useStationStore()
const scopeChannels=computed(()=>station.instrumentCapabilities?.oscilloscope.channels??0)
const scopeAvailable=computed(()=>station.canExecute&&scopeChannels.value>0)
const horizontalKeys = [SCOPE_KEYS.auto_set_button, SCOPE_KEYS.run_stop_button, SCOPE_KEYS.single_button, SCOPE_KEYS.default_button]
const triggerKeys = [SCOPE_KEYS.trigger_mode_button, SCOPE_KEYS.trigger_source_button, SCOPE_KEYS.trigger_slope_button, SCOPE_KEYS.trigger_menu_button]
const channels=computed(()=>Array.from({length:Math.min(scopeChannels.value,16)},(_,index)=>({name:'CH'+(index+1),accent:index%2?'var(--instrument-ch2)':'var(--instrument-ch1)'})))
</script>
<template>
  <div class="scope-instrument" :style="instrumentThemeStyle">
    <div class="scope-faceplate">
      <header class="scope-brand"><div><strong>net<span>*CIRCUIT</span></strong><small>DIGITAL OSCILLOSCOPE · {{ scopeChannels }} declared channels</small></div><span class="scope-status">{{ instrument.analogCapture ? 'CAPTURE EVIDENCE' : 'NO CAPTURE SOURCE' }}</span></header>
      <div class="scope-front">
        <div class="scope-display-column">
          <AnalogCaptureView v-if="instrument.analogCapture" :capture="instrument.analogCapture" />
          <div v-else class="scope-display">
            <div class="scope-display-status"><span>OSC / 01</span><span>TRIGGER <b>—</b></span><span>TIMEBASE {{ instrument.oscilloscope.timeDiv }} / div</span></div>
            <div class="scope-plot">
              <svg viewBox="0 0 500 360" preserveAspectRatio="none" role="img" aria-label="Empty oscilloscope grid; no waveform data">
                <line v-for="n in 11" :key="'x' + n" :x1="(n - 1) * 50" :x2="(n - 1) * 50" y1="0" y2="360" />
                <line v-for="n in 9" :key="'y' + n" x1="0" x2="500" :y1="(n - 1) * 45" :y2="(n - 1) * 45" />
                <path d="M0 180H500 M250 0V360" class="scope-crosshair" />
              </svg>
              <div class="scope-empty"><span class="scope-empty-icon" aria-hidden="true">∿</span><strong>NO WAVEFORM DATA</strong><span>Waiting for a capture source</span></div>
            </div>
            <div class="scope-scale-bar"><span class="scope-ch1">CH1 {{ instrument.oscilloscope.channelScale }} / div</span><span class="scope-ch2">CH2 {{ instrument.oscilloscope.channelScale }} / div</span></div>
          </div>
          <div class="scope-inputs"><span><i class="scope-ch1" aria-hidden="true" />CH1 <small>Not attached</small></span><span><i class="scope-ch2" aria-hidden="true" />CH2 <small>Not attached</small></span><span>Trig Out <small>—</small></span></div>
        </div>
        <fieldset :disabled="!scopeAvailable" class="scope-controls" aria-label="Oscilloscope controls" title="Acquisition is not connected">
          <legend class="visually-hidden">Oscilloscope controls unavailable</legend>
          <section class="scope-control-panel" aria-labelledby="scope-horizontal-title">
            <h3 id="scope-horizontal-title">{{ SCOPE_SECTIONS[0] }}</h3>
            <div class="scope-horizontal">
              <InstrumentDial :label="SCOPE_LABELS.timeDiv" :caption="SCOPE_LABELS.timeDiv" :value="instrument.oscilloscope.timeDiv" style="--dial-accent: var(--instrument-ch2)" />
              <InstrumentDial label="Horizontal Position" :caption="SCOPE_LABELS.position" value="—" compact />
              <div class="scope-key-stack"><button v-for="(key, index) in horizontalKeys" :key="key.label" type="button" disabled title="No confirmed analog acquisition producer" :class="{ 'scope-action-key': index < 2 }" :style="index < 2 ? { '--key-accent': key.color } : {}">{{ key.label }}</button></div>
            </div>
          </section>
          <section class="scope-control-panel" aria-labelledby="scope-trigger-title">
            <h3 id="scope-trigger-title">{{ SCOPE_SECTIONS[1] }}</h3>
            <div class="scope-trigger"><InstrumentDial label="Trigger Level" :caption="SCOPE_LABELS.level" value="—" /><div class="scope-trigger-keys"><button v-for="key in triggerKeys" :key="key.label" type="button" disabled>{{ key.label }}</button><span>{{ instrument.oscilloscope.trigger }} <b>·</b> Source —</span></div></div>
          </section>
          <section class="scope-control-panel scope-vertical" aria-labelledby="scope-vertical-title">
            <h3 id="scope-vertical-title">{{ SCOPE_SECTIONS[2] }}</h3>
            <p v-if="scopeChannels > 16">{{ scopeChannels - 16 }} additional declared channels; no attached analog source.</p><div class="scope-channels"><div v-for="channel in channels" :key="channel.name" class="scope-channel" :style="{ '--dial-accent': channel.accent }"><strong>{{ channel.name }}</strong><InstrumentDial :label="channel.name + ' ' + SCOPE_LABELS.voltsDiv" :caption="SCOPE_LABELS.voltsDiv" :value="instrument.oscilloscope.channelScale" /><InstrumentDial :label="channel.name + ' Position'" :caption="SCOPE_LABELS.position" value="—" compact /></div></div>
          </section>
        </fieldset>
      </div>
      <footer class="scope-measurements" aria-label="Oscilloscope measurements"><span>Frequency <b>—</b></span><span>Amplitude <b>—</b></span><span>Period <b>—</b></span><small>No confirmed analog acquisition producer</small></footer>
    </div>
  </div>
</template>
<style scoped>
.scope-instrument { container-type: inline-size; min-width: 0; color: #d9e3e8; }
.scope-faceplate { padding: 8px; border: 1px solid #68757d; border-radius: 7px; background: var(--instrument-bezel); box-shadow: inset 0 1px 0 #aab6bd44; }
.scope-brand { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; margin-bottom: 10px; }
.scope-brand > div { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; min-width: 0; }
.scope-brand strong { font-size: 12px; letter-spacing: -.3px; }.scope-brand strong span { color: var(--instrument-ch2); }
.scope-brand small { font: 8px/12px Consolas, monospace; letter-spacing: .4px; color: #a9bac4; }
.scope-status { flex-shrink: 0; padding: 4px 6px; border: 1px solid #596c78; border-radius: 3px; font: 8px/12px Consolas, monospace; color: #c0d1db; }
.scope-front { display: grid; grid-template-columns: minmax(0, 1fr) 246px; align-items: stretch; gap: 10px; min-width: 0; }
.scope-display-column { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.scope-display { display: flex; flex-direction: column; flex: 1; min-width: 0; padding: 7px; background: var(--instrument-screen); border: 5px solid #141d24; border-radius: 5px; box-shadow: 0 0 0 1px #627582; }
.scope-display-status { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 0 0 7px; border-bottom: 1px solid #34444e; font: 8px/11px Consolas, monospace; color: #9aafb9; }.scope-display-status span:last-child { margin-left: auto; }.scope-display-status b { font-weight: normal; }
.scope-plot { position: relative; flex: 1; min-height: 240px; margin: 8px 0; }
.scope-plot svg { position: absolute; width: 100%; height: 100%; overflow: visible; }
.scope-plot line { stroke: #34444f; stroke-width: 1; stroke-dasharray: 2 5; vector-effect: non-scaling-stroke; }
.scope-crosshair { fill: none; stroke: #65747e; stroke-width: 1; vector-effect: non-scaling-stroke; }
.scope-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; text-align: center; color: #9bafb9; }
.scope-empty strong { padding: 5px 8px; background: #050b10e8; font: 10px Consolas, monospace; letter-spacing: .8px; }.scope-empty > span:last-child { font-size: 10px; }
.scope-empty-icon { font-size: 30px; color: #58707e; background: var(--instrument-screen); }
.scope-scale-bar { display: flex; flex-wrap: wrap; gap: 8px 18px; padding-top: 7px; border-top: 1px solid #34444e; font: 9px/12px Consolas, monospace; }
.scope-ch1 { color: var(--instrument-ch1); }.scope-ch2 { color: var(--instrument-ch2); }
.scope-inputs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 7px 4px; font: 9px Consolas, monospace; }.scope-inputs > span { display: flex; align-items: center; gap: 5px; }.scope-inputs i { width: 15px; height: 15px; border: 2px solid currentColor; border-radius: 50%; box-shadow: inset 0 0 0 2px #8b9ba2; }.scope-inputs small { color: #9bafb9; font: 8px 'Segoe UI', sans-serif; }
.scope-controls { display: grid; gap: 7px; min-width: 0; margin: 0; padding: 0; border: none; }
.scope-control-panel { min-width: 0; padding: 7px; border: 1px solid #687983; border-radius: 4px; background: var(--instrument-panel); }
.scope-control-panel h3 { margin: 0 0 5px; font-size: 10px; font-weight: 500; color: #e2e9ed; }
.scope-horizontal { display: grid; grid-template-columns: 1fr .8fr 74px; align-items: center; gap: 6px; }
.scope-key-stack { display: grid; gap: 4px; }
.scope-controls button { min-height: 20px; border-radius: 3px; font-size: 9px; background: #35434e; border-color: #63727c; color: #dae4e9; opacity: 1; cursor: not-allowed; }
.scope-controls .scope-action-key { background: var(--key-accent); border-color: var(--key-accent); color: #06212a; }
.scope-trigger { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; gap: 10px; }
.scope-trigger-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }.scope-trigger-keys > span { grid-column: 1 / -1; font: 8px Consolas, monospace; text-align: center; color: #9db1bc; }.scope-trigger-keys b { margin-inline: 3px; font-weight: normal; }
.scope-channels { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.scope-channel { display: grid; grid-template-columns: 1fr 1fr; justify-items: center; align-items: center; gap: 6px; }.scope-channel + .scope-channel { border-left: 1px solid #586975; }.scope-channel > strong { grid-column: 1 / -1; justify-self: stretch; padding: 3px; border-radius: 3px; text-align: center; background: var(--dial-accent); color: #07181e; font: bold 9px Consolas, monospace; }
.scope-measurements { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #637581; font: 9px/12px Consolas, monospace; color: #b4c4cc; }.scope-measurements b { padding-left: 4px; color: #e0e9ed; font-weight: normal; }.scope-measurements small { margin-left: auto; font: 8px 'Segoe UI', sans-serif; color: #a2b4bf; }
@container (max-width: 640px) { .scope-front { grid-template-columns: minmax(0, 1fr); }.scope-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }.scope-vertical { grid-column: 1 / -1; }.scope-channels { gap: 12px; }.scope-plot { min-height: 215px; } }
@container (max-width: 430px) { .scope-brand { flex-wrap: wrap; }.scope-controls { grid-template-columns: minmax(0, 1fr); }.scope-vertical { grid-column: auto; }.scope-faceplate { padding: 8px; }.scope-plot { min-height: 180px; }.scope-measurements small { flex-basis: 100%; margin-left: 0; } }
</style>
