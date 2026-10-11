import { defineStore } from 'pinia'
import type { ConnectionState } from '../services/websocket/client'
import { windowDefinitions, type WindowKind, type WorkspaceWindow } from '../types/windows'

function bound(window: WorkspaceWindow, width: number, height: number) {
  window.width = Math.min(windowDefinitions[window.kind].width, width)
  window.height = Math.min(windowDefinitions[window.kind].height, height)
  window.x = Math.max(0, Math.min(window.x, width - window.width))
  window.y = Math.max(0, Math.min(window.y, height - window.height))
}

export const useUiStore = defineStore('ui', {
  state: () => ({ activeRibbonGroup: null as string | null, componentToolbarCollapsed: false, toolsSidebarCollapsed: false, componentToolbarHeight: null as number | null, toolsSidebarWidth: null as number | null, workbenchSize: { width: 900, height: 600 }, windows: [] as WorkspaceWindow[], viewport: { width: 900, height: 500 }, connectionState: 'idle' as ConnectionState }),
  getters: {
    componentToolbarMaxHeight: (state) => Math.max(96, Math.min(260, state.workbenchSize.height - 180)),
    toolsSidebarMaxWidth: (state) => Math.max(54, Math.min(180, state.workbenchSize.width - 200)),
  },
  actions: {
    toggleRibbon(id: string) { if (!this.componentToolbarCollapsed) this.activeRibbonGroup = this.activeRibbonGroup === id ? null : id },
    toggleComponentToolbar() {
      this.componentToolbarCollapsed = !this.componentToolbarCollapsed
      this.activeRibbonGroup = null
    },
    toggleToolsSidebar() { this.toolsSidebarCollapsed = !this.toolsSidebarCollapsed },
    setComponentToolbarHeight(height: number) { if (Number.isFinite(height)) this.componentToolbarHeight = Math.max(96, Math.min(260, height)) },
    setToolsSidebarWidth(width: number) { if (Number.isFinite(width)) this.toolsSidebarWidth = Math.max(54, Math.min(180, width)) },
    setWorkbenchSize(width: number, height: number) {
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      width = Math.max(0, width); height = Math.max(0, height)
      if (this.workbenchSize.width !== width || this.workbenchSize.height !== height) this.workbenchSize = { width, height }
    },
    setViewport(width: number, height: number) {
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      width = Math.max(0, width); height = Math.max(0, height)
      if (this.viewport.width === width && this.viewport.height === height) return
      this.viewport = { width, height }
      for (const window of this.windows) bound(window, this.viewport.width, this.viewport.height)
    },
    openWindow(kind: WindowKind, options: { activate?: boolean } = {}) {
      let window = this.windows.find((entry) => entry.kind === kind)
      if (!window) {
        const index = this.windows.length
        window = { kind, open: true, x: 32 + index * 26, y: 36 + index * 22, width: windowDefinitions[kind].width, height: windowDefinitions[kind].height, z: 0, activation: 0 }
        this.windows.push(window)
      }
      window.open = true
      bound(window, this.viewport.width, this.viewport.height)
      this.focusWindow(kind)
      if (options.activate !== false) window.activation++
    },
    closeWindow(kind: WindowKind) { const window = this.windows.find((entry) => entry.kind === kind); if (window) window.open = false },
    focusWindow(kind: WindowKind) {
      const ordered = [...this.windows].sort((a, b) => a.z - b.z)
      const active = ordered.find((entry) => entry.kind === kind)
      if (!active) return
      const rest = ordered.filter((entry) => entry !== active)
      rest.push(active)
      rest.forEach((entry, index) => { entry.z = index + 1 })
    },
    moveWindow(kind: WindowKind, x: number, y: number) {
      const window = this.windows.find((entry) => entry.kind === kind)
      if (!window || !Number.isFinite(x) || !Number.isFinite(y)) return
      window.x = x; window.y = y
      bound(window, this.viewport.width, this.viewport.height)
    },
  },
})
