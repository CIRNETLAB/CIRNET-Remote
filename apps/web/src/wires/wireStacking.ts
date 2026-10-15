import type { CircuitConnection, WireIdentity, WireVisual } from '../types/circuit'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from './wireRouting'
import { readWireVisual, wireKey } from './wireVisual'
import { wireRoutesConflict } from './wireLayout'

export { wireRoutesConflict } from './wireLayout'
export interface WireStackPeer { wire: CircuitConnection; visual: WireVisual; route: SolvedWireRoute }

// Priority is an ordering hint. Physical separation is derived locally by the
// layout solver; it must never become a whole-wire Y translation.
export function findWireStackConflicts(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): WireStackPeer[] {
  const candidate = solveWireRoute(wire, visual, context)
  if (!candidate) return []
  const peers: WireStackPeer[] = []
  for (const connection of connections) {
    if (wireKey(connection) === wireKey(wire)) continue
    const otherVisual = readWireVisual(connection), route = solveWireRoute(connection, otherVisual, context)
    if (route && wireRoutesConflict(candidate, visual, route, otherVisual)) peers.push({ wire: connection, visual: otherVisual, route })
  }
  return peers
}
export function automaticWireLayer(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): number {
  const peers = findWireStackConflicts(wire, visual, connections, context)
  return peers.length ? Math.max(...peers.map(peer => peer.visual.layer ?? 0)) + 1 : 0
}
