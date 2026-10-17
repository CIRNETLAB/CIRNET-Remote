import { Group, Mesh, Sprite, Vector3, type Material } from 'three'
import type { CircuitGraph } from '../types/circuit'
import type { EditorSelection } from '../editor/selection'
import { applyPose, buildComponent, disposeObject } from './ComponentModel'
import { createWireLayer } from './WireLayer'
import { wireKey } from '../wires/wireVisual'
import { graphWireRouteContext, type SelectionGhostRoute } from './SelectionGhostRoutes'
import { updateFlexiblePackageGeometry } from './package/FlexiblePackageGeometry'
import { isFlexibleMount } from '../electrical/flexibleGeometry'

/** Render-only projection of a complete candidate. Never registered for picking. */
export function createSelectionPreview() {
  const root = new Group(), models = new Map<string, Group>(), invalidWires = new Map<string, ReturnType<typeof createWireLayer>>()
  root.name = 'selection-duplicate-preview'; root.userData.ignorePick = true
  let graph: CircuitGraph | null = null
  const context = graphWireRouteContext(() => graph), pose = context.modulePose
  const wires = createWireLayer(value => { const point = context.endpoint(value)?.position; return point ? new Vector3(point.x, point.y, point.z) : null }, context)
  root.add(wires.group)
  function tint(object: Group, valid: boolean) {
    object.traverse(child => {
      child.castShadow = false; child.receiveShadow = false
      if (!(child instanceof Mesh) && !(child instanceof Sprite)) return
      const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        material.transparent = true; material.opacity = .42; material.depthWrite = false
        if ('transmission' in material) (material as any).transmission = 0
        if ('color' in material) (material.color as { set(value: string): void }).set(valid ? '#60e6b0' : '#ff5959')
      }
    })
  }
  function clear() {
    for (const model of models.values()) { model.removeFromParent(); disposeObject(model) }
    models.clear(); graph = null; wires.sync([]); clearInvalidWires(); root.visible = false
  }
  function clearInvalidWires() {
    for (const layer of invalidWires.values()) { layer.tools.removeFromParent(); layer.dispose() }
    invalidWires.clear()
  }
  return {
    root,
    show(candidate: CircuitGraph, selection: EditorSelection, valid: boolean, fallbackRoutes?: SelectionGhostRoute[]) {
      graph = candidate; root.visible = true; root.userData.valid = valid
      const ids = new Set(selection.moduleIds)
      for (const [id, model] of models) if (!ids.has(id)) { model.removeFromParent(); disposeObject(model); models.delete(id) }
      for (const id of ids) {
        const module = candidate.modules.find(item=>item.id===id)
        if (!module) continue
        const signature = JSON.stringify([module.type, module.properties])
        let model = models.get(id)
        if (model && (model.userData.previewSignature !== signature || !!model.userData.resolvedPinAnchors!==isFlexibleMount(module.mount))) { model.removeFromParent(); disposeObject(model); models.delete(id); model = undefined }
        if (!model) { model = buildComponent(module,candidate.modules); model.userData.previewSignature = signature; models.set(id, model); root.add(model) }
        updateFlexiblePackageGeometry(model,module,candidate.modules)
        applyPose(model, pose(id)!); tint(model, valid)
      }
      if (fallbackRoutes) {
        wires.sync([])
        const keys = new Set(fallbackRoutes.map(item => wireKey(item.wire)))
        for (const [key, layer] of invalidWires) if (!keys.has(key)) { layer.tools.removeFromParent(); layer.dispose(); invalidWires.delete(key) }
        for (const item of fallbackRoutes) {
          const key = wireKey(item.wire)
          let layer = invalidWires.get(key)
          if (!layer) { layer = createWireLayer(() => null); invalidWires.set(key, layer); root.add(layer.tools) }
          layer.previewDuplicate(item.wire, item.visual, false, item.route)
        }
        return
      }
      clearInvalidWires()
      const keys = new Set(selection.wires.map(wireKey))
      // Layout must see the same complete wire set as the committed scene, so
      // crossings and bridge clearances do not change when a ghost is pasted.
      wires.sync(candidate.connections)
      for (const { wire, mesh } of wires.selectionMeshes()) mesh.visible = keys.has(wireKey(wire))
      tint(wires.group, valid)
    },
    clear,
    dispose() { clear(); wires.dispose(); root.removeFromParent() },
  }
}
