import type { ExperimentRecord } from '../contracts/generated/dto'
export type { ExperimentCreateV2 as ExperimentInput } from '../contracts/generated/dto'
export type Experiment = ExperimentRecord
export type ExperimentState = 'idle' | ExperimentRecord['state']
