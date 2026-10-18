import type { ContractMap, GeneratorCapability, InstrumentCapabilities, LabEndpoint, ObservedPhysicalComponent } from './generated/dto'
import { contractIssue, ContractValidationError, parseStructural, type ValidationProfile } from './structural'
import { normalizeCircuitDocument, validateCircuitDocument } from '../domain/document/circuitFile'
import { validateSignalDomains } from '../electrical/signalDomains'
import { validateAnalogCapture } from '../domain/capture/validation'
import { validateLabelAnnotations } from './labelValidation'

export { ContractValidationError, type ContractIssue, type ValidationProfile } from './structural'

function unique<T, K extends keyof T>(entries: T[], key: K, path: string, profile: ValidationProfile) {
  const seen = new Set<T[K]>()
  entries.forEach((entry, index) => {
    if (seen.has(entry[key])) contractIssue(`Duplicate ${String(key)}.`, `${path}/${index}/${String(key)}`, 'DUPLICATE_ID', profile)
    seen.add(entry[key])
  })
}

function endpoint(value: LabEndpoint, path: string, profile: ValidationProfile) {
  if (['node_id', 'fixed_node_id', 'reference_node_id', 'design_port'].filter(key => key in value).length > 1) {
    contractIssue('Endpoint binding forms are mutually exclusive.', path, 'ENDPOINT_BINDING_CONFLICT', profile)
  }
}

function component(value: ObservedPhysicalComponent, path: string, profile: ValidationProfile) {
  if (value.kind === 'OPAQUE_PHYSICAL_COMPONENT' && value.identity !== 'UNKNOWN') contractIssue('Opaque identity must be UNKNOWN.', `${path}/identity`, 'OPAQUE_IDENTITY', profile)
  unique(value.pins ?? [], 'pin_id', `${path}/pins`, profile)
}

function generator(capability: GeneratorCapability, path: string, profile: ValidationProfile) {
  for (const [lower, upper] of [['frequency_min_hz', 'frequency_max_hz'], ['offset_min_v', 'offset_max_v']] as const) {
    if (capability[lower] !== undefined && capability[upper] !== undefined && capability[lower]! > capability[upper]!) contractIssue('Generator profile limits are inconsistent.', `${path}/${lower}`, 'PROFILE_LIMIT_ORDER', profile)
  }
  const waveforms = capability.supported_waveforms ?? []
  if (new Set(waveforms).size !== waveforms.length) contractIssue('Generator supported waveforms must be unique.', `${path}/supported_waveforms`, 'DUPLICATE_WAVEFORM', profile)
}

function instruments(value: InstrumentCapabilities, path: string, profile: ValidationProfile) { generator(value.generator, `${path}/generator`, profile) }

function finite(value: unknown, path: string, profile: ValidationProfile, ancestors = new Set<object>()) {
  if (typeof value === 'number' && !Number.isFinite(value)) contractIssue('Nonfinite numeric value.', path, 'NONFINITE_NUMBER', profile)
  if (value === null || typeof value !== 'object') return
  if (ancestors.has(value)) contractIssue('A contract document cannot contain cyclic references.', path, 'CYCLIC_DOCUMENT', profile)
  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) finite(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, profile, ancestors)
  ancestors.delete(value)
}

/** Shape comes from generated validators; only explicit shared relationships live here. */
export function parseLab<K extends keyof ContractMap>(name: K, value: unknown, profile: ValidationProfile = 'transport'): ContractMap[K] {
  const data = parseStructural(name, value, profile)
  finite(data, '', profile)
  validateSignalDomains(name,data,profile)
  validateLabelAnnotations(name,data,profile)
  if (name === 'PublicStationCapabilities') instruments((data as ContractMap['PublicStationCapabilities']).instrument_capabilities, '/instrument_capabilities', profile)
  if (name === 'StationDescriptor') {
    const descriptor=data as ContractMap['StationDescriptor']
    try { parseLab('PublicStationCapabilities',descriptor.capabilities,profile) }
    catch(error) { prefix(error,'/capabilities') }
    if(descriptor.station_id!==descriptor.capabilities.station_id||descriptor.mode!==descriptor.capabilities.mode) contractIssue('Station descriptor and capabilities disagree.','/capabilities','STATION_IDENTITY_MISMATCH',profile)
  }
  if (name === 'OperationRecord' && (data as ContractMap['OperationRecord']).experiment!==undefined) {
    try { parseLab('ExperimentRecord',(data as ContractMap['OperationRecord']).experiment,profile) }
    catch(error) { prefix(error,'/experiment') }
  }
  if (name === 'InstrumentCapabilities') instruments(data as ContractMap['InstrumentCapabilities'], '', profile)
  if (name === 'GeneratorCapability') generator(data as ContractMap['GeneratorCapability'], '', profile)
  if (name === 'InstrumentControlAccess') {
    const access=data as ContractMap['InstrumentControlAccess'],ready=access.reason==='READY'
    if(access.can_configure_generator!==ready||!!access.generator_channels.length!==ready)contractIssue('Control access requires ready allocated context.','/can_configure_generator','CONTROL_ACCESS_MISMATCH',profile)
  }
  if (name === 'InstrumentCommandRecord') {
    const record=data as ContractMap['InstrumentCommandRecord'],status=record.status
    const valid=record.accepted===['ACCEPTED','APPLIED'].includes(status)&&record.hardware_applied===(status==='APPLIED')
      &&(status==='FAILED'?record.error_code!==null:status==='REQUESTED'?record.error_code===null||record.error_code==='ACKNOWLEDGEMENT_UNKNOWN':record.error_code===null)
      &&(status==='REQUESTED'||record.revision>=1)
    if(!valid)contractIssue('Acknowledgement status and evidence disagree.','/status','ACKNOWLEDGEMENT_MISMATCH',profile)
  }
  if (name === 'ExperimentHistoryPage' || name === 'ExperimentActiveSnapshot') {
    const page=data as ContractMap['ExperimentHistoryPage']
    unique(page.items,'experiment_id','/items',profile)
    page.items.forEach((entry,index)=>{
      try { parseLab('ExperimentRecord',entry,profile) }
      catch(error) { prefix(error,`/items/${index}`) }
    })
  }
  if (name === 'ExperimentRecord') {
    const record = data as ContractMap['ExperimentRecord']
    if (record.state_history.at(-1) !== record.state) contractIssue('Experiment state/history disagree.', '/state_history', 'STATE_HISTORY_MISMATCH', profile)
    if (record.capture !== null) {
      try { parseLab('CaptureMetadata', record.capture, profile) }
      catch (error) { prefix(error, '/capture') }
    }
  }
  if (name === 'AnalogCaptureDescriptor' || name === 'AnalogCaptureHeader' || name === 'AnalogCaptureChannel' || name === 'AnalogCaptureQuality' || name === 'AnalogCaptureTimeAxis') validateAnalogCapture(name,data,profile)
  if (name === 'CaptureMetadata') {
    const capture = data as ContractMap['CaptureMetadata'], signals = capture.signals
    if (capture.instrument === 'logic_analyzer' && capture.encoding !== 'digital_events' || capture.instrument === 'oscilloscope' && capture.encoding === 'digital_events') contractIssue('Capture instrument/encoding disagree.', '/encoding', 'CAPTURE_ENCODING_MISMATCH', profile)
    if (signals && (new Set(signals).size !== signals.length || signals.length !== capture.channel_count)) contractIssue('Capture channels are inconsistent.', '/signals', 'CAPTURE_CHANNEL_MISMATCH', profile)
    if (capture.available && (capture.payload_ref === null || capture.payload_byte_count <= 0) || !capture.available && (capture.payload_ref !== null || capture.payload_byte_count !== 0 || capture.sha256 != null)) contractIssue('Capture availability is inconsistent.', '/available', 'CAPTURE_AVAILABILITY_MISMATCH', profile)
    if (capture.encoding === 'digital_events' && (capture.sample_count > 100000 || capture.channel_count > 4096 || capture.payload_byte_count > 9 + 65536 + 100000 * 11)) contractIssue('Capture exceeds NCAP v1 digital limits.', '', 'CAPTURE_PAYLOAD_LIMIT', profile)
  }
  if (name === 'CaptureResult') {
    const capture = data as ContractMap['CaptureResult']
    if (capture.sample_count !== capture.samples.length) contractIssue('Capture metadata does not match samples.', '/sample_count', 'CAPTURE_COUNT_MISMATCH', profile)
    capture.samples.forEach((sample, index) => {
      if (sample.time_ns > capture.duration_ns) contractIssue('Capture sample exceeds declared duration.', `/samples/${index}/time_ns`, 'CAPTURE_TIME_OUTSIDE_DURATION', profile)
    })
  }
  if (name === 'AssignmentAuthoringCreate' || name === 'AssignmentAuthoringSave' || name === 'AssignmentAuthoringDocument' || name === 'AssignmentAuthoringCreateV2' || name === 'AssignmentAuthoringSaveV2' || name === 'AssignmentAuthoringDocumentV2') {
    try { parseLab(name.endsWith('V2')?'AnySupportedAssignmentDefinition':'AssignmentDefinition',(data as ContractMap['AssignmentAuthoringCreateV2']).definition,profile) }
    catch(error) { prefix(error,'/definition') }
  }
  if (name === 'AssignmentAuthoringSummary' || name === 'AssignmentAuthoringDocument' || name === 'AssignmentAuthoringSummaryV2' || name === 'AssignmentAuthoringDocumentV2') {
    const document=data as ContractMap['AssignmentAuthoringSummaryV2'],selected=document.published_revision
    if ((selected===null)===document.published || selected!==null && selected>document.revision) contractIssue('The published revision is inconsistent with the authoring head.','/published_revision','ASSIGNMENT_PUBLICATION_MISMATCH',profile)
    if(name==='AssignmentAuthoringDocument' || name==='AssignmentAuthoringDocumentV2') {
      const definition=(data as ContractMap['AssignmentAuthoringDocumentV2']).definition
      if(document.assignment_id!==definition.assignment_id) contractIssue('Assignment identity differs from its definition.','/definition/assignment_id','ASSIGNMENT_ID_MISMATCH',profile)
      if(document.title!==definition.title) contractIssue('Assignment title differs from its definition.','/definition/title','ASSIGNMENT_TITLE_MISMATCH',profile)
    }
  }
  if(name==='AssignmentAuthoringPage' || name==='AssignmentAuthoringPageV2') {
    (data as ContractMap['AssignmentAuthoringPageV2']).items.forEach((item,index)=>{
      try { parseLab(name.endsWith('V2')?'AssignmentAuthoringSummaryV2':'AssignmentAuthoringSummary',item,profile) }
      catch(error) { prefix(error,`/items/${index}`) }
    })
  }
  if(name==='AnySupportedAssignmentDefinition') {
    const assignment=data as ContractMap['AnySupportedAssignmentDefinition']
    parseLab(assignment.schema_version==='2.0'?'AssignmentDefinitionV2':'AssignmentDefinition',assignment,profile)
  }
  if(name==='AssignmentViewV2' || name==='InstructorAssignmentDocumentV2') {
    const view=data as ContractMap['AssignmentViewV2']
    if(view.document_kind==='instructor') {
      const definition=Object.fromEntries(Object.entries(view).filter(([key])=>!['document_kind','owner_id','published','feedback_policy'].includes(key)))
      parseLab(view.schema_version==='2.0'?'AssignmentDefinitionV2':'AssignmentDefinition',definition,profile)
    }
  }
  if (name === 'AssignmentDefinition' || name === 'AssignmentDefinitionV2') {
    const assignment = data as ContractMap['AnySupportedAssignmentDefinition']
    unique(assignment.lab_endpoints, 'endpoint_id', '/lab_endpoints', profile)
    assignment.lab_endpoints.forEach((entry, index) => endpoint(entry, `/lab_endpoints/${index}`, profile))
    if (assignment.reference_topology_graph) {
      try { parseLab('DetectedTopologyGraph', assignment.reference_topology_graph, profile) }
      catch (error) { prefix(error, '/reference_topology_graph') }
    }
    if (assignment.reference_design_graph) {
      try {
        const graph = parseStructural(name==='AssignmentDefinitionV2'?'AnySupportedCircuitGraph':'CircuitGraph', assignment.reference_design_graph, 'editor')
        validateCircuitDocument(normalizeCircuitDocument(graph))
      } catch (error) {
        if (error instanceof ContractValidationError) prefix(error, '/reference_design_graph')
        contractIssue('Invalid reference CircuitGraph.', '/reference_design_graph', 'INVALID_REFERENCE_DESIGN', profile)
      }
    }
    const profiles = assignment.instructor_pin_profiles ?? []
    unique(profiles, 'profile_id', '/instructor_pin_profiles', profile)
    profiles.forEach((entry, index) => unique(entry.pins, 'pin_id', `/instructor_pin_profiles/${index}/pins`, profile))
  }
  if (name === 'LabEndpoint') endpoint(data as ContractMap['LabEndpoint'], '', profile)
  if (['ObservedComponent', 'ObservedPhysicalComponent', 'OpaqueComponent', 'OpaquePhysicalComponent'].includes(name)) component(data as ContractMap['ObservedPhysicalComponent'], '', profile)
  if (name === 'DetectedTopologyGraph') {
    const graph = data as ContractMap['DetectedTopologyGraph']
    unique(graph.nodes, 'node_id', '/nodes', profile)
    unique(graph.components, 'component_id', '/components', profile)
    const ids = new Set(graph.nodes.map(node => node.node_id)), connections = new Set<string>()
    graph.connections.forEach((connection, index) => {
      const members = connection.node_ids, key = JSON.stringify([...members].sort())
      if (new Set(members).size !== members.length || members.some(node => !ids.has(node))) contractIssue('Connection contains duplicate or missing nodes.', `/connections/${index}/node_ids`, 'INVALID_NODE_REFERENCE', profile)
      if (connections.has(key)) contractIssue('Duplicate electrical connection.', `/connections/${index}`, 'DUPLICATE_CONNECTION', profile)
      connections.add(key)
    })
    graph.components.forEach((entry, index) => {
      component(entry, `/components/${index}`, profile)
      const members = entry.node_ids, pins = entry.pins ?? []
      if (new Set(members).size !== members.length || members.some(node => !ids.has(node)) || pins.some(pin => !members.includes(pin.node_id))) contractIssue('Component or pin references a missing node.', `/components/${index}`, 'INVALID_NODE_REFERENCE', profile)
    })
  }
  if (name === 'TopologyResolutionResult') {
    const resolution = data as ContractMap['TopologyResolutionResult']
    unique(resolution.endpoint_bindings, 'endpoint_id', '/endpoint_bindings', profile)
    unique(resolution.component_matches, 'reference_component_id', '/component_matches', profile)
    unique(resolution.component_matches, 'observed_component_id', '/component_matches', profile)
  }
  if (name === 'MemoryImage') {
    const image = data as ContractMap['MemoryImage']
    if (image.data.length !== image.depth) contractIssue('Memory image data length must equal depth.', '/data', 'MEMORY_DEPTH_MISMATCH', profile)
  }
  return data
}

function prefix(error: unknown, path: string): never {
  if (error instanceof ContractValidationError) throw new ContractValidationError(error.message, error.issues.map(issue => ({ ...issue, path: path + issue.path })))
  throw error
}
