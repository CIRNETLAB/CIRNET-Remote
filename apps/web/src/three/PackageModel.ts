import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { getPartForType, getPartForModule, MM_TO_WORLD, type PartDefinition } from '../data/partCatalog'
import type { CircuitModule } from '../types/circuit'
import { inverseTransformPoint, isFlexibleMount, resolveFlexibleGeometry, rotationMatrix, subtractPoint } from '../electrical/flexibleGeometry'

/** Package-local origin is the lead contact plane, in the canonical footprint frame. */
export function packagePinAnchor(type: string, pinId: string, module?: CircuitModule, modules: CircuitModule[] = []): Vector3 | null {
  if(module&&isFlexibleMount(module.mount)){
    const part=getPartForModule(module),board=modules.find(item=>item.id===module.mount!.boardId)
    if(!part||!board)throw Error('Flexible pin resolution requires its supporting board.')
    const point=resolveFlexibleGeometry(module,part,board).leads.find(lead=>lead.pinId===pinId)?.points.at(-1)
    if(!point)return null
    const local=inverseTransformPoint(rotationMatrix({x:0,y:module.mount.bodyPose.rotation.y,z:0}),subtractPoint(point,module.mount.bodyPose.position))
    return new Vector3(local.x,local.y,local.z)
  }
  const pin = (module ? getPartForModule(module) : getPartForType(type))?.package.pins.find(pin => pin.id === pinId)
  return pin ? new Vector3(pin.positionMm.x, pin.positionMm.y, pin.positionMm.z).multiplyScalar(MM_TO_WORLD) : null
}

/** Show only the requested pin. Hit volumes themselves never enter the render pass. */
export function setPackagePinHighlight(group: Group, pinId: string | null) {
  for (const child of group.children) if (child.userData.pinHighlight) child.visible = child.userData.pinId === pinId
}

export interface PackageSimulationVisual { status?: string; ledOn?: boolean; segments?: string[] }
/** Receives compiler/simulator state; no electrical decisions are made in the renderer. */
export function applyPackageSimulation(group: Group, state: PackageSimulationVisual | null) {
  group.userData.simulationStatus = state?.status ?? 'UNKNOWN'
  group.userData.ledOn = state?.ledOn === true
  group.traverse(object => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return
    if (object.userData.ledLens) {
      object.material.emissive.set(state?.ledOn === true ? group.userData.ledColor ?? '#ed281e' : '#000000')
      object.material.emissiveIntensity = state?.ledOn === true ? .8 : 0
    }
    if (object.userData.segment) {
      const on = state?.segments?.includes(object.userData.segment) === true
      object.material.emissive.set(on ? '#ef332c' : '#000000'); object.material.emissiveIntensity = on ? 1 : 0
    }
  })
}

export { addPackageModel } from './package/PackageFactory'
export { canUpdatePackageAppearance, updatePackageAppearance } from './package/PackageAppearance'
