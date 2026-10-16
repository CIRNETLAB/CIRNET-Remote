import type { GeneratorConfiguration } from '../../contracts/generated/dto'
import { apiClient,type ApiClient } from './client'
import { callOperation } from './operations'

export function createInstrumentsApi(client:ApiClient) {
  return {
    access(experimentId:string,signal?:AbortSignal) {
      return callOperation(client,'getExperimentInstrumentAccess',{path:{experiment_id:experimentId},signal,controlContext:true})
    },
    configureGenerator(experimentId:string,configuration:GeneratorConfiguration,key:string,signal?:AbortSignal) {
      return callOperation(client,'configureExperimentGenerator',{path:{experiment_id:experimentId},body:{configuration},headers:{'Idempotency-Key':key},signal})
    },
    command(experimentId:string,key:string,signal?:AbortSignal) {
      return callOperation(client,'getExperimentInstrumentCommand',{path:{experiment_id:experimentId,operation_key:key},signal})
    },
  }
}
export const instrumentsApi=createInstrumentsApi(apiClient)
