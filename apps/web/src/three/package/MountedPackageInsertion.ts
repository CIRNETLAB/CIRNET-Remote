import { Box3, Group, Mesh, Vector3, type BufferGeometry } from 'three'
import { getPartForModule, MM_TO_WORLD } from '../../data/partCatalog'
import { isFlexibleMount } from '../../electrical/flexibleGeometry'
import { boardContactMechanics, insertionContinuation } from '../../geometry/BreadboardMechanicalProfile'
import type { CircuitModule } from '../../types/circuit'
import { createFixedPackageLead } from './PackageFeedthrough'
import { createMoldedPackageLead } from './StampedLeadGeometry'

const signatures = new WeakMap<Group, string>()
/** Mounted revision opt-in. Replaces one closed continuous lead sweep per pin;
 * canonical pin targets, body pose and electrical anchors remain untouched. */
export function updateMountedPackageInsertion(group: Group, module: CircuitModule, modules: CircuitModule[]): void {
  const part = getPartForModule(module), mount = module.mount
  if (!part?.package.boardInsertion || isFlexibleMount(mount)) { signatures.delete(group); return }
  if(!mount&&!signatures.has(group))return
  const board = mount ? modules.find(item => item.id === mount.boardId) : null
  if (mount&&!board) throw Error('Mounted insertion requires its board.')
  const section=part.package.shape!.leadSection
  const radius=(section.kind==='round'?section.widthMm:Math.hypot(section.widthMm,section.thicknessMm))*MM_TO_WORLD/2
  const continuations=mount?.contacts.map(binding=>({pinId:binding.pinId,...insertionContinuation(board!.type,binding.contactId,radius)}))??[]
  const signature = JSON.stringify([part.id,part.revision,part.package.id,part.package.revision,board?.type??null,section,continuations.map(item=>[item.pinId,item.length])])
  if (signatures.get(group) === signature) return
  const replacements: { mesh: Mesh<BufferGeometry>; geometry: BufferGeometry }[] = []
  try {
    for (const pin of part.package.pins) {
      const continuation = continuations.find(item=>item.pinId===pin.id)
      if(mount){
        const binding=mount.contacts.find(item=>item.pinId===pin.id)
        if(!binding||!continuation)throw Error('Unknown mounted pin.')
        const mechanics = boardContactMechanics(board!.type, binding.contactId)
        if (mechanics.profile.id !== part.package.boardInsertion.mechanicalProfileId) throw Error('Unsupported board insertion profile.')
      }
      const lead = group.getObjectByName(`package-lead-${pin.id}`)
      const mesh = lead?.getObjectByName('lead-metal') as Mesh<BufferGeometry> | undefined
      if (!mesh) throw Error('Mounted insertion requires a stable package lead mesh.')
      const family = part.package.shape!.family
      const geometry = family === 'dip' || family === 'to92' ? createMoldedPackageLead(part, pin, continuation?.length??0) : createFixedPackageLead(part, pin.id, continuation?.length??0).geometry
      replacements.push({ mesh, geometry })
    }
  } catch (error) { replacements.forEach(item => item.geometry.dispose()); throw error }
  for (const { mesh, geometry } of replacements) { const previous = mesh.geometry; mesh.geometry = geometry; previous.dispose() }
  const bounds = new Box3()
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  group.traverse(object => {
    if (!(object instanceof Mesh) || object.userData.pinTarget || object.userData.pinHighlight || object.userData.isOutline) return
    object.geometry.computeBoundingBox()
    const box = object.geometry.boundingBox
    if (!box) return
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(object.matrixWorld).applyMatrix4(inverse))
  })
  group.userData.visualBounds = [bounds.min.toArray(), bounds.max.toArray()]
  group.userData.visualGeometryRevision = Number(group.userData.visualGeometryRevision ?? 0) + 1
  signatures.set(group, signature)
}
