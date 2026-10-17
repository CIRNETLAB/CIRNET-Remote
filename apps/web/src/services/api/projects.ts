import type { ApiOperations } from '../../contracts/generated/operations'
import { apiClient,ApiError,type ApiClient } from './client'
import { callOperation } from './operations'
export function createProjectsApi(client:ApiClient) {
  const supportedRead=async<T>(legacy:()=>Promise<T>,versioned:()=>Promise<T>):Promise<T>=>{
    try{return await legacy()}
    catch(error){if(error instanceof ApiError&&error.status===422&&error.code==='UNSUPPORTED_DOCUMENT_VERSION')return versioned();throw error}
  }
  return {
    list(query:ApiOperations['listProjects']['query']={},signal?:AbortSignal){return callOperation(client,'listProjects',{query,signal})},
    create(body:ApiOperations['createProject']['request'],signal?:AbortSignal){return callOperation(client,'createProject',{body,signal})},
    get(project_id:string,signal?:AbortSignal){return callOperation(client,'getProject',{path:{project_id},signal})},
    update(project_id:string,body:ApiOperations['updateProject']['request'],signal?:AbortSignal){return callOperation(client,'updateProject',{path:{project_id},body,signal})},
    remove(project_id:string,base_revision:number,signal?:AbortSignal){return callOperation(client,'deleteProject',{path:{project_id},body:{base_revision},signal})},
    circuits(project_id:string,query:ApiOperations['listCircuits']['query']={},signal?:AbortSignal){return supportedRead<ApiOperations['listCircuits']['response']|ApiOperations['listCircuitsV2']['response']>(
      ()=>callOperation(client,'listCircuits',{path:{project_id},query,signal}),()=>callOperation(client,'listCircuitsV2',{path:{project_id},query,signal}))},
    getCircuit(document_id:string,signal?:AbortSignal){return supportedRead<ApiOperations['getCircuit']['response']|ApiOperations['getCircuitV2']['response']>(
      ()=>callOperation(client,'getCircuit',{path:{document_id},signal}),()=>callOperation(client,'getCircuitV2',{path:{document_id},signal}))},
    createCircuit(project_id:string,body:ApiOperations['createCircuitV2']['request'],signal?:AbortSignal){
      return body.graph.schema_version==='1.2'?callOperation(client,'createCircuitV2',{path:{project_id},body,signal})
        :callOperation(client,'createCircuit',{path:{project_id},body:{...body,graph:body.graph},signal})
    },
    saveCircuit(document_id:string,body:ApiOperations['saveCircuitV2']['request'],signal?:AbortSignal){
      return body.graph.schema_version==='1.2'?callOperation(client,'saveCircuitV2',{path:{document_id},body,signal})
        :callOperation(client,'saveCircuit',{path:{document_id},body:{...body,graph:body.graph},signal})
    },
    removeCircuit(document_id:string,base_revision:number,signal?:AbortSignal){return callOperation(client,'deleteCircuit',{path:{document_id},body:{base_revision},signal})},
  }
}
export const projectsApi=createProjectsApi(apiClient)
