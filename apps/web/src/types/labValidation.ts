import schema from '../data/labContracts.json'
import { isRecord } from './api'
import { ApiError } from '../services/api/client'

type Schema = { $ref?:string; anyOf?:Schema[]; const?:unknown; enum?:unknown[]; type?:string;
  properties?:Record<string,Schema>; required?:string[]; additionalProperties?:boolean|Schema;
  items?:Schema; minimum?:number; maximum?:number; exclusiveMinimum?:number; minLength?:number;
  pattern?:string; minItems?:number; maxItems?:number }
const definitions=schema.$defs as unknown as Record<string,Schema>

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
    if(value.capture!==null) parseLab('CaptureResult',value.capture)
  }
  if(name==='CaptureResult' && isRecord(value)) {
    const samples=value.samples as {signal:string;time_ns:number;value:0|1|'X'}[]
    if(value.sample_count!==samples.length || samples.some(s=>s.time_ns>(value.duration_ns as number))) throw new ApiError(0,'INVALID_RESPONSE','Capture metadata does not match samples.')
  }
  if(name==='AssignmentDefinition' && isRecord(value)) {
    const ids=(value.lab_endpoints as {endpoint_id:string}[]).map(e=>e.endpoint_id)
    if(new Set(ids).size!==ids.length) throw new ApiError(0,'INVALID_RESPONSE','Assignment endpoint identities are duplicated.')
  }
  return value as T
}
