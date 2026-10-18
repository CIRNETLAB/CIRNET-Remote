// Generated from contracts/manifest.json by scripts/generate_contracts.py. DO NOT EDIT.

/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitModule".
 */
export type CircuitModule = {
  id: string
  type: string
  position?: {
    x?: number
    y?: number
    z?: number
  }
  /**
   * Optional editor yaw in degrees around world Y; no electrical meaning.
   */
  rotation?: number
  properties?: {
    [k: string]: unknown
  }
  mount?: MountBinding
  [k: string]: unknown
}
export type ExpectedComponentSet = string[]
export type InstructorPinProfiles = {
  profile_id: string
  component_type: string
  pins: {
    pin_id: string
    role: string
  }[]
}[]
export type LabEndpoints = LabEndpoint[]
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "WireRouteMode".
 */
export type WireRouteMode = 'FREE' | 'ORTHOGONAL' | 'AUTO'
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "WireControlPoint".
 */
export type WireControlPoint =
  | {
      space: 'world'
      position: WirePoint3
      [k: string]: unknown
    }
  | {
      space: 'module'
      moduleId: string
      position: WirePoint3
      [k: string]: unknown
    }
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "LeadSettings".
 */
export type LeadSettings = {
  leadForm?: 'straight' | 'formed90' | 'offset-s'
  leadLengthMm?: number
  bodyLiftMm?: number
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentCreate".
 */
export type ExperimentCreate = {
  station_id: string
  assignment_id?: string
  circuit_graph?: CircuitGraph
  clock_config?: {} | ClockConfiguration
  generator_config?: GeneratorConfiguration[]
  capture_config?: CaptureConfiguration
  test_vectors?: TestVector[]
  circuit_document_id?: string
  circuit_revision?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentConfigureRequest".
 */
export type InstrumentConfigureRequest =
  | {
      instrument: 'generator'
      configuration: GeneratorConfiguration
    }
  | {
      instrument: 'clock'
      configuration: ClockConfiguration
    }
  | {
      instrument: 'trigger'
      configuration: TriggerConfiguration
    }
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ServerEvent".
 */
export type ServerEvent =
  HelloEvent | EchoEvent | StationUpdatedEvent | ExperimentUpdatedEvent | ResyncEvent | ProtocolErrorEvent
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "LegacyServerEvent".
 */
export type LegacyServerEvent =
  | {
      type: 'hello'
      service: string
      [k: string]: unknown
    }
  | {
      type: 'echo'
      payload: string
      [k: string]: unknown
    }
  | {
      type: 'station.updated'
      station: {
        station_id: string
        mode: 'simulation' | 'hardware'
        state: 'ready' | 'unavailable' | 'busy' | 'error'
        capabilities?: PublicStationCapabilities
        [k: string]: unknown
      }
      [k: string]: unknown
    }
  | {
      type: 'experiment.updated'
      experiment: ExperimentRecord
      [k: string]: unknown
    }
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentView".
 */
export type AssignmentView = StudentAssignmentView | InstructorAssignmentDocument
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProjectUpdate".
 */
export type ProjectUpdate = ProjectUpdate1 & {
  base_revision: number
  name?: string
  description?: string
}
export type ProjectUpdate1 = {
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentDocumentReference".
 */
export type ExperimentDocumentReference = {
  schema_version: '1.0'
  experiment_id: string
  snapshot_id: string
  source: 'INLINE_GRAPH' | 'SAVED_DOCUMENT' | 'ASSIGNMENT_CONTEXT'
  execution_mode: 'simulation' | 'hardware'
  circuit_id: string
  graph_schema_version: ('1.0' | '1.1') | null
  assignment_id?: string | null
  document_id?: string
  revision?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SignalDomain".
 */
export type SignalDomain = 'DIGITAL' | 'ANALOG' | 'POWER' | 'GROUND' | 'CLOCK' | 'MIXED'
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitModuleV12".
 */
export type CircuitModuleV12 = {
  id: string
  type: string
  position?: {
    x?: number
    y?: number
    z?: number
  }
  rotation?: number
  properties?: {
    [k: string]: unknown
  }
  mount?: MountBinding | FlexibleMountV1 | FlexibleMountV2
  physicalDescriptor?: PhysicalDescriptorV1
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnySupportedCircuitGraph".
 */
export type AnySupportedCircuitGraph = CircuitGraph | CircuitGraphV12
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentDocumentReferenceV2".
 */
export type ExperimentDocumentReferenceV2 = {
  schema_version: '2.0'
  experiment_id: string
  snapshot_id: string
  source: 'INLINE_GRAPH' | 'SAVED_DOCUMENT' | 'ASSIGNMENT_CONTEXT'
  execution_mode: 'simulation' | 'hardware'
  circuit_id: string
  graph_schema_version: ('1.0' | '1.1' | '1.2') | null
  assignment_id?: string | null
  document_id?: string
  revision?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentCreateV2".
 */
export type ExperimentCreateV2 = {
  station_id: string
  assignment_id?: string
  circuit_graph?: AnySupportedCircuitGraph
  clock_config?: {} | ClockConfiguration
  generator_config?: GeneratorConfiguration[]
  capture_config?: CaptureConfiguration
  test_vectors?: TestVector[]
  circuit_document_id?: string
  circuit_revision?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnySupportedAssignmentDefinition".
 */
export type AnySupportedAssignmentDefinition = AssignmentDefinition | AssignmentDefinitionV2
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentViewV2".
 */
export type AssignmentViewV2 = InstructorAssignmentDocumentV2 | StudentAssignmentViewV2

export interface ContractMap {
  CircuitGraph: CircuitGraph
  CircuitModule: CircuitModule
  Point3: Point3
  PinContactBinding: PinContactBinding
  MountBinding: MountBinding
  CircuitConnection: CircuitConnection
  MemoryImage: MemoryImage
  LabEndpoint: LabEndpoint
  AssignmentDefinition: AssignmentDefinition
  DetectedNode: DetectedNode
  DetectedConnection: DetectedConnection
  ObservedPhysicalComponent: ObservedPhysicalComponent
  OpaquePhysicalComponent: OpaquePhysicalComponent
  DetectedTopologyGraph: DetectedTopologyGraph
  ExecutionDecision: ExecutionDecision
  ClockConfiguration: ClockConfiguration
  GeneratorConfiguration: GeneratorConfiguration
  CaptureConfiguration: CaptureConfiguration
  SafetyVerificationResult: SafetyVerificationResult
  TopologyVerificationResult: TopologyVerificationResult
  FunctionalVerificationResult: FunctionalVerificationResult
  DigitalObservation: DigitalObservation
  CaptureResult: CaptureResult
  ExperimentRecord: ExperimentRecord
  QueueState: QueueState
  ObservedPinBinding: ObservedPinBinding
  ComponentMatch: ComponentMatch
  ResolvedEndpointBinding: ResolvedEndpointBinding
  TopologyResolutionResult: TopologyResolutionResult
  ComponentDiagnostic: ComponentDiagnostic
  NetDiagnostic: NetDiagnostic
  PinMappingDiagnostic: PinMappingDiagnostic
  SafetyEvidence: SafetyEvidence
  SignalMismatch: SignalMismatch
  ObservedTruthTableCase: ObservedTruthTableCase
  TimingComparison: TimingComparison
  WaveformComparison: WaveformComparison
  CaptureMetadata: CaptureMetadata
  InstrumentCapability: InstrumentCapability
  GeneratorCapability: GeneratorCapability
  InstrumentCapabilities: InstrumentCapabilities
  AssessmentResult: AssessmentResult
  WireRouteMode: WireRouteMode
  WireControlPoint: WireControlPoint
  WireVisual: WireVisual
  LeadSettings: LeadSettings
  TestVector: TestVector
  WirePoint3: WirePoint3
  HealthResponse: HealthResponse
  CircuitValidationResult: CircuitValidationResult
  PhysicalDeviceState: PhysicalDeviceState
  PhysicalPreviewResult: PhysicalPreviewResult
  PublicStationCapabilities: PublicStationCapabilities
  StationDescriptor: StationDescriptor
  ExperimentCreate: ExperimentCreate
  TriggerConfiguration: TriggerConfiguration
  InstrumentConfigureRequest: InstrumentConfigureRequest
  InstrumentOperationResult: InstrumentOperationResult
  FieldIssue: FieldIssue
  ErrorEnvelope: ErrorEnvelope
  OperationRecord: OperationRecord
  HelloEvent: HelloEvent
  EchoEvent: EchoEvent
  StationUpdatedEvent: StationUpdatedEvent
  ExperimentUpdatedEvent: ExperimentUpdatedEvent
  ResyncEvent: ResyncEvent
  ProtocolErrorEvent: ProtocolErrorEvent
  ClientHelloMessage: ClientHelloMessage
  ServerEvent: ServerEvent
  LegacyServerEvent: LegacyServerEvent
  PrincipalView: PrincipalView
  SessionView: SessionView
  LoginRequest: LoginRequest
  LogoutRequest: LogoutRequest
  GuestClaimRequest: GuestClaimRequest
  UserView: UserView
  UserCreate: UserCreate
  UserUpdate: UserUpdate
  AssignmentPublication: AssignmentPublication
  InstructorAssignmentDocument: InstructorAssignmentDocument
  StudentAssignmentView: StudentAssignmentView
  AssignmentView: AssignmentView
  Project: Project
  ProjectPage: ProjectPage
  ProjectCreate: ProjectCreate
  ProjectUpdate: ProjectUpdate
  ProjectDelete: ProjectDelete
  ProjectDeletion: ProjectDeletion
  CircuitSummary: CircuitSummary
  CircuitDocument: CircuitDocument
  CircuitPage: CircuitPage
  CircuitCreate: CircuitCreate
  CircuitSave: CircuitSave
  CircuitDelete: CircuitDelete
  CircuitDeletion: CircuitDeletion
  ExperimentDocumentReference: ExperimentDocumentReference
  AssignmentAuthoringSummary: AssignmentAuthoringSummary
  AssignmentAuthoringDocument: AssignmentAuthoringDocument
  AssignmentAuthoringPage: AssignmentAuthoringPage
  AssignmentAuthoringCreate: AssignmentAuthoringCreate
  AssignmentAuthoringSave: AssignmentAuthoringSave
  AssignmentAuthoringPublication: AssignmentAuthoringPublication
  ExperimentHistoryPage: ExperimentHistoryPage
  ExperimentActiveSnapshot: ExperimentActiveSnapshot
  InstrumentControlAccess: InstrumentControlAccess
  InstrumentGeneratorCommand: InstrumentGeneratorCommand
  InstrumentCommandRecord: InstrumentCommandRecord
  SignalDomain: SignalDomain
  SignalPortDefinition: SignalPortDefinition
  SignalDomainNamespace: SignalDomainNamespace
  SimulationClassification: SimulationClassification
  SimulationRequest: SimulationRequest
  SimulationCapture: SimulationCapture
  SimulationResult: SimulationResult
  SimulationErrorResult: SimulationErrorResult
  AnalogCaptureChannel: AnalogCaptureChannel
  AnalogCaptureTimeAxis: AnalogCaptureTimeAxis
  AnalogCaptureGap: AnalogCaptureGap
  AnalogCaptureInvalidRange: AnalogCaptureInvalidRange
  AnalogCaptureQuality: AnalogCaptureQuality
  AnalogCaptureHeader: AnalogCaptureHeader
  AnalogCaptureDescriptor: AnalogCaptureDescriptor
  NCAPLayout: NCAPLayout
  BodyPose3D: BodyPose3D
  FlexibleLeadIntent: FlexibleLeadIntent
  FlexibleMountV1: FlexibleMountV1
  MechanicalAuthoringProfileV1: MechanicalAuthoringProfileV1
  ComponentDesignPropertiesV1: ComponentDesignPropertiesV1
  FlexibleMechanicsCatalog: FlexibleMechanicsCatalog
  CircuitGraphV12: CircuitGraphV12
  CircuitModuleV12: CircuitModuleV12
  AnySupportedCircuitGraph: AnySupportedCircuitGraph
  CircuitSummaryV2: CircuitSummaryV2
  CircuitDocumentV2: CircuitDocumentV2
  CircuitPageV2: CircuitPageV2
  CircuitCreateV2: CircuitCreateV2
  CircuitSaveV2: CircuitSaveV2
  ExperimentDocumentReferenceV2: ExperimentDocumentReferenceV2
  ExperimentCreateV2: ExperimentCreateV2
  SimulationRequestV2: SimulationRequestV2
  MechanicalBodyExitV1: MechanicalBodyExitV1
  AssignmentDefinitionV2: AssignmentDefinitionV2
  AnySupportedAssignmentDefinition: AnySupportedAssignmentDefinition
  AssignmentAuthoringSummaryV2: AssignmentAuthoringSummaryV2
  AssignmentAuthoringDocumentV2: AssignmentAuthoringDocumentV2
  AssignmentAuthoringPageV2: AssignmentAuthoringPageV2
  AssignmentAuthoringCreateV2: AssignmentAuthoringCreateV2
  AssignmentAuthoringSaveV2: AssignmentAuthoringSaveV2
  AssignmentAuthoringPublicationV2: AssignmentAuthoringPublicationV2
  InstructorAssignmentDocumentV2: InstructorAssignmentDocumentV2
  StudentAssignmentViewV2: StudentAssignmentViewV2
  AssignmentViewV2: AssignmentViewV2
  AutomaticRoutingIntentV1: AutomaticRoutingIntentV1
  FlexibleMountV2: FlexibleMountV2
  PhysicalDescriptorV1: PhysicalDescriptorV1
  PackageLeadSectionV1: PackageLeadSectionV1
  PackageLeadExitV1: PackageLeadExitV1
  PackageShapeV1: PackageShapeV1
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitGraph".
 */
export interface CircuitGraph {
  schema_version: '1.0' | '1.1'
  circuit_id: string
  modules: CircuitModule[]
  connections: CircuitConnection[]
  metadata?: {
    [k: string]: unknown
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "MountBinding".
 */
export interface MountBinding {
  kind: 'breadboard'
  version: 1
  boardId: string
  partId: string
  partRevision: number
  packageId: string
  packageRevision: number
  pose: {
    position: Point3
    rotation: number
  }
  /**
   * @minItems 1
   */
  contacts: PinContactBinding[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "Point3".
 */
export interface Point3 {
  x: number
  y: number
  z: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PinContactBinding".
 */
export interface PinContactBinding {
  kind: 'pin-contact'
  version: 1
  pinId: string
  contactId: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitConnection".
 */
export interface CircuitConnection {
  source: string
  destination: string
  metadata?: {
    [k: string]: unknown
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "MemoryImage".
 */
export interface MemoryImage {
  version: '1.0'
  word_bits: 8
  depth: number
  /**
   * @minItems 1
   * @maxItems 256
   */
  data: number[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "LabEndpoint".
 */
export interface LabEndpoint {
  endpoint_id: string
  role: 'INPUT_SOURCE' | 'OUTPUT_SENSE' | 'CLOCK' | 'VCC' | 'GND' | 'GENERATOR' | 'SCOPE' | 'LOGIC_ANALYZER'
  /**
   * Deprecated fixed observed node only; never a teacher reference node.
   */
  node_id?: string
  channel?: number
  required?: boolean
  design_port?: string
  fixed_node_id?: string
  reference_node_id?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentDefinition".
 */
export interface AssignmentDefinition {
  schema_version: '1.0'
  assignment_id: string
  title: string
  reference_design_graph?: ReferenceDesignGraph
  reference_topology_graph?: DetectedTopologyGraph
  expected_component_set?: ExpectedComponentSet
  instructor_pin_profiles?: InstructorPinProfiles
  lab_endpoints: LabEndpoints
  expected_behavior?: ExpectedBehavior
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  component_resolution_mode?: 'AUTO_DISCOVERY' | 'INSTRUCTOR_PROFILE' | 'HYBRID'
}
export interface ReferenceDesignGraph {
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "DetectedTopologyGraph".
 */
export interface DetectedTopologyGraph {
  schema_version: '1.0'
  scan_id: string
  nodes: DetectedNode[]
  connections: DetectedConnection[]
  components: ObservedPhysicalComponent[]
  ambiguities: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "DetectedNode".
 */
export interface DetectedNode {
  node_id: string
  label?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "DetectedConnection".
 */
export interface DetectedConnection {
  /**
   * @minItems 2
   */
  node_ids: string[]
  confidence?: number
  notes?: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ObservedPhysicalComponent".
 */
export interface ObservedPhysicalComponent {
  component_id: string
  kind: 'OBSERVED_PHYSICAL_COMPONENT' | 'OPAQUE_PHYSICAL_COMPONENT'
  node_ids: string[]
  identity: string
  package?: string
  observations?: string[]
  pins?: ObservedPinBinding[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ObservedPinBinding".
 */
export interface ObservedPinBinding {
  pin_id: string
  node_id: string
  confidence?: number
  inferred_role?: string
  observations?: string[]
}
export interface ExpectedBehavior {
  truth_table?: {
    inputs: {
      [k: string]: 0 | 1
    }
    outputs: {
      [k: string]: 0 | 1
    }
  }[]
  expected_signals?: {
    signal: string
    time_ns: number
    value: 0 | 1
  }[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "OpaquePhysicalComponent".
 */
export interface OpaquePhysicalComponent {
  component_id: string
  kind: 'OPAQUE_PHYSICAL_COMPONENT'
  node_ids: string[]
  identity: 'UNKNOWN'
  package?: string
  observations?: string[]
  pins?: ObservedPinBinding[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExecutionDecision".
 */
export interface ExecutionDecision {
  schema_version: '1.0'
  decision: 'BLOCK_SAFETY' | 'BLOCK_UNEXECUTABLE' | 'RUN_NORMAL' | 'RUN_GUARDED'
  reasons: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ClockConfiguration".
 */
export interface ClockConfiguration {
  signal: string
  period_ns: number
  cycles: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "GeneratorConfiguration".
 */
export interface GeneratorConfiguration {
  channel: 1 | 2
  waveform: 'SINE' | 'SQUARE' | 'TRIANGLE' | 'RAMP' | 'PULSE' | 'ARBITRARY'
  frequency_hz: number
  amplitude_vpp: number
  offset_v: number
  phase_degrees?: number
  enabled: boolean
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CaptureConfiguration".
 */
export interface CaptureConfiguration {
  signals: string[]
  duration_ns: number
  max_events?: number
  trigger?: {
    signal: string
    edge: 'RISING' | 'FALLING' | 'ANY'
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SafetyVerificationResult".
 */
export interface SafetyVerificationResult {
  schema_version: '1.0'
  status: 'SAFE' | 'UNSAFE' | 'INDETERMINATE'
  issues: string[]
  observed_signals?: {
    signal: string
    time_ns: number
    value: 0 | 1
  }[]
  power_shorts?: SafetyEvidence[]
  hazardous_drive_conflicts?: SafetyEvidence[]
  protection_faults?: SafetyEvidence[]
  notes?: string[]
  over_current_risks?: SafetyEvidence[]
  invalid_voltage_risks?: SafetyEvidence[]
  polarity_errors?: SafetyEvidence[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SafetyEvidence".
 */
export interface SafetyEvidence {
  node_ids: string[]
  message?: string
  component_id?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "TopologyVerificationResult".
 */
export interface TopologyVerificationResult {
  schema_version: '1.0'
  status: 'MATCH' | 'MISMATCH' | 'UNKNOWN' | 'AMBIGUOUS'
  issues: string[]
  observed_signals?: {
    signal: string
    time_ns: number
    value: 0 | 1
  }[]
  missing_components?: ComponentDiagnostic[]
  unexpected_components?: ComponentDiagnostic[]
  unknown_components?: ComponentDiagnostic[]
  missing_nets?: NetDiagnostic[]
  unexpected_nets?: NetDiagnostic[]
  pin_mapping_issues?: PinMappingDiagnostic[]
  matched_components?: ComponentMatch[]
  matched_nets?: NetDiagnostic[]
  shorted_nets?: NetDiagnostic[]
  orientation_differences?: PinMappingDiagnostic[]
  pin_mapping_differences?: PinMappingDiagnostic[]
  confidence?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ComponentDiagnostic".
 */
export interface ComponentDiagnostic {
  identity: string
  component_id?: string
  count?: number
  package?: string
  notes?: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "NetDiagnostic".
 */
export interface NetDiagnostic {
  reference_nodes: string[]
  observed_nodes: string[]
  reference_pins: string[]
  observed_pins: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PinMappingDiagnostic".
 */
export interface PinMappingDiagnostic {
  reference_component_id: string
  observed_component_id: string
  pin_id: string
  reference_node_id?: string
  observed_node_id?: string
  issue: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ComponentMatch".
 */
export interface ComponentMatch {
  reference_component_id: string
  observed_component_id: string
  identity?: string
  confidence?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FunctionalVerificationResult".
 */
export interface FunctionalVerificationResult {
  schema_version: '1.0'
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NO_RESPONSE' | 'NOT_EVALUATED'
  issues: string[]
  observed_signals?: {
    signal: string
    time_ns: number
    value: 0 | 1 | 'X'
  }[]
  expected_signals?: DigitalObservation[]
  mismatched_signals?: SignalMismatch[]
  expected_truth_table?: {
    inputs: {
      [k: string]: 0 | 1
    }
    outputs: {
      [k: string]: 0 | 1
    }
  }[]
  observed_truth_table?: ObservedTruthTableCase[]
  timing_results?: TimingComparison[]
  waveform_comparisons?: WaveformComparison[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "DigitalObservation".
 */
export interface DigitalObservation {
  signal: string
  time_ns: number
  value: 0 | 1 | 'X'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SignalMismatch".
 */
export interface SignalMismatch {
  signal: string
  time_ns: number
  expected: 0 | 1
  observed: 0 | 1 | 'X' | null
  case_index?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ObservedTruthTableCase".
 */
export interface ObservedTruthTableCase {
  case_index: number
  inputs: {
    [k: string]: 0 | 1
  }
  outputs: {
    [k: string]: 0 | 1 | 'X' | null
  }
  time_ns: number
  status: 'PASS' | 'FAIL' | 'NO_RESPONSE'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "TimingComparison".
 */
export interface TimingComparison {
  signal: string
  expected_time_ns: number
  observed_time_ns: number | null
  tolerance_ns?: number
  status: 'PASS' | 'FAIL' | 'NO_RESPONSE'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "WaveformComparison".
 */
export interface WaveformComparison {
  signal: string
  expected: DigitalObservation[]
  observed: DigitalObservation[]
  status: 'PASS' | 'FAIL' | 'NO_RESPONSE'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CaptureResult".
 */
export interface CaptureResult {
  schema_version: '1.0'
  capture_id: string
  source: 'simulation' | 'hardware'
  instrument: 'logic_analyzer'
  encoding: 'digital_events'
  available: boolean
  duration_ns: number
  sample_count: number
  /**
   * @maxItems 100000
   */
  samples: DigitalObservation[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentRecord".
 */
export interface ExperimentRecord {
  schema_version: '1.0'
  experiment_id: string
  circuit_id: string
  station_id: string
  assignment_id: string | null
  mode: 'simulation' | 'hardware'
  state:
    | 'CREATED'
    | 'QUEUED'
    | 'RESERVED'
    | 'SAFE_STATE'
    | 'TOPOLOGY_SCAN'
    | 'SAFETY_CHECK'
    | 'EXECUTION_DECISION'
    | 'ROUTE_PREPARE'
    | 'GUARDED_POWER_UP'
    | 'READY'
    | 'ARMED'
    | 'RUNNING'
    | 'CAPTURING'
    | 'VERIFYING'
    | 'FUNCTIONAL_VERIFY'
    | 'STOPPING'
    | 'COMPLETE'
    | 'RELEASE'
    | 'FAULT'
  /**
   * @minItems 1
   */
  state_history: (
    | 'CREATED'
    | 'QUEUED'
    | 'RESERVED'
    | 'SAFE_STATE'
    | 'TOPOLOGY_SCAN'
    | 'SAFETY_CHECK'
    | 'EXECUTION_DECISION'
    | 'ROUTE_PREPARE'
    | 'GUARDED_POWER_UP'
    | 'READY'
    | 'ARMED'
    | 'RUNNING'
    | 'CAPTURING'
    | 'VERIFYING'
    | 'FUNCTIONAL_VERIFY'
    | 'STOPPING'
    | 'COMPLETE'
    | 'RELEASE'
    | 'FAULT'
  )[]
  revision: number
  execution_decision: ExecutionDecision | null
  safety_verification: SafetyVerificationResult | null
  topology_verification: TopologyVerificationResult | null
  functional_verification: FunctionalVerificationResult
  capture: CaptureMetadata | null
  error_code: string | null
  queue_position: number | null
  lease_expires_at: number | null
  topology_resolution?: TopologyResolutionResult | null
  assessment?: AssessmentResult | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CaptureMetadata".
 */
export interface CaptureMetadata {
  schema_version: '1.0'
  capture_id: string
  source: 'simulation' | 'hardware'
  available: boolean
  duration_ns: number
  sample_count: number
  instrument: 'logic_analyzer' | 'oscilloscope'
  encoding: 'digital_events' | 'INT16' | 'UINT16' | 'FLOAT32'
  channel_count: number
  payload_ref: string | null
  payload_byte_count: number
  sha256?: string | null
  timestamp_ns?: string
  sample_rate_hz?: number
  /**
   * @maxItems 4096
   */
  signals?: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "TopologyResolutionResult".
 */
export interface TopologyResolutionResult {
  schema_version: '1.0'
  status: 'RESOLVED' | 'PARTIAL' | 'AMBIGUOUS' | 'UNRESOLVED'
  component_matches: ComponentMatch[]
  endpoint_bindings: ResolvedEndpointBinding[]
  issues: string[]
  confidence?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ResolvedEndpointBinding".
 */
export interface ResolvedEndpointBinding {
  endpoint_id: string
  observed_node_id: string
  source: 'FIXED_NODE' | 'REFERENCE_TOPOLOGY' | 'COMPONENT_PIN' | 'DESIGN_PORT'
  confidence?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssessmentResult".
 */
export interface AssessmentResult {
  schema_version: '1.0'
  policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NO_RESPONSE' | 'NOT_EVALUATED'
  topology_evaluated: boolean
  function_evaluated: boolean
  issues: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "QueueState".
 */
export interface QueueState {
  schema_version: '1.0'
  station_id: string
  queued_count: number
  busy: boolean
  own_positions: {
    experiment_id: string
    position: number
  }[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentCapability".
 */
export interface InstrumentCapability {
  channels: number
  runtime_reconfiguration_supported: boolean
  status?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "GeneratorCapability".
 */
export interface GeneratorCapability {
  channels: number
  runtime_reconfiguration_supported: boolean
  status?: string
  /**
   * @minItems 1
   */
  supported_waveforms?: ('SINE' | 'SQUARE' | 'TRIANGLE' | 'RAMP' | 'PULSE' | 'ARBITRARY')[]
  frequency_min_hz?: number
  frequency_max_hz?: number
  amplitude_max_vpp?: number
  offset_min_v?: number
  offset_max_v?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentCapabilities".
 */
export interface InstrumentCapabilities {
  logic_analyzer: InstrumentCapability
  oscilloscope: InstrumentCapability
  generator: GeneratorCapability
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "WirePoint3".
 */
export interface WirePoint3 {
  x: number
  y: number
  z: number
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "WireVisual".
 */
export interface WireVisual {
  version: 1
  color: string
  routeMode: WireRouteMode
  controlPoints: WireControlPoint[]
  thickness: number
  height?: number
  layer?: number
  frameModuleId?: string | null
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "TestVector".
 */
export interface TestVector {
  time_ns: number
  inputs: {
    [k: string]: 0 | 1
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "HealthResponse".
 */
export interface HealthResponse {
  status: 'ok'
  service: 'netcircuit-api'
  hardware_mode: 'simulation' | 'hardware'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitValidationResult".
 */
export interface CircuitValidationResult {
  valid: boolean
  code: string
  message: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PhysicalDeviceState".
 */
export interface PhysicalDeviceState {
  state: 'POWERED' | 'UNPOWERED' | 'FAULT' | 'UNSUPPORTED' | 'ON' | 'OFF' | 'UNKNOWN' | 'PASSIVE'
  model?: string | null
  reason?: string | null
  voltage?: number | null
  resistanceOhms?: number | null
  currentAmps?: number | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PhysicalPreviewResult".
 */
export interface PhysicalPreviewResult {
  device_states: {
    [k: string]: PhysicalDeviceState
  }
  pin_values: {
    [k: string]: 0 | 1 | 'X'
  }
  diagnostics: string[]
  provenance?: 'simulation_preview'
  limitations?: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PublicStationCapabilities".
 */
export interface PublicStationCapabilities {
  schema_version: '1.0'
  station_id: string
  mode: 'simulation' | 'hardware'
  available: boolean
  virtual_digital: boolean
  virtual_analog: boolean
  physical_digital: boolean
  physical_analog_routing: boolean
  physical_execution_slots: number
  topology_scan_supported: boolean
  safety_gate_supported: boolean
  guarded_run_supported: boolean
  component_resolution_modes: ('AUTO_DISCOVERY' | 'INSTRUCTOR_PROFILE' | 'HYBRID')[]
  breadboards?: {
    id: string
    model: string
  }[]
  hardware_rpc_version: string
  fpga_protocol_version: string
  firmware_version: string
  hardware_profile_version: string
  instrument_capabilities: InstrumentCapabilities
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "StationDescriptor".
 */
export interface StationDescriptor {
  station_id: string
  mode: 'simulation' | 'hardware'
  state: 'ready' | 'unavailable' | 'busy' | 'error'
  capabilities: PublicStationCapabilities
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "TriggerConfiguration".
 */
export interface TriggerConfiguration {
  signal: string
  edge: 'RISING' | 'FALLING' | 'ANY'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentOperationResult".
 */
export interface InstrumentOperationResult {
  accepted: boolean
  code: string
  status: 'ACCEPTED' | 'APPLIED' | 'FAILED'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FieldIssue".
 */
export interface FieldIssue {
  code: string
  path: string
  severity: 'error' | 'warning' | 'info'
  profile: string
  message: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ErrorEnvelope".
 */
export interface ErrorEnvelope {
  code: string
  message: string
  request_id: string
  issues?: FieldIssue[]
  operation_key?: string
  current_revision?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "OperationRecord".
 */
export interface OperationRecord {
  schema_version: '1.0'
  operation_key: string
  kind: 'create' | 'run' | 'stop'
  status: 'REQUESTED' | 'ACCEPTED' | 'APPLIED' | 'FAILED'
  experiment_id: string | null
  error_code: string | null
  revision: number
  experiment?: ExperimentRecord
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "HelloEvent".
 */
export interface HelloEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id?: string
  aggregate_revision?: number
  correlation_id?: string
  type: 'hello'
  service: string
  resync_required: boolean
  /**
   * @minItems 1
   */
  supported_protocol_versions: '1.0'[]
  capabilities: {
    snapshot_resync: true
    ordered_stream: true
    replay_commands: false
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "EchoEvent".
 */
export interface EchoEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id?: string
  aggregate_revision?: number
  correlation_id?: string
  type: 'echo'
  payload: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "StationUpdatedEvent".
 */
export interface StationUpdatedEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id?: string
  aggregate_revision?: number
  correlation_id?: string
  type: 'station.updated'
  station: StationDescriptor
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentUpdatedEvent".
 */
export interface ExperimentUpdatedEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id: string
  aggregate_revision: number
  correlation_id?: string
  type: 'experiment.updated'
  experiment: ExperimentRecord
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ResyncEvent".
 */
export interface ResyncEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id?: string
  aggregate_revision?: number
  correlation_id?: string
  type: 'resync.required'
  reason: 'QUEUE_OVERFLOW' | 'STREAM_RESET' | 'SEQUENCE_GAP' | 'PROTOCOL_MISMATCH' | 'INVALID_EVENT'
  dropped_events?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProtocolErrorEvent".
 */
export interface ProtocolErrorEvent {
  protocol_version: '1.0'
  stream_id: string
  sequence: number
  aggregate_id?: string
  aggregate_revision?: number
  correlation_id?: string
  type: 'protocol.error'
  code: 'UNSUPPORTED_VERSION' | 'INVALID_MESSAGE'
  message: string
  retryable: boolean
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ClientHelloMessage".
 */
export interface ClientHelloMessage {
  type: 'client.hello'
  protocol_version: string
  /**
   * Non-secret, volatile per-tab control context. Bound to the authenticated server session; never an authentication token. Omit for a view-only stream.
   */
  control_client_id?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PrincipalView".
 */
export interface PrincipalView {
  principal_id: string
  kind: 'USER' | 'GUEST'
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'
  username?: string
  display_name?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SessionView".
 */
export interface SessionView {
  schema_version: '1.0'
  authenticated: boolean
  principal: PrincipalView | null
  csrf_token: string
  expires_at: number
  guest_enabled: boolean
  claim_available: boolean
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "LoginRequest".
 */
export interface LoginRequest {
  username: string
  password: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "LogoutRequest".
 */
export interface LogoutRequest {}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "GuestClaimRequest".
 */
export interface GuestClaimRequest {
  confirm: true
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "UserView".
 */
export interface UserView {
  principal_id: string
  username: string
  display_name: string
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'
  active: boolean
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "UserCreate".
 */
export interface UserCreate {
  username: string
  password: string
  display_name: string
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "UserUpdate".
 */
export interface UserUpdate {
  role?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'
  active?: boolean
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentPublication".
 */
export interface AssignmentPublication {
  published: boolean
  feedback_policy?: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstructorAssignmentDocument".
 */
export interface InstructorAssignmentDocument {
  schema_version: '1.0'
  assignment_id: string
  title: string
  reference_design_graph?: ReferenceDesignGraph
  reference_topology_graph?: DetectedTopologyGraph
  expected_component_set?: ExpectedComponentSet
  instructor_pin_profiles?: InstructorPinProfiles
  lab_endpoints: LabEndpoints
  expected_behavior?: ExpectedBehavior
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  component_resolution_mode?: 'AUTO_DISCOVERY' | 'INSTRUCTOR_PROFILE' | 'HYBRID'
  document_kind: 'instructor'
  owner_id: string
  published: boolean
  feedback_policy: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "StudentAssignmentView".
 */
export interface StudentAssignmentView {
  schema_version: '1.0'
  assignment_id: string
  title: string
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  lab_endpoints: {
    endpoint_id: string
    role: 'INPUT_SOURCE' | 'OUTPUT_SENSE' | 'CLOCK' | 'VCC' | 'GND' | 'GENERATOR' | 'SCOPE' | 'LOGIC_ANALYZER'
    channel?: number
    required?: boolean
  }[]
  document_kind: 'student'
  published: true
  feedback_policy: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "Project".
 */
export interface Project {
  schema_version: '1.0'
  project_id: string
  owner_id: string
  name: string
  description: string
  revision: number
  created_at: number
  updated_at: number
  access_scope: 'private'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProjectPage".
 */
export interface ProjectPage {
  schema_version: '1.0'
  /**
   * @maxItems 100
   */
  items: Project[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProjectCreate".
 */
export interface ProjectCreate {
  name: string
  description?: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProjectDelete".
 */
export interface ProjectDelete {
  base_revision: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ProjectDeletion".
 */
export interface ProjectDeletion {
  schema_version: '1.0'
  project_id: string
  deleted: true
  revision: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitSummary".
 */
export interface CircuitSummary {
  schema_version: '1.0'
  document_id: string
  project_id: string
  owner_id: string
  name: string
  graph_schema_version: '1.0' | '1.1'
  revision: number
  created_at: number
  updated_at: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitDocument".
 */
export interface CircuitDocument {
  schema_version: '1.0'
  document_id: string
  project_id: string
  owner_id: string
  name: string
  graph_schema_version: '1.0' | '1.1'
  revision: number
  created_at: number
  updated_at: number
  graph: CircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitPage".
 */
export interface CircuitPage {
  schema_version: '1.0'
  /**
   * @maxItems 100
   */
  items: CircuitSummary[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitCreate".
 */
export interface CircuitCreate {
  name: string
  graph: CircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitSave".
 */
export interface CircuitSave {
  base_revision: number
  name: string
  graph: CircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitDelete".
 */
export interface CircuitDelete {
  base_revision: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitDeletion".
 */
export interface CircuitDeletion {
  schema_version: '1.0'
  document_id: string
  deleted: true
  revision: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringSummary".
 */
export interface AssignmentAuthoringSummary {
  schema_version: '1.0'
  assignment_id: string
  title: string
  owner_id: string
  revision: number
  published: boolean
  published_revision: number | null
  feedback_policy: 'observed_only' | 'detailed'
  created_at: number
  updated_at: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringDocument".
 */
export interface AssignmentAuthoringDocument {
  schema_version: '1.0'
  assignment_id: string
  title: string
  owner_id: string
  revision: number
  published: boolean
  published_revision: number | null
  feedback_policy: 'observed_only' | 'detailed'
  created_at: number
  updated_at: number
  definition: AssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringPage".
 */
export interface AssignmentAuthoringPage {
  schema_version: '1.0'
  items: AssignmentAuthoringSummary[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringCreate".
 */
export interface AssignmentAuthoringCreate {
  definition: AssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringSave".
 */
export interface AssignmentAuthoringSave {
  base_revision: number
  definition: AssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringPublication".
 */
export interface AssignmentAuthoringPublication {
  base_revision: number
  published: boolean
  feedback_policy?: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentHistoryPage".
 */
export interface ExperimentHistoryPage {
  schema_version: '1.0'
  /**
   * @maxItems 100
   */
  items: ExperimentRecord[]
  next_cursor: string | null
}
/**
 * Owner-scoped active, unstarted and quarantined records. Admitted executions precede CREATED records. Follow next_cursor explicitly; snapshots never authorize control or replay execution.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ExperimentActiveSnapshot".
 */
export interface ExperimentActiveSnapshot {
  schema_version: '1.0'
  /**
   * @maxItems 100
   */
  items: ExperimentRecord[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentControlAccess".
 */
export interface InstrumentControlAccess {
  schema_version: '1.0'
  experiment_id: string
  revision: number
  can_configure_generator: boolean
  /**
   * @maxItems 2
   */
  generator_channels: (1 | 2)[]
  reason:
    | 'READY'
    | 'NOT_RUNNING'
    | 'CONTROL_CONTEXT_REQUIRED'
    | 'LEASE_UNAVAILABLE'
    | 'GENERATOR_UNAVAILABLE'
    | 'RUNTIME_CONFIGURATION_UNSUPPORTED'
    | 'NO_ALLOCATED_CHANNEL'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentGeneratorCommand".
 */
export interface InstrumentGeneratorCommand {
  configuration: GeneratorConfiguration
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstrumentCommandRecord".
 */
export interface InstrumentCommandRecord {
  schema_version: '1.0'
  experiment_id: string
  operation_key: string
  status: 'REQUESTED' | 'ACCEPTED' | 'APPLIED' | 'FAILED'
  revision: number
  accepted: boolean
  hardware_applied: boolean
  error_code: string | null
  configuration: GeneratorConfiguration
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SignalPortDefinition".
 */
export interface SignalPortDefinition {
  id: string
  direction: 'input' | 'output' | 'inout'
  width?: number
  domain?: SignalDomain
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SignalDomainNamespace".
 */
export interface SignalDomainNamespace {
  version: '1.0'
  ports: {
    [k: string]: SignalDomain
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationClassification".
 */
export interface SimulationClassification {
  schema_version: '1.0'
  kind: 'DIGITAL' | 'DC_DIGITAL' | 'ANALOG' | 'MIXED' | 'UNKNOWN'
  domains: SignalDomain[]
  unsupported_components: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationRequest".
 */
export interface SimulationRequest {
  schema_version: '1.0'
  graph: CircuitGraph
  capture_config: CaptureConfiguration
  test_vectors?: TestVector[]
  clock_config?:
    | {
        [k: string]: unknown
      }
    | ClockConfiguration
  inputs?: {
    [k: string]: 0 | 1
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationCapture".
 */
export interface SimulationCapture {
  available: boolean
  state: 'COMPLETE' | 'STOPPED'
  duration_ns: number
  /**
   * @maxItems 100000
   */
  samples: DigitalObservation[]
  device_states?: {
    [k: string]: PhysicalDeviceState
  }
  pin_values?: {
    [k: string]: 0 | 1 | 'X'
  }
  diagnostics?: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationResult".
 */
export interface SimulationResult {
  schema_version: '1.0'
  status: 'COMPLETE'
  classification: SimulationClassification
  capture: SimulationCapture
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationErrorResult".
 */
export interface SimulationErrorResult {
  schema_version: '1.0'
  status: 'UNAVAILABLE' | 'REJECTED'
  classification: SimulationClassification
  code: string
  message: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureChannel".
 */
export interface AnalogCaptureChannel {
  id: string
  unit: string
  scale: number
  offset: number
  range_min: number
  range_max: number
  calibration_id: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureTimeAxis".
 */
export interface AnalogCaptureTimeAxis {
  reference: 'capture_relative' | 'unix_epoch' | 'device_clock'
  clock_id: string | null
  anchor_ns: string
  sample_rate_hz: {
    numerator: number
    denominator: number
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureGap".
 */
export interface AnalogCaptureGap {
  at_frame: number
  missing_frames: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureInvalidRange".
 */
export interface AnalogCaptureInvalidRange {
  first_frame: number
  frame_count: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureQuality".
 */
export interface AnalogCaptureQuality {
  status: 'VALID' | 'PARTIAL' | 'INVALID' | 'LOSS'
  termination_reason:
    'COMPLETE' | 'STOPPED' | 'DURATION_LIMIT' | 'BUFFER_LIMIT' | 'TRANSPORT_LOSS' | 'DRIVER_ERROR' | 'UNKNOWN'
  lost_frames: number
  /**
   * @minItems 0
   * @maxItems 256
   */
  gaps: AnalogCaptureGap[]
  /**
   * @minItems 0
   * @maxItems 256
   */
  invalid_ranges: AnalogCaptureInvalidRange[]
  /**
   * @minItems 0
   * @maxItems 8
   */
  clipped_channels: string[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureHeader".
 */
export interface AnalogCaptureHeader {
  format: 'NCAP_SAMPLED_V2'
  capture_id: string
  generation: number
  source: 'simulation' | 'hardware'
  provenance: 'measured' | 'synthetic_fixture'
  instrument: 'oscilloscope'
  encoding: 'INT16' | 'UINT16' | 'FLOAT32'
  byte_order: 'little'
  layout: 'frame_interleaved'
  frame_count: number
  /**
   * @minItems 1
   * @maxItems 8
   */
  channels: AnalogCaptureChannel[]
  time_axis: AnalogCaptureTimeAxis
  quality: AnalogCaptureQuality
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AnalogCaptureDescriptor".
 */
export interface AnalogCaptureDescriptor {
  schema_version: '2.0'
  header: AnalogCaptureHeader
  payload_byte_count: number
  sha256: string
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "NCAPLayout".
 */
export interface NCAPLayout {
  schema_version: '1.0'
  prefix: {
    magic_hex: string
    struct_format: string
    byte_length: number
    version_offset: number
    header_length_offset: number
    byte_order: string
  }
  max_header_bytes: number
  digital_v1: {
    version: number
    encoding: string
    struct_format: string
    record_bytes: number
    channel_offset: number
    time_offset: number
    value_offset: number
    max_events: number
    max_channels: number
    max_time_ns: number
    unknown_value_code: number
  }
  sampled_v2: {
    version: number
    layout: string
    byte_order: string
    max_frames: number
    max_channels: number
    max_gaps: number
    max_invalid_ranges: number
    max_lost_frames: number
    max_rate_term: number
    encodings: {
      INT16: {
        struct_format: string
        bytes_per_value: number
      }
      UINT16: {
        struct_format: string
        bytes_per_value: number
      }
      FLOAT32: {
        struct_format: string
        bytes_per_value: number
      }
    }
  }
}
/**
 * Authoritative body-center pose in board-local world units; rotation is degrees in fixed Euler YXZ order (Ry * Rx * Rz). No scale.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "BodyPose3D".
 */
export interface BodyPose3D {
  position: Point3
  rotation: {
    x: number
    y: number
    z: number
  }
}
/**
 * Ordered board-local world-space bend intent from body exit toward the named contact; endpoints derive from the descriptor and contact.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FlexibleLeadIntent".
 */
export interface FlexibleLeadIntent {
  pinId: string
  /**
   * @maxItems 8
   */
  controlPoints: Point3[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FlexibleMountV1".
 */
export interface FlexibleMountV1 {
  kind: 'breadboard-flexible'
  version: 1
  boardId: string
  partId: string
  partRevision: number
  packageId: string
  packageRevision: number
  mechanicalProfileId: string
  mechanicalProfileRevision: number
  geometryRevision: 1
  bodyPose: BodyPose3D
  /**
   * @minItems 2
   * @maxItems 2
   */
  contacts: PinContactBinding[]
  /**
   * @minItems 2
   * @maxItems 2
   */
  leads: FlexibleLeadIntent[]
}
/**
 * Versioned authoring limits and body exits. These are design geometry limits, not observed hardware ratings or safety evidence.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "MechanicalAuthoringProfileV1".
 */
export interface MechanicalAuthoringProfileV1 {
  id: string
  revision: number
  packageId: string
  packageRevision: number
  strategy: 'axial' | 'radial'
  bodyOrigin: 'center'
  /**
   * @minItems 2
   * @maxItems 2
   */
  pins: MechanicalBodyExitV1[]
  minLeadLengthMm: number
  maxLeadLengthMm: number
  contactStubMm: number
  exitStraightMm: number
  minBendRadiusMm: number
  bodyClearanceMm: number
  maxBodyLiftMm: number
  maxControlsPerLead: 8
  /**
   * Preferred circular display radius; minimum remains the physical lower bound. Omitted historical profiles use minBendRadiusMm.
   */
  preferredBendRadiusMm?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "MechanicalBodyExitV1".
 */
export interface MechanicalBodyExitV1 {
  pinId: string
  bodyExitMm: Point3
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "ComponentDesignPropertiesV1".
 */
export interface ComponentDesignPropertiesV1 {
  resistanceOhms?: number
  powerWatts?: number
  tolerancePercent?: number
  capacitanceFarads?: number
  voltageRatingVolts?: number
  capacitorType?: 'CERAMIC' | 'ELECTROLYTIC'
  buzzerType?: 'PASSIVE' | 'ACTIVE'
  transistorType?: 'NPN' | 'PNP'
  forwardVoltageVolts?: number
  leakageCurrentAmps?: number
  zenerVoltageVolts?: number
  maxCurrentAmps?: number
  color?: string
  [k: string]: unknown
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FlexibleMechanicsCatalog".
 */
export interface FlexibleMechanicsCatalog {
  schema_version: '1.0'
  units: 'mm'
  profiles: MechanicalAuthoringProfileV1[]
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitGraphV12".
 */
export interface CircuitGraphV12 {
  schema_version: '1.2'
  circuit_id: string
  /**
   * @maxItems 2000
   */
  modules: CircuitModuleV12[]
  /**
   * @maxItems 10000
   */
  connections: CircuitConnection[]
  metadata?: {
    [k: string]: unknown
  }
}
/**
 * Explicitly generated circular routing. Historical version 1 body poses and controls remain authoritative and are never inferred to be automatic.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "FlexibleMountV2".
 */
export interface FlexibleMountV2 {
  kind: 'breadboard-flexible'
  version: 2
  boardId: string
  partId: string
  partRevision: number
  packageId: string
  packageRevision: number
  mechanicalProfileId: string
  mechanicalProfileRevision: number
  geometryRevision: 2
  bodyPose: BodyPose3D
  /**
   * @minItems 2
   * @maxItems 2
   */
  contacts: PinContactBinding[]
  /**
   * @minItems 2
   * @maxItems 2
   */
  leads: FlexibleLeadIntent[]
  routing: AutomaticRoutingIntentV1
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AutomaticRoutingIntentV1".
 */
export interface AutomaticRoutingIntentV1 {
  version: 1
  mode: 'automatic'
  template: 'axial-standing' | 'axial-horizontal' | 'radial-upright'
}
/**
 * Explicit descriptor identity for new unmounted physical parts; missing historical modules retain their original descriptor.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PhysicalDescriptorV1".
 */
export interface PhysicalDescriptorV1 {
  version: 1
  partId: string
  partRevision: number
  packageId: string
  packageRevision: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitSummaryV2".
 */
export interface CircuitSummaryV2 {
  schema_version: '2.0'
  document_id: string
  project_id: string
  owner_id: string
  name: string
  graph_schema_version: '1.0' | '1.1' | '1.2'
  revision: number
  created_at: number
  updated_at: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitDocumentV2".
 */
export interface CircuitDocumentV2 {
  schema_version: '2.0'
  document_id: string
  project_id: string
  owner_id: string
  name: string
  graph_schema_version: '1.0' | '1.1' | '1.2'
  revision: number
  created_at: number
  updated_at: number
  graph: AnySupportedCircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitPageV2".
 */
export interface CircuitPageV2 {
  schema_version: '2.0'
  /**
   * @maxItems 100
   */
  items: CircuitSummaryV2[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitCreateV2".
 */
export interface CircuitCreateV2 {
  name: string
  graph: AnySupportedCircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "CircuitSaveV2".
 */
export interface CircuitSaveV2 {
  base_revision: number
  name: string
  graph: AnySupportedCircuitGraph
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "SimulationRequestV2".
 */
export interface SimulationRequestV2 {
  schema_version: '2.0'
  graph: AnySupportedCircuitGraph
  capture_config: CaptureConfiguration
  test_vectors?: TestVector[]
  clock_config?:
    | {
        [k: string]: unknown
      }
    | ClockConfiguration
  inputs?: {
    [k: string]: 0 | 1
  }
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentDefinitionV2".
 */
export interface AssignmentDefinitionV2 {
  schema_version: '2.0'
  assignment_id: string
  title: string
  reference_design_graph?: AnySupportedCircuitGraph
  reference_topology_graph?: DetectedTopologyGraph
  expected_component_set?: ExpectedComponentSet
  instructor_pin_profiles?: InstructorPinProfiles
  lab_endpoints: LabEndpoints
  expected_behavior?: ExpectedBehavior
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  component_resolution_mode?: 'AUTO_DISCOVERY' | 'INSTRUCTOR_PROFILE' | 'HYBRID'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringSummaryV2".
 */
export interface AssignmentAuthoringSummaryV2 {
  schema_version: '2.0'
  assignment_id: string
  title: string
  owner_id: string
  revision: number
  published: boolean
  published_revision: number | null
  feedback_policy: 'observed_only' | 'detailed'
  created_at: number
  updated_at: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringDocumentV2".
 */
export interface AssignmentAuthoringDocumentV2 {
  schema_version: '2.0'
  assignment_id: string
  title: string
  owner_id: string
  revision: number
  published: boolean
  published_revision: number | null
  feedback_policy: 'observed_only' | 'detailed'
  created_at: number
  updated_at: number
  definition: AnySupportedAssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringPageV2".
 */
export interface AssignmentAuthoringPageV2 {
  schema_version: '2.0'
  items: AssignmentAuthoringSummaryV2[]
  next_cursor: string | null
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringCreateV2".
 */
export interface AssignmentAuthoringCreateV2 {
  definition: AnySupportedAssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringSaveV2".
 */
export interface AssignmentAuthoringSaveV2 {
  base_revision: number
  definition: AnySupportedAssignmentDefinition
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "AssignmentAuthoringPublicationV2".
 */
export interface AssignmentAuthoringPublicationV2 {
  base_revision: number
  published: boolean
  feedback_policy?: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "InstructorAssignmentDocumentV2".
 */
export interface InstructorAssignmentDocumentV2 {
  schema_version: '1.0' | '2.0'
  assignment_id: string
  title: string
  reference_design_graph?: AnySupportedCircuitGraph
  reference_topology_graph?: DetectedTopologyGraph
  expected_component_set?: ExpectedComponentSet
  instructor_pin_profiles?: InstructorPinProfiles
  lab_endpoints: LabEndpoints
  expected_behavior?: ExpectedBehavior
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  component_resolution_mode?: 'AUTO_DISCOVERY' | 'INSTRUCTOR_PROFILE' | 'HYBRID'
  document_kind: 'instructor'
  owner_id: string
  published: boolean
  feedback_policy: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "StudentAssignmentViewV2".
 */
export interface StudentAssignmentViewV2 {
  schema_version: '1.0' | '2.0'
  assignment_id: string
  title: string
  assessment_policy: 'STRICT_TOPOLOGY' | 'FUNCTIONAL_ONLY' | 'TOPOLOGY_AND_FUNCTION'
  lab_endpoints: {
    endpoint_id: string
    role: 'INPUT_SOURCE' | 'OUTPUT_SENSE' | 'CLOCK' | 'VCC' | 'GND' | 'GENERATOR' | 'SCOPE' | 'LOGIC_ANALYZER'
    channel?: number
    required?: boolean
  }[]
  document_kind: 'student'
  published: true
  feedback_policy: 'observed_only' | 'detailed'
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PackageLeadSectionV1".
 */
export interface PackageLeadSectionV1 {
  kind: 'round' | 'rectangular' | 'stamped'
  widthMm: number
  thicknessMm: number
  shoulderWidthMm?: number
}
/**
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PackageLeadExitV1".
 */
export interface PackageLeadExitV1 {
  pinId: string
  positionMm: Point3
  normal: Point3
}
/**
 * Versioned model geometry in centered body-local millimetres. Body envelope, contact tips, exits and the hidden interior embed remain distinct; no electrical or safety capability is implied.
 *
 * This interface was referenced by `ContractMap`'s JSON-Schema
 * via the `definition` "PackageShapeV1".
 */
export interface PackageShapeV1 {
  version: 1
  family: 'resistor' | 'diode' | 'zener' | 'ceramic' | 'electrolytic' | 'led' | 'dip' | 'to92'
  embeddedDepthMm: number
  leadSection: PackageLeadSectionV1
  /**
   * @minItems 2
   * @maxItems 64
   */
  leadExits: PackageLeadExitV1[]
  lensDiameterMm?: number
  flangeDiameterMm?: number
  flangeHeightMm?: number
  domeRadiusMm?: number
  bevelMm?: number
}
