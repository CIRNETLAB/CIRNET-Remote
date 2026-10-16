import {markRaw} from 'vue'
import type {DecodedAnalogCapture} from '../domain/capture/ncap'
import { StoreScopeMap } from '../services/session/storeScope'
import { defineStore } from 'pinia'
import type { CaptureMetadata, CaptureResult, GeneratorConfiguration } from '../types/lab'
import { parseLab } from '../types/labValidation'
import { errorMessage } from '../services/api/client'
import { loadDigitalCapture } from '../services/captures/digital'
import type { InstrumentControlPort } from '../application/ports/lab'
import type {ClockConfiguration,TriggerConfiguration,TestVector,PublicStationCapabilities} from '../contracts/generated/dto'
import {InstrumentCommandController,initialInstrumentCommandState} from '../application/instruments/commands'
import {buildPreRunConfiguration,type RequestedRunConfiguration} from '../application/instruments/configuration'

const requests = new StoreScopeMap<{ controller: AbortController; promise: Promise<void> }>()
const controls = new StoreScopeMap<InstrumentControlPort>()
const commandControllers=new StoreScopeMap<InstrumentCommandController>()
function captureKey(metadata: CaptureMetadata | null) {
  return metadata === null ? null : JSON.stringify([metadata.capture_id, metadata.source, metadata.available, metadata.instrument, metadata.encoding,
    metadata.duration_ns, metadata.sample_count, metadata.channel_count, metadata.signals, metadata.payload_ref, metadata.payload_byte_count, metadata.sha256])
}

function requestedDefaults(){return {
 requestedInputErrors:{} as Record<string,{text:string;error:string}>,captureDurationNs:1000000,captureSignals:[] as string[],captureMaxEvents:null as number|null,
 clockDraft:{enabled:false,signal:'',period_ns:1000,cycles:1} as ClockConfiguration&{enabled:boolean},
 triggerDraft:{enabled:false,signal:'',edge:'RISING'} as TriggerConfiguration&{enabled:boolean},
 testVectors:[] as TestVector[],generatorPlanChannels:[] as (1|2)[],generatorEnabled:{1:false,2:false},
 generator:{waveform:'Sine',frequency:1000,amplitude:1,offset:0,phase:0,dutyCycle:50,
  channel2:{waveform:'Square',frequency:1000,amplitude:1,offset:0,phase:0,dutyCycle:50}},
}}

export interface ConsoleEntry { id: number; time: string; level: 'info' | 'error'; message: string }
export const useInstrumentStore = defineStore('instrument', {
  state: () => ({
    entries: [] as ConsoleEntry[], nextEntryId: 1,
    capture: null as CaptureResult|null,analogCapture:null as DecodedAnalogCapture|null,
    captureMetadata: null as CaptureMetadata|null,
    captureLoading: false, captureError: null as string|null, captureGeneration: 0,
    principalId:null as string|null,...requestedDefaults(),configurationError:null as string|null,generatorControl:initialInstrumentCommandState(),
    oscilloscope:{timeDiv:'1 ms',channelScale:'1 V',trigger:'Auto'},
    monitor: { channels: [] as string[], timeScale: '1 ms' },
  }),
  actions: {
    setPrincipal(id:string|null){
      if(this.principalId===id)return
      this.analogCapture=null;this.cancelGeneratorCommands();this.principalId=id;this.cancelCaptureLoad();this.useCapture(null);this.clearConsole()
      Object.assign(this,requestedDefaults());this.configurationError=null
    },
    requestedConfiguration():RequestedRunConfiguration {
      const {enabled:clockEnabled,...clock}=this.clockDraft,{enabled:triggerEnabled,...trigger}=this.triggerDraft
      return {capture:{signals:this.captureSignals,duration_ns:this.captureDurationNs,
        ...(this.captureMaxEvents===null?{}:{max_events:this.captureMaxEvents}),...(triggerEnabled?{trigger}:{})},
        clock:clockEnabled?clock:null,generators:this.generatorPlanChannels.map(channel=>this.generatorConfiguration(channel,this.generatorEnabled[channel])),testVectors:this.testVectors}
    },
    setRequestedInputError(key:string,text:string,error:string){this.requestedInputErrors[key]={text,error}},
    clearRequestedInputError(key:string){delete this.requestedInputErrors[key]},
    preRunConfiguration(caps:PublicStationCapabilities){const invalid=Object.values(this.requestedInputErrors)[0];if(invalid)throw new Error('Correct invalid requested settings: '+invalid.error);return buildPreRunConfiguration(this.requestedConfiguration(),caps)},
    attachControl(port:InstrumentControlPort) {
      const owner=this
      if(controls.get(owner)!==port)this.cancelGeneratorCommands()
      controls.set(owner,port)
      return ()=>{if(controls.get(owner)===port){this.cancelGeneratorCommands();controls.delete(owner)}}
    },
    useAnalogCapture(value:DecodedAnalogCapture|null){this.analogCapture=value===null?null:markRaw(value)},
    useCapture(value:CaptureMetadata|null) {
      const metadata=value===null?null:parseLab('CaptureMetadata',value)
      if(captureKey(metadata)===captureKey(this.captureMetadata)) return
      this.cancelCaptureLoad()
      this.captureMetadata=metadata; this.capture=null;this.analogCapture=null; this.captureError=null; this.monitor.channels=[]
    },
    cancelCaptureLoad() {
      ++this.captureGeneration; requests.get(this)?.controller.abort(); requests.delete(this); this.captureLoading=false
    },
    async ensureCaptureLoaded():Promise<void> {
      const metadata=this.captureMetadata
      if(!metadata?.available||metadata.instrument!=='logic_analyzer'||metadata.encoding!=='digital_events'||this.capture) return
      const current=requests.get(this)
      if(current) return current.promise
      const controller=new AbortController(), generation=this.captureGeneration
      this.captureLoading=true; this.captureError=null
      const promise=(async()=>{
        try {
          const capture=await loadDigitalCapture(metadata,controller.signal)
          if(controller.signal.aborted||generation!==this.captureGeneration) return
          this.capture=capture; this.monitor.channels=[...new Set(capture.samples.map(sample=>sample.signal))]
        } catch(error) {
          if(!controller.signal.aborted&&generation===this.captureGeneration) this.captureError=errorMessage(error)
        } finally {
          if(generation===this.captureGeneration) {this.captureLoading=false;requests.delete(this)}
        }
      })()
      requests.set(this,{controller,promise})
      return promise
    },
    generatorConfiguration(channel:1|2,enabled=false):GeneratorConfiguration {
      const preview=channel===1?this.generator:this.generator.channel2
      const waveforms:Record<string,GeneratorConfiguration['waveform']>={Sine:'SINE',Square:'SQUARE',Triangle:'TRIANGLE',Ramp:'RAMP',Pulse:'PULSE',Arbitrary:'ARBITRARY'}
      const waveform=Object.hasOwn(waveforms,preview.waveform)?waveforms[preview.waveform]:undefined
      if(!waveform) throw new Error('Unsupported generator waveform.')
      const configuration:GeneratorConfiguration={channel,waveform,frequency_hz:preview.frequency,
        amplitude_vpp:preview.amplitude,offset_v:preview.offset,phase_degrees:preview.phase,enabled}
      return parseLab('GeneratorConfiguration',configuration)
    },
    commands():InstrumentCommandController {
      const existing=commandControllers.get(this);if(existing)return existing
      const control=controls.get(this)
      if(!control)throw new Error('Live instrument control is not connected to an application session.')
      const controller=new InstrumentCommandController({...control,key:()=>crypto.randomUUID(),changed:state=>{this.generatorControl=state}})
      commandControllers.set(this,controller);return controller
    },
    async refreshGeneratorAccess(id:string){
      try{return await this.commands().refreshAccess(id)}
      catch(error){this.generatorControl.accessError=errorMessage(error);return null}
    },
    async configureGenerator(experimentId:string,channel:1|2,enabled=false){
      const invalid=Object.entries(this.requestedInputErrors).find(([key])=>key.startsWith('generator.'))?.[1];if(invalid)throw new Error('Correct invalid generator settings: '+invalid.error)
      return this.commands().configure(experimentId,this.generatorConfiguration(channel,enabled))
    },
    async reconcileGenerator(channel:1|2){return commandControllers.get(this)?.reconcile(channel)??null},
    cancelGeneratorCommands(){commandControllers.get(this)?.cancel();commandControllers.delete(this);this.generatorControl=initialInstrumentCommandState()},
    log(message: string, level: ConsoleEntry['level'] = 'info') {
      this.entries.push({ id: this.nextEntryId++, time: new Date().toLocaleTimeString(), level, message })
      if (this.entries.length > 100) this.entries.shift()
    },
    clearConsole() { this.entries = [] },
  },
})
