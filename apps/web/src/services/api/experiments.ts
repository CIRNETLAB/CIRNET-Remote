import type { ApiOperations } from '../../contracts/generated/operations'
import type { Experiment, ExperimentInput } from '../../types/experiment'
import type { GeneratorConfiguration } from '../../types/lab'
import { parseLab } from '../../contracts/validation'
import { apiClient, type ApiClient } from './client'
import { callOperation } from './operations'

export function parseExperiment(value:unknown):Experiment { return parseLab('ExperimentRecord',value) }
export function createExperimentsApi(client:ApiClient) {
  const identity=(key?:string)=>key===undefined?undefined:{'Idempotency-Key':key}
  return {
    list(signal?:AbortSignal):Promise<Experiment[]> {
      return callOperation(client,'listExperiments',{signal})
    },
    create(body:ExperimentInput,signal?:AbortSignal,operationKey?:string):Promise<Experiment> {
      const graph=body.circuit_graph
      return graph?.schema_version==='1.2'||body.circuit_document_id!=null
        ?callOperation(client,'createExperimentV2',{body,signal,headers:identity(operationKey)})
        :callOperation(client,'createExperiment',{body:{...body,circuit_graph:graph},signal,headers:identity(operationKey)})
    },
    get(id:string,signal?:AbortSignal):Promise<Experiment> { return callOperation(client,'getExperiment',{path:{experiment_id:id},signal}) },
    run(id:string,signal?:AbortSignal,operationKey?:string):Promise<Experiment> { return callOperation(client,'runExperiment',{path:{experiment_id:id},signal,headers:identity(operationKey)}) },
    stop(id:string,signal?:AbortSignal,operationKey?:string):Promise<Experiment> { return callOperation(client,'stopExperiment',{path:{experiment_id:id},signal,headers:identity(operationKey)}) },
    results(id:string,signal?:AbortSignal):Promise<Experiment> { return callOperation(client,'getExperimentResults',{path:{experiment_id:id},signal}) },
    configureGenerator(id:string,configuration:GeneratorConfiguration,signal?:AbortSignal) {
      return callOperation(client,'configureExperimentInstrument',{path:{experiment_id:id},body:{instrument:'generator',configuration},signal})
    },
    operation(operationKey:string,query?:ApiOperations['getOperation']['query'],signal?:AbortSignal) {
      return callOperation(client,'getOperation',{path:{operation_key:operationKey},query,signal})
    },
  }
}
export const experimentsApi=createExperimentsApi(apiClient)
