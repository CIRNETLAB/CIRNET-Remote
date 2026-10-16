import { stationStatus, type Station } from '../../types/station'
import { apiClient, type ApiClient } from './client'
import { callOperation } from './operations'

export function createStationsApi(client: ApiClient) {
  return {
    async list(signal?: AbortSignal): Promise<Station[]> {
      return (await callOperation(client,'listStations',{signal})).map(station=>({...station,status:stationStatus(station)}))
    },
  }
}
export const stationsApi = createStationsApi(apiClient)
