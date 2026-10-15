import type { CircuitGraph, WireIdentity } from '../types/circuit'
import { wireKey } from '../wires/wireVisual'

export interface EditorSelection { moduleIds: string[]; wires: WireIdentity[] }
export const emptyEditorSelection = (): EditorSelection => ({ moduleIds: [], wires: [] })
const sameWire = (a: WireIdentity, b: WireIdentity) => a.source === b.source && a.destination === b.destination || a.source === b.destination && a.destination === b.source

export function normalizeEditorSelection(selection: EditorSelection): EditorSelection {
  return {
    moduleIds: [...new Set(selection.moduleIds.filter(Boolean))],
    wires: selection.wires.filter((wire, index, all) => !!wire.source && !!wire.destination && !all.slice(0, index).some(previous => sameWire(previous, wire))).map(wire => ({ source: wire.source, destination: wire.destination })),
  }
}

export function normalizeSelection(graph: CircuitGraph, selection: EditorSelection): EditorSelection {
  const normalized = normalizeEditorSelection(selection), moduleIds = new Set(normalized.moduleIds)
  return {
    moduleIds: graph.modules.filter(module => moduleIds.has(module.id)).map(module => module.id),
    wires: graph.connections.filter(wire => normalized.wires.some(selected => sameWire(selected, wire))).map(wire => ({ source: wire.source, destination: wire.destination })),
  }
}

export function toggleModuleSelection(selection: EditorSelection, moduleId: string): EditorSelection {
  const normalized = normalizeEditorSelection(selection)
  return { ...normalized, moduleIds: normalized.moduleIds.includes(moduleId) ? normalized.moduleIds.filter(id => id !== moduleId) : [...normalized.moduleIds, moduleId] }
}

export function toggleWireSelection(selection: EditorSelection, wire: WireIdentity): EditorSelection {
  const normalized = normalizeEditorSelection(selection), selected = normalized.wires.some(item => sameWire(item, wire))
  return { ...normalized, wires: selected ? normalized.wires.filter(item => !sameWire(item, wire)) : [...normalized.wires, { source: wire.source, destination: wire.destination }] }
}

export const selectionWireKeys = (selection: EditorSelection) => new Set(selection.wires.map(wireKey))
