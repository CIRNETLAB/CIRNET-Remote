import type { Pinia } from 'pinia'
import { createLabApplication } from '../../src/application/labApplication'
import {instrumentsApi} from '../../src/services/api/instruments'
import { useExperimentStore } from '../../src/stores/experiment'
import { useInstrumentStore } from '../../src/stores/instrument'
import { useStationStore } from '../../src/stores/station'

/** Standalone store fixtures use the same explicit composition as the app. */
export function bindLabApplication(pinia?:Pinia) {
  return createLabApplication({experiment:useExperimentStore(pinia),instrument:useInstrumentStore(pinia),station:useStationStore(pinia),
    configureGenerator:instrumentsApi.configureGenerator,getInstrumentAccess:instrumentsApi.access,getInstrumentCommand:instrumentsApi.command})
}
