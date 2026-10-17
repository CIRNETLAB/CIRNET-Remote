import { defineStore } from 'pinia'
import type { WireIdentity, WireRouteMode } from '../types/circuit'
import { ZOOM_DEFAULT, clampZoom } from '../config/workbenchViewport'
import { normalizeComponentProperties } from '../data/componentProperties'
import { getDefinition, validateProperties } from '../data/editorCatalog'
import { componentDesignTransition } from '../data/partCatalog'
import { normalizeEditorSelection, toggleModuleSelection, toggleWireSelection, type EditorSelection } from '../editor/selection'
export type WorkspaceTool = 'select' | 'wire' | 'move' | 'rotate'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({ selectedModuleId: null as string | null, selectedWire: null as WireIdentity | null, selectedModuleIds: [] as string[], selectedWires: [] as WireIdentity[], marqueeActive: false, pendingPort: null as string | null, wireColor: '#d8493f', wireRouteMode: 'FREE' as WireRouteMode, selectedWireBend: null as number | null, previewType: null as string | null, placementType: null as string | null, placementProperties: null as Record<string, unknown> | null, placementEpoch: 0, showPins: false, snap: true, zoom: ZOOM_DEFAULT, fitRequest: 0, zoomAreaActive: false, tool: 'select' as WorkspaceTool, editError: '' }),
  getters: {
    selection: (state): EditorSelection => normalizeEditorSelection({
      moduleIds: [...state.selectedModuleIds, ...(state.selectedModuleId ? [state.selectedModuleId] : [])],
      wires: [...state.selectedWires, ...(state.selectedWire ? [state.selectedWire] : [])],
    }),
    selectionCount(): number { return this.selection.moduleIds.length + this.selection.wires.length },
    wireOptionsActive: (state) => (state.tool === 'wire' || Boolean(state.selectedWire)) && !state.placementType && !state.zoomAreaActive && !state.marqueeActive,
  },
  actions: {
    setTool(tool: WorkspaceTool) { this.cancelMarquee(true); this.cancelZoomArea(); this.tool = tool; this.cancelPlacement() },
    preview(type: string) { this.cancelMarquee(true); this.cancelZoomArea(); this.previewType = type; this.selectedModuleId = null },
    armPlacement(type: string, properties?: Record<string, unknown>) { const snapshot = properties ? normalizeComponentProperties(type, properties) : null; this.cancelMarquee(true); this.cancelZoomArea(); this.clearSelection(); this.previewType = type; this.placementType = type; this.placementProperties = snapshot; this.placementEpoch++; this.tool = 'select'; this.editError = '' },
    updatePlacementProperties(patch: Record<string, unknown>, nextType?: string) {
      if (!this.placementType) throw new Error('Choose a component to place first.')
      const type = nextType ?? this.placementType
      if (type !== this.placementType && componentDesignTransition(this.placementType, patch).type !== type) throw new Error('Choose Add to place a different component.')
      const definition = getDefinition(type)
      if (!definition) throw new Error('This component cannot be placed.')
      const properties = normalizeComponentProperties(type, { ...definition.defaults, ...this.placementProperties, ...patch })
      validateProperties(type, properties)
      this.placementProperties = properties; this.placementType = type; this.previewType = type; this.editError = ''
    },
    selectModule(id: string | null) { this.cancelMarquee(true); this.selectedModuleId = id; this.selectedWire = null; this.selectedWireBend = null; this.placementType = null; this.editError = '' },
    selectWire(source: string, destination: string) { this.cancelMarquee(true); this.selectedModuleId = null; this.selectedWire = { source, destination }; this.selectedWireBend = null; this.placementType = null },
    cancelPlacement() { this.placementType = null; this.placementProperties = null; this.pendingPort = null },
    clearSelection() { this.clearMarqueeSelection(); this.selectedModuleId = null; this.selectedWire = null; this.selectedWireBend = null; this.previewType = null; this.cancelPlacement(); this.editError = '' },
    setZoom(value: number) { if (Number.isFinite(value)) { this.cancelZoomArea(); this.zoom = clampZoom(value) } },
    fitEntireCircuit() { this.cancelMarquee(true); this.cancelZoomArea(); this.zoom = ZOOM_DEFAULT; this.fitRequest++ },
    toggleZoomArea() { this.cancelMarquee(true); this.zoomAreaActive = !this.zoomAreaActive; if (this.zoomAreaActive) { this.cancelPlacement(); this.editError = '' } },
    cancelZoomArea() { this.zoomAreaActive = false },
    toggleMarquee() {
      if (this.marqueeActive) { this.cancelMarquee(true); return }
      this.cancelZoomArea(); this.clearSelection(); this.marqueeActive = true; this.tool = 'select'
    },
    clearMarqueeSelection() {
      if (this.selectedModuleIds.length || this.selectedWires.length) { this.selectedModuleId = null; this.selectedWire = null; this.selectedWireBend = null }
      this.selectedModuleIds = []; this.selectedWires = []
    },
    cancelMarquee(clearSelection = false) { this.marqueeActive = false; if (clearSelection) this.clearMarqueeSelection() },
    setMarqueeSelection(selection: { moduleIds: string[]; wires: WireIdentity[] }) {
      this.setSelection(selection)
    },
    setSelection(selection: { moduleIds: string[]; wires: WireIdentity[] }) {
      this.clearSelection()
      const normalized = normalizeEditorSelection(selection)
      this.selectedModuleIds = normalized.moduleIds
      this.selectedWires = normalized.wires
      const count = this.selectedModuleIds.length + this.selectedWires.length
      // Only one object may drive Inspector and the existing edit controls.
      this.selectedModuleId = count === 1 && this.selectedModuleIds.length ? this.selectedModuleIds[0] : null
      this.selectedWire = count === 1 && this.selectedWires.length ? this.selectedWires[0] : null
    },
    toggleModule(id: string) {
      this.setSelection(toggleModuleSelection(this.selection, id))
    },
    toggleWire(source: string, destination: string) {
      this.setSelection(toggleWireSelection(this.selection, { source, destination }))
    },
  },
})
