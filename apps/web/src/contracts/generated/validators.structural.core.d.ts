// Generated. DO NOT EDIT.
import type { ContractMap } from './dto'
export interface ValidationIssue { instancePath: string; keyword: string; message?: string; params: Record<string, unknown> }
export interface Validator<T> { (value: unknown): value is T; errors?: ValidationIssue[] | null }
export const SignalDomainNamespace: Validator<ContractMap['SignalDomainNamespace']>
export const ComponentDesignPropertiesV1: Validator<ContractMap['ComponentDesignPropertiesV1']>
export const AnySupportedCircuitGraph: Validator<ContractMap['AnySupportedCircuitGraph']>
export const LabelPropertiesV1: Validator<ContractMap['LabelPropertiesV1']>
