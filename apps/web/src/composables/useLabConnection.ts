import { onMounted, onUnmounted } from 'vue'
import { createEventClient, eventSocketUrl } from '../services/websocket/client'
import { useStationStore } from '../stores/station'
import { useUiStore } from '../stores/ui'
import { useInstrumentStore } from '../stores/instrument'
import { useExperimentStore } from '../stores/experiment'

export function useLabConnection() {
  const station = useStationStore()
  const ui = useUiStore()
  const instrument = useInstrumentStore()
  const experiment=useExperimentStore()
  let poll:ReturnType<typeof setInterval>|null=null
  const controller = new AbortController()
  let disposed = false
  const client = createEventClient({
    url: import.meta.env.VITE_WS_URL || eventSocketUrl(window.location),
    onState(state) {
      if (disposed) return
      if (ui.connectionState !== state) {
        if (state === 'connected') instrument.log('Event connection established.')
        if (state === 'reconnecting') instrument.log('Event connection lost. Retrying automatically.', 'error')
      }
      ui.connectionState = state
      station.setEventsConnected(state === 'connected')
      if (state === 'connected') void station.refresh(controller.signal)
    },
    onEvent(event) {
      if (disposed) return
      if (event.type === 'hello') instrument.log(`Connected to ${event.service}.`)
      if (event.type === 'station.updated') station.updateStation(event.station)
      if(event.type==='experiment.updated') experiment.receive(event.experiment)
    },
  })
  onMounted(async() => {
    // Establish the server-issued session cookie before subscribing to its events.
    await station.refresh(controller.signal)
    if(disposed) return
    client.connect();void experiment.loadAssignments(controller.signal)
    poll=setInterval(()=>{if(!disposed){void experiment.refreshActive(controller.signal);void station.refresh(controller.signal)}},3000)
  })
  onUnmounted(() => {
    disposed = true
    controller.abort()
    if(poll) clearInterval(poll)
    experiment.cancelPending()
    client.disconnect()
    station.setEventsConnected(false)
  })
}
