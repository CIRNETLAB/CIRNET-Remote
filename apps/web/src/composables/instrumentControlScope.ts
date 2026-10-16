import {watch} from 'vue'
import type {useInstrumentStore} from '../stores/instrument'
import type {useExperimentStore} from '../stores/experiment'
import type {useStationStore} from '../stores/station'
/** Session-local output authority ends immediately when the controlled context changes. */
export function watchInstrumentControlScope(instrument:ReturnType<typeof useInstrumentStore>,experiment:ReturnType<typeof useExperimentStore>,station:ReturnType<typeof useStationStore>){
 return watch([()=>experiment.currentExecution?.experiment_id,()=>experiment.currentExecution?.state,()=>experiment.controlledExperimentId,()=>station.executionTarget?.station_id],()=>instrument.cancelGeneratorCommands(),{flush:'sync'})
}
