import { CylinderGeometry, Group, MeshStandardMaterial } from 'three'
import { MM_TO_WORLD as mm, type PartDefinition } from '../../data/partCatalog'
import { packageBuilderTools } from './PackageBuilderTools'
import { recessedPackageBox } from './ContactPackageGeometry'
import { segmentGlyphGeometry } from './PackageShapes'

export const DISPLAY_DIFFUSER_OFF = '#D7D6C8'
export const DISPLAY_DIFFUSER_ON = '#EF332C'

/** A single millimetre glyph is reused for all three catalog digit counts.
 * Canonical electrical pins and multiplex mapping remain catalog-owned. */
export function addDisplayPackageModel(group: Group, part: PartDefinition): boolean {
  const pkg = part.package, shape = pkg.shape
  if (shape?.family !== 'seven-segment') return false
  const { mesh } = packageBuilderTools(group), bottom = pkg.standoffMm * mm, w = pkg.bodyMm.x * mm, h = pkg.bodyMm.y * mm, d = pkg.bodyMm.z * mm
  const caseMaterial = new MeshStandardMaterial({ color: '#E8E7DD', roughness: .5, metalness: 0 })
  const faceMaterial = new MeshStandardMaterial({ color: '#25292B', roughness: .56, metalness: 0 })
  const faceH = .03 * mm, inset = shape.faceInsetMm! * mm, top = bottom + h
  const body = mesh('package-body', recessedPackageBox(w, h, d, shape.bevelMm! * mm, [{ x: 0, z: 0, width: w - 2 * inset, depth: d - 2 * inset, floor: h - .06 * mm }]), caseMaterial); body.position.y = bottom
  const face = mesh('package-display-face', recessedPackageBox(w - inset * 2 - .004 * mm, faceH, d - inset * 2 - .004 * mm, .005 * mm), faceMaterial); face.position.y = top - .06 * mm
  // The printed face is only .03 mm thick; the enclosing case owns its shadow.
  // Excluding this layer from the shadow map prevents diagonal self-shadow acne.
  face.castShadow = false
  const stroke = shape.strokeWidthMm! * mm, digitH = shape.digitHeightMm! * mm, digitW = shape.digitWidthMm! * mm
  const half = (digitW - stroke) / 2, quarter = (digitH - stroke) / 4, horizontalLength = digitW - stroke, verticalLength = (digitH - 3 * stroke) / 2
  const digits = pkg.digits ?? 1, pitch = (shape.digitPitchMm ?? 0) * mm, slant = Math.tan(shape.slantDegrees! * Math.PI / 180)
  const segments = [
    ['a', 0, -(digitH - stroke) / 2, horizontalLength, stroke], ['b', half, -quarter, stroke, verticalLength],
    ['c', half, quarter, stroke, verticalLength], ['d', 0, (digitH - stroke) / 2, horizontalLength, stroke],
    ['e', -half, quarter, stroke, verticalLength], ['f', -half, -quarter, stroke, verticalLength], ['g', 0, 0, horizontalLength, stroke],
  ] as const
  for (let digit = 0; digit < digits; digit++) {
    const cx = (digit - (digits - 1) / 2) * pitch - .35 * mm
    for (const [name, x, z, width, depth] of segments) {
      const geometry = segmentGlyphGeometry(width, depth, .018 * mm)
      geometry.rotateX(-Math.PI / 2)
      const position = geometry.getAttribute('position')
      // Shear is applied in the common glyph frame, not by rotating individual
      // rectangles: top, middle and bottom strokes keep their true 1.5 mm width.
      for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) - (position.getZ(i) + z) * slant)
      geometry.computeVertexNormals()
      const material = new MeshStandardMaterial({ color: DISPLAY_DIFFUSER_OFF, roughness: .56, emissive: '#000000', emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -1 })
      const glyph = mesh(`package-digit-${digit}-${name}`, geometry, material, false); glyph.position.set(cx + x, top - .018 * mm, z)
      glyph.userData.segment = `${digit}.${name}`; glyph.userData.segmentOffColor = DISPLAY_DIFFUSER_OFF; glyph.userData.segmentOnColor = DISPLAY_DIFFUSER_ON; glyph.userData.ignorePick = true
      glyph.castShadow = false; glyph.receiveShadow = false
    }
    const dp = mesh(`package-digit-${digit}-DP`, new CylinderGeometry(shape.decimalPointDiameterMm! * mm / 2, shape.decimalPointDiameterMm! * mm / 2, .018 * mm, 48), new MeshStandardMaterial({ color: DISPLAY_DIFFUSER_OFF, roughness: .56, emissive: '#000000', emissiveIntensity: 0 }), false)
    dp.position.set(cx + 5.45 * mm, top - .009 * mm, (shape.digitHeightMm! / 2 - shape.decimalPointDiameterMm! / 2) * mm)
    dp.userData.segment = `${digit}.DP`; dp.userData.segmentOffColor = DISPLAY_DIFFUSER_OFF; dp.userData.segmentOnColor = DISPLAY_DIFFUSER_ON; dp.userData.ignorePick = true; dp.castShadow = false; dp.receiveShadow = false
  }
  return true
}
