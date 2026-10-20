import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createApiClient} from '../src/services/api/client'
import {createProjectsApi} from '../src/services/api/projects'
import {createCircuitsApi} from '../src/services/api/circuits'
import type {CircuitGraphV12} from '../src/contracts/generated/dto'
import {classifyGraph} from '../src/electrical/signalDomains'

const graph:CircuitGraphV12={schema_version:'1.2',circuit_id:'retained',modules:[],connections:[]}
const document={schema_version:'2.0',document_id:'d',project_id:'p',owner_id:'u',name:'Design',graph_schema_version:'1.2',revision:1,created_at:0,updated_at:0,graph}

test('graph 1.2 classification preserves explicit digital-domain execution rules',()=>{
  assert.equal(classifyGraph({...graph,modules:[{id:'S',type:'DIGITAL_SWITCH'}]}).kind,'DIGITAL')
})

test('graph 1.2 mutations and validation select versioned operations without replay',async()=>{
  const paths:string[]=[]
  const client=createApiClient({baseUrl:'http://lab/api',fetcher:async(url,options)=>{paths.push(String(url));return Response.json(String(url).endsWith('/validate')?{valid:true,code:'OK',message:'Valid'}:document,{status:options?.method==='POST'&&String(url).endsWith('/circuits')?201:200})}})
  const projects=createProjectsApi(client)
  await projects.createCircuit('p',{name:'Design',graph})
  await projects.saveCircuit('d',{name:'Design',base_revision:1,graph})
  await createCircuitsApi(client).validate(graph)
  assert.deepEqual(paths,['http://lab/api/v2/projects/p/circuits','http://lab/api/v2/circuits/d','http://lab/api/v2/circuits/validate'])
})

test('a legacy unsupported-document response opts into one versioned read',async()=>{
  const methods:string[]=[]
  const client=createApiClient({baseUrl:'http://lab/api',fetcher:async(url,options)=>{
    methods.push(`${options?.method} ${String(url)}`)
    return String(url).includes('/v2/')?Response.json(document):Response.json({code:'UNSUPPORTED_DOCUMENT_VERSION',message:'Use the supported document endpoint.',request_id:'document-version'},{status:422})
  }})
  assert.equal((await createProjectsApi(client).getCircuit('d')).graph.schema_version,'1.2')
  assert.deepEqual(methods,['GET http://lab/api/circuits/d','GET http://lab/api/v2/circuits/d'])
})
