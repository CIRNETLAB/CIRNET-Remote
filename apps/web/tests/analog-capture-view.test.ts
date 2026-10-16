import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createPinia,setActivePinia} from 'pinia'
import {markRaw} from 'vue'
import type {AnalogCaptureDescriptor} from '../src/contracts/generated/dto'
import {decodeAnalogCapture} from '../src/domain/capture/ncap'
import {loadSfc,mountSfc} from './helpers/vueSfc'
import {useInstrumentStore} from '../src/stores/instrument'
const cases=(JSON.parse(readFileSync('../../contracts/fixtures/capture/conformance.json','utf8')) as {cases:{id:string;payload_hex:string;descriptor:AnalogCaptureDescriptor}[]}).cases
function fixture(id:string){const entry=cases.find(value=>value.id===id)!;return decodeAnalogCapture(Uint8Array.from(Buffer.from(entry.payload_hex,'hex')).buffer,entry.descriptor)}
test('analog display labels calibrated units, explicit min/max representation, quality and exact clock identity without altering raw',async()=>{
 const raw=fixture('v2-loss-gaps-invalid-range-clipped'),before=raw.samples.slice(),pinia=createPinia();setActivePinia(pinia)
 const view=mountSfc(await loadSfc('components/windows/AnalogCaptureView.vue'),pinia,{capture:markRaw(raw),pixels:3})
 try{assert.match(view.text(),/synthetic_fixture/);assert.match(view.text(),/min\/max envelope/);assert.match(view.text(),/TRANSPORT_LOSS/);assert.match(view.text(),/Lost frames: 5/);assert.match(view.text(),/unix_epoch/);assert.match(view.text(),/Integrity: unchecked/);assert.match(view.text(),/V/)
 const buckets=view.all().filter(node=>node.tag==='line'&&node.props['data-envelope-bucket']!==undefined);assert.equal(buckets.length,2,'invalid amplitude is never drawn');assert.ok(view.text().includes('Invalid samples'));assert.ok(view.text().includes('Clipped'));assert.deepEqual(raw.samples,before)
 }finally{view.app.unmount()}
})
test('device-clock presentation never invents UTC and invalid evidence has no amplitude trace',async()=>{
 const pinia=createPinia();setActivePinia(pinia);let view=mountSfc(await loadSfc('components/windows/AnalogCaptureView.vue'),pinia,{capture:markRaw(fixture('v2-device-clock-is-not-UTC'))})
 try{assert.match(view.text(),/device_clock/);assert.match(view.text(),/synthetic-device-clock/);assert.doesNotMatch(view.text(),/UTC|1970-/)}finally{view.app.unmount()}
 view=mountSfc(await loadSfc('components/windows/AnalogCaptureView.vue'),pinia,{capture:markRaw(fixture('v2-invalid-evidence-retained'))})
 try{assert.match(view.text(),/INVALID/);assert.equal(view.all().filter(node=>node.props['data-envelope-bucket']!==undefined).length,0)}finally{view.app.unmount()}
})
test('scope receives only explicitly provided decoded evidence and clears it across principal partition',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const instrument=useInstrumentStore();instrument.setPrincipal('a');const raw=fixture('v2-int16-interleaved-negative-calibration');instrument.useAnalogCapture(raw)
 const view=mountSfc(await loadSfc('components/windows/OscilloscopeWindow.vue'),pinia)
 try{assert.match(view.text(),/synthetic_fixture/);assert.equal(instrument.analogCapture,raw);instrument.setPrincipal('b');assert.equal(instrument.analogCapture,null)}finally{view.app.unmount()}
})

test('extreme finite calibrated range produces only finite SVG coordinates and keeps raw extrema',async()=>{
 const template=fixture('v2-int16-interleaved-negative-calibration'),descriptor=structuredClone(template.descriptor),channel=descriptor.header.channels[0]!
 descriptor.header.channels=[{...channel,range_min:-1e308,range_max:1e308,scale:1e308,offset:0}];descriptor.header.frame_count=2
 const raw={descriptor,samples:new Int16Array([-1,1]),integrity:'unchecked' as const},before=raw.samples.slice(),pinia=createPinia();setActivePinia(pinia);const view=mountSfc(await loadSfc('components/windows/AnalogCaptureView.vue'),pinia,{capture:markRaw(raw),pixels:2})
 try{for(const line of view.all().filter(node=>node.props['data-envelope-bucket']!==undefined))for(const coordinate of ['x1','x2','y1','y2'])assert.equal(Number.isFinite(line.props[coordinate]),true,coordinate);assert.deepEqual(raw.samples,before)}finally{view.app.unmount()}
})
