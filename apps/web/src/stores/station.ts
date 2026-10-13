import { defineStore } from 'pinia'
import { stationsApi } from '../services/api/stations'
import { errorMessage } from '../services/api/client'
import { stationStatus, canStationExecute, type Station, type StationDescriptor, type HardwareMode, type LabStatus } from '../types/station'
export type { HardwareMode, HardwareState } from '../types/station'

export const useStationStore = defineStore('station', {
  state: () => ({
    mode: 'simulation' as HardwareMode,
    stationId: null as string | null,
    stations: [] as Station[],
    loading: false,
    loaded: false,
    error: null as string | null,
    eventsConnected: false,
    refreshVersion: 0,
    eventVersion: 0,
    stationEventVersions: new Map<string, number>(),
  }),
  getters: {
    executionTarget(state): Station | null {
      if(state.stationId) return state.stations.find(s=>s.station_id===state.stationId&&s.mode===state.mode)??null
      return state.stations.find(s=>s.mode===state.mode&&s.capabilities?.available)??null
    },
    canExecute():boolean {
      return this.eventsConnected&&!this.error&&canStationExecute(this.executionTarget)
    },
    selected: (state): Station | null => state.stations.find((station) => station.station_id === state.stationId) ?? null,
    status(): LabStatus {
      if (this.mode === 'simulation' && !this.stationId) return 'SIMULATION'
      if (!this.selected || this.selected.mode !== this.mode || this.error || !this.eventsConnected) return 'HARDWARE_OFFLINE'
      return this.selected.status
    },
    state(): string { return this.selected?.state ?? (this.mode === 'simulation' ? 'ready' : 'unavailable') },
  },
  actions: {
    setStations(stations: StationDescriptor[]) {
      this.stations = stations.map((station) => ({ ...station, status: stationStatus(station) }))
      const ids = new Set(stations.map((station) => station.station_id))
      for (const id of this.stationEventVersions.keys()) if (!ids.has(id)) this.stationEventVersions.delete(id)
      this.loaded = true
      this.error = null
    },
    updateStation(station: StationDescriptor) {
      const previous=this.stations.find(s=>s.station_id===station.station_id&&s.mode===station.mode)
      station={...station,...(station.capabilities===undefined&&previous?.capabilities?{capabilities:previous.capabilities}:{})}
      this.stationEventVersions.set(station.station_id, ++this.eventVersion)
      const stations = this.stations.filter((item) => item.station_id !== station.station_id)
      this.setStations([...stations, station])
    },
    selectStation(id: string) {
      const selected = this.stations.find((station) => station.station_id === id)
      if (!selected) return
      this.stationId = selected.station_id
      this.mode = selected.mode
    },
    useSimulation() { this.mode = 'simulation'; this.stationId = null },
    setEventsConnected(connected: boolean) { this.eventsConnected = connected },
    async refresh(signal?: AbortSignal) {
      const version = ++this.refreshVersion
      const eventVersion = this.eventVersion
      this.loading = true
      try {
        const stations = await stationsApi.list(signal)
        if (version === this.refreshVersion && !signal?.aborted) {
          // Events observed after discovery began supersede that older HTTP snapshot.
          const latest = new Map(stations.map((station) => [station.station_id, station]))
          for (const station of this.stations) {
            if ((this.stationEventVersions.get(station.station_id) ?? 0) > eventVersion) latest.set(station.station_id, station)
          }
          this.setStations([...latest.values()])
        }
      } catch (error) {
        if (version === this.refreshVersion && !signal?.aborted) this.error = errorMessage(error)
      } finally { if (version === this.refreshVersion) this.loading = false }
    },
  },
})
