import * as generatedValidators from './generated/validators.core.js'
import * as editorValidators from './generated/validators.editor.core.js'
import * as structuralValidators from './generated/validators.structural.core.js'
import type { ContractMap } from './generated/dto'
import {publicContractNames} from './generated/publicContractNames'

export type ValidationProfile = 'structural' | 'editor' | 'transport'
export interface ContractIssue {
  code: string
  path: string
  severity: 'error'
  profile: ValidationProfile
  message: string
}

export class ContractValidationError extends Error {
  readonly code = 'INVALID_RESPONSE'
  constructor(message: string, public readonly issues: ContractIssue[]) {
    super(message)
    this.name = 'ContractValidationError'
  }
}

export function contractIssue(message: string, path = '', code = 'CONTRACT_INTEGRITY', profile: ValidationProfile = 'transport'): never {
  throw new ContractValidationError(message, [{ code, path, severity: 'error', profile, message }])
}

interface SchemaIssue { instancePath: string; keyword: string; message?: string; params: Record<string, unknown> }
type Validator<T> = ((value: unknown) => value is T) & { errors?: SchemaIssue[] | null }
const registries: Record<ValidationProfile, Partial<{ [K in keyof ContractMap]: Validator<ContractMap[K]> }>> = {
  transport: generatedValidators, editor: editorValidators, structural: structuralValidators,
}
const loading:Partial<Record<ValidationProfile,Promise<void>>>={}
/** Explicit workflow loading keeps pointer/document validation synchronous. Failed loads may be retried. */
export async function prepareContractProfile(profile:ValidationProfile='transport'):Promise<void> {
  if(!loading[profile]) {
    const task=(profile==='transport'?import('./generated/validators.js'):profile==='editor'?import('./generated/validators.editor.js'):import('./generated/validators.structural.js'))
      .then(registry=>{registries[profile]=registry})
    loading[profile]=task
    void task.catch(()=>{if(loading[profile]===task)delete loading[profile]})
  }
  await loading[profile]
}
export async function prepareContracts(names:readonly (keyof ContractMap)[],profile:ValidationProfile='transport'):Promise<void> {
  if(!contractsReady(names,profile))await prepareContractProfile(profile)
}
/** Keep already prepared synchronous workflows on their existing dispatch path. */
export function contractsReady(names:readonly (keyof ContractMap)[],profile:ValidationProfile='transport'):boolean {
  return names.every(name=>typeof registries[profile]?.[name]==='function')
}
const pointer = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1')
const publicNames=new Set<string>(publicContractNames)

/** Generated JSON Schema validation never normalizes, coerces or adds defaults. */
export function parseStructural<K extends keyof ContractMap>(name: K, value: unknown, profile: ValidationProfile = 'transport'): ContractMap[K] {
  if(!publicNames.has(name))contractIssue('Unknown public contract.','','UNKNOWN_CONTRACT',profile)
  const registry = registries[profile]
  if (!registry) contractIssue('Unknown validation profile.', '', 'UNKNOWN_PROFILE', 'transport')
  const validator: Validator<ContractMap[K]>|undefined = registry[name]
  if (typeof validator !== 'function') contractIssue('Prepare the contract profile before entering this workflow.', '', 'VALIDATOR_NOT_READY', profile)
  if (!validator(value)) {
    const issues = (validator.errors ?? []).map(error => {
      const member = error.params.missingProperty ?? error.params.additionalProperty
      return {
        code: `SCHEMA_${error.keyword.toUpperCase()}`,
        path: error.instancePath + (typeof member === 'string' ? `/${pointer(member)}` : ''),
        severity: 'error' as const, profile, message: error.message ?? 'Invalid contract value.',
      }
    })
    throw new ContractValidationError(`Invalid ${name} schema at ${issues[0]?.path || '/'}: ${issues[0]?.message ?? 'contract validation failed.'}`, issues)
  }
  return value
}
