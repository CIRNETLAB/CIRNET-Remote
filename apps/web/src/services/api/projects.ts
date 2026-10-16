import type { ApiOperations } from '../../contracts/generated/operations'
import { apiClient,type ApiClient } from './client'
import { callOperation } from './operations'
export function createProjectsApi(client:ApiClient) {
  return {
    list(query:ApiOperations['listProjects']['query']={},signal?:AbortSignal){return callOperation(client,'listProjects',{query,signal})},
    create(body:ApiOperations['createProject']['request'],signal?:AbortSignal){return callOperation(client,'createProject',{body,signal})},
    get(project_id:string,signal?:AbortSignal){return callOperation(client,'getProject',{path:{project_id},signal})},
    update(project_id:string,body:ApiOperations['updateProject']['request'],signal?:AbortSignal){return callOperation(client,'updateProject',{path:{project_id},body,signal})},
    remove(project_id:string,base_revision:number,signal?:AbortSignal){return callOperation(client,'deleteProject',{path:{project_id},body:{base_revision},signal})},
    circuits(project_id:string,query:ApiOperations['listCircuits']['query']={},signal?:AbortSignal){return callOperation(client,'listCircuits',{path:{project_id},query,signal})},
    getCircuit(document_id:string,signal?:AbortSignal){return callOperation(client,'getCircuit',{path:{document_id},signal})},
    createCircuit(project_id:string,body:ApiOperations['createCircuit']['request'],signal?:AbortSignal){return callOperation(client,'createCircuit',{path:{project_id},body,signal})},
    saveCircuit(document_id:string,body:ApiOperations['saveCircuit']['request'],signal?:AbortSignal){return callOperation(client,'saveCircuit',{path:{document_id},body,signal})},
    removeCircuit(document_id:string,base_revision:number,signal?:AbortSignal){return callOperation(client,'deleteCircuit',{path:{document_id},body:{base_revision},signal})},
  }
}
export const projectsApi=createProjectsApi(apiClient)
