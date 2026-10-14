import type { CircuitGraph, WireIdentity } from '../types/circuit'
import { getDefinition } from '../data/editorCatalog'
import { resolveEndpoint, type ResolvedEndpoint } from './endpoints'

export interface ResolvedNet { id: string; endpoints: string[]; drivers: string[]; inputs: string[]; width: number }
export interface ElectricalNetResolution { nets: ResolvedNet[]; endpointNetIds: Record<string, string>; unresolved: string[] }

export function resolveElectricalNets(graph: CircuitGraph): ElectricalNetResolution {
  const parent = new Map<string, string>(), endpoints = new Map<string, ResolvedEndpoint>(), unresolved = new Set<string>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== root) root = parent.get(root)!
    while (key !== root) { const next = parent.get(key)!; parent.set(key, root); key = next }
    return root
  }
  const register = (value: string) => {
    if (endpoints.has(value)) return endpoints.get(value)!
    const resolved = resolveEndpoint(graph.modules, value)
    if (!resolved) { unresolved.add(value); return null }
    endpoints.set(value, resolved)
    if (!parent.has(resolved.nodeKey)) parent.set(resolved.nodeKey, resolved.nodeKey)
    return resolved
  }
  for (const module of graph.modules) for (const port of getDefinition(module.type)?.ports ?? []) register(`${module.id}.${port.id}`)
  for (const wire of graph.connections) {
    const a = register(wire.source), b = register(wire.destination)
    if (!a || !b) continue
    const ra = find(a.nodeKey), rb = find(b.nodeKey)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const groups = new Map<string, ResolvedEndpoint[]>()
  for (const endpoint of endpoints.values()) {
    const key = find(endpoint.nodeKey), group = groups.get(key) ?? []
    group.push(endpoint); groups.set(key, group)
  }
  const endpointNetIds: Record<string, string> = {}
  const nets = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, group]): ResolvedNet => {
    for (const item of group) endpointNetIds[item.serialized] = id
    return { id, endpoints: group.map(e => e.serialized).sort(), drivers: group.filter(e => e.direction === 'output').map(e => e.serialized).sort(), inputs: group.filter(e => e.direction === 'input').map(e => e.serialized).sort(), width: Math.max(...group.map(e => e.width)) }
  })
  return { nets, endpointNetIds: Object.fromEntries(Object.entries(endpointNetIds).sort(([a], [b]) => a.localeCompare(b))), unresolved: [...unresolved].sort() }
}

export function assertConnectionAllowed(graph: CircuitGraph, first: string, second: string): WireIdentity & { reversed: boolean } {
  let a = resolveEndpoint(graph.modules, first), b = resolveEndpoint(graph.modules, second)
  if (!a || !b) throw new Error('Choose two known ports or breadboard contacts.')
  if (first === second) throw new Error('Choose different endpoints.')
  let source = first, destination = second, reversed = false
  if (a.endpoint.kind === 'port' && b.endpoint.kind === 'port') {
    if (a.direction === 'input' || b.direction === 'output') { [a, b] = [b, a]; [source, destination] = [destination, source]; reversed = true }
    if (a.direction === 'input' || b.direction === 'output') throw new Error('Connect an output/terminal to an input/terminal.')
    if (b.direction === 'input' && graph.connections.some(w => w.source === destination || w.destination === destination)) throw new Error('This input already has a driver. Disconnect it first.')
  }
  if (a.width !== b.width) throw new Error('Port widths must match; breadboard contacts require a scalar port.')
  if (graph.connections.some(w => w.source === source && w.destination === destination || w.source === destination && w.destination === source)) throw new Error('These endpoints are already connected.')
  const candidate = { ...graph, connections: [...graph.connections, { source, destination }] }
  const resolution = resolveElectricalNets(candidate)
  const net = resolution.nets.find(n => n.id === resolution.endpointNetIds[source])!
  if (net.drivers.length > 1) throw new Error('This electrical net already has a driver. Disconnect it first.')
  // A scalar contact anywhere on a net cannot carry a multi-bit logical bus.
  if (net.width > 1 && net.endpoints.some(e => resolveEndpoint(graph.modules, e)?.endpoint.kind === 'contact')) throw new Error('Breadboard contacts require scalar wiring; use an explicit adapter.')
  return { source, destination, reversed }
}
