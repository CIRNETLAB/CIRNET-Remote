import { CylinderGeometry, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import type { Point3 } from '../types/circuit'
import type { SolvedWireRoute } from '../wires/wireRouting'
import { CONTACT_COPPER_LENGTH, COPPER_COLOR, COPPER_EMBED_LENGTH, COPPER_RADIUS_RATIO, FREE_COPPER_LENGTH, WIRE_RADIAL_SEGMENTS } from '../wires/wireAppearance'

export interface WireTerminal { tip: Point3; endpoint: Point3; junction: Point3; radius: number; overlap: number }
export interface WireParts { bodyPoints: Point3[]; terminals: [WireTerminal, WireTerminal]; capHoleRadius: number }

export function deriveWireParts(route: SolvedWireRoute, diameter: number): WireParts {
  const points = route.points.map(point => new Vector3(point.x, point.y, point.z))
  const first = points[1].clone().sub(points[0]), last = points.at(-2)!.clone().sub(points.at(-1)!)
  const sourceLimit = route.terminalLeads.source ? CONTACT_COPPER_LENGTH : FREE_COPPER_LENGTH
  const destinationLimit = route.terminalLeads.destination ? CONTACT_COPPER_LENGTH : FREE_COPPER_LENGTH
  const lift = route.layerOffset ?? 0
  const length = (segment: Vector3, limit: number, contact: boolean) => contact ? Math.min(limit, Math.max(0, segment.length() - lift) * .65) + lift : lift > 0 ? segment.length() : Math.min(limit, segment.length() * .45)
  let sourceLength = length(first, sourceLimit, !!route.terminalLeads.source)
  let destinationLength = length(last, destinationLimit, !!route.terminalLeads.destination)
  if (points.length === 2) {
    if (route.terminalLeads.source && !route.terminalLeads.destination) destinationLength = Math.min(destinationLength, (first.length() - sourceLength) * .6)
    else if (!route.terminalLeads.source && route.terminalLeads.destination) sourceLength = Math.min(sourceLength, (last.length() - destinationLength) * .6)
    const scale = Math.min(1, first.length() * .85 / (sourceLength + destinationLength))
    sourceLength *= scale; destinationLength *= scale
  }
  const radius = diameter * COPPER_RADIUS_RATIO
  const start = points[0].clone().addScaledVector(first.normalize(), sourceLength), end = points.at(-1)!.clone().addScaledVector(last.normalize(), destinationLength)
  const plain = (point: Vector3): Point3 => ({ x: point.x, y: point.y, z: point.z })
  const terminal = (index: number, axis: Vector3, junction: Vector3, contact: boolean): WireTerminal => {
    // Insertion extends against the lead, below the unchanged electrical anchor.
    // Pitch bounds insertion to the breadboard scale; overlap seals the cap above.
    const depth = contact ? Math.min(diameter * 1.2, (route.contactPitch?.[index === 0 ? 'source' : 'destination'] ?? .13) * .65) : 0
    return { tip: plain(points[index].clone().addScaledVector(axis, -depth)), endpoint: plain(points[index]), junction: plain(junction), radius, overlap: Math.min(diameter * .12, COPPER_EMBED_LENGTH) }
  }
  return { bodyPoints: [plain(start), ...route.points.slice(1, -1).map(point => ({ ...point })), plain(end)], capHoleRadius: lift > 0 && (!route.terminalLeads.source || !route.terminalLeads.destination) ? 0 : radius * .9,
    terminals: [terminal(0, first, start, !!route.terminalLeads.source), terminal(points.length - 1, last, end, !!route.terminalLeads.destination)] }
}

// One capped cylinder and copper material per layer, shared by all terminal meshes.
// Ownership stays here so deleting one wire cannot dispose another wire's pins.
export function createWireTerminals() {
  const geometry = new CylinderGeometry(1, 1, 1, WIRE_RADIAL_SEGMENTS, 1, false)
  const material = new MeshStandardMaterial({ color: COPPER_COLOR, roughness: .29, metalness: .86 })
  const up = new Vector3(0, 1, 0)
  let disposed = false
  const detach = (root: Object3D) => { for (const child of [...root.children]) if (child.userData.wireTerminal) root.remove(child) }
  return {
    update(root: Object3D, parts: WireParts, free = false) {
      let meshes = root.children.filter(child => child.userData.wireTerminal) as Mesh[]
      if (!meshes.length) { meshes = [new Mesh(geometry, material), new Mesh(geometry, material)]; root.add(...meshes) }
      parts.terminals.forEach((terminal, index) => {
        const mesh = meshes[index], tip = new Vector3(terminal.tip.x, terminal.tip.y, terminal.tip.z), axis = new Vector3(terminal.junction.x, terminal.junction.y, terminal.junction.z).sub(tip)
        const length = axis.length()
        mesh.name = index === 0 ? 'wire-terminal-source' : free ? 'wire-terminal-free' : 'wire-terminal-destination'
        mesh.userData = { kind: 'wire', source: root.userData.source, destination: root.userData.destination, wireTerminal: true }
        mesh.visible = length > 1e-8
        if (!mesh.visible) return
        axis.normalize()
        const end = tip.clone().addScaledVector(axis, length + terminal.overlap)
        mesh.position.copy(tip).add(end).multiplyScalar(.5)
        mesh.quaternion.setFromUnitVectors(up, axis); mesh.scale.set(terminal.radius, length + terminal.overlap, terminal.radius); mesh.updateMatrix()
      })
    },
    detach,
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose() },
  }
}
