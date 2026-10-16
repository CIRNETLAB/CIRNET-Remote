import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildPreRunConfiguration} from '../src/application/instruments/configuration'
import {stationFixture} from './helpers/station'
import type {RequestedRunConfiguration} from '../src/application/instruments/configuration'
const draft=():RequestedRunConfiguration=>({capture:{signals:['y'],duration_ns:40},clock:null,generators:[],testVectors:[{time_ns:20,inputs:{x:1}}]})
test('pre-run builder validates public DTOs and takes a deep immutable configuration snapshot',()=>{
 const requested=draft(),built=buildPreRunConfiguration(requested,stationFixture().capabilities!)
 requested.capture.signals.push('other');requested.testVectors[0]!.inputs.x=0
 assert.deepEqual(built,{capture_config:{signals:['y'],duration_ns:40},test_vectors:[{time_ns:20,inputs:{x:1}}]})
 assert.equal(Object.isFrozen(built),true);assert.equal(Object.isFrozen(built.capture_config.signals),true);assert.equal(Object.isFrozen(built.test_vectors![0]!.inputs),true)
})
test('unsupported trigger and hardware clock requests fail explicitly rather than disappearing from serialization',()=>{
 const caps=stationFixture().capabilities!,requested=draft();requested.capture.trigger={signal:'y',edge:'RISING'}
 assert.throws(()=>buildPreRunConfiguration(requested,caps),/trigger.*unavailable|trigger.*unsupported/i)
 const clock={signal:'x',period_ns:20,cycles:2};requested.capture.trigger=undefined;requested.clock=clock
 assert.deepEqual(buildPreRunConfiguration(requested,caps).clock_config,clock)
 assert.throws(()=>buildPreRunConfiguration(requested,{...caps,mode:'hardware'}),/clock.*unavailable|clock.*virtual/i)
})
test('capability channel and generator profile limits are checked without inventing support',()=>{
 const caps=stationFixture().capabilities!,requested=draft()
 requested.generators=[{channel:1,waveform:'SINE',frequency_hz:1000,amplitude_vpp:1,offset_v:0,enabled:true}]
 assert.throws(()=>buildPreRunConfiguration(requested,caps),/generator.*channel|generator.*unavailable/i)
 caps.instrument_capabilities.generator={channels:1,runtime_reconfiguration_supported:false,frequency_max_hz:500}
 assert.throws(()=>buildPreRunConfiguration(requested,caps),/frequency/i)
 caps.instrument_capabilities.generator.frequency_max_hz=2000
 assert.deepEqual(buildPreRunConfiguration(requested,caps).generator_config,requested.generators)
 requested.capture.signals=['a','b','c','d','e'];assert.throws(()=>buildPreRunConfiguration(requested,caps),/capture.*channel/i)
})
test('invalid numeric settings, duplicate generator channels and time ranges fail before transport',()=>{
 const caps=stationFixture().capabilities!,requested=draft();caps.instrument_capabilities.generator.channels=2
 requested.capture.duration_ns=Number.NaN;assert.throws(()=>buildPreRunConfiguration(requested,caps));requested.capture.duration_ns=40
 requested.clock={signal:'x',period_ns:9007199254740992,cycles:1};assert.throws(()=>buildPreRunConfiguration(requested,caps));requested.clock=null
 const generator={channel:1 as const,waveform:'SINE' as const,frequency_hz:1,amplitude_vpp:1,offset_v:0,enabled:false};requested.generators=[generator,generator];assert.throws(()=>buildPreRunConfiguration(requested,caps),/duplicate/i)
 requested.generators=[];requested.testVectors=[{time_ns:4294967296,inputs:{x:1}}];assert.throws(()=>buildPreRunConfiguration(requested,caps))
})
