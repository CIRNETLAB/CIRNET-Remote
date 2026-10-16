import * as generatedValidators from './generated/validators.js'
import * as editorValidators from './generated/validators.editor.js'
import * as structuralValidators from './generated/validators.structural.js'
import type { ContractMap } from './generated/dto'

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
const registries: Record<ValidationProfile, { [K in keyof ContractMap]: Validator<ContractMap[K]> }> = {
  transport: generatedValidators, editor: editorValidators, structural: structuralValidators,
}
const pointer = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1')

/** Generated JSON Schema validation never normalizes, coerces or adds defaults. */
export function parseStructural<K extends keyof ContractMap>(name: K, value: unknown, profile: ValidationProfile = 'transport'): ContractMap[K] {
  const registry = registries[profile]
  if (!registry) contractIssue('Unknown validation profile.', '', 'UNKNOWN_PROFILE', 'transport')
  const validator: Validator<ContractMap[K]> = registry[name]
  if (typeof validator !== 'function') contractIssue('Unknown public contract.', '', 'UNKNOWN_CONTRACT', profile)
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
