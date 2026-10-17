/** Application views accept both generated wire envelopes after exact parsing. */
import type {CircuitDocument as LegacyDocument,CircuitDocumentV2,CircuitSummary as LegacySummary,CircuitSummaryV2} from '../contracts/generated/dto'

export type CircuitDocument=Omit<CircuitDocumentV2,'schema_version'>&Pick<LegacyDocument|CircuitDocumentV2,'schema_version'>
export type CircuitSummary=Omit<CircuitSummaryV2,'schema_version'>&Pick<LegacySummary|CircuitSummaryV2,'schema_version'>
