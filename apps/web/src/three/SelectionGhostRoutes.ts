import { Vector3 } from 'three'
import type { CircuitGraph, CircuitModule, Point3, WireIdentity, WireVisual } from '../types/circuit'
import type { SelectionClipboard } from '../editor/selectionClipboard'
import { getDefinition } from '../data/editorCatalog'
import { getBreadboardContact } from '../electrical/BreadboardTopology'
import { parseEndpoint } from '../electrical/endpoints'
import { moduleLocalToWorld, moduleWorldPose } from '../electrical/modulePose'
import { readWireVisual, wireKey } from '../wires/wireVisual'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from '../wires/wireRouting'
import { createWireLayoutCache } from '../wires/wireLayout'
import { portAnchor } from './ComponentModel'

export interface SelectionGhostRoute { wire: WireIdentity; visual: WireVisual; route: SolvedWireRoute }

/** The same graph projection supplies both candidate and captured-source route contexts. */
export function graphWireRouteContext(current: () => CircuitGraph | null): WireRouteContext {
  const pose = (id: string): CircuitModule | null => {
    const graph = current(), module = graph?.modules.find(item => item.id === id)
    return graph && module ? moduleWorldPose(module, graph.modules) : null
  }
  return {
    modulePose: pose,
    endpoint(value) {
      const parsed = parseEndpoint(value), module = parsed && pose(parsed.moduleId)
      if (!parsed || !module) return null
      const contact = parsed.kind === 'contact' ? getBreadboardContact(module.type, parsed.contactId) : null
      const port = parsed.kind === 'port' ? getDefinition(module.type)?.ports.find(item => item.id === parsed.portId) : null
      const local = contact ? new Vector3(...contact.localPosition) : port ? portAnchor(module.type, port) : null
      if (!local) return null
      const boardId = parsed.kind === 'contact' ? module.id : module.mount?.boardId
      return { endpoint: value, position: moduleLocalToWorld(local, module), ...(boardId ? { contactModuleId: boardId } : {}) }
    },
  }
}

/** Invalid placement has no electrical endpoints. Project captured solved geometry only. */
export function buildSelectionGhostRoutes(snapshot: SelectionClipboard, transformPoint: (point: Point3) => Point3): SelectionGhostRoute[] {
  const graph: CircuitGraph = { schema_version: '1.1', circuit_id: '@clipboard-preview', modules: snapshot.sourceModules, connections: snapshot.sourceConnections ?? snapshot.connections }
  const context = graphWireRouteContext(() => graph)
  const inputs = graph.connections.flatMap(wire => {
    const visual = readWireVisual(wire), route = solveWireRoute(wire, visual, context)
    return route ? [{ wire, visual, route }] : []
  })
  const layouts = createWireLayoutCache().sync(inputs)
  const moveSegment = <T extends { start: Point3; end: Point3 }>(segment: T): T => ({ ...segment, start: transformPoint(segment.start), end: transformPoint(segment.end) })
  return snapshot.connections.flatMap(wire => {
    const visual = readWireVisual(wire), source = layouts.get(wireKey(wire)) ?? solveWireRoute(wire, visual, context)
    if (!source) return []
    const route: SolvedWireRoute = {
      ...source,
      points: source.points.map(transformPoint),
      semanticPoints: source.semanticPoints.map(item => ({ ...item, position: transformPoint(item.position) })),
      handles: source.handles.map(item => ({ ...item, position: transformPoint(item.position) })),
      segments: source.segments.map(moveSegment),
      terminalLeads: { source: source.terminalLeads.source ? transformPoint(source.terminalLeads.source) : null, destination: source.terminalLeads.destination ? transformPoint(source.terminalLeads.destination) : null },
      ...(source.contactDeckY ? { contactDeckY: {
        source: source.contactDeckY.source == null ? null : transformPoint({ x: 0, y: source.contactDeckY.source, z: 0 }).y,
        destination: source.contactDeckY.destination == null ? null : transformPoint({ x: 0, y: source.contactDeckY.destination, z: 0 }).y,
      } } : {}),
      ...(source.renderPoints ? { renderPoints: source.renderPoints.map(transformPoint) } : {}),
      ...(source.renderHandles ? { renderHandles: source.renderHandles.map(item => ({ ...item, position: transformPoint(item.position) })) } : {}),
      ...(source.renderSegments ? { renderSegments: source.renderSegments.map(item => ({ ...moveSegment(item), baseStart: transformPoint(item.baseStart), baseEnd: transformPoint(item.baseEnd) })) } : {}),
    }
    return [{ wire: { source: wire.source, destination: wire.destination }, visual, route }]
  })
}
