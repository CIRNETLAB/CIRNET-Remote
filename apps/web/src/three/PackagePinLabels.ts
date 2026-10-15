import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { MM_TO_WORLD, type PartDefinition } from '../data/partCatalog'
import { createPackageMarking } from './package/PackageMarking'

/** Labels are model-owned scene resources, created only on hover or Show pins. */
export function setPackagePinLabels(group: Group, part: PartDefinition, pinId: string | null, showAll = false) {
  for (const pin of part.package.pins) {
    const name = `pin-label-${pin.id}`, visible = showAll || pin.id === pinId
    let holder = group.getObjectByName(name)
    if (!holder && visible) {
      const label = new Group(); label.name = name; label.userData = { pinLabel: true, ignorePick: true }
      const width = .14, depth = .065
      const text = createPackageMarking(`${pin.number}\n${pin.name}`, width, depth, `${name}-text`)
      const background = new Mesh(new PlaneGeometry(width * 1.08, depth * 1.12), new MeshBasicMaterial({ color: '#14202d', transparent: true, opacity: .92, depthWrite: false }))
      background.rotation.x = -Math.PI / 2; background.position.y = -.001
      background.userData.ignorePick = true; background.userData.selectionSurface = false
      label.add(background, text)
      label.position.set(pin.positionMm.x * MM_TO_WORLD, pin.positionMm.y * MM_TO_WORLD + .045, pin.positionMm.z * MM_TO_WORLD)
      if (part.package.family === 'dip' || part.package.family === 'seven-segment') label.position.z += Math.sign(pin.positionMm.z || 1) * .09
      else label.position.x += Math.sign(pin.positionMm.x || 1) * .08
      group.add(label); holder = label
    }
    if (holder) holder.visible = visible
  }
}
