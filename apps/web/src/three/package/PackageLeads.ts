import { Box3, Group, Mesh, Object3D, Vector3, type BufferGeometry } from 'three'
import { readLeadProperties, type LeadProperties } from '../../data/leadProperties'
import { MM_TO_WORLD, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createFormedLeadGeometry } from './LeadGeometry'

interface EditableLead { surface: Mesh<BufferGeometry>; baseline: Vector3[] }
interface LeadModelState { body: { object: Object3D; y: number }[]; leads: EditableLead[]; signature: string }
// Per-model ownership with no graph mutations or strong global model references.
const editableModels = new WeakMap<Group, LeadModelState>()
const signatureOf = (properties: LeadProperties) => `${properties.leadForm}/${properties.leadLengthMm}/${properties.bodyLiftMm}`

export function isEditableLeadPart(part: PartDefinition): boolean {
  return part.package.family === 'radial-capacitor' || part.package.family === 'axial' && (part.package.visualVariant === 'resistor' || part.function === 'resistor')
}

/** Preserve the original path exactly when old files omit visual properties. */
export function editableLeadPoints(baseline: Vector3[], properties: LeadProperties, part: PartDefinition): Vector3[] {
  const [anchor, knee, shoulder] = baseline.map(point => point.clone()) as [Vector3, Vector3, Vector3]
  const mm = MM_TO_WORLD, diameter = part.package.leadDiameterMm * mm, lift = properties.bodyLiftMm * mm, slack = properties.leadLengthMm * mm
  if (properties.leadForm === 'formed90' && slack === 0) {
    knee.y += lift; shoulder.y += lift
    return [anchor, knee, shoulder]
  }
  const axial = part.package.family === 'axial', sign = Math.sign(anchor.x || 1), bottom = part.package.standoffMm * mm + lift
  // The contact has a vertical insertion stub. A diagonal segment must never
  // sweep its radius through the breadboard surface at the fixed contact.
  const stub = anchor.clone(); stub.y += Math.min(diameter * 1.15, bottom * .4)
  let entry: Vector3, approach: Vector3
  if (axial) {
    entry = shoulder; entry.y += lift
    approach = new Vector3(sign * (part.package.bodyMm.x * mm / 2 + diameter * .6), entry.y, 0)
  } else {
    // Approach a radial body vertically from below. In particular, do not
    // route an offset through the capacitor's sleeve or ceramic disc.
    entry = new Vector3(anchor.x * .5, bottom + part.package.bodyMm.y * mm * .2, anchor.z * .5)
    approach = new Vector3(entry.x, bottom - diameter * .65, entry.z)
  }
  if (properties.leadForm === 'straight') return [anchor, stub, approach, entry]
  const outward = sign * (Math.max(Math.abs(anchor.x), Math.abs(approach.x)) + slack * .5 + (properties.leadForm === 'offset-s' ? diameter * .8 : 0))
  const rise = Math.max(approach.y - stub.y, diameter * .4)
  if (properties.leadForm === 'formed90') return [anchor, stub, new Vector3(outward, stub.y + rise * .4, anchor.z), new Vector3(outward, approach.y, anchor.z), approach, entry]
  const offset = Math.max(diameter * 1.2, slack * .4)
  return [anchor, stub, new Vector3(outward, stub.y + rise * .3, anchor.z + offset), new Vector3(outward, stub.y + rise * .7, anchor.z + offset), approach, entry]
}

/** Record baseline transforms once, before any visual lift. Targets are excluded. */
export function registerEditablePackageLeads(group: Group, part: PartDefinition, body: Object3D[]): void {
  if (!isEditableLeadPart(part)) return
  const leads: EditableLead[] = []
  for (const child of group.children.filter(object => object.userData.physicalLead)) {
    const surface = child.getObjectByName('lead-metal') as Mesh<BufferGeometry> | undefined
    const points = surface?.userData.leadBaseline as [number, number, number][] | undefined
    if (surface && points) leads.push({ surface, baseline: points.map(point => new Vector3(...point)) })
  }
  editableModels.set(group, { body: body.map(object => ({ object, y: object.position.y })), leads, signature: signatureOf(readLeadProperties(undefined)) })
}

function refreshLeadModelBounds(group: Group): void {
  group.updateWorldMatrix(true, true)
  const inverse = group.matrixWorld.clone().invert(), bounds = new Box3()
  group.traverseVisible(object => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (materials.every(material => !material.visible)) return
    for (let owner: Object3D | null = object; owner && owner !== group; owner = owner.parent) if (owner.userData.ignorePick || owner.userData.pinTarget || owner.userData.pinHighlight || owner.userData.isOutline) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)))
  })
  if (!bounds.isEmpty()) group.userData.visualBounds = [bounds.min.toArray(), bounds.max.toArray()]
  group.userData.visualGeometryRevision = Number(group.userData.visualGeometryRevision ?? 0) + 1
}

/** Replace only the two model-owned sweeps. Paint edits allocate no geometry. */
export function updatePackageLeads(group: Group, module: CircuitModule, part: PartDefinition): void {
  const state = editableModels.get(group)
  if (!state) return
  const properties = readLeadProperties(module.properties), signature = signatureOf(properties)
  if (signature === state.signature) return
  // Allocate the complete replacement first, then commit/dispose; an exception
  // cannot leave a partly changed model or leak a successfully allocated sweep.
  const replacements: { lead: EditableLead; geometry: BufferGeometry; points: Vector3[] }[] = []
  try {
    for (const lead of state.leads) {
      const points = editableLeadPoints(lead.baseline, properties, part)
      replacements.push({ lead, geometry: createFormedLeadGeometry(points, part.package.leadDiameterMm * MM_TO_WORLD), points })
    }
  } catch (error) { replacements.forEach(item => item.geometry.dispose()); throw error }
  for (const { lead, geometry, points } of replacements) {
    const previous = lead.surface.geometry
    lead.surface.geometry = geometry; lead.surface.userData.leadPoints = points.map(point => point.toArray()); previous.dispose()
  }
  for (const { object, y } of state.body) object.position.y = y + properties.bodyLiftMm * MM_TO_WORLD
  refreshLeadModelBounds(group)
  state.signature = signature
  group.userData.leadAppearance = { ...properties }
}
