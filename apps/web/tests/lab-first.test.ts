import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { createApiClient, configureApiClient } from '../src/services/api/client'
import { createExperimentsApi, parseExperiment } from '../src/services/api/experiments'
import { createStationsApi } from '../src/services/api/stations'
import { parseServerEvent } from '../src/services/websocket/events'
import { useExperimentStore } from '../src/stores/experiment'
import type { StationDescriptor } from '../src/types/station'
import { useStationStore } from '../src/stores/station'
import { useCircuitStore } from '../src/stores/circuit'
import { useInstrumentStore } from '../src/stores/instrument'
import { nextTick } from 'vue'
import { loadSfc,mountSfc } from './helpers/vueSfc'

function target():StationDescriptor {
  return {station_id:'v1',mode:'simulation',state:'ready',capabilities:{schema_version:'1.0',station_id:'v1',mode:'simulation',
    available:true,virtual_digital:true,virtual_analog:false,physical_digital:false,physical_analog_routing:false,physical_execution_slots:0,
    topology_scan_supported:false,safety_gate_supported:false,guarded_run_supported:false,component_resolution_modes:[],
    logic_analyzer_channels:4,oscilloscope_channels:0,generator_channels:0,routing_resources:[],hardware_rpc_version:'2.0',
    fpga_protocol_version:'UNAVAILABLE',firmware_version:'virtual-events-1.0',hardware_profile_version:'virtual-1.0'}}
}

beforeEach(() => setActivePinia(createPinia()))

function record(state='COMPLETE', revision=10) {
  return { schema_version:'1.0', experiment_id:'e1', circuit_id:'c1', station_id:'v1', assignment_id:null,
    mode:'simulation',state,state_history:['CREATED',state],revision,queue_position:null,lease_expires_at:null,
    error_code:null, execution_decision:{schema_version:'1.0',decision:'RUN_NORMAL',reasons:[]},
    safety_verification:{schema_version:'1.0',status:'SAFE',issues:[]},
    topology_verification:{schema_version:'1.0',status:'MISMATCH',issues:['wrong safe IC']},
    functional_verification:{schema_version:'1.0',status:'FAIL',issues:['wrong output']},
    capture:{schema_version:'1.0',capture_id:'capture-1',source:'simulation',instrument:'logic_analyzer',encoding:'digital_events',
      available:true,duration_ns:20,sample_count:2,samples:[{signal:'L.IN',time_ns:0,value:'X'},{signal:'L.IN',time_ns:8,value:1}]},
  }
}

test('API accepts independent safety/topology/function and measured digital capture',async()=>{
  const client=createApiClient({fetcher:async()=>new Response(JSON.stringify(record()))})
  const value=await createExperimentsApi(client).get('e1') as unknown as ReturnType<typeof record>
  assert.equal(value.safety_verification.status,'SAFE')
  assert.equal(value.topology_verification.status,'MISMATCH')
  assert.equal(value.functional_verification.status,'FAIL')
  assert.equal(value.capture.samples[0].value,'X')
})

test('API rejects invalid nested enum, version and capture count',async()=>{
  for(const value of [ {...record(),schema_version:'future'},
    {...record(),safety_verification:{schema_version:'1.0',status:['SAFE'],issues:[]}},
    {...record(),capture:{...record().capture,sample_count:100}},
    {...record(),capture:{...record().capture,samples:[{signal:'L.IN',time_ns:0,value:2}]}}]) {
    const api=createExperimentsApi(createApiClient({fetcher:async()=>new Response(JSON.stringify(value))}))
    await assert.rejects(api.get('e1'),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='INVALID_RESPONSE')
  }
})

test('lifecycle websocket event validates the same response contract',()=>{
  const event=parseServerEvent({type:'experiment.updated',experiment:record()})
  assert.equal(event?.type,'experiment.updated')
  assert.equal(parseServerEvent({type:'experiment.updated',experiment:{...record(),revision:'10'}}),null)
})

test('station capability is validated instead of trusting a ready descriptor',async()=>{
  const api=createStationsApi(createApiClient({fetcher:async()=>new Response(JSON.stringify([
    {station_id:'v1',mode:'simulation',state:'ready',capabilities:{available:'yes'}}]))}))
  await assert.rejects(api.list(),(e:unknown)=>e instanceof Error && 'code' in e && e.code==='INVALID_RESPONSE')
})

test('experiment store rejects stale HTTP records after a newer lifecycle event',()=>{
  const store=useExperimentStore() as unknown as {receive(value:unknown):void;activeId:string|null;active:ReturnType<typeof record>|null}
  assert.equal(typeof store.receive,'function','lifecycle reducer missing')
  store.activeId='e1'; store.receive(record('COMPLETE',20)); store.receive(record('RUNNING',10))
  assert.equal(store.active?.state,'COMPLETE')
  assert.equal(store.active?.revision,20)
})

test('create/run/stop use lifecycle endpoints with immutable design input',async()=>{
  const calls:{url:string;method:string;body:unknown}[]=[]
  const api=createExperimentsApi(createApiClient({fetcher:async(url,options)=>{
    calls.push({url:String(url),method:options?.method ?? '',body:options?.body?JSON.parse(String(options.body)):null})
    return new Response(JSON.stringify(record('QUEUED',2)))
  }})) as unknown as {create(body:unknown):Promise<unknown>;run(id:string):Promise<unknown>;stop(id:string):Promise<unknown>}
  assert.equal(typeof api.create,'function','creation lifecycle missing')
  const graph={schema_version:'1.0',circuit_id:'c1',modules:[],connections:[]}; const before=JSON.stringify(graph)
  await api.create({station_id:'v1',circuit_graph:graph}); await api.run('e/1'); await api.stop('e/1')
  assert.deepEqual(calls.map(c=>[c.url,c.method]),[['/api/experiments','POST'],['/api/experiments/e%2F1/run','POST'],['/api/experiments/e%2F1/stop','POST']])
  assert.equal(JSON.stringify(graph),before)
})

test('run actions refuse unavailable execution capability before any request',async()=>{
  let requests=0
  configureApiClient({fetcher:async()=>{requests++;return new Response(JSON.stringify(record('CREATED',0)))}})
  const unavailable=target(); unavailable.capabilities!.virtual_digital=false
  const store=useExperimentStore()
  assert.equal(await store.run({schema_version:'1.0',circuit_id:'c1',modules:[],connections:[]},unavailable),false)
  assert.equal(requests,0)
})

test('generator maps CH2 configuration and rejects unknown preview waveforms',async()=>{
  const bodies:unknown[]=[]
  configureApiClient({fetcher:async(_url,options)=>{
    bodies.push(JSON.parse(String(options?.body)))
    return new Response(JSON.stringify({accepted:true,code:'OK'}))
  }})
  const instrument=useInstrumentStore()
  await instrument.configureGenerator('e1',2,true)
  assert.deepEqual(bodies,[{instrument:'generator',configuration:{channel:2,waveform:'SQUARE',frequency_hz:1000,amplitude_vpp:1,offset_v:0,enabled:true}}])
  instrument.generator.channel2.waveform='unsupported'
  await assert.rejects(instrument.configureGenerator('e1',2,true),/Unsupported generator waveform/)
  assert.equal(bodies.length,1)
})

test('cancelled create cannot attach a late experiment or dispatch Run',async()=>{
  let resolve!: (value:Response)=>void
  const requests:string[]=[]
  configureApiClient({fetcher:async(url)=>{requests.push(String(url));return new Promise<Response>(done=>{resolve=done})}})
  const store=useExperimentStore()
  const pending=store.run({schema_version:'1.0',circuit_id:'c1',modules:[],connections:[]},target())
  await store.stop()
  resolve(new Response(JSON.stringify(record('CREATED',0))))
  await pending
  assert.equal(store.activeId,null); assert.equal(store.pending,false)
  assert.deepEqual(requests,['/api/experiments'])
})

test('physical Run sends assignment identity without logical validation or circuit rewrite',async()=>{
  const bodies:unknown[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    if(options?.body) bodies.push(JSON.parse(String(options.body)))
    const state=String(url).endsWith('/run')?'QUEUED':'CREATED'
    return new Response(JSON.stringify({...record(state,state==='CREATED'?0:2),mode:'hardware'}))
  }})
  const hardware=target();hardware.mode='hardware';hardware.capabilities={...hardware.capabilities!,mode:'hardware',physical_digital:true,
    physical_execution_slots:1,topology_scan_supported:true,safety_gate_supported:true,guarded_run_supported:true}
  const store=useExperimentStore();store.assignmentId='a1'
  assert.equal(await store.run(null,hardware),true)
  assert.deepEqual(bodies,[{station_id:'v1',assignment_id:'a1'}])
  assert.equal(store.state,'QUEUED')
})

test('statusbar Run invokes backend lifecycle and preserves editor history',async()=>{
  const pinia=createPinia();setActivePinia(pinia)
  const circuit=useCircuitStore();circuit.createDraft('Run test')
  const station=useStationStore();station.setStations([target()]);station.setEventsConnected(true)
  // Register this store before the standalone SFC bundle loads its own API module.
  const experiment=useExperimentStore()
  // A new draft must not inherit the previous draft's observed capture ports.
  useInstrumentStore().useCapture(parseExperiment(record()).capture)
  const calls:string[]=[]
  const bodies:unknown[]=[]
  configureApiClient({fetcher:async(url,options)=>{calls.push(String(url));if(options?.body) bodies.push(JSON.parse(String(options.body)));return new Response(JSON.stringify(record(String(url).endsWith('/run')?'QUEUED':'CREATED',String(url).endsWith('/run')?2:0)))}})
  const component=await loadSfc('components/workbench/SimulationStatusBar.vue')
  const mounted=mountSfc(component,pinia)
  const button=mounted.find('button','aria-label','Run')
  assert.ok(button,'Run lifecycle button missing')
  assert.equal(Boolean(button.props.disabled),false)
  const before=JSON.stringify(circuit.graph)
  await (button.props.onClick as ()=>Promise<unknown>)(); await nextTick()
  assert.equal(experiment.error,null)
  assert.deepEqual(calls,['/api/experiments','/api/experiments/e1/run'])
  assert.deepEqual((bodies[0] as {capture_config:{signals:string[]}}).capture_config.signals,[])
  assert.equal(JSON.stringify(circuit.graph),before)
  assert.ok(mounted.text().includes('QUEUED'))
  mounted.app.unmount()
})

test('independent safety topology function states and real trace render in existing windows',async()=>{
  const pinia=createPinia();setActivePinia(pinia)
  const experiment=useExperimentStore();experiment.activeId='e1';experiment.receive(record())
  const status=mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'),pinia)
  const monitor=mountSfc(await loadSfc('components/windows/SignalMonitorWindow.vue'),pinia)
  for(const text of ['SAFETY','SAFE','TOPOLOGY','MISMATCH','FUNCTION','FAIL']) assert.ok(status.text().includes(text),text)
  assert.ok(monitor.all().some(node=>node.tag==='path'&&node.props['data-signal']==='L.IN'),'observed trace is missing')
  assert.ok(monitor.text().includes('simulation'))
  assert.equal(useInstrumentStore().capture?.samples[0].value,'X')
  status.app.unmount();monitor.app.unmount()
})
