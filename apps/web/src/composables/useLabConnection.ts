import { onMounted, onUnmounted,watch } from 'vue'
import { createEventClient, eventSocketUrl } from '../services/websocket/client'
import { useStationStore } from '../stores/station'
import { useUiStore } from '../stores/ui'
import { useInstrumentStore } from '../stores/instrument'
import { useExperimentStore } from '../stores/experiment'
import {instrumentsApi} from '../services/api/instruments'
import { experimentsApi } from '../services/api/experiments'
import { errorMessage } from '../services/api/client'
import { createRemotePolling } from '../application/remotePolling'
import { useAuthStore } from '../stores/auth'
import { createRemoteSessionScope } from '../application/remoteConnection'
import {watchInstrumentControlScope} from './instrumentControlScope'
import { createLabApplication } from '../application/labApplication'
import { useWorkspaceMessageStore } from '../stores/workspaceMessages'
import {prepareContractProfile} from '../contracts/structural'

export function useLabConnection() {
  const station = useStationStore()
  const ui = useUiStore()
  const instrument = useInstrumentStore()
  const experiment=useExperimentStore()
  const auth=useAuthStore()
  const messages=useWorkspaceMessageStore()
  const application=createLabApplication({experiment,instrument:{useCapture:metadata=>instrument.useCapture(metadata),attachControl:port=>instrument.attachControl(port),log:(message,level)=>instrument.log(message,level,{source:'execution',scope:'session'})},station,
    configureGenerator:instrumentsApi.configureGenerator,getInstrumentAccess:instrumentsApi.access,getInstrumentCommand:instrumentsApi.command})
  const stopInstrumentScope=watchInstrumentControlScope(instrument,experiment,station)
  let mounted=false,appliedScope:string|null=null
  const scope=createRemoteSessionScope({reset() {
    messages.clearSource('remote-snapshot')
    experiment.cancelPending();experiment.setObservationPrincipal(null);experiment.$reset()
    instrument.cancelGeneratorCommands();instrument.cancelCaptureLoad();instrument.useAnalogCapture(null);instrument.useCapture(null);instrument.clearConsole()
    station.$reset();ui.connectionState='closed'
  },connect(signal) {
    experiment.setObservationPrincipal(auth.principal?.principal_id??null)
    experiment.requireReconciliation()
    let protocolReady=false,reconciliation=0
    function reconcile(){
      if(signal.aborted)return
      reconciliation++;station.setEventsConnected(false);experiment.requireReconciliation()
      if(protocolReady)ui.connectionState='reconciling'
      snapshots.request()
    }
    const snapshots=createRemotePolling({signal,automatic:true,async refresh(signal) {
      const version=reconciliation
      const [,history,active]=await Promise.all([station.refresh(signal),experiment.refreshHistory(false,signal),experiment.refreshOwned(signal)])
      if(signal.aborted)return
      const ids=new Set([station.executionTarget?.station_id,experiment.currentExecution?.station_id].filter((id):id is string=>!!id))
      const queues=await Promise.all([...ids].map(id=>experiment.refreshQueue(id,signal)))
      if(!signal.aborted&&(station.error||!history||!active||queues.some(value=>!value)))throw new Error(station.error??experiment.historyError??'Remote snapshots are temporarily unavailable.')
      // refreshOwned already reconciles lifecycle keys after its fresh snapshot.
      if(!signal.aborted)await instrument.recoverGeneratorObservations()
      if(!signal.aborted){
        messages.clearSource('remote-snapshot')
        if(protocolReady&&version===reconciliation){station.setEventsConnected(true);ui.connectionState='connected'}
      }
    },onError(error) { if(signal.aborted)return;station.setEventsConnected(false);experiment.requireReconciliation();if(protocolReady)ui.connectionState='reconciling';const text=`Cannot refresh remote snapshots: ${errorMessage(error)}`;instrument.log(text,'error',{source:'remote-snapshot',scope:'session'});messages.setHint('remote-snapshot',text,{level:'error',scope:'session',window:'inspector'}) }})
    const client = createEventClient({
    url: import.meta.env.VITE_WS_URL || eventSocketUrl(window.location),
    onState(state) {
      if (signal.aborted) return
      if(state==='ready'){protocolReady=true;ui.connectionState='reconciling';return}
      protocolReady=false;reconciliation++;experiment.requireReconciliation()
      if (ui.connectionState !== state) {
        if (state === 'connected') instrument.log('Event connection established.','info',{source:'connection',scope:'session'})
        if (state === 'reconnecting') instrument.log('Event connection lost. Retrying automatically.', 'error',{source:'connection',scope:'session'})
      }
      ui.connectionState = state==='connected'?'negotiating':state
      station.setEventsConnected(false)
    },
    onResync() { reconcile() },
    onProtocolError(issue) { if(!signal.aborted) instrument.log(issue.message,'error') },
    onAuthenticationLost(code) { if(!signal.aborted) auth.authenticationLost(code===4403?'The event connection origin was denied. Check the application configuration.':undefined) },
    onEvent(event) {
      if (signal.aborted) return
      if (event.type === 'hello') instrument.log(`Connected to ${event.service}.`,'info',{source:'connection',scope:'session'})
      if (event.type === 'station.updated') station.updateStation(event.station)
      if(event.type==='experiment.updated') experiment.receive(event.experiment)
    },
    })
    // Session bootstrap precedes this scope. All refresh triggers share one poller.
    void prepareContractProfile('transport').then(()=>{if(!signal.aborted)client.connect()}).catch(error=>{
      if(signal.aborted)return
      instrument.log(`Cannot prepare realtime validation: ${errorMessage(error)}`,'error',{source:'connection',scope:'session'})
      ui.connectionState='closed'
    })
    snapshots.request();void experiment.loadAssignments(signal)
    return()=>{snapshots.dispose();client.disconnect()}
  }})
  function synchronize() {
    const key=`${auth.connectionEpoch}:${auth.pending}:${auth.loading}`
    if(!mounted||appliedScope===key) return
    appliedScope=key;scope.replace(auth.principal!==null&&!auth.pending&&!auth.loading)
  }
  const stop=watch(()=>[auth.connectionEpoch,auth.pending,auth.loading],synchronize,{flush:'sync'})
  onMounted(async()=>{mounted=true;await auth.bootstrap();synchronize()})
  onUnmounted(() => {
    mounted=false;stop();stopInstrumentScope();scope.dispose();application.dispose()
  })
}
