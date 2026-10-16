import type { CircuitConnection, CircuitGraph, CircuitModule, Point3 } from '../types/circuit'
import { getDefinition, validateProperties } from '../data/editorCatalog'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { formatEndpoint, parseEndpoint } from '../electrical/endpoints'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from '../electrical/modulePose'
import { validateMountBindings } from '../electrical/mounting'
import { assertConnectionAllowed, assertElectricalNetsAllowed } from '../electrical/nets'
import { parseCircuitFile } from '../domain/document/circuitFile'
import { shiftBreadboardContact, shiftedWireCopy, wireCopyAtContact } from '../wires/wireClipboard'
import { readWireVisual, validateWireVisual, wireKey } from '../wires/wireVisual'
import { normalizeSelection, type EditorSelection } from './selection'
import { cloneClipboardData as clone, type SelectionClipboard } from './selectionClipboard'
import { clipboardContactWorld as contactWorld, selectionModulePosition as positionOf, selectionPoint as point } from './selectionContacts'

export const WORLD_PASTE_STEP = .5
const EPS = 1e-7
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const subtract = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const close = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < EPS
const norm = (n: number) => ((n % 360) + 360) % 360

export interface PasteOptions { step?: number; delta?: Point3; targetContact?: string }
export interface PasteCandidate { graph: CircuitGraph; selection: EditorSelection; delta: Point3 }
export class PasteCandidateError extends Error {
  constructor(message: string, public previewGraph: CircuitGraph, public selection: EditorSelection, public snapshot: SelectionClipboard, public transformPoint: (point: Point3) => Point3, public delta: Point3) { super(message); this.name = 'PasteCandidateError' }
}

function uniqueIds(graph: CircuitGraph, modules: CircuitModule[]) {
  const used = new Set(graph.modules.map(module => module.id)), mapped = new Map<string, string>()
  for (const module of modules) {
    let serial = 1
    while (used.has(`${module.type}_${serial}`)) serial++
    const id = `${module.type}_${serial}`
    used.add(id); mapped.set(module.id, id)
  }
  return mapped
}

/** Build and validate everything before the caller records a single history entry. */
export function buildPasteCandidate(graph: CircuitGraph, snapshot: SelectionClipboard, options: PasteOptions = {}): PasteCandidate {
  const step = options.step ?? 1
  if (!Number.isSafeInteger(step) || step < 1) throw new Error('Paste requires a positive placement step.')
  if (options.delta && !Object.values(options.delta).every(Number.isFinite)) throw new Error('Paste position must be finite.')
  if (!snapshot.modules.length && !snapshot.connections.length) throw new Error('The selection clipboard is empty.')
  const idMap = uniqueIds(graph, snapshot.modules), newIds = new Set(idMap.values()), boardMap = new Map<string, string>()
  let delta: Point3 = options.delta ? { ...options.delta } : { x: WORLD_PASTE_STEP * step, y: 0, z: 0 }
  let rotate = 0, transform = (world: Point3): Point3 => add(world, delta)
  let draft: CircuitGraph = { ...graph, modules: [...graph.modules], connections: [...graph.connections] }
  const selection: EditorSelection = { moduleIds: [...idMap.values()], wires: [] }
  try {
    if (options.targetContact) {
      if (!snapshot.anchorContact) throw new Error('Choose a world position for a selection without a breadboard contact anchor.')
      const from = contactWorld(snapshot.sourceModules, snapshot.anchorContact), to = contactWorld(graph.modules, options.targetContact)
      const fromPose = moduleWorldPose(from.module, snapshot.sourceModules), toPose = moduleWorldPose(to.module, graph.modules)
      if (Math.abs(getBreadboardTopology(from.module.type)!.pitch - getBreadboardTopology(to.module.type)!.pitch) > EPS) throw new Error('The target breadboard has a different contact pitch.')
      boardMap.set(from.module.id, to.module.id)
      rotate = (toPose.rotation ?? 0) - (fromPose.rotation ?? 0)
      transform = world => moduleLocalToWorld(add(subtract(worldToModuleLocal(world, fromPose), point(from.contact.localPosition)), point(to.contact.localPosition)), toPose)
      delta = subtract(transform(snapshot.anchor), snapshot.anchor)
    } else if (!options.delta && snapshot.anchorContact) {
      const anchor = contactWorld(snapshot.sourceModules, snapshot.anchorContact), topology = getBreadboardTopology(anchor.module.type)!
      const sourcePose = moduleWorldPose(anchor.module, snapshot.sourceModules), current = graph.modules.find(module => module.id === anchor.module.id)
      if (!current) throw new Error('A copied selection references a missing breadboard.')
      const currentPose = moduleWorldPose(current, graph.modules)
      rotate = (currentPose.rotation ?? 0) - (sourcePose.rotation ?? 0)
      transform = world => moduleLocalToWorld(add(worldToModuleLocal(world, sourcePose), { x: topology.pitch * step, y: 0, z: 0 }), currentPose)
      delta = subtract(transform(snapshot.anchor), snapshot.anchor)
    } else if (options.delta && snapshot.modules.some(module => module.mount && !idMap.has(module.mount.boardId)) && snapshot.anchorContact) {
      // Snap one shared anchor; the rest of the selection keeps the same rigid transform.
      const anchor = contactWorld(snapshot.sourceModules, snapshot.anchorContact), board = graph.modules.find(module => module.id === anchor.module.id)
      if (!board) throw new Error('A copied mount references a missing breadboard.')
      const desired = worldToModuleLocal(add(anchor.world, delta), moduleWorldPose(board, graph.modules)), topology = getBreadboardTopology(board.type)!
      const nearest = [...topology.contacts].sort((a, b) => Math.hypot(a.localPosition[0] - desired.x, a.localPosition[2] - desired.z) - Math.hypot(b.localPosition[0] - desired.x, b.localPosition[2] - desired.z))[0]
      if (nearest && Math.hypot(nearest.localPosition[0] - desired.x, nearest.localPosition[2] - desired.z) <= topology.pitch) delta = subtract(moduleLocalToWorld(point(nearest.localPosition), moduleWorldPose(board, graph.modules)), anchor.world)
    }

    const mapContact = (value: string): string => {
      const endpoint = parseEndpoint(value)
      if (!endpoint || endpoint.kind !== 'contact') throw new Error('Paste requires declared breadboard contacts; component ports cannot be guessed.')
      const mapped = idMap.get(endpoint.moduleId)
      if (mapped) return formatEndpoint({ ...endpoint, moduleId: mapped })
      if (!options.delta && !options.targetContact) {
        const shifted = shiftBreadboardContact({ ...graph, modules: snapshot.sourceModules }, value, step)
        if (!close(contactWorld(graph.modules, shifted.endpoint).world, transform(contactWorld(snapshot.sourceModules, value).world))) throw new Error('Paste requires breadboards with the same local X pitch direction to preserve the selection shape.')
        return shifted.endpoint
      }
      const old = contactWorld(snapshot.sourceModules, value), expected = transform(old.world)
      const preferredId = boardMap.get(endpoint.moduleId) ?? (!options.targetContact ? endpoint.moduleId : undefined)
      const boards = preferredId ? draft.modules.filter(module => module.id === preferredId) : draft.modules.filter(module => getBreadboardTopology(module.type) && !newIds.has(module.id))
      const matches = boards.flatMap(module => {
        const local = worldToModuleLocal(expected, moduleWorldPose(module, draft.modules))
        return (getBreadboardTopology(module.type)?.contacts ?? []).filter(contact => close(point(contact.localPosition), local)).map(contact => ({ module, contact }))
      })
      if (matches.length !== 1) throw new Error(matches.length ? 'The destination contact is ambiguous. Choose endpoints explicitly.' : 'No matching declared contact at this position. Paste was not applied.')
      const match = matches[0]
      boardMap.set(endpoint.moduleId, match.module.id)
      return `${match.module.id}.contact:${match.contact.contactId}`
    }
    const mapEndpoint = (value: string): string => {
      const endpoint = parseEndpoint(value)
      if (!endpoint) throw new Error('A copied wire has an invalid endpoint.')
      const mapped = idMap.get(endpoint.moduleId)
      if (mapped) return formatEndpoint({ ...endpoint, moduleId: mapped })
      return endpoint.kind === 'contact' ? mapContact(value) : value
    }

    // Resolve the complete group before reading any visual owner references.
    // One wire may use a frame/control owner mapped by a later selected wire.
    for (const wire of snapshot.connections) { mapEndpoint(wire.source); mapEndpoint(wire.destination) }
    for (const module of snapshot.modules) if (module.mount && !idMap.has(module.mount.boardId)) {
      for (const binding of module.mount.contacts) mapContact(`${module.mount.boardId}.contact:${binding.contactId}`)
    }
    const owners = new Map([...idMap, ...boardMap])

    // Boards precede their copied mounted parts so their poses can be resolved immediately.
    const copies = snapshot.modules.filter(module => !module.mount).map(module => ({ ...clone(module), id: idMap.get(module.id)!, position: transform(positionOf(moduleWorldPose(module, snapshot.sourceModules))), rotation: norm((module.rotation ?? 0) + rotate) }))
    draft = { ...draft, modules: [...graph.modules, ...copies] }
    for (const original of snapshot.modules.filter(module => module.mount)) {
      const module = clone(original), mount = module.mount!
      module.id = idMap.get(original.id)!
      const copiedBoard = idMap.get(mount.boardId)
      if (copiedBoard) mount.boardId = copiedBoard
      else {
        const bindings = mount.contacts.map(binding => {
          const mapped = parseEndpoint(mapContact(`${mount.boardId}.contact:${binding.contactId}`))!
          if (mapped.kind !== 'contact') throw new Error('A mount must use declared contacts.')
          return { ...binding, boardId: mapped.moduleId, contactId: mapped.contactId }
        })
        if (!bindings.length || bindings.some(binding => binding.boardId !== bindings[0].boardId)) throw new Error('A copied footprint must fit one breadboard.')
        const board = draft.modules.find(item => item.id === bindings[0].boardId)!
        const pose = moduleWorldPose(original, snapshot.sourceModules), boardPose = moduleWorldPose(board, draft.modules)
        mount.boardId = board.id
        mount.pose = { position: worldToModuleLocal(transform(positionOf(pose)), boardPose), rotation: norm((pose.rotation ?? 0) + rotate - (boardPose.rotation ?? 0)) }
        mount.contacts = bindings.map(({ boardId: _boardId, ...binding }) => binding)
      }
      draft.modules.push(module)
    }

    const newWires: CircuitConnection[] = []
    for (const original of snapshot.connections) {
      let source: string, destination: string, visual = readWireVisual(original)
      const bothContacts = parseEndpoint(original.source)?.kind === 'contact' && parseEndpoint(original.destination)?.kind === 'contact'
      if (!snapshot.modules.length && !snapshot.anchorContact && !options.delta && !options.targetContact) throw new Error('Paste requires declared breadboard contacts; component ports cannot be guessed.')
      if (!snapshot.modules.length && bothContacts && !options.delta && !options.targetContact) {
        mapContact(original.source); mapContact(original.destination)
        const shifted = shiftedWireCopy({ ...graph, modules: snapshot.sourceModules }, original, visual, step)
        const moved = wireCopyAtContact(graph, original, visual, shifted.wire.source, snapshot.sourceModules, owners)
        if (moved.wire.destination !== shifted.wire.destination) throw new Error('Paste requires breadboards with the same local X pitch direction to preserve the wire shape.')
        source = moved.wire.source; destination = moved.wire.destination; visual = moved.visual
      } else if (!snapshot.modules.length && bothContacts && options.targetContact) {
        const mappedSource = mapContact(original.source), mappedDestination = mapContact(original.destination)
        const moved = wireCopyAtContact(graph, original, visual, mappedSource, snapshot.sourceModules, owners)
        const from = contactWorld(snapshot.sourceModules, original.source), to = contactWorld(graph.modules, mappedSource)
        const difference = norm((to.module.rotation ?? 0) - (from.module.rotation ?? 0) - rotate)
        if (moved.wire.destination !== mappedDestination || Math.min(difference, 360 - difference) > EPS) throw new Error('Paste requires one rigid transform for the whole wire selection.')
        source = moved.wire.source; destination = moved.wire.destination; visual = moved.visual
      } else {
        source = mapEndpoint(original.source); destination = mapEndpoint(original.destination)
        if (visual.frameModuleId) visual.frameModuleId = owners.get(visual.frameModuleId) ?? visual.frameModuleId
        visual.controlPoints = visual.controlPoints.map(control => {
          const owner = control.space === 'module' ? snapshot.sourceModules.find(module => module.id === control.moduleId) : null
          if (control.space === 'module' && !owner) throw new Error('A copied wire control point refers to a missing module.')
          const world = owner ? moduleLocalToWorld(control.position, moduleWorldPose(owner, snapshot.sourceModules)) : control.position
          if (control.space === 'world') return { space: 'world' as const, position: { ...transform(world) } }
          const moduleId = owners.get(control.moduleId) ?? control.moduleId, next = draft.modules.find(module => module.id === moduleId)
          if (!next) throw new Error('A copied wire control point refers to a missing module.')
          if (idMap.has(control.moduleId)) return { space: 'module' as const, moduleId, position: { ...control.position } }
          return { space: 'module' as const, moduleId, position: { ...worldToModuleLocal(transform(world), moduleWorldPose(next, draft.modules)) } }
        })
      }
      const metadata = clone(original.metadata ?? {})
      // Unknown future namespaces remain intact; known routing data follows the copy.
      if (!metadata.wireVisual || (metadata.wireVisual as { version?: unknown }).version === 1) metadata.wireVisual = visual
      newWires.push({ source, destination, metadata })
    }
    draft.connections.push(...newWires)
    selection.wires = newWires.map(wire => ({ source: wire.source, destination: wire.destination }))
    validateMountBindings(draft)
    for (const module of draft.modules.filter(module => selection.moduleIds.includes(module.id))) {
      const definition = getDefinition(module.type)
      if (definition) validateProperties(module.type, { ...definition.defaults, ...module.properties })
    }
    const checked: CircuitGraph = { ...draft, connections: [...graph.connections] }
    for (const wire of newWires) {
      const allowed = assertConnectionAllowed(checked, wire.source, wire.destination)
      if (allowed.reversed && (wire.metadata?.wireVisual as { version?: unknown } | undefined)?.version === 1) {
        const visual = readWireVisual(wire)
        visual.controlPoints.reverse(); wire.metadata = { ...wire.metadata, wireVisual: visual }
      }
      wire.source = allowed.source; wire.destination = allowed.destination
      if (wire.metadata?.wireVisual !== undefined) validateWireVisual(wire.metadata.wireVisual, draft.modules)
      checked.connections.push(wire)
    }
    // Mount bonds and internal part relationships can change a net even without a copied wire.
    assertElectricalNetsAllowed(draft)
    selection.wires = newWires.map(wire => ({ source: wire.source, destination: wire.destination }))
    parseCircuitFile(JSON.stringify(draft))
    return { graph: draft, selection, delta }
  } catch (error) {
    // Keep a renderable body for invalid contact/mount targets without inventing bindings.
    for (const original of snapshot.modules) {
      const id = idMap.get(original.id)!
      if (draft.modules.some(module => module.id === id)) continue
      const { mount: _mount, ...free } = clone(moduleWorldPose(original, snapshot.sourceModules))
      draft.modules.push({ ...free, id, position: transform(positionOf(free)), rotation: norm((free.rotation ?? 0) + rotate) })
    }
    if (!selection.wires.length && snapshot.connections.length) {
      selection.wires = snapshot.connections.map(wire => ({ source: wire.source, destination: wire.destination }))
      const present = new Set(draft.connections.map(wireKey))
      draft.connections.push(...snapshot.connections.filter(wire => !present.has(wireKey(wire))).map(clone))
    }
    throw new PasteCandidateError(error instanceof Error ? error.message : String(error), draft, selection, snapshot, transform, delta)
  }
}

export function buildDeleteCandidate(graph: CircuitGraph, selection: EditorSelection): CircuitGraph {
  const normalized = normalizeSelection(graph, selection), ids = new Set(normalized.moduleIds), wires = new Set(normalized.wires.map(wireKey))
  if (!ids.size && !wires.size) return graph
  const modules = graph.modules.filter(module => !ids.has(module.id)).map(module => {
    if (!module.mount || !ids.has(module.mount.boardId)) return module
    const { mount: _mount, ...free } = moduleWorldPose(module, graph.modules)
    return free
  })
  const connections = graph.connections.filter(wire => !wires.has(wireKey(wire)) && !ids.has(parseEndpoint(wire.source)?.moduleId ?? '') && !ids.has(parseEndpoint(wire.destination)?.moduleId ?? '')).map(wire => {
    const visual = readWireVisual(wire)
    if (!ids.has(visual.frameModuleId ?? '') && !visual.controlPoints.some(control => control.space === 'module' && ids.has(control.moduleId))) return wire
    if (ids.has(visual.frameModuleId ?? '')) visual.frameModuleId = null
    visual.controlPoints = visual.controlPoints.map(control => {
      if (control.space !== 'module' || !ids.has(control.moduleId)) return control
      const owner = graph.modules.find(module => module.id === control.moduleId)!
      return { space: 'world' as const, position: { ...moduleLocalToWorld(control.position, moduleWorldPose(owner, graph.modules)) } }
    })
    return { ...wire, metadata: { ...wire.metadata, wireVisual: visual } }
  })
  const candidate = { ...graph, modules, connections }
  parseCircuitFile(JSON.stringify(candidate))
  return candidate
}

