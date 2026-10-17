/** Application views retain saved definition versions while accepting flexible references. */
import type {AnySupportedAssignmentDefinition,AssignmentAuthoringDocumentV2,AssignmentAuthoringSummaryV2,AssignmentView as LegacyAssignmentView,AssignmentViewV2} from '../contracts/generated/dto'
export type AssignmentDefinition=AnySupportedAssignmentDefinition
export type AssignmentAuthoringSummary=Omit<AssignmentAuthoringSummaryV2,'schema_version'>&{schema_version:'1.0'|'2.0'}
export type AssignmentAuthoringDocument=Omit<AssignmentAuthoringDocumentV2,'schema_version'>&{schema_version:'1.0'|'2.0'}
export type AssignmentView=LegacyAssignmentView|AssignmentViewV2
