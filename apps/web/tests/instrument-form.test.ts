import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {nextTick} from 'vue'
import {useInstrumentStore} from '../src/stores/instrument'
import {useStationStore} from '../src/stores/station'
import {stationFixture} from './helpers/station'
import {loadSfc,mountSfc,dispatch} from './helpers/vueSfc'
test('pre-run UI edits typed clock and vectors while unsupported trigger remains explicit and numeric precision is preserved',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const store=useInstrumentStore(),station=useStationStore();store.setPrincipal('first');station.setStations([stationFixture()]);station.setEventsConnected(true)
 const view=mountSfc(await loadSfc('components/windows/InstrumentConfigurationForm.vue'),pinia)
 try{dispatch(view.find('input','aria-label','Include clock in next Run'),'onChange',true);await nextTick();dispatch(view.find('input','aria-label','Clock signal'),'onChange','clock.OUT');dispatch(view.find('input','aria-label','Clock period (ns)'),'onChange','20');dispatch(view.find('input','aria-label','Clock cycles'),'onChange','2')
 dispatch(view.find('input','aria-label','Test vector time (ns)'),'onInput','20');dispatch(view.find('input','aria-label','Test vector inputs'),'onInput','x=1');dispatch(view.find('button','aria-label','Add test vector'),'onClick');await nextTick()
 assert.deepEqual(store.preRunConfiguration(station.executionTarget!.capabilities!).clock_config,{signal:'clock.OUT',period_ns:20,cycles:2});assert.deepEqual(store.testVectors,[{time_ns:20,inputs:{x:1}}]);assert.equal(view.find('input','aria-label','Include trigger in next Run').props.disabled,true)
 dispatch(view.find('input','aria-label','Clock period (ns)'),'onChange','9007199254740993');await nextTick();assert.equal(store.clockDraft.period_ns,20);assert.ok(view.text().includes('precision'))
 }finally{view.app.unmount()}
})

test('invalid capture and clock text survives remount and blocks Run until corrected',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const store=useInstrumentStore(),station=useStationStore();station.setStations([stationFixture()]);store.clockDraft.signal='clock.OUT';let view=mountSfc(await loadSfc('components/windows/InstrumentConfigurationForm.vue'),pinia)
 try{for(const label of ['Capture duration (ns)','Capture maximum events','Clock period (ns)']){dispatch(view.find('input','aria-label',label),'onChange','9007199254740993');await nextTick();assert.throws(()=>store.preRunConfiguration(station.executionTarget!.capabilities!),/invalid requested/i)}
 view.app.unmount();view=mountSfc(await loadSfc('components/windows/InstrumentConfigurationForm.vue'),pinia)
 for(const [label,canonical] of [['Capture duration (ns)','1000000'],['Capture maximum events',''],['Clock period (ns)','1000']] as const){assert.equal(view.find('input','aria-label',label).props.value,'9007199254740993');dispatch(view.find('input','aria-label',label),'onChange',canonical)}
 assert.deepEqual(store.requestedInputErrors,{});assert.equal(store.preRunConfiguration(station.executionTarget!.capabilities!).capture_config.duration_ns,1000000)
 }finally{view.app.unmount()}
})
