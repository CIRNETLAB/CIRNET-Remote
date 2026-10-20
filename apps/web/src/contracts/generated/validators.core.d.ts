// Generated. DO NOT EDIT.
import type { ContractMap } from './dto'
export interface ValidationIssue { instancePath: string; keyword: string; message?: string; params: Record<string, unknown> }
export interface Validator<T> { (value: unknown): value is T; errors?: ValidationIssue[] | null }
export const AssignmentDefinition: Validator<ContractMap['AssignmentDefinition']>
export const DetectedTopologyGraph: Validator<ContractMap['DetectedTopologyGraph']>
export const ClockConfiguration: Validator<ContractMap['ClockConfiguration']>
export const GeneratorConfiguration: Validator<ContractMap['GeneratorConfiguration']>
export const CaptureConfiguration: Validator<ContractMap['CaptureConfiguration']>
export const TestVector: Validator<ContractMap['TestVector']>
export const HealthResponse: Validator<ContractMap['HealthResponse']>
export const PublicStationCapabilities: Validator<ContractMap['PublicStationCapabilities']>
export const ExperimentCreate: Validator<ContractMap['ExperimentCreate']>
export const ErrorEnvelope: Validator<ContractMap['ErrorEnvelope']>
export const SessionView: Validator<ContractMap['SessionView']>
export const LoginRequest: Validator<ContractMap['LoginRequest']>
export const LogoutRequest: Validator<ContractMap['LogoutRequest']>
export const GuestClaimRequest: Validator<ContractMap['GuestClaimRequest']>
export const UserView: Validator<ContractMap['UserView']>
export const UserCreate: Validator<ContractMap['UserCreate']>
export const UserUpdate: Validator<ContractMap['UserUpdate']>
export const SignalDomainNamespace: Validator<ContractMap['SignalDomainNamespace']>
export const AssignmentDefinitionV2: Validator<ContractMap['AssignmentDefinitionV2']>
export const AnySupportedAssignmentDefinition: Validator<ContractMap['AnySupportedAssignmentDefinition']>
export const LabelPropertiesV1: Validator<ContractMap['LabelPropertiesV1']>
