<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useInstrumentStore} from '../../stores/instrument'
import {useStationStore} from '../../stores/station'
import {parseDocumentJson} from '../../domain/document/json'
import {parseLab} from '../../contracts/validation'
import {parseBitAssignments} from '../../application/assignments/authoring'
const instrument=useInstrumentStore(),station=useStationStore(),error=ref(''),vectorTime=ref('0'),vectorInputs=ref('')
const clockAvailable=computed(()=>station.executionTarget?.mode==='simulation'&&station.executionTarget.capabilities?.virtual_digital===true)
function attempt(action:()=>void){try{action();error.value=''}catch(reason){error.value=reason instanceof Error?reason.message:'Configuration is invalid.'}}
function number(text:string){const value=parseDocumentJson(text);if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Enter a finite number in the displayed units.');return value}
function inputText(key:string,value:string|number|null){return instrument.requestedInputErrors[key]?.text??value??''}
function numericAttempt(key:string,text:string,apply:()=>void){try{apply();instrument.clearRequestedInputError(key);error.value=''}catch(reason){error.value=reason instanceof Error?reason.message:'Invalid requested value.';instrument.setRequestedInputError(key,text,error.value)}}
function clockField(key:'signal'|'period_ns'|'cycles',text:string){numericAttempt('clock.'+key,text,()=>{const {enabled,...draft}=instrument.clockDraft;const value=parseLab('ClockConfiguration',{...draft,[key]:key==='signal'?text:number(text)});instrument.clockDraft={enabled,...value}})}
function captureField(key:'duration_ns'|'max_events',text:string){numericAttempt('capture.'+key,text,()=>{const value=key==='max_events'&&!text.trim()?null:number(text),configuration={signals:instrument.captureSignals,duration_ns:key==='duration_ns'?value:instrument.captureDurationNs,...(key==='max_events'?(value===null?{}:{max_events:value}):instrument.captureMaxEvents===null?{}:{max_events:instrument.captureMaxEvents})};parseLab('CaptureConfiguration',configuration);if(key==='duration_ns')instrument.captureDurationNs=value!;else instrument.captureMaxEvents=value})}
function addVector(){attempt(()=>{const vector=parseLab('TestVector',{time_ns:number(vectorTime.value),inputs:parseBitAssignments(vectorInputs.value)});instrument.testVectors=[...instrument.testVectors,vector];vectorInputs.value=''})}
watch(()=>instrument.principalId,()=>{error.value='';vectorTime.value='0';vectorInputs.value=''})
</script>
<template>
 <section class="run-configuration" aria-label="Pre-run instrument configuration">
  <h3>Next Run configuration</h3><p>These are requested settings. Create takes an immutable snapshot; editing them does not change a running output.</p>
  <p v-if="error||Object.values(instrument.requestedInputErrors)[0]?.error||instrument.configurationError" role="alert">{{error||Object.values(instrument.requestedInputErrors)[0]?.error||instrument.configurationError}}</p>
  <label>Capture duration (ns)<input aria-label="Capture duration (ns)" inputmode="numeric" :value="inputText('capture.duration_ns',instrument.captureDurationNs)" @change="captureField('duration_ns',($event.target as HTMLInputElement).value)" /></label>
  <label>Capture signals (comma separated)<input aria-label="Capture signals" :value="instrument.captureSignals.join(', ')" placeholder="Automatic outputs / probes" @change="instrument.captureSignals=($event.target as HTMLInputElement).value.split(',').map(value=>value.trim()).filter(Boolean)" /></label>
  <label>Maximum digital events (optional)<input aria-label="Capture maximum events" inputmode="numeric" :value="inputText('capture.max_events',instrument.captureMaxEvents)" @change="captureField('max_events',($event.target as HTMLInputElement).value)" /></label>
  <p>Declared logic analyzer channels: {{station.instrumentCapabilities?.logic_analyzer.channels??0}}</p>
  <fieldset><legend>Clock</legend><label class="check"><input type="checkbox" aria-label="Include clock in next Run" :checked="instrument.clockDraft.enabled" :disabled="!clockAvailable&&!instrument.clockDraft.enabled" @change="instrument.clockDraft.enabled=($event.target as HTMLInputElement).checked" />Include clock in next Run</label>
   <p v-if="!clockAvailable">Clock execution is unavailable on this target. The current supported path is virtual digital clocks.</p>
   <label>Clock signal<input aria-label="Clock signal" :value="inputText('clock.signal',instrument.clockDraft.signal)" @change="clockField('signal',($event.target as HTMLInputElement).value)" /></label><label>Period (ns)<input aria-label="Clock period (ns)" inputmode="numeric" :value="inputText('clock.period_ns',instrument.clockDraft.period_ns)" @change="clockField('period_ns',($event.target as HTMLInputElement).value)" /></label><label>Cycles<input aria-label="Clock cycles" inputmode="numeric" :value="inputText('clock.cycles',instrument.clockDraft.cycles)" @change="clockField('cycles',($event.target as HTMLInputElement).value)" /></label>
  </fieldset>
  <fieldset><legend>Trigger</legend><p>Local draft only: current adapters have no confirmed trigger producer. A requested trigger will fail validation.</p><label class="check"><input type="checkbox" aria-label="Include trigger in next Run" :checked="instrument.triggerDraft.enabled" :disabled="!instrument.triggerDraft.enabled" @change="instrument.triggerDraft.enabled=($event.target as HTMLInputElement).checked" />Include trigger in next Run (unavailable)</label><label>Signal (local draft)<input aria-label="Trigger signal local draft" :value="instrument.triggerDraft.signal" @change="instrument.triggerDraft.signal=($event.target as HTMLInputElement).value" /></label><label>Edge (local draft)<select aria-label="Trigger edge local draft" :value="instrument.triggerDraft.edge" @change="instrument.triggerDraft.edge=($event.target as HTMLSelectElement).value as typeof instrument.triggerDraft.edge"><option>RISING</option><option>FALLING</option><option>ANY</option></select></label></fieldset>
  <fieldset><legend>Digital test vectors</legend><ul><li v-for="(vector,index) in instrument.testVectors" :key="index">{{vector.time_ns}} ns · {{vector.inputs}}<button :aria-label="`Remove test vector ${index+1}`" @click="instrument.testVectors=instrument.testVectors.filter((_,n)=>n!==index)">Remove</button></li></ul><label>Time (ns)<input aria-label="Test vector time (ns)" inputmode="numeric" :value="vectorTime" @input="vectorTime=($event.target as HTMLInputElement).value" /></label><label>Inputs, e.g. x=1<input aria-label="Test vector inputs" :value="vectorInputs" @input="vectorInputs=($event.target as HTMLInputElement).value" /></label><button aria-label="Add test vector" @click="addVector">Add test vector</button></fieldset>
 </section>
</template>
<style scoped>
.run-configuration{font-size:12px}.run-configuration h3{font-size:13px;margin:14px 0 8px}.run-configuration fieldset{border:1px solid #42576b;margin:12px 0;padding:8px}.run-configuration label{margin:8px 0}.run-configuration .check{display:flex;flex-direction:row;align-items:center;gap:6px}.check input{width:auto}.run-configuration ul{padding-left:16px}.run-configuration li{margin:5px 0}.run-configuration p{line-height:1.5}[role=alert]{color:#ffb7a6}
</style>
