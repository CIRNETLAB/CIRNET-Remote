import { BoxGeometry, CylinderGeometry, Group, Mesh, type BufferGeometry, type MeshStandardMaterial } from 'three'

/** Each builder owns its resources. All views call the same builder and dispose
 * them through the existing component ownership traversal. */
export function packageBuilderTools(group: Group) {
  const mesh = (name: string, geometry: BufferGeometry, material: MeshStandardMaterial, surface = true, parent: Group = group) => {
    const object = new Mesh(geometry, material); object.name = name; object.userData.selectionSurface = surface
    object.castShadow = surface; object.receiveShadow = true; parent.add(object); return object
  }
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: MeshStandardMaterial, surface = true, parent: Group = group) => {
    const object = mesh(name, new BoxGeometry(w, h, d), material, surface, parent); object.position.set(x, y, z); return object
  }
  const cylinder = (name: string, radius: number, h: number, x: number, y: number, z: number, material: MeshStandardMaterial, surface = true, parent: Group = group) => {
    const object = mesh(name, new CylinderGeometry(radius, radius, h, 48), material, surface, parent); object.position.set(x, y, z); return object
  }
  return { mesh, box, cylinder }
}
