import type { CircuitGraph, CircuitModule } from '../types/circuit'
import { contractIssue, ContractValidationError, parseStructural, type ValidationProfile } from './structural'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'

/** Semantic parity with contracts/label_properties.py; no new graph fields. */
export function validateLabelAnnotations(name: string, value: unknown, profile: ValidationProfile = 'structural', path = ''): void {
  if (name === 'SimulationRequest' || name === 'SimulationRequestV2') return validateLabelAnnotations('CircuitGraph', (value as { graph: CircuitGraph }).graph, profile, path + '/graph')
  const graph = ['CircuitGraph', 'CircuitGraphV12', 'AnySupportedCircuitGraph'].includes(name)
  const modules: CircuitModule[] = graph ? (value as CircuitGraph).modules : ['CircuitModule', 'CircuitModuleV12'].includes(name) ? [value as CircuitModule] : []
  const byId = new Map(modules.map(module => [module.id, module])), labels = new Set<string>()
  modules.forEach((module, index) => {
    if (module.type !== 'LABEL') return
    labels.add(module.id)
    const location = graph ? `${path}/modules/${index}` : path
    if ('mount' in module || 'physicalDescriptor' in module) contractIssue('A Label has only a visual board association and cannot have physical mounting.', location, 'INVALID_LABEL_MOUNT', profile)
    let properties
    try { properties = parseStructural('LabelPropertiesV1', module.properties ?? {}, profile) }
    catch (error) {
      if (error instanceof ContractValidationError) throw new ContractValidationError(error.message, error.issues.map(issue => ({ ...issue, path: location + '/properties' + issue.path })))
      throw error
    }
    if (graph && properties.boardId !== undefined && !getBreadboardTopology(byId.get(properties.boardId)?.type ?? '')) contractIssue('A Label board association must reference an existing breadboard.', location + '/properties/boardId', 'INVALID_LABEL_BOARD', profile)
  })
  if (graph && labels.size) (value as CircuitGraph).connections.forEach((edge, index) => {
    if ([edge.source, edge.destination].some(endpoint => labels.has(endpoint.split('.')[0]!))) contractIssue('A Label has no electrical ports or nets.', `${path}/connections/${index}`, 'INVALID_LABEL_CONNECTION', profile)
  })
}
