import type { CircuitGraph } from './circuit'
import type { ExperimentRecord, InstrumentationExecutionPlan } from './lab'
export type Experiment = ExperimentRecord
export type ExperimentState = 'idle' | ExperimentRecord['state']
export type ExperimentInput = { station_id:string; assignment_id?:string; circuit_graph?:CircuitGraph }
  & Partial<Pick<InstrumentationExecutionPlan,'clock_config'|'generator_config'|'capture_config'|'test_vectors'>>
