import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {useInstrumentStore} from '../src/stores/instrument'
import {stationFixture} from './helpers/station'
test('instrument draft settings produce immutable complete pre-run configuration and reject unsupported trigger intent',()=>{
 setActivePinia(createPinia());const store=useInstrumentStore();store.setPrincipal('first')
 store.captureSignals=['y'];store.captureDurationNs=40;store.clockDraft={enabled:true,signal:'clock.OUT',period_ns:20,cycles:2};store.testVectors=[{time_ns:20,inputs:{x:1}}]
 const snapshot=store.preRunConfiguration(stationFixture().capabilities!);store.clockDraft.period_ns=80;store.testVectors[0]!.inputs.x=0
 assert.deepEqual(snapshot,{capture_config:{signals:['y'],duration_ns:40},clock_config:{signal:'clock.OUT',period_ns:20,cycles:2},test_vectors:[{time_ns:20,inputs:{x:1}}]})
 store.triggerDraft={enabled:true,signal:'y',edge:'RISING'};assert.throws(()=>store.preRunConfiguration(stationFixture().capabilities!),/trigger/i)
})
test('instrument drafts remain local to a principal and same-principal session rotation preserves requested configuration',()=>{
 setActivePinia(createPinia());const store=useInstrumentStore();store.setPrincipal('first');store.captureSignals=['private'];store.clockDraft.enabled=true;store.testVectors=[{time_ns:1,inputs:{private:1}}];store.generator.frequency=1234;store.setRequestedInputError('capture.duration_ns','private-invalid','Invalid requested value')
 store.setPrincipal('first');assert.equal(store.requestedInputErrors['capture.duration_ns']?.text,'private-invalid');assert.equal(store.generator.frequency,1234);assert.equal(store.clockDraft.enabled,true)
 store.setPrincipal('second');assert.deepEqual(store.requestedInputErrors,{});assert.deepEqual(store.captureSignals,[]);assert.equal(store.clockDraft.enabled,false);assert.deepEqual(store.testVectors,[]);assert.equal(store.generator.frequency,1000)
})
