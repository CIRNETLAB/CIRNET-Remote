import schema from '../data/labContracts.json'
import { isRecord } from './api'
import { ApiError } from '../services/api/client'
import { parseCircuitFile } from '../services/files/circuitFile'

type Schema = { $ref?:string; anyOf?:Schema[]; const?:unknown; enum?:unknown[]; type?:string;
  properties?:Record<string,Schema>; required?:string[]; additionalProperties?:boolean|Schema;
  items?:Schema; minimum?:number; maximum?:number; exclusiveMinimum?:number; minLength?:number;
  pattern?:string; minItems?:number; maxItems?:number }
const definitions=schema.$defs as unknown as Record<string,Schema>

function integrity(message:string):never { throw new ApiError(0,'INVALID_RESPONSE',message) }
function unique(entries:Record<string,unknown>[],key:string) {
  if(new Set(entries.map(e=>e[key])).size!==entries.length) integrity(`Duplicate ${key}.`)
}
function endpoint(value:Record<string,unknown>) {
  if(['node_id','fixed_node_id','reference_node_id','design_port'].filter(key=>key in value).length>1) integrity('Endpoint binding forms are mutually exclusive.')
}
function component(value:Record<string,unknown>) {
  if(value.kind==='OPAQUE_PHYSICAL_COMPONENT'&&value.identity!=='UNKNOWN') integrity('Opaque identity must be UNKNOWN.')
  unique((value.pins??[]) as Record<string,unknown>[],'pin_id')
}

function valid(rule:Schema,value:unknown):boolean {
  if(rule.$ref) return valid(definitions[rule.$ref.split('/').at(-1)!],value)
  if(rule.anyOf) return rule.anyOf.some(option=>valid(option,value))
  if('const' in rule && value!==rule.const) return false
  if(rule.enum && !rule.enum.some(option=>option===value)) return false
  if(rule.type==='null') return value===null
  if(rule.type==='boolean') return typeof value==='boolean'
  if(rule.type==='string') return typeof value==='string' && value.length>=(rule.minLength??0) && (!rule.pattern||new RegExp(rule.pattern).test(value))
  if(rule.type==='number'||rule.type==='integer') return typeof value==='number' && Number.isFinite(value)
    && (rule.type!=='integer'||Number.isSafeInteger(value)) && value>=(rule.minimum??-Infinity)
    && value<=(rule.maximum??Infinity) && (rule.exclusiveMinimum===undefined||value>rule.exclusiveMinimum)
  if(rule.type==='array') return Array.isArray(value) && value.length>=(rule.minItems??0) && value.length<=(rule.maxItems??Infinity) && value.every(item=>valid(rule.items??{},item))
  if(rule.type==='object') {
    if(!isRecord(value)||(rule.required??[]).some(key=>!(key in value))) return false
    return Object.entries(value).every(([key,item])=>rule.properties?.[key] ? valid(rule.properties[key],item)
      : rule.additionalProperties===false ? false : typeof rule.additionalProperties==='object' ? valid(rule.additionalProperties,item) : true)
  }
  return true
}

export function parseLab<T>(name:string,value:unknown):T {
  if(!definitions[name]||!valid(definitions[name],value)) throw new ApiError(0,'INVALID_RESPONSE',`The API returned an invalid ${name}.`)
  if(name==='ExperimentRecord' && isRecord(value)) {
    const history=value.state_history as string[]
    if(history.at(-1)!==value.state) throw new ApiError(0,'INVALID_RESPONSE','Experiment state/history disagree.')
    if(value.capture!==null) parseLab('CaptureMetadata',value.capture)
  }
  if(name==='CaptureMetadata' && isRecord(value)) {
    const signals=value.signals as string[]|undefined
    if(value.instrument==='logic_analyzer'&&value.encoding!=='digital_events'
      || value.instrument==='oscilloscope'&&value.encoding==='digital_events'
      || signals&&(new Set(signals).size!==signals.length||signals.length!==value.channel_count)
      || value.available&&(value.payload_ref===null||(value.payload_byte_count as number)<=0)
      || !value.available&&(value.payload_ref!==null||value.payload_byte_count!==0||value.sha256!=null)
      || value.encoding==='digital_events'&&((value.sample_count as number)>100000||(value.channel_count as number)>4096||(value.payload_byte_count as number)>9+65536+100000*11)) integrity('Capture metadata is inconsistent.')
  }
  if(name==='CaptureResult' && isRecord(value)) {
    const samples=value.samples as {signal:string;time_ns:number;value:0|1|'X'}[]
    if(value.sample_count!==samples.length || samples.some(s=>s.time_ns>(value.duration_ns as number))) throw new ApiError(0,'INVALID_RESPONSE','Capture metadata does not match samples.')
  }
  if(name==='AssignmentDefinition' && isRecord(value)) {
    const endpoints=value.lab_endpoints as Record<string,unknown>[]
    unique(endpoints,'endpoint_id'); endpoints.forEach(endpoint)
    if(value.reference_topology_graph) parseLab('DetectedTopologyGraph',value.reference_topology_graph)
    if(value.reference_design_graph) {
      try { parseCircuitFile(JSON.stringify(value.reference_design_graph)) } catch { integrity('Invalid reference CircuitGraph.') }
    }
    const profiles=(value.instructor_pin_profiles??[]) as Record<string,unknown>[]
    unique(profiles,'profile_id'); profiles.forEach(p=>unique(p.pins as Record<string,unknown>[],'pin_id'))
  }
  if(name==='LabEndpoint'&&isRecord(value)) endpoint(value)
  if(['ObservedComponent','ObservedPhysicalComponent','OpaqueComponent','OpaquePhysicalComponent'].includes(name)&&isRecord(value)) component(value)
  if(name==='DetectedTopologyGraph'&&isRecord(value)) {
    const nodes=value.nodes as {node_id:string}[], components=value.components as Record<string,unknown>[]
    unique(nodes,'node_id'); unique(components,'component_id')
    const ids=new Set(nodes.map(n=>n.node_id)), connections=new Set<string>()
    for(const connection of value.connections as {node_ids:string[]}[]) {
      const members=connection.node_ids, key=JSON.stringify([...members].sort())
      if(new Set(members).size!==members.length||members.some(n=>!ids.has(n))||connections.has(key)) integrity('Duplicate or missing electrical connection node.')
      connections.add(key)
    }
    for(const entry of components) {
      component(entry)
      const members=entry.node_ids as string[], pins=(entry.pins??[]) as {node_id:string}[]
      if(new Set(members).size!==members.length||members.some(n=>!ids.has(n))||pins.some(p=>!members.includes(p.node_id))) integrity('Component or pin references a missing node.')
    }
  }
  if(name==='TopologyResolutionResult'&&isRecord(value)) {
    unique(value.endpoint_bindings as Record<string,unknown>[],'endpoint_id')
    unique(value.component_matches as Record<string,unknown>[],'reference_component_id')
    unique(value.component_matches as Record<string,unknown>[],'observed_component_id')
  }
  if(name==='InstrumentationExecutionPlan'&&isRecord(value)) {
    const bindings=value.endpoint_bindings as {endpoint_id:string}[]
    unique(bindings,'endpoint_id'); unique(value.routing_allocations as Record<string,unknown>[],'resource_id')
    const ids=new Set(bindings.map(b=>b.endpoint_id))
    if([...(value.routing_allocations as {endpoint_id:string}[]),...(value.instrument_allocations as {endpoint_id:string}[])].some(a=>!ids.has(a.endpoint_id))) integrity('Allocation references an unbound endpoint.')
  }
  return value as T
}
