import { defineStore } from 'pinia'
import type { ConnectionState } from '../services/websocket/client'
import { windowDefinitions, type WindowKind, type WorkspaceWindow } from '../types/windows'

function bound(window: WorkspaceWindow, width: number, height: number, insets: { left: number; top: number }) {
  const left = Math.min(insets.left, width), top = Math.min(insets.top, height)
  window.width = Math.min(windowDefinitions[window.kind].width, width - left)
  window.height = Math.min(windowDefinitions[window.kind].height, height - top)
  window.x = Math.max(left, Math.min(window.x, width - window.width))
  window.y = Math.max(top, Math.min(window.y, height - window.height))
}

export const useUiStore = defineStore('ui', {
  state: () => ({ activeRibbonGroup: null as string | null, componentToolbarCollapsed: false, toolsSidebarCollapsed: false, componentToolbarHeight: null as number | null, toolsSidebarWidth: null as number | null, workbenchSize: { width: 900, height: 600 }, windows: [] as WorkspaceWindow[], viewport: { width: 900, height: 500 }, connectionState: 'idle' as ConnectionState }),
  getters: {
    componentToolbarMaxHeight: (state) => Math.max(96, Math.min(260, state.workbenchSize.height - 180)),
    toolsSidebarMaxWidth: (state) => Math.max(54, Math.min(180, state.workbenchSize.width - 200)),
    componentOverlayHeight(): number { return Math.min(this.componentToolbarHeight ?? 96, this.componentToolbarMaxHeight) },
    toolsOverlayWidth(): number { return Math.min(this.toolsSidebarWidth ?? (this.workbenchSize.width <= 560 ? 54 : 66), this.toolsSidebarMaxWidth) },
    drawerInsets(): { left: number; top: number } {
      return { left: this.toolsSidebarCollapsed ? 0 : this.toolsOverlayWidth, top: this.componentToolbarCollapsed ? 0 : this.componentOverlayHeight }
    },
  },
  actions: {
    toggleRibbon(id: string) { if (!this.componentToolbarCollapsed) this.activeRibbonGroup = this.activeRibbonGroup === id ? null : id },
    toggleComponentToolbar() {
      this.componentToolbarCollapsed = !this.componentToolbarCollapsed
      this.activeRibbonGroup = null
      if (!this.componentToolbarCollapsed) this.boundWindows()
    },
    toggleToolsSidebar() { this.toolsSidebarCollapsed = !this.toolsSidebarCollapsed; if (!this.toolsSidebarCollapsed) this.boundWindows() },
    setComponentToolbarHeight(height: number) {
      if (!Number.isFinite(height)) return
      height = Math.max(96, Math.min(260, height))
      if (this.componentToolbarHeight === height) return
      this.componentToolbarHeight = height
      if (!this.componentToolbarCollapsed) this.boundWindows()
    },
    setToolsSidebarWidth(width: number) {
      if (!Number.isFinite(width)) return
      width = Math.max(54, Math.min(180, width))
      if (this.toolsSidebarWidth === width) return
      this.toolsSidebarWidth = width
      if (!this.toolsSidebarCollapsed) this.boundWindows()
    },
    boundWindows() { for (const window of this.windows) bound(window, this.viewport.width, this.viewport.height, this.drawerInsets) },
    setWorkbenchSize(width: number, height: number) {
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      width = Math.max(0, width); height = Math.max(0, height)
      if (this.workbenchSize.width === width && this.workbenchSize.height === height) return
      this.workbenchSize = { width, height }
      this.boundWindows()
    },
    setViewport(width: number, height: number) {
      if (!Number.isFinite(width) || !Number.isFinite(height)) return
      width = Math.max(0, width); height = Math.max(0, height)
      if (this.viewport.width === width && this.viewport.height === height) return
      this.viewport = { width, height }
      this.boundWindows()
    },
    openWindow(kind: WindowKind, options: { activate?: boolean } = {}) {
      let window = this.windows.find((entry) => entry.kind === kind)
      if (!window) {
        const index = this.windows.length
        window = { kind, open: true, x: 32 + index * 26, y: 36 + index * 22, width: windowDefinitions[kind].width, height: windowDefinitions[kind].height, z: 0, activation: 0 }
        this.windows.push(window)
      }
      window.open = true
      bound(window, this.viewport.width, this.viewport.height, this.drawerInsets)
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
      bound(window, this.viewport.width, this.viewport.height, this.drawerInsets)
    },
  },
})
