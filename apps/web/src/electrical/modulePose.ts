import type { CircuitModule, Point3 } from '../types/circuit'

export function moduleLocalToWorld(point: Point3, module: CircuitModule): Point3 {
  const angle = ((module.rotation ?? 0) % 360) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  return { x: c * point.x + s * point.z + (module.position?.x ?? 0), y: point.y + (module.position?.y ?? 0), z: -s * point.x + c * point.z + (module.position?.z ?? 0) }
}
export function worldToModuleLocal(point: Point3, module: CircuitModule): Point3 {
  const angle = ((module.rotation ?? 0) % 360) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const x = point.x - (module.position?.x ?? 0), z = point.z - (module.position?.z ?? 0)
  return { x: c * x - s * z, y: point.y - (module.position?.y ?? 0), z: s * x + c * z }
}
