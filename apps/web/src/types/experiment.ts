import type { ExperimentRecord } from '../contracts/generated/dto'
export type { ExperimentCreate as ExperimentInput } from '../contracts/generated/dto'
export type Experiment = ExperimentRecord
export type ExperimentState = 'idle' | ExperimentRecord['state']
