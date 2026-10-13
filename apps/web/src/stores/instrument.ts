import { defineStore } from 'pinia'
import type { CaptureMetadata, CaptureResult, GeneratorConfiguration } from '../types/lab'
import { parseLab } from '../types/labValidation'
import { experimentsApi } from '../services/api/experiments'
import { errorMessage } from '../services/api/client'
import { loadDigitalCapture } from '../services/captures/digital'

const requests = new WeakMap<object, { controller: AbortController; promise: Promise<void> }>()
function captureKey(metadata: CaptureMetadata | null) {
  return metadata === null ? null : JSON.stringify([metadata.capture_id, metadata.source, metadata.available, metadata.instrument, metadata.encoding,
    metadata.duration_ns, metadata.sample_count, metadata.channel_count, metadata.signals, metadata.payload_ref, metadata.payload_byte_count, metadata.sha256])
}

export interface ConsoleEntry { id: number; time: string; level: 'info' | 'error'; message: string }
export const useInstrumentStore = defineStore('instrument', {
  state: () => ({
    entries: [] as ConsoleEntry[], nextEntryId: 1,
    capture: null as CaptureResult|null,
    captureMetadata: null as CaptureMetadata|null,
    captureLoading: false, captureError: null as string|null, captureGeneration: 0,
    captureDurationNs:1000000,
    // Requested ports are configuration; observed ports belong to the last capture.
    captureSignals:[] as string[],
    oscilloscope: { timeDiv: '1 ms', channelScale: '1 V', trigger: 'Auto' },
    // Existing flat fields remain CH1 configuration for compatibility. CH2 is
    // independent local configuration; neither channel implies DDS output.
    generator: { waveform: 'Sine', frequency: 1000, amplitude: 1, offset: 0, dutyCycle: 50,
      channel2: { waveform: 'Square', frequency: 1000, amplitude: 1, offset: 0, dutyCycle: 50 },
    },
    monitor: { channels: [] as string[], timeScale: '1 ms' },
  }),
  actions: {
    useCapture(value:CaptureMetadata|null) {
      const metadata=value===null?null:parseLab<CaptureMetadata>('CaptureMetadata',value)
      if(captureKey(metadata)===captureKey(this.captureMetadata)) return
      this.cancelCaptureLoad()
      this.captureMetadata=metadata; this.capture=null; this.captureError=null; this.monitor.channels=[]
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
    async configureGenerator(experimentId:string,channel:1|2,enabled=false) {
      const preview=channel===1?this.generator:this.generator.channel2
      const waveforms:Record<string,GeneratorConfiguration['waveform']>={Sine:'SINE',Square:'SQUARE',Triangle:'TRIANGLE',Ramp:'RAMP',Pulse:'PULSE',Arbitrary:'ARBITRARY'}
      const waveform=Object.hasOwn(waveforms,preview.waveform)?waveforms[preview.waveform]:undefined
      if(!waveform) throw new Error('Unsupported generator waveform.')
      const configuration:GeneratorConfiguration={channel,waveform,frequency_hz:preview.frequency,
        amplitude_vpp:preview.amplitude,offset_v:preview.offset,enabled}
      return experimentsApi.configureGenerator(experimentId,configuration)
    },
    log(message: string, level: ConsoleEntry['level'] = 'info') {
      this.entries.push({ id: this.nextEntryId++, time: new Date().toLocaleTimeString(), level, message })
      if (this.entries.length > 100) this.entries.shift()
    },
    clearConsole() { this.entries = [] },
  },
})
