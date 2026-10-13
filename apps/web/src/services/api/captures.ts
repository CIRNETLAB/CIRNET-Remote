import { apiClient, type ApiClient } from './client'

export function createCapturesApi(client: ApiClient) {
  return {
    payload(captureId: string, signal?: AbortSignal): Promise<ArrayBuffer> {
      return client.request('/captures/' + encodeURIComponent(captureId) + '/payload', {
        signal, responseType: 'arrayBuffer', accept: 'application/vnd.netcircuit.capture; version=1',
      })
    },
  }
}

export const capturesApi = createCapturesApi(apiClient)
