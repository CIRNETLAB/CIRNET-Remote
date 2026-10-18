import { Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import type { Point3 } from '../types/circuit'
import type { SolvedWireRoute } from '../wires/wireRouting'
import { CONTACT_COPPER_LENGTH, COPPER_COLOR, COPPER_EMBED_LENGTH, COPPER_RADIUS_RATIO, FREE_COPPER_LENGTH } from '../wires/wireAppearance'
import { BREADBOARD_MECHANICAL_PROFILE } from '../geometry/BreadboardMechanicalProfile'
import { MM_TO_WORLD } from '../data/partCatalog'
import { wireCenterline } from '../wires/wireCenterline'
import { type LeadPath, type LeadPathSegment } from '../electrical/leadPath'
import { buildWireGeometry } from './WireGeometry'

export interface WireTerminal { tip: Point3; endpoint: Point3; junction: Point3; radius: number; overlap: number }
export interface WireParts { bodyPoints: Point3[]; bodyPath: LeadPath; corePath: LeadPath; terminals: [WireTerminal, WireTerminal]; capHoleRadius: number }

export function deriveWireParts(route: SolvedWireRoute, diameter: number): WireParts {
  const path = route.renderPoints ?? route.points
  const points = path.map(point => new Vector3(point.x, point.y, point.z))
  const first = points[1].clone().sub(points[0]), last = points.at(-2)!.clone().sub(points.at(-1)!)
  const sourceLimit = route.terminalLeads.source ? CONTACT_COPPER_LENGTH : FREE_COPPER_LENGTH
  const destinationLimit = route.terminalLeads.destination ? CONTACT_COPPER_LENGTH : FREE_COPPER_LENGTH
  const length = (segment: Vector3, limit: number, contact: boolean, end: 'source' | 'destination') => {
    if (!contact) return Math.min(limit, segment.length() * .45)
    const endpoint = end === 'source' ? points[0] : points.at(-1)!
    const deck = route.contactDeckY?.[end]
    const exposure = deck === null || deck === undefined ? limit : Math.max(0, deck + BREADBOARD_MECHANICAL_PROFILE.insulationClearanceMm * MM_TO_WORLD - endpoint.y)
    return Math.min(exposure, segment.length() * .9)
  }
  let sourceLength = length(first, sourceLimit, !!route.terminalLeads.source, 'source')
  let destinationLength = length(last, destinationLimit, !!route.terminalLeads.destination, 'destination')
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
    const deck=route.contactDeckY?.[index===0?'source':'destination']
    const depth = contact && deck !== null && deck !== undefined ? points[index].y - (deck - BREADBOARD_MECHANICAL_PROFILE.insertionDepthMm * MM_TO_WORLD) : 0
    return { tip: plain(points[index].clone().addScaledVector(axis, -depth)), endpoint: plain(points[index]), junction: plain(junction), radius, overlap: Math.min(diameter * .12, COPPER_EMBED_LENGTH) }
  }
  const bodyPoints=[plain(start), ...path.slice(1, -1).map(point => ({ ...point })), plain(end)]
  const bodyPath=wireCenterline(bodyPoints,diameter)
  const terminals:[WireTerminal,WireTerminal]=[terminal(0, first, start, !!route.terminalLeads.source), terminal(points.length - 1, last, end, !!route.terminalLeads.destination)]
  const corePath=structuredClone(bodyPath),segments:LeadPathSegment[]=[]
  const line=(a:Point3,b:Point3)=>{const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);if(length>1e-10)segments.push({kind:'line',start:a,end:b,length})}
  line(terminals[0].tip,bodyPath.segments[0]!.start);segments.push(...corePath.segments);line(bodyPath.segments.at(-1)!.end,terminals[1].tip)
  corePath.segments=segments;corePath.points=[terminals[0].tip,...bodyPath.points,terminals[1].tip]
  corePath.length=segments.reduce((sum,segment)=>sum+segment.length,0)
  // Preserve the exact body fillets while extending their sampled arclength
  // domain through both metal-only tails. Re-fitting the longer core polyline
  // would allocate different radii from the insulation around the same bend.
  const extension=(a:Point3,b:Point3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
  const sourceExtension=extension(terminals[0].tip,bodyPath.samples[0]!),destinationExtension=extension(bodyPath.samples.at(-1)!,terminals[1].tip)
  corePath.sampleDistances=bodyPath.sampleDistances.map(distance=>distance+sourceExtension)
  if(sourceExtension>1e-10){corePath.samples.unshift({...terminals[0].tip});corePath.sampleDistances.unshift(0)}
  if(destinationExtension>1e-10){corePath.samples.push({...terminals[1].tip});corePath.sampleDistances.push(corePath.length)}
  return { bodyPoints, bodyPath, corePath, capHoleRadius: radius, terminals }
}

// One capped cylinder and copper material per layer, shared by all terminal meshes.
// Ownership stays here so deleting one wire cannot dispose another wire's pins.
export function createWireTerminals() {
  const material = new MeshStandardMaterial({ color: COPPER_COLOR, roughness: .32, metalness: .9 })
  let disposed = false
  const detach = (root: Object3D) => { for (const child of [...root.children]) if (child.userData.wireTerminal) { root.remove(child); (child as Mesh).geometry.dispose() } }
  return {
    update(root: Object3D, parts: WireParts, free = false) {
      let mesh = root.children.find(child => child.userData.wireTerminal) as Mesh | undefined
      const geometry=buildWireGeometry({points:parts.corePath.points},parts.terminals[0].radius*2,{path:parts.corePath})
      if(mesh){mesh.geometry.dispose();mesh.geometry=geometry}else{mesh=new Mesh(geometry,material);root.add(mesh)}
      mesh.name=free?'wire-conductor-free':'wire-conductor'
      mesh.userData={kind:'wire',source:root.userData.source,destination:root.userData.destination,wireTerminal:true,terminals:parts.terminals}
    },
    detach,
    dispose() { if (disposed) return; disposed = true; material.dispose() },
  }
}
