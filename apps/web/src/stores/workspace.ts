import { defineStore } from 'pinia'
import type { WireRouteMode } from '../types/circuit'
export type WorkspaceTool = 'select' | 'wire' | 'move' | 'rotate' | 'delete' | 'scope' | 'probe'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({ selectedModuleId: null as string | null, selectedWire: null as { source: string; destination: string } | null, pendingPort: null as string | null, wireColor: '#d8493f', wireRouteMode: 'AUTO' as WireRouteMode, selectedWireBend: null as number | null, previewType: null as string | null, placementType: null as string | null, snap: true, zoom: 100, fitRequest: 0, zoomAreaActive: false, tool: 'select' as WorkspaceTool, editError: '' }),
  actions: {
    setTool(tool: WorkspaceTool) { this.cancelZoomArea(); this.tool = tool; this.cancelPlacement() },
    preview(type: string) { this.cancelZoomArea(); this.previewType = type; this.selectedModuleId = null },
    armPlacement(type: string) { this.cancelZoomArea(); this.clearSelection(); this.previewType = type; this.placementType = type; this.tool = 'select'; this.editError = '' },
    selectModule(id: string | null) { this.selectedModuleId = id; this.selectedWire = null; this.selectedWireBend = null; this.placementType = null; this.editError = '' },
    selectWire(source: string, destination: string) { this.selectedModuleId = null; this.selectedWire = { source, destination }; this.selectedWireBend = null; this.placementType = null },
    cancelPlacement() { this.placementType = null; this.pendingPort = null },
    clearSelection() { this.selectedModuleId = null; this.selectedWire = null; this.previewType = null; this.cancelPlacement(); this.editError = '' },
    setZoom(value: number) { if (Number.isFinite(value)) { this.cancelZoomArea(); this.zoom = Math.min(200, Math.max(50, value)) } },
    fitEntireCircuit() { this.cancelZoomArea(); this.zoom = 100; this.fitRequest++ },
    toggleZoomArea() { this.zoomAreaActive = !this.zoomAreaActive; if (this.zoomAreaActive) { this.cancelPlacement(); this.editError = '' } },
    cancelZoomArea() { this.zoomAreaActive = false },
  },
})
