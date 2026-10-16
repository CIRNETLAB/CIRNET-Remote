import type { ApiOperations } from '../../contracts/generated/operations'
import { apiClient, type ApiClient } from './client'
import { callOperation } from './operations'

export function createHistoryApi(client:ApiClient) {
  return {
    history(query?:ApiOperations['listExperimentHistory']['query'],signal?:AbortSignal) {
      return callOperation(client,'listExperimentHistory',{query,signal})
    },
    active(signal?:AbortSignal,cursor?:string) {
      return callOperation(client,'listActiveExperiments',{query:cursor?{cursor}:undefined,signal})
    },
    queue(stationId:string,signal?:AbortSignal) {
      return callOperation(client,'getStationQueue',{path:{station_id:stationId},signal})
    },
  }
}
export const historyApi=createHistoryApi(apiClient)
