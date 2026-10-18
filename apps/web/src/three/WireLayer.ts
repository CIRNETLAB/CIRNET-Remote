import { BackSide, BufferGeometry, Color, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3, type PerspectiveCamera } from 'three'
import type { CircuitConnection, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { copyWireVisual, readWireVisual, wireKey } from '../wires/wireVisual'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from '../wires/wireRouting'
import { buildWireGeometry, roundedWirePoints } from './WireGeometry'
import { disposeObject } from './ComponentModel'
import { renderWireDiameter } from '../wires/wireAppearance'
import { createWireTerminals, deriveWireParts, type WireParts } from './WireTerminals'
import { createWireLayoutCache, type WireLayoutInput } from '../wires/wireLayout'

interface WireRecord { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; pick: Line; connection: CircuitConnection; signature: string; route: SolvedWireRoute; parts: WireParts }

export function createWireLayer(endpointPosition: (endpoint: string) => Vector3 | null, routeContext?: WireRouteContext) {
  const group = new Group(), tools = new Group(), records = new Map<string, WireRecord>()
  const terminals = createWireTerminals()
  const layoutCache = createWireLayoutCache()
  const duplicateLayout = createWireLayoutCache()
  const connections = new Map<string, CircuitConnection>(), incident = new Map<string, Set<string>>(), overrides = new Map<string, WireVisual>(), dirty = new Set<string>()
  const context: WireRouteContext = routeContext ?? { endpoint: (value: string) => { const position = endpointPosition(value); return position ? { endpoint: value, position } : null }, modulePose: () => null }
  let selected: WireIdentity | null = null, hovered: WireIdentity | null = null, selectedHandle: number | null = null
  let multiSelected: WireIdentity[] = []
  let handleMesh: InstancedMesh | null = null, drawingMesh: Mesh<BufferGeometry, MeshStandardMaterial> | null = null
  let segmentLine: Line | null = null, selectedSegment: number | null = null, segmentSignature = ''
  let drawingSignature = ''
  let duplicateMesh: Mesh<BufferGeometry, MeshStandardMaterial> | null = null, duplicateSignature = ''
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
    const requested: [string, WireIdentity | null][] = [['wire-selection-outline', selected], ['wire-hover-outline', hovered && !same(selected, hovered) ? hovered : null], ...multiSelected.map(wire => [`wire-multi-outline:${wireKey(wire)}`, wire] as [string, WireIdentity])]
    const names = new Set(requested.map(([name]) => name))
    for (const [name, outline] of outlines) if (!names.has(name)) { tools.remove(outline.mesh); disposeObject(outline.mesh); outlines.delete(name) }
    for (const [name, wire] of requested) {
      const record = wire && records.get(wireKey(wire)), existing = outlines.get(name)
      if (!record) { if (existing) existing.mesh.visible = false; continue }
      const diameter = renderWireDiameter(overrides.get(wireKey(record.connection)) ?? readWireVisual(record.connection)) + (name === 'wire-hover-outline' ? .013 : .02)
      const signature = JSON.stringify([record.parts.bodyPoints, diameter])
      if (!existing || existing.signature !== signature) {
        const geometry = buildWireGeometry({ points: record.parts.bodyPoints }, diameter, { caps: false, path: record.parts.bodyPath })
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
  const update = (connection: CircuitConnection, route: SolvedWireRoute | null) => {
    const key = wireKey(connection), visual = overrides.get(key) ?? readWireVisual(connection)
    if (!route) {
      const previous=records.get(key)
      if(previous&&overrides.has(key)){previous.mesh.material.color.set('#f16365');previous.mesh.userData.invalidGeometry=true;return}
      remove(key);return
    }
    const diameter = renderWireDiameter(visual)
    let parts:WireParts
    try { parts=deriveWireParts(route,diameter) } catch {
      const previous=records.get(key)
      if(previous){previous.mesh.material.color.set('#f16365');previous.mesh.userData.invalidGeometry=true}
      return
    }
    const signature = JSON.stringify([parts, diameter])
    let record = records.get(key)
    const geometryChanged = !record || record.signature !== signature
    if (geometryChanged) {
      const geometry = buildWireGeometry({ points: parts.bodyPoints }, diameter, { capHoleRadius: parts.capHoleRadius, path: parts.bodyPath })
      const pickGeometry = new BufferGeometry().setFromPoints(roundedWirePoints(parts.bodyPoints, diameter / 2))
      if (record) { record.mesh.geometry.dispose(); record.pick.geometry.dispose(); record.mesh.geometry = geometry; record.pick.geometry = pickGeometry }
      else {
        const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: visual.color, roughness: .62, metalness: 0 }))
        const pick = new Line(pickGeometry, new LineBasicMaterial()); pick.visible = false
        mesh.userData = { kind: 'wire', source: connection.source, destination: connection.destination }; pick.userData = { ...mesh.userData }
        mesh.add(pick); group.add(mesh)
        record = { mesh, pick, connection, signature, route, parts }; records.set(key, record)
      }
    }
    record!.connection = connection; record!.signature = signature; record!.route = route; record!.parts = parts; record!.mesh.userData.invalidGeometry=false; style(record!)
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
    const points = [...(route.renderHandles ?? route.handles).map(h => h.position), route.points[0], route.points.at(-1)!]
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
    const record = selected && records.get(wireKey(selected)), segments = record && selectedSegment !== null ? (record.route.renderSegments ?? record.route.segments).filter(segment => segment.index === selectedSegment && segment.editable) : []
    if (!segments.length || !record) { if (segmentLine) segmentLine.visible = false; return }
    const points = [segments[0].start, ...segments.map(segment => segment.end)]
    const signature = JSON.stringify(points)
    if (!segmentLine || signature !== segmentSignature) {
      const geometry = new BufferGeometry().setFromPoints(points.map(point => new Vector3(point.x, point.y, point.z)))
      if (segmentLine) { segmentLine.geometry.dispose(); segmentLine.geometry = geometry }
      else { segmentLine = new Line(geometry, new LineBasicMaterial({ color: '#e4c378', depthTest: false, depthWrite: false })); segmentLine.name = 'wire-segment-hover-line'; segmentLine.userData.ignorePick = true; tools.add(segmentLine) }
      segmentSignature = signature
    }
    segmentLine.visible = true
  }
  const clearDrawing = () => { const active = !!drawing; drawing = null; drawingDirty = false; drawingSignature = ''; if (drawingMesh) { tools.remove(drawingMesh); terminals.detach(drawingMesh); disposeObject(drawingMesh); drawingMesh = null }; if (active && !disposed) refresh() }
  const clearDuplicate = () => {
    if (duplicateMesh) { tools.remove(duplicateMesh); terminals.detach(duplicateMesh); disposeObject(duplicateMesh); duplicateMesh = null }
    duplicateSignature = ''; duplicateLayout.clear()
  }
  const previewDuplicate = (wire: WireIdentity, visual: WireVisual, valid: boolean, fallback?: SolvedWireRoute | null) => {
    if (disposed) return
    let route = fallback ?? solveWireRoute(wire, visual, context)
    if (route && !fallback) {
      const key = { source: '@duplicate', destination: '@preview' }
      const inputs: WireLayoutInput[] = [...connections.values()].flatMap(connection => {
        const appearance = readWireVisual(connection), solved = solveWireRoute(connection, appearance, context)
        return solved ? [{ wire: connection, visual: appearance, route: solved }] : []
      })
      inputs.push({ wire: key, visual, route })
      route = duplicateLayout.sync(inputs).get(wireKey(key)) ?? route
    }
    if (!route) { if (duplicateMesh) duplicateMesh.visible = false; return }
    const diameter = renderWireDiameter(visual)
    let parts:WireParts
    try{parts=deriveWireParts(route,diameter)}catch{if(duplicateMesh){duplicateMesh.material.color.set('#f16365');duplicateMesh.userData.valid=false}return}
    const signature = JSON.stringify([parts, diameter])
    if (!duplicateMesh || duplicateSignature !== signature) {
      const geometry = buildWireGeometry({ points: parts.bodyPoints }, diameter, { capHoleRadius: parts.capHoleRadius, path: parts.bodyPath })
      if (duplicateMesh) { duplicateMesh.geometry.dispose(); duplicateMesh.geometry = geometry }
      else {
        duplicateMesh = new Mesh(geometry, new MeshStandardMaterial({ roughness: .62, metalness: 0, transparent: true, opacity: .56, depthWrite: false }))
        duplicateMesh.name = 'wire-duplicate-preview'; duplicateMesh.renderOrder = 12; duplicateMesh.userData.ignorePick = true; tools.add(duplicateMesh)
      }
      duplicateSignature = signature; terminals.update(duplicateMesh, parts)
    }
    duplicateMesh.material.color.set(valid ? visual.color : '#f16365'); duplicateMesh.visible = true
    duplicateMesh.userData.valid = valid; duplicateMesh.userData.route = route
  }
  const updateDrawing = (route: SolvedWireRoute | null) => {
    if (!drawing) return
    const state = drawing, destination = state.wire.destination || '@cursor'
    if (!route) { if (drawingMesh) drawingMesh.visible = false; return }
    const diameter = renderWireDiameter(state.visual)
    let parts:WireParts
    try{parts=deriveWireParts(route,diameter)}catch{if(drawingMesh){drawingMesh.material.color.set('#f16365');drawingMesh.userData.valid=false}return}
    const signature = JSON.stringify([parts, diameter])
    if (!drawingMesh || signature !== drawingSignature) {
      const geometry = buildWireGeometry({ points: parts.bodyPoints }, diameter, { capHoleRadius: parts.capHoleRadius, path: parts.bodyPath })
      if (drawingMesh) { drawingMesh.geometry.dispose(); drawingMesh.geometry = geometry }
      else { drawingMesh = new Mesh(geometry, new MeshStandardMaterial({ color: state.visual.color, roughness: .62, metalness: 0, transparent: false, opacity: 1 })); drawingMesh.name = 'wire-drawing-preview'; tools.add(drawingMesh) }
      drawingSignature = signature
    }
    drawingMesh.material.color.set(state.visual.color); drawingMesh.visible = true; drawingMesh.userData.valid=true
    terminals.update(drawingMesh, parts, destination === '@cursor')
    drawingMesh.userData.route = route
  }
  const refresh = () => {
    const inputs: WireLayoutInput[] = []
    for (const connection of connections.values()) {
      const visual = overrides.get(wireKey(connection)) ?? readWireVisual(connection), route = solveWireRoute(connection, visual, context)
      if (route) inputs.push({ wire: connection, visual, route })
    }
    const drawingKey = { source: '@drawing', destination: '@preview' }
    if (drawing) {
      const state = drawing, destination = state.wire.destination || '@cursor'
      const previewContext: WireRouteContext = { ...context, endpoint: value => value === '@cursor' ? state.cursor ? { endpoint: value, position: state.cursor } : null : context.endpoint(value) }
      const route = solveWireRoute({ ...state.wire, destination }, state.visual, previewContext)
      if (route) inputs.push({ wire: drawingKey, visual: { ...state.visual, layer: Math.max(0, ...inputs.map(input => input.visual.layer ?? 0)) + 1 }, route })
    }
    const layouts = layoutCache.sync(inputs)
    for (const connection of connections.values()) update(connection, layouts.get(wireKey(connection)) ?? null)
    if (drawing) updateDrawing(layouts.get(wireKey(drawingKey)) ?? null)
    updateHandles(); updateSegment(); updateOutlines()
  }
  return {
    group, tools,
    updateCamera(camera: PerspectiveCamera, height: number) {
      if (disposed || height <= 0) return
      viewCamera = camera; viewHeight = height
      const signature = JSON.stringify([camera.position.toArray(), camera.quaternion.toArray(), camera.fov, camera.zoom, height])
      if (signature !== cameraSignature) { cameraSignature = signature; updateHandles() }
    },
    sync(next: CircuitConnection[]) {
      if (disposed) return
      const keys = new Set(next.map(wireKey))
      for (const key of records.keys()) if (!keys.has(key)) remove(key)
      connections.clear(); incident.clear(); overrides.clear(); dirty.clear()
      for (const connection of next) {
        const key = wireKey(connection); connections.set(key, connection)
        const visual = readWireVisual(connection)
        const owners = [connection.source.split('.')[0], connection.destination.split('.')[0], ...(visual.frameModuleId ? [visual.frameModuleId] : []), ...visual.controlPoints.flatMap(p => p.space === 'module' ? [p.moduleId] : [])]
        for (const id of owners) { const links = incident.get(id) ?? new Set<string>(); links.add(key); incident.set(id, links) }
      }
      refresh()
    },
    updateModule(id: string) {
      if (disposed) return
      for (const key of incident.get(id) ?? []) {
        dirty.add(key)
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
    previewDuplicate, clearDuplicate,
    flush() {
      if (disposed) return
      if (dirty.size || drawingDirty) { dirty.clear(); drawingDirty = false; refresh() }
    },
    route(wire: WireIdentity) { return records.get(wireKey(wire))?.route ?? null },
    selectionMeshes() { return [...records.values()].map(record => ({ wire: { source: record.connection.source, destination: record.connection.destination }, mesh: record.mesh })) },
    orderPeers(wire: WireIdentity, connected = false) { return layoutCache.peers(wireKey(wire), connected).flatMap(key => { const connection = connections.get(key); return connection ? [{ source: connection.source, destination: connection.destination }] : [] }) },
    highlight(wire?: WireIdentity | null) { if (disposed) return; selected = wire ? { ...wire } : null; selectedHandle = null; selectedSegment = null; updateHandles(); updateSegment(); updateOutlines() },
    highlightMany(wires: WireIdentity[]) { if (disposed) return; multiSelected = wires.map(wire => ({ ...wire })); updateOutlines() },
    hover(wire: WireIdentity | null) { if (disposed) return; hovered = wire; updateOutlines() },
    selectHandle(index: number | null) { if (disposed) return; selectedHandle = index; updateHandles() },
    selectSegment(index: number | null) { if (disposed) return; selectedSegment = index; updateSegment() },
    dispose() {
      if (disposed) return; disposed = true
      clearDrawing(); clearDuplicate(); if (handleMesh) { tools.remove(handleMesh); disposeObject(handleMesh); handleMesh = null }
      if (segmentLine) { tools.remove(segmentLine); disposeObject(segmentLine); segmentLine = null }
      for (const outline of outlines.values()) { tools.remove(outline.mesh); disposeObject(outline.mesh) }
      outlines.clear()
      for (const key of records.keys()) remove(key)
      terminals.dispose()
      layoutCache.clear()
      connections.clear(); incident.clear(); overrides.clear(); dirty.clear(); selected = null; hovered = null
    },
  }
}
