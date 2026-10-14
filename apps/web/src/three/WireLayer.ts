import { BackSide, BufferGeometry, Color, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3, type PerspectiveCamera } from 'three'
import type { CircuitConnection, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { copyWireVisual, readWireVisual, wireKey } from '../wires/wireVisual'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from '../wires/wireRouting'
import { buildWireGeometry, roundedWirePoints } from './WireGeometry'
import { disposeObject } from './ComponentModel'
import { MIN_WIRE_DIAMETER, renderWireDiameter } from '../wires/wireAppearance'
import { createWireTerminals, deriveWireParts, type WireParts } from './WireTerminals'

interface WireRecord { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; pick: Line; connection: CircuitConnection; signature: string; route: SolvedWireRoute; parts: WireParts }

export function createWireLayer(endpointPosition: (endpoint: string) => Vector3 | null, routeContext?: WireRouteContext) {
  const group = new Group(), tools = new Group(), records = new Map<string, WireRecord>()
  const terminals = createWireTerminals()
  const connections = new Map<string, CircuitConnection>(), incident = new Map<string, Set<string>>(), overrides = new Map<string, WireVisual>(), dirty = new Set<string>()
  let largestDiameter = MIN_WIRE_DIAMETER
  const context: WireRouteContext = { ...(routeContext ?? { endpoint: (value: string) => { const position = endpointPosition(value); return position ? { endpoint: value, position } : null }, modulePose: () => null }), layerDiameter: () => Math.max(largestDiameter, routeContext?.layerDiameter?.() ?? 0) }
  let selected: WireIdentity | null = null, hovered: WireIdentity | null = null, selectedHandle: number | null = null
  let handleMesh: InstancedMesh | null = null, drawingMesh: Mesh<BufferGeometry, MeshStandardMaterial> | null = null
  let segmentLine: Line | null = null, selectedSegment: number | null = null, segmentSignature = ''
  let drawingSignature = ''
  let viewCamera: PerspectiveCamera | null = null, viewHeight = 1, cameraSignature = ''
  const outlines = new Map<string, { mesh: Mesh<BufferGeometry, MeshBasicMaterial>; signature: string }>()
  let drawing: { wire: WireIdentity; visual: WireVisual; cursor: Point3 | null } | null = null, drawingDirty = false, disposed = false
  group.name = 'committed-wires'; tools.name = 'wire-tools'
  const same = (a: WireIdentity | null, b: WireIdentity) => !!a && wireKey(a) === wireKey(b)
  const style = (record: WireRecord) => {
    const visual = overrides.get(wireKey(record.connection)) ?? readWireVisual(record.connection)
    record.mesh.material.color.set(visual.color)
    record.mesh.material.emissive.set('#000000')
  }
  const updateOutlines = () => {
    for (const [name, wire] of [['wire-selection-outline', selected], ['wire-hover-outline', hovered && !same(selected, hovered) ? hovered : null]] as const) {
      const record = wire && records.get(wireKey(wire)), existing = outlines.get(name)
      if (!record) { if (existing) existing.mesh.visible = false; continue }
      const diameter = renderWireDiameter(overrides.get(wireKey(record.connection)) ?? readWireVisual(record.connection)) + (name === 'wire-selection-outline' ? .02 : .013)
      const signature = JSON.stringify([record.parts.bodyPoints, diameter])
      if (!existing || existing.signature !== signature) {
        const geometry = buildWireGeometry({ points: record.parts.bodyPoints }, diameter, { caps: false })
        if (existing) { existing.mesh.geometry.dispose(); existing.mesh.geometry = geometry; existing.signature = signature }
        else {
          const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: '#e8c36c', side: BackSide, depthWrite: false }))
          mesh.name = name; mesh.userData.ignorePick = true; tools.add(mesh); outlines.set(name, { mesh, signature })
        }
      }
      outlines.get(name)!.mesh.visible = true
    }
  }
  const remove = (key: string) => {
    const record = records.get(key)
    if (record) { group.remove(record.mesh); terminals.detach(record.mesh); disposeObject(record.mesh); records.delete(key) }
  }
  const update = (connection: CircuitConnection) => {
    const key = wireKey(connection), visual = overrides.get(key) ?? readWireVisual(connection), route = solveWireRoute(connection, visual, context)
    if (!route) { remove(key); return }
    const diameter = renderWireDiameter(visual), parts = deriveWireParts(route, diameter), signature = JSON.stringify([parts, diameter])
    let record = records.get(key)
    const geometryChanged = !record || record.signature !== signature
    if (geometryChanged) {
      const geometry = buildWireGeometry({ points: parts.bodyPoints }, diameter, { capHoleRadius: parts.capHoleRadius })
      const pickGeometry = new BufferGeometry().setFromPoints(roundedWirePoints(route.points, diameter / 2))
      if (record) { record.mesh.geometry.dispose(); record.pick.geometry.dispose(); record.mesh.geometry = geometry; record.pick.geometry = pickGeometry }
      else {
        const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: visual.color, roughness: .62, metalness: 0 }))
        const pick = new Line(pickGeometry, new LineBasicMaterial()); pick.visible = false
        mesh.userData = { kind: 'wire', source: connection.source, destination: connection.destination }; pick.userData = { ...mesh.userData }
        mesh.add(pick); group.add(mesh)
        record = { mesh, pick, connection, signature, route, parts }; records.set(key, record)
      }
    }
    record!.connection = connection; record!.signature = signature; record!.route = route; record!.parts = parts; style(record!)
    if (geometryChanged) terminals.update(record!.mesh, parts)
  }
  const updateHandles = () => {
    const route = selected && records.get(wireKey(selected))?.route
    const count = route ? route.handles.length + 2 : 0
    if (count && (!handleMesh || handleMesh.instanceMatrix.count < count)) {
      if (handleMesh) { tools.remove(handleMesh); disposeObject(handleMesh) }
      handleMesh = new InstancedMesh(new SphereGeometry(.04, 8, 5), new MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }), 2 ** Math.ceil(Math.log2(Math.max(8, count))))
      handleMesh.renderOrder = 10
      handleMesh.name = 'wire-handles'; tools.add(handleMesh)
    }
    if (!handleMesh) return
    handleMesh.count = count
    if (!route) return
    const points = [...route.handles.map(h => h.position), route.points[0], route.points.at(-1)!]
    points.forEach((p, i) => {
      const depth = viewCamera ? -new Vector3(p.x, p.y, p.z).applyMatrix4(viewCamera.matrixWorldInverse).z : 0
      const radius = viewCamera ? Math.max(viewCamera.near, depth) * 2 * Math.tan(viewCamera.fov * Math.PI / 360) / (viewHeight * viewCamera.zoom) * 3.5 : .04
      handleMesh!.setMatrixAt(i, new Matrix4().makeScale(radius / .04, radius / .04, radius / .04).setPosition(p.x, p.y, p.z))
      handleMesh!.setColorAt(i, new Color(i >= route.handles.length ? '#8ebf75' : route.handles[i].index === selectedHandle ? '#fff1bd' : '#d9b66f'))
    })
    handleMesh.instanceMatrix.needsUpdate = true
    if (handleMesh.instanceColor) handleMesh.instanceColor.needsUpdate = true
    handleMesh.computeBoundingSphere()
  }
  const updateSegment = () => {
    const record = selected && records.get(wireKey(selected)), segment = selectedSegment !== null && record ? record.route.segments[selectedSegment] : null
    if (!segment || !segment.editable || !record) { if (segmentLine) segmentLine.visible = false; return }
    const signature = JSON.stringify([segment.start, segment.end])
    if (!segmentLine || signature !== segmentSignature) {
      const geometry = new BufferGeometry().setFromPoints([new Vector3(segment.start.x, segment.start.y, segment.start.z), new Vector3(segment.end.x, segment.end.y, segment.end.z)])
      if (segmentLine) { segmentLine.geometry.dispose(); segmentLine.geometry = geometry }
      else { segmentLine = new Line(geometry, new LineBasicMaterial({ color: '#e4c378', depthTest: false, depthWrite: false })); segmentLine.name = 'wire-segment-hover-line'; segmentLine.userData.ignorePick = true; tools.add(segmentLine) }
      segmentSignature = signature
    }
    segmentLine.visible = true
  }
  const clearDrawing = () => { drawing = null; drawingDirty = false; drawingSignature = ''; if (drawingMesh) { tools.remove(drawingMesh); terminals.detach(drawingMesh); disposeObject(drawingMesh); drawingMesh = null } }
  const updateDrawing = () => {
    if (!drawing) return
    const state = drawing, destination = state.wire.destination || '@cursor'
    const previewContext: WireRouteContext = { ...context, endpoint: value => value === '@cursor' ? state.cursor ? { endpoint: value, position: state.cursor } : null : context.endpoint(value) }
    const route = solveWireRoute({ ...state.wire, destination }, state.visual, previewContext)
    if (!route) { if (drawingMesh) drawingMesh.visible = false; return }
    const diameter = renderWireDiameter(state.visual), parts = deriveWireParts(route, diameter), signature = JSON.stringify([parts, diameter])
    if (!drawingMesh || signature !== drawingSignature) {
      const geometry = buildWireGeometry({ points: parts.bodyPoints }, diameter, { capHoleRadius: parts.capHoleRadius })
      if (drawingMesh) { drawingMesh.geometry.dispose(); drawingMesh.geometry = geometry }
      else { drawingMesh = new Mesh(geometry, new MeshStandardMaterial({ color: state.visual.color, roughness: .62, metalness: 0, transparent: false, opacity: 1 })); drawingMesh.name = 'wire-drawing-preview'; tools.add(drawingMesh) }
      drawingSignature = signature
    }
    drawingMesh.material.color.set(state.visual.color); drawingMesh.visible = true
    terminals.update(drawingMesh, parts, destination === '@cursor')
    drawingMesh.userData.route = route
  }
  return {
    group, tools,
    layerDiameter: () => largestDiameter,
    updateCamera(camera: PerspectiveCamera, height: number) {
      if (disposed || height <= 0) return
      viewCamera = camera; viewHeight = height
      const signature = JSON.stringify([camera.position.toArray(), camera.quaternion.toArray(), camera.fov, camera.zoom, height])
      if (signature !== cameraSignature) { cameraSignature = signature; updateHandles() }
    },
    sync(next: CircuitConnection[]) {
      if (disposed) return
      largestDiameter = next.reduce((diameter, connection) => Math.max(diameter, renderWireDiameter(readWireVisual(connection))), MIN_WIRE_DIAMETER)
      const keys = new Set(next.map(wireKey))
      for (const key of records.keys()) if (!keys.has(key)) remove(key)
      connections.clear(); incident.clear(); overrides.clear(); dirty.clear()
      for (const connection of next) {
        const key = wireKey(connection); connections.set(key, connection)
        const visual = readWireVisual(connection)
        const owners = [connection.source.split('.')[0], connection.destination.split('.')[0], ...(visual.frameModuleId ? [visual.frameModuleId] : []), ...visual.controlPoints.flatMap(p => p.space === 'module' ? [p.moduleId] : [])]
        for (const id of owners) { const links = incident.get(id) ?? new Set<string>(); links.add(key); incident.set(id, links) }
        update(connection)
      }
      updateHandles(); updateSegment(); updateOutlines()
    },
    updateModule(id: string) {
      if (disposed) return
      for (const key of incident.get(id) ?? []) {
        if (routeContext) dirty.add(key)
        else update(connections.get(key)!)
      }
      if (drawing) drawingDirty = true
    },
    previewVisual(wire: WireIdentity, visual: WireVisual | null) {
      if (disposed) return
      const key = wireKey(wire)
      if (visual) overrides.set(key, copyWireVisual(visual)); else overrides.delete(key)
      dirty.add(key)
    },
    previewDrawing(wire: WireIdentity, visual: WireVisual, cursor: Point3 | null) { if (!disposed) { drawing = { wire: { ...wire }, visual: copyWireVisual(visual), cursor: cursor ? { ...cursor } : null }; drawingDirty = true } },
    clearDrawing,
    flush() {
      if (disposed) return
      const changed = dirty.size > 0
      for (const key of dirty) { const connection = connections.get(key); if (connection) update(connection) }
      dirty.clear()
      if (changed) { updateHandles(); updateSegment(); updateOutlines() }
      if (drawingDirty) { drawingDirty = false; updateDrawing() }
    },
    route(wire: WireIdentity) { return records.get(wireKey(wire))?.route ?? null },
    highlight(wire?: WireIdentity | null) { if (disposed) return; selected = wire ? { ...wire } : null; selectedHandle = null; selectedSegment = null; updateHandles(); updateSegment(); updateOutlines() },
    hover(wire: WireIdentity | null) { if (disposed) return; hovered = wire; updateOutlines() },
    selectHandle(index: number | null) { if (disposed) return; selectedHandle = index; updateHandles() },
    selectSegment(index: number | null) { if (disposed) return; selectedSegment = index; updateSegment() },
    dispose() {
      if (disposed) return; disposed = true
      clearDrawing(); if (handleMesh) { tools.remove(handleMesh); disposeObject(handleMesh); handleMesh = null }
      if (segmentLine) { tools.remove(segmentLine); disposeObject(segmentLine); segmentLine = null }
      for (const outline of outlines.values()) { tools.remove(outline.mesh); disposeObject(outline.mesh) }
      outlines.clear()
      for (const key of records.keys()) remove(key)
      terminals.dispose()
      connections.clear(); incident.clear(); overrides.clear(); dirty.clear(); selected = null; hovered = null
    },
  }
}
