import { isRecord } from '../../types/api'
import type { Experiment, ExperimentInput } from '../../types/experiment'
import type { CaptureConfiguration, GeneratorConfiguration } from '../../types/lab'
import { parseLab } from '../../types/labValidation'
import { apiClient, ApiError, type ApiClient } from './client'

export function parseExperiment(value:unknown):Experiment { return parseLab<Experiment>('ExperimentRecord',value) }
export function createExperimentsApi(client:ApiClient) {
  const path=(id:string)=>'/experiments/'+encodeURIComponent(id)
  return {
    list(signal?:AbortSignal):Promise<Experiment[]> {
      return client.request('/experiments',{signal,parse(value) {
        if(!Array.isArray(value)) throw new ApiError(0,'INVALID_RESPONSE','The API returned an invalid experiment list.')
        return value.map(parseExperiment)
      }})
    },
    create(body:ExperimentInput,signal?:AbortSignal):Promise<Experiment> {
      return client.request('/experiments',{method:'POST',body,signal,parse:parseExperiment})
    },
    get(id:string,signal?:AbortSignal):Promise<Experiment> { return client.request(path(id),{signal,parse:parseExperiment}) },
    run(id:string,signal?:AbortSignal):Promise<Experiment> { return client.request(path(id)+'/run',{method:'POST',signal,parse:parseExperiment}) },
    stop(id:string,signal?:AbortSignal):Promise<Experiment> { return client.request(path(id)+'/stop',{method:'POST',signal,parse:parseExperiment}) },
    results(id:string,signal?:AbortSignal):Promise<Experiment> { return client.request(path(id)+'/results',{signal,parse:parseExperiment}) },
    configureGenerator(id:string,configuration:GeneratorConfiguration,signal?:AbortSignal):Promise<{accepted:boolean;code:string}> {
      return client.request(path(id)+'/instruments',{method:'POST',body:{instrument:'generator',configuration},signal,parse(value) {
        if(!isRecord(value)||typeof value.accepted!=='boolean'||typeof value.code!=='string') throw new ApiError(0,'INVALID_RESPONSE','Invalid instrument acknowledgement.')
        return value as {accepted:boolean;code:string}
      }})
    },
  }
}
export const experimentsApi=createExperimentsApi(apiClient)
