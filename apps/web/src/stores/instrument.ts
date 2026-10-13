import { defineStore } from 'pinia'
import type { CaptureResult, GeneratorConfiguration } from '../types/lab'
import { parseLab } from '../types/labValidation'
import { experimentsApi } from '../services/api/experiments'

export interface ConsoleEntry { id: number; time: string; level: 'info' | 'error'; message: string }
export const useInstrumentStore = defineStore('instrument', {
  state: () => ({
    entries: [] as ConsoleEntry[], nextEntryId: 1,
    capture: null as CaptureResult|null,
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
    useCapture(value:CaptureResult|null) {
      this.capture=value===null?null:parseLab<CaptureResult>('CaptureResult',value)
      if(this.capture?.available) this.monitor.channels=[...new Set(this.capture.samples.map(s=>s.signal))]
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
