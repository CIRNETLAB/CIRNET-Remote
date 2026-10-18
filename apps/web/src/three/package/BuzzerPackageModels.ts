import { CircleGeometry, Group, LatheGeometry, MeshStandardMaterial, Vector2 } from 'three'
import { MM_TO_WORLD as mm, type PartDefinition } from '../../data/partCatalog'
import { createPackageMarking } from './PackageMarking'
import { packageBuilderTools } from './PackageBuilderTools'

/** One closed meridian includes the lid annulus, upright opening and blind
 * diaphragm. There is no top cap underneath a cosmetic black disc. */
export function addBuzzerPackageModel(group: Group, part: PartDefinition): boolean {
  const pkg = part.package, shape = pkg.shape
  if (shape?.family !== 'buzzer') return false
  const radius = Math.min(pkg.bodyMm.x, pkg.bodyMm.z) * mm / 2, h = pkg.bodyMm.y * mm, b = shape.shoulderRadiusMm! * mm
  const opening = shape.openingDiameterMm! * mm / 2, depth = shape.openingDepthMm! * mm, points = [new Vector2(0, 0), new Vector2(radius - b, 0)]
  for (let i = 1; i <= 8; i++) { const a = i * Math.PI / 16; points.push(new Vector2(radius - b + b * Math.sin(a), b - b * Math.cos(a))) }
  points.push(new Vector2(radius, h - b))
  for (let i = 1; i <= 8; i++) { const a = i * Math.PI / 16; points.push(new Vector2(radius - b + b * Math.cos(a), h - b + b * Math.sin(a))) }
  points.push(new Vector2(opening, h), new Vector2(opening, h - depth), new Vector2(0, h - depth))
  const { mesh } = packageBuilderTools(group), polymer = new MeshStandardMaterial({ color: '#252729', roughness: .52, metalness: 0 })
  const body = mesh('package-body', new LatheGeometry(points, 48), polymer); body.position.y = pkg.standoffMm * mm
  const diaphragm = mesh('package-buzzer-diaphragm', new CircleGeometry(opening - .015 * mm, 48), new MeshStandardMaterial({ color: '#555A5B', roughness: .59, metalness: 0 }), false)
  diaphragm.rotation.x = -Math.PI / 2; diaphragm.position.y = body.position.y + h - depth + .002 * mm; diaphragm.userData.ignorePick = true
  if (pkg.polarized) { const label = createPackageMarking('+', 2 * mm, 2 * mm); label.position.set(-3 * mm, body.position.y + h + .002 * mm, 0); group.add(label) }
  return true
}
