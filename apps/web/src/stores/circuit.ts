import { defineStore } from 'pinia'
import type { CircuitGraph, CircuitModule, WireIdentity, WireVisual } from '../types/circuit'
import type { MemoryImage } from '../types/memory'
import { getDefinition, validateProperties } from '../data/editorCatalog'
import { assertConnectionAllowed } from '../electrical/nets'
import { copyWireVisual, readWireVisual, validateWireVisual } from '../wires/wireVisual'
import { moduleLocalToWorld } from '../electrical/modulePose'
import { createMemoryImage, parseMemoryImage } from '../services/files/memoryImage'
import type { CircuitValidation } from '../types/api'
import { circuitsApi } from '../services/api/circuits'
import { errorMessage } from '../services/api/client'
import { MAX_CIRCUIT_FILE_BYTES, parseCircuitFile } from '../services/files/circuitFile'

export interface CircuitDraft { id: string; name: string; graph: CircuitGraph }
// Conservative UTF-16 string storage budget, shared by both history directions.
export const MAX_HISTORY_STORAGE_BYTES = 20_000_000
const validationControllers = new WeakMap<object, AbortController>()
export const useCircuitStore = defineStore('circuit', {
  state: () => ({
    drafts: [] as CircuitDraft[], activeId: null as string | null,
    validationResult: null as CircuitValidation | null, validatedSnapshot: '',
    validating: false, validationError: null as string | null, validationVersion: 0,
    past: [] as string[], future: [] as string[], saved: {} as Record<string, string>,
  }),
  getters: {
    current: (state): CircuitDraft | null => state.drafts.find((draft) => draft.id === state.activeId) ?? null,
    graph(): CircuitGraph | null { return this.current?.graph ?? null },
    validation(): CircuitValidation | null { return JSON.stringify(this.graph) === this.validatedSnapshot ? this.validationResult : null },
    canUndo: (state) => state.past.length > 0,
    canRedo: (state) => state.future.length > 0,
    dirty(): boolean { return !!this.current && this.saved[this.current.id] !== JSON.stringify(this.current) },
  },
  actions: {
    commitGraph(graph: CircuitGraph) {
      if (!this.current || JSON.stringify(graph) === JSON.stringify(this.graph)) return
      this.recordChange(); this.current.graph = graph; this.clearValidation()
    },
    placeModule(type: string, position: Required<NonNullable<CircuitModule['position']>>, rotation = 0): string {
      if (!this.graph) throw new Error('Create a circuit first.')
      const definition = getDefinition(type)
      if (!definition) throw new Error('Placement metadata is unavailable for this type.')
      if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
      if (!Number.isFinite(rotation)) throw new Error('Rotation must be finite.')
      const ids = new Set(this.graph.modules.map((module) => module.id))
      let serial = 1
      while (ids.has(`${type}_${serial}`)) serial++
      const id = `${type}_${serial}`
      const properties = structuredClone(definition.defaults)
      if (definition.memoryContract) properties.memory = createMemoryImage()
      this.commitGraph({ ...this.graph, modules: [...this.graph.modules, { id, type, position: { ...position }, rotation: ((rotation % 360) + 360) % 360, properties }] })
      return id
    },
    moveModule(id: string, position: Required<NonNullable<CircuitModule['position']>>) {
      if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
      if (!this.graph?.modules.some((module) => module.id === id)) return
      this.commitGraph({ ...this.graph, modules: this.graph.modules.map((module) => module.id === id ? { ...module, position: { ...position } } : module) })
    },
    rotateModule(id: string, degrees = 90) {
      if (!Number.isFinite(degrees)) throw new Error('Rotation must be finite.')
      if (!this.graph?.modules.some((module) => module.id === id)) return
      this.commitGraph({ ...this.graph, modules: this.graph.modules.map((module) => module.id === id ? { ...module, rotation: (((module.rotation ?? 0) % 360 + degrees % 360) % 360 + 360) % 360 } : module) })
    },
    removeModule(id: string) {
      if (!this.graph?.modules.some((module) => module.id === id)) return
      const removed = this.graph.modules.find(module => module.id === id)!
      const connections = this.graph.connections.filter(wire => wire.source.split('.')[0] !== id && wire.destination.split('.')[0] !== id).map(wire => {
        const visual = readWireVisual(wire)
        if (visual.frameModuleId !== id && !visual.controlPoints.some(p => p.space === 'module' && p.moduleId === id)) return wire
        return { ...wire, metadata: { ...wire.metadata, wireVisual: { ...visual, ...(visual.frameModuleId === id ? { frameModuleId: null } : {}), controlPoints: visual.controlPoints.map(p => p.space === 'module' && p.moduleId === id ? { space: 'world' as const, position: moduleLocalToWorld(p.position, removed) } : p) } } }
      })
      this.commitGraph({ ...this.graph, modules: this.graph.modules.filter((module) => module.id !== id), connections })
    },
    connectPorts(first: string, second: string) {
      this.connectEndpoints(first, second)
    },
    connectEndpoints(first: string, second: string, visual?: WireVisual) {
      if (!this.graph) throw new Error('Create a circuit first.')
      const { source, destination, reversed } = assertConnectionAllowed(this.graph, first, second)
      if (visual) validateWireVisual(visual, this.graph.modules)
      const copy = visual ? copyWireVisual(visual) : undefined
      if (copy && reversed) copy.controlPoints.reverse()
      this.commitGraph({ ...this.graph, connections: [...this.graph.connections, { source, destination, ...(copy ? { metadata: { wireVisual: copy } } : {}) }] })
    },
    updateWireVisual(wire: WireIdentity, visual: WireVisual) {
      if (!this.graph) return
      if (!this.graph.connections.some(c => c.source === wire.source && c.destination === wire.destination)) return
      validateWireVisual(visual, this.graph.modules)
      const copy = copyWireVisual(visual)
      this.commitGraph({ ...this.graph, connections: this.graph.connections.map(c => c.source === wire.source && c.destination === wire.destination ? { ...c, metadata: { ...c.metadata, wireVisual: copy } } : c) })
    },
    disconnectPorts(source: string, destination: string) {
      if (!this.graph) return
      this.commitGraph({ ...this.graph, connections: this.graph.connections.filter((wire) => wire.source !== source || wire.destination !== destination) })
    },
    updateModuleProperties(id: string, patch: Record<string, unknown>) {
      const module = this.graph?.modules.find((module) => module.id === id)
      if (!module || !this.graph) return
      const definition = getDefinition(module.type)
      if (Object.keys(patch).some((key) => !definition?.parameters.some((parameter) => parameter.key === key))) throw new Error('Unsupported component parameter.')
      const properties = { ...definition?.defaults, ...module.properties, ...patch }
      validateProperties(module.type, properties)
      this.commitGraph({ ...this.graph, modules: this.graph.modules.map((item) => item.id === id ? { ...item, properties } : item) })
    },
    setMemoryImage(id: string, image: MemoryImage) {
      const module = this.graph?.modules.find((module) => module.id === id)
      if (!this.graph || !module || !getDefinition(module.type)?.memoryContract) throw new Error('Select a supported memory component.')
      const copy = parseMemoryImage(JSON.stringify(image))
      this.commitGraph({ ...this.graph, modules: this.graph.modules.map((item) => item.id === id ? { ...item, properties: { ...item.properties, memory: copy } } : item) })
    },
    snapshot(): string { return JSON.stringify({ drafts: this.drafts, activeId: this.activeId }) },
    recordChange() {
      this.past.push(this.snapshot())
      this.future = []
      this.trimHistory()
    },
    trimHistory() {
      let bytes = [...this.past, ...this.future].reduce((total, snapshot) => total + snapshot.length * 2, 0)
      // Keep one immediate Undo/Redo even when a multi-draft snapshot exceeds the budget.
      while (this.past.length + this.future.length > 1 && (this.past.length + this.future.length > 50 || bytes > MAX_HISTORY_STORAGE_BYTES)) {
        const removed = this.past.length ? this.past.shift()! : this.future.shift()!
        bytes -= removed.length * 2
      }
      this.pruneSaved()
    },
    pruneSaved() {
      const reachable = new Set(this.drafts.map((draft) => draft.id))
      const candidates = Object.keys(this.saved).filter((id) => !reachable.has(id))
      if (!candidates.length) return
      for (const snapshot of [...this.past, ...this.future]) {
        const state = JSON.parse(snapshot) as { drafts: CircuitDraft[] }
        for (const draft of state.drafts) reachable.add(draft.id)
      }
      for (const id of candidates) if (!reachable.has(id)) delete this.saved[id]
    },
    restore(snapshot: string) {
      const state = JSON.parse(snapshot) as { drafts: CircuitDraft[]; activeId: string | null }
      this.drafts = state.drafts; this.activeId = state.activeId
      this.clearValidation()
    },
    undo() { const previous = this.past.pop(); if (previous) { this.future.push(this.snapshot()); this.restore(previous); this.trimHistory() } },
    redo() { const next = this.future.pop(); if (next) { this.past.push(this.snapshot()); this.restore(next); this.trimHistory() } },
    markSaved() { if (this.current) this.saved[this.current.id] = JSON.stringify(this.current) },
    importGraph(graph: CircuitGraph) {
      const copy = parseCircuitFile(JSON.stringify(graph))
      this.recordChange()
      const id = crypto.randomUUID()
      const name = typeof copy.metadata?.name === 'string' && copy.metadata.name.trim() ? copy.metadata.name.trim() : 'Imported circuit'
      this.drafts.push({ id, name, graph: copy })
      this.activeId = id
      this.clearValidation()
      this.markSaved()
    },
    exportGraph(): string {
      if (!this.current) throw new Error('Create or open a circuit first.')
      const graph = { ...this.current.graph, metadata: { ...this.current.graph.metadata, name: this.current.name } }
      const compact = JSON.stringify(graph)
      parseCircuitFile(compact)
      const pretty = JSON.stringify(graph, null, 2)
      return new TextEncoder().encode(pretty).length <= MAX_CIRCUIT_FILE_BYTES ? pretty : compact
    },
    clearValidation() {
      validationControllers.get(this)?.abort()
      validationControllers.delete(this)
      this.validationVersion++
      this.validationResult = null
      this.validationError = null
      this.validatedSnapshot = ''
      this.validating = false
    },
    createDraft(name?: string): string {
      this.recordChange()
      const id = crypto.randomUUID()
      const title = name ?? `Untitled circuit ${this.drafts.length + 1}`
      this.drafts.push({ id, name: title.trim() || 'Untitled circuit', graph: { schema_version: '1.0', circuit_id: id, modules: [], connections: [] } })
      this.activeId = id
      this.clearValidation()
      return id
    },
    openDraft(id: string) {
      if (!this.drafts.some((draft) => draft.id === id)) return
      if (this.activeId === id) return
      this.recordChange()
      this.activeId = id
      this.clearValidation()
    },
    renameCurrent(name: string) {
      if (this.current && name.trim() && this.current.name !== name.trim()) { this.recordChange(); this.current.name = name.trim() }
    },
    async validateCurrent() {
      if (!this.graph || this.validating) return
      this.clearValidation()
      const version = this.validationVersion
      const snapshot = JSON.stringify(this.graph)
      const controller = new AbortController()
      validationControllers.set(this, controller)
      this.validating = true
      try {
        const result = await circuitsApi.validate(JSON.parse(snapshot) as CircuitGraph, controller.signal)
        if (version === this.validationVersion && JSON.stringify(this.graph) === snapshot) {
          this.validationResult = result
          this.validatedSnapshot = snapshot
        }
      } catch (error) {
        if (version === this.validationVersion && JSON.stringify(this.graph) === snapshot) this.validationError = errorMessage(error)
      } finally {
        if (validationControllers.get(this) === controller) validationControllers.delete(this)
        if (version === this.validationVersion) this.validating = false
      }
    },
  },
})
