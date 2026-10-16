<script setup lang="ts">
import {computed} from 'vue'
import type {DecodedAnalogCapture} from '../../domain/capture/ncap'
import {createDisplayEnvelope} from '../../domain/capture/envelope'
const props=defineProps<{capture:DecodedAnalogCapture;pixels?:number}>()
const header=computed(()=>props.capture.descriptor.header)
const displays=computed(()=>header.value.channels.map(channel=>({channel,envelope:createDisplayEnvelope(props.capture,{channelId:channel.id,pixels:props.pixels??600})})))
function geometry(display:(typeof displays.value)[number]){
 const valid=display.envelope.buckets.filter(bucket=>bucket.minimum!==null&&bucket.maximum!==null)
 const low=Math.min(display.channel.range_min,...valid.map(bucket=>bucket.minimum!)),high=Math.max(display.channel.range_max,...valid.map(bucket=>bucket.maximum!)),normalizer=Math.max(Math.abs(low),Math.abs(high),1),normalizedLow=low/normalizer,span=high/normalizer-normalizedLow||1
 const end=Math.max(1,...display.envelope.buckets.map(bucket=>bucket.endOffsetNs))
 return valid.map(bucket=>({bucket,x:(bucket.startOffsetNs+bucket.endOffsetNs)/2/end*600,y1:180-(bucket.minimum!/normalizer-normalizedLow)/span*160,y2:180-(bucket.maximum!/normalizer-normalizedLow)/span*160}))
}
</script>
<template>
 <section class="analog-capture" aria-label="Analog capture evidence">
  <header><strong>{{ header.source }} · {{ header.provenance }}</strong><span>Integrity: {{ capture.integrity }}</span></header>
  <p>Explicit min/max envelope · raw samples retained · {{ header.frame_count }} frames</p>
  <p>{{ header.quality.status }} · Lost frames: {{ header.quality.lost_frames }} · {{ header.quality.termination_reason }}</p>
  <p>Clock: {{ header.time_axis.reference }}<span v-if="header.time_axis.clock_id"> · {{ header.time_axis.clock_id }}</span> · anchor {{ header.time_axis.anchor_ns }} ns · sample rate {{ header.time_axis.sample_rate_hz.numerator }}/{{ header.time_axis.sample_rate_hz.denominator }} Hz</p>
  <p v-if="header.quality.status === 'INVALID'" role="alert">INVALID evidence: amplitudes are unavailable.</p>
  <section v-for="display in displays" :key="display.channel.id" class="analog-channel">
   <h3>{{ display.channel.id }} · {{ display.channel.unit }}</h3>
   <p>Calibration {{ display.channel.calibration_id ?? 'unidentified' }} · scale {{ display.channel.scale }} · offset {{ display.channel.offset }} · range {{ display.channel.range_min }} to {{ display.channel.range_max }} {{ display.channel.unit }}</p>
   <svg viewBox="0 0 600 200" role="img" :aria-label="display.channel.id + ' calibrated min/max envelope in ' + display.channel.unit">
    <line x1="0" x2="600" y1="180" y2="180" class="analog-axis" />
    <line v-for="point in geometry(display)" :key="point.bucket.firstFrame" :data-envelope-bucket="point.bucket.firstFrame" :x1="point.x" :x2="point.x" :y1="point.y1" :y2="point.y2" :class="{'quality-warning':point.bucket.clipped || point.bucket.discontinuous}" />
   </svg>
   <p v-if="display.envelope.buckets.some(bucket=>bucket.hasInvalidSamples)">Invalid samples: omitted from amplitude envelope.</p>
   <p v-if="display.envelope.buckets.some(bucket=>bucket.discontinuous)">Discontinuities: missing frames; no interpolated trace.</p>
   <p v-if="display.envelope.buckets.some(bucket=>bucket.clipped)">Clipped or outside calibrated range.</p>
  </section>
 </section>
</template>
<style scoped>
.analog-capture {font:11px/1.6 Consolas,monospace;color:#b8d1dc}.analog-capture header{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.analog-capture p{margin:5px 0;overflow-wrap:anywhere}.analog-channel h3{font-size:12px;margin:10px 0 4px}.analog-channel svg{width:100%;height:180px;background:#07131c;border:1px solid #405765}.analog-channel line{stroke:#78d4c3;stroke-width:1.5;vector-effect:non-scaling-stroke}.analog-channel line.analog-axis{stroke:#405765}.analog-channel line.quality-warning{stroke:#efc37c}[role=alert]{color:#ffb8a8}
</style>
