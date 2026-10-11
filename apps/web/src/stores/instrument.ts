import { defineStore } from 'pinia'

export interface ConsoleEntry { id: number; time: string; level: 'info' | 'error'; message: string }
export const useInstrumentStore = defineStore('instrument', {
  state: () => ({
    entries: [] as ConsoleEntry[], nextEntryId: 1,
    oscilloscope: { timeDiv: '1 ms', channelScale: '1 V', trigger: 'Auto' },
    // Existing flat fields remain CH1 configuration for compatibility. CH2 is
    // independent local configuration; neither channel implies DDS output.
    generator: { waveform: 'Sine', frequency: 1000, amplitude: 1, offset: 0, dutyCycle: 50,
      channel2: { waveform: 'Square', frequency: 1000, amplitude: 1, offset: 0, dutyCycle: 50 },
    },
    monitor: { channels: [] as string[], timeScale: '1 ms' },
  }),
  actions: {
    log(message: string, level: ConsoleEntry['level'] = 'info') {
      this.entries.push({ id: this.nextEntryId++, time: new Date().toLocaleTimeString(), level, message })
      if (this.entries.length > 100) this.entries.shift()
    },
    clearConsole() { this.entries = [] },
  },
})
