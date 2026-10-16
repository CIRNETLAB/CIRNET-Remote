import { apiClient, type ApiClient } from './client'
import { callOperation } from './operations'

export function createCapturesApi(client: ApiClient) {
  return {
    payload(captureId: string, signal?: AbortSignal): Promise<ArrayBuffer> {
      return callOperation(client, 'getCapturePayload', {
        path: {capture_id:captureId}, signal,
        maxResponseBytes: 9 + 65536 + 100000 * 11,
      })
    },
    deletePayload(captureId:string,signal?:AbortSignal) {
      return callOperation(client,'deleteCapturePayload',{path:{capture_id:captureId},signal})
    },
  }
}

export const capturesApi = createCapturesApi(apiClient)
