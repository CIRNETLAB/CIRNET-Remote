import catalog from '../data/signalPortCatalog.json'
import type { CircuitGraph, CircuitModule, SignalDomain, SignalPortDefinition, SimulationClassification } from '../contracts/generated/dto'
import { contractIssue, ContractValidationError, parseStructural, type ValidationProfile } from '../contracts/structural'

interface DomainDescriptor { type:string;ports:SignalPortDefinition[];execution:'DIGITAL'|'DC_DIGITAL'|'VISUAL'|'UNAVAILABLE' }
const descriptors=new Map((catalog.components as DomainDescriptor[]).map(item=>[item.type,item]))
const pointer=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1')

function namespace(module:CircuitModule,path:string,profile:ValidationProfile,execution=false):void {
  if(!('signal_domains' in module))return
  const value=module.signal_domains,location=path+'/signal_domains'
  if(value===null||typeof value!=='object'||Array.isArray(value)||!('version' in value)||typeof value.version!=='string')contractIssue('Signal domains require an explicit namespace version.',location,'INVALID_SIGNAL_DOMAINS',profile)
  if(value.version!=='1.0') {
    if(execution)contractIssue('The signal-domain namespace version has no execution adapter.',location+'/version','UNSUPPORTED_SIGNAL_DOMAIN_VERSION',profile)
    return
  }
  let validated
  try { validated=parseStructural('SignalDomainNamespace',value,profile) }
  catch(error) {
    if(error instanceof ContractValidationError)throw new ContractValidationError(error.message,error.issues.map(issue=>({...issue,path:location+issue.path})))
    throw error
  }
  const descriptor=descriptors.get(module.type)
  if(!descriptor)return
  for(const [id,domain] of Object.entries(validated.ports)) {
    const port=descriptor.ports.find(item=>item.id===id)
    if(!port)contractIssue('The namespace references an unknown catalog port.',location+'/ports/'+pointer(id),'UNKNOWN_SIGNAL_PORT',profile)
    if(port.domain!==domain)contractIssue('An instance annotation cannot relabel the canonical port domain.',location+'/ports/'+pointer(id),'SIGNAL_DOMAIN_CONFLICT',profile)
  }
}

export function validateSignalDomains(name:string,value:unknown,profile:ValidationProfile='transport',path=''):void {
  if(name==='CircuitGraph') (value as CircuitGraph).modules.forEach((module,index)=>namespace(module,`${path}/modules/${index}`,profile))
  else if(name==='CircuitModule')namespace(value as CircuitModule,path,profile)
  else if(name==='SimulationRequest')validateSignalDomains('CircuitGraph',(value as {graph:CircuitGraph}).graph,profile,path+'/graph')
}

/** Direct compatibility only. Unknown and MIXED are never universal adapters. */
export function domainsCompatible(source:SignalDomain|undefined,destination:SignalDomain|undefined):boolean {
  return source!==undefined&&destination!==undefined&&(source===destination||source==='CLOCK'&&destination==='DIGITAL'||source==='DIGITAL'&&destination==='CLOCK')
}

export function portDomain(module:CircuitModule,port:string):SignalDomain|undefined {
  const descriptor=descriptors.get(module.type)
  if(descriptor)return descriptor.ports.find(item=>item.id===port)?.domain
  const value=module.signal_domains
  if(value!==null&&typeof value==='object'&&!Array.isArray(value)&&'version' in value&&value.version==='1.0')return parseStructural('SignalDomainNamespace',value).ports[port]
  return undefined
}

/** Catalog selection describes local models; it never asserts hardware capability. */
export function classifyGraph(graph:CircuitGraph):SimulationClassification {
  parseStructural('CircuitGraph',graph,'structural')
  const domains=new Set<SignalDomain>(),unsupported:string[]=[]
  let digital=false,dc=false,analog=false,mixed=false,unknown=false
  graph.modules.forEach((module,index)=>{
    namespace(module,`/modules/${index}`,'transport',true)
    const descriptor=descriptors.get(module.type)
    if(!descriptor){unknown=true;unsupported.push(module.id);return}
    const componentDomains=new Set(descriptor.ports.flatMap(port=>port.domain?[port.domain]:[]))
    componentDomains.forEach(domain=>domains.add(domain))
    if(descriptor.execution==='VISUAL')return
    if(descriptor.execution==='DIGITAL')digital=true
    else if(descriptor.execution==='DC_DIGITAL')dc=true
    else {
      unsupported.push(module.id)
      mixed=mixed||componentDomains.has('MIXED')
      analog=analog||componentDomains.has('ANALOG')
      digital=digital||componentDomains.has('DIGITAL')||componentDomains.has('CLOCK')
    }
  })
  return {schema_version:'1.0',kind:unknown?'UNKNOWN':mixed||analog&&digital?'MIXED':analog?'ANALOG':dc?'DC_DIGITAL':'DIGITAL',domains:[...domains].sort(),unsupported_components:unsupported.sort()}
}

export function validateDomainConnections(graph:CircuitGraph,profile:ValidationProfile='transport'):void {
  const modules=new Map(graph.modules.map(module=>[module.id,module]))
  graph.connections.forEach((edge,index)=>{
    const endpoints=[edge.source,edge.destination].flatMap(endpoint=>{
      const [id,port,...extra]=endpoint.split('.'),module=modules.get(id??'')
      return module&&port&&extra.length===0&&!port.startsWith('contact:')?[{module,domain:portDomain(module,port)}]:[]
    })
    if(endpoints.length!==2)return
    const [source,destination]=endpoints
    if(domainsCompatible(source!.domain,destination!.domain))return
    if(endpoints.every(item=>item.domain!==undefined&&item.domain!=='MIXED')&&endpoints.some(item=>descriptors.get(item.module.type)?.execution==='DC_DIGITAL'))return
    contractIssue('Connection domains require an explicit compatible adapter.',`/connections/${index}`,'SIGNAL_DOMAIN_MISMATCH',profile)
  })
}
