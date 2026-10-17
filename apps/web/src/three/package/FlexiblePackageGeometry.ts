import { Box3, Group, Mesh, Vector3, type BufferGeometry } from 'three'
import { getPartForType, MM_TO_WORLD } from '../../data/partCatalog'
import { inverseTransformPoint, isFlexibleMount, resolveFlexibleGeometry, rotationMatrix, subtractPoint } from '../../electrical/flexibleGeometry'
import type { CircuitModule } from '../../types/circuit'
import { createFlexibleLeadPathGeometry } from './LeadGeometry'

const signatures = new WeakMap<Group, string>()
/** Renderer adapter: all coordinates are derived from the canonical board-local mount. */
export function updateFlexiblePackageGeometry(group: Group, module: CircuitModule, modules: CircuitModule[]): void {
  if (!isFlexibleMount(module.mount)) return
  const board = modules.find(item => item.id === module.mount!.boardId), part = getPartForType(module.type,module.mount)
  if (!board || !part) throw Error('Flexible rendering requires its mounting breadboard.')
  const signature = JSON.stringify(module.mount)
  if (signatures.get(group) === signature) return
  const geometry = resolveFlexibleGeometry(module, part, board), pose = module.mount.bodyPose
  const yaw = rotationMatrix({ x: 0, y: pose.rotation.y, z: 0 })
  const local = (point: {x:number;y:number;z:number}) => { const p = inverseTransformPoint(yaw, subtractPoint(point, pose.position)); return new Vector3(p.x, p.y, p.z) }
  const direction = (point:{x:number;y:number;z:number}) => { const p=inverseTransformPoint(yaw,point);return new Vector3(p.x,p.y,p.z) }
  // Construct replacements before mutating any live object.
  const replacements: {surface:Mesh<BufferGeometry>;geometry:BufferGeometry;points:Vector3[]}[] = []
  try {
    for (const lead of geometry.leads) {
      const surface = group.getObjectByName(`package-lead-${lead.pinId}`)?.getObjectByName('lead-metal') as Mesh<BufferGeometry> | undefined
      if (!surface) throw Error('Flexible package is missing a stable lead mesh.')
      const points = lead.points.map(local)
      replacements.push({surface, points, geometry:createFlexibleLeadPathGeometry(lead.path,part.package.leadDiameterMm * MM_TO_WORLD,local,direction)})
    }
  } catch (error) { replacements.forEach(item => item.geometry.dispose()); throw error }
  let body = group.getObjectByName('flexible-rigid-body') as Group | undefined
  if (!body) {
    body = new Group(); body.name = 'flexible-rigid-body'
    const centerY = (part.package.standoffMm + part.package.bodyMm.y / 2) * MM_TO_WORLD
    for (const child of group.children.slice()) {
      if (child.userData.physicalLead || child.userData.pinTarget || child.userData.pinHighlight || child.userData.pinLabel || child.userData.isOutline) continue
      child.position.y -= centerY; body.add(child)
    }
    group.add(body)
  }
  body.rotation.set(pose.rotation.x * Math.PI / 180, 0, pose.rotation.z * Math.PI / 180, 'YXZ')
  const anchors: Record<string, number[]> = {}
  for (let i = 0; i < replacements.length; i++) {
    const replacement = replacements[i]!, lead = geometry.leads[i]!, old = replacement.surface.geometry
    replacement.surface.geometry = replacement.geometry; replacement.surface.userData.leadPoints = replacement.points.map(p => p.toArray()); old.dispose()
    const anchor = replacement.points.at(-1)!
    anchors[lead.pinId] = anchor.toArray()
    const target = group.getObjectByName(`package-pin-target-${lead.pinId}`), highlight = group.getObjectByName(`package-pin-highlight-${lead.pinId}`)
    if (target) target.position.copy(anchor)
    if (highlight) highlight.position.copy(anchor).y += .028
  }
  group.userData.resolvedPinAnchors = anchors
  const bounds = new Box3(); group.updateMatrixWorld(true)
  // All points and body corners are in the unposed local frame. No world-AABB inflation.
  for (const replacement of replacements) replacement.points.forEach(point => bounds.expandByPoint(point))
  for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) bounds.expandByPoint(new Vector3(x*geometry.half.x,y*geometry.half.y,z*geometry.half.z).applyEuler(body.rotation))
  bounds.expandByScalar(part.package.leadDiameterMm * MM_TO_WORLD / 2)
  group.userData.visualBounds = [bounds.min.toArray(),bounds.max.toArray()]
  group.userData.visualGeometryRevision = Number(group.userData.visualGeometryRevision ?? 0) + 1
  signatures.set(group, signature)
}
