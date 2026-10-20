// Generated. DO NOT EDIT.
import type { ContractMap } from './dto'
export interface ValidationIssue { instancePath: string; keyword: string; message?: string; params: Record<string, unknown> }
export interface Validator<T> { (value: unknown): value is T; errors?: ValidationIssue[] | null }
export const CircuitGraph: Validator<ContractMap['CircuitGraph']>
export const MemoryImage: Validator<ContractMap['MemoryImage']>
export const WireVisual: Validator<ContractMap['WireVisual']>
export const LeadSettings: Validator<ContractMap['LeadSettings']>
export const SignalDomainNamespace: Validator<ContractMap['SignalDomainNamespace']>
export const FlexibleMountV1: Validator<ContractMap['FlexibleMountV1']>
export const AnySupportedCircuitGraph: Validator<ContractMap['AnySupportedCircuitGraph']>
export const FlexibleMountV2: Validator<ContractMap['FlexibleMountV2']>
export const LabelPropertiesV1: Validator<ContractMap['LabelPropertiesV1']>
