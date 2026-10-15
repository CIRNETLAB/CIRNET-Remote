import { defineStore } from 'pinia'
import type { WireRouteMode } from '../types/circuit'
import { ZOOM_DEFAULT, clampZoom } from '../config/workbenchViewport'
import { normalizeComponentProperties } from '../data/componentProperties'
export type WorkspaceTool = 'select' | 'wire' | 'move' | 'rotate'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({ selectedModuleId: null as string | null, selectedWire: null as { source: string; destination: string } | null, pendingPort: null as string | null, wireColor: '#d8493f', wireRouteMode: 'FREE' as WireRouteMode, selectedWireBend: null as number | null, previewType: null as string | null, placementType: null as string | null, placementProperties: null as Record<string, unknown> | null, showPins: false, snap: true, zoom: ZOOM_DEFAULT, fitRequest: 0, zoomAreaActive: false, tool: 'select' as WorkspaceTool, editError: '' }),
  getters: {
    wireOptionsActive: (state) => (state.tool === 'wire' || Boolean(state.selectedWire)) && !state.placementType && !state.zoomAreaActive,
  },
  actions: {
    setTool(tool: WorkspaceTool) { this.cancelZoomArea(); this.tool = tool; this.cancelPlacement() },
    preview(type: string) { this.cancelZoomArea(); this.previewType = type; this.selectedModuleId = null },
    armPlacement(type: string, properties?: Record<string, unknown>) { const snapshot = properties ? normalizeComponentProperties(type, properties) : null; this.cancelZoomArea(); this.clearSelection(); this.previewType = type; this.placementType = type; this.placementProperties = snapshot; this.tool = 'select'; this.editError = '' },
    selectModule(id: string | null) { this.selectedModuleId = id; this.selectedWire = null; this.selectedWireBend = null; this.placementType = null; this.editError = '' },
    selectWire(source: string, destination: string) { this.selectedModuleId = null; this.selectedWire = { source, destination }; this.selectedWireBend = null; this.placementType = null },
    cancelPlacement() { this.placementType = null; this.placementProperties = null; this.pendingPort = null },
    clearSelection() { this.selectedModuleId = null; this.selectedWire = null; this.previewType = null; this.cancelPlacement(); this.editError = '' },
    setZoom(value: number) { if (Number.isFinite(value)) { this.cancelZoomArea(); this.zoom = clampZoom(value) } },
    fitEntireCircuit() { this.cancelZoomArea(); this.zoom = ZOOM_DEFAULT; this.fitRequest++ },
    toggleZoomArea() { this.zoomAreaActive = !this.zoomAreaActive; if (this.zoomAreaActive) { this.cancelPlacement(); this.editError = '' } },
    cancelZoomArea() { this.zoomAreaActive = false },
  },
})
