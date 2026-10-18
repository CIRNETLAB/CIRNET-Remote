import { Color, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, type MeshStandardMaterialParameters } from 'three'
import { createCoatingMaterial } from '../StudioEnvironment'
import { MM_TO_WORLD } from '../../data/partCatalog'

/** Body paint only: reduce display-space brightness by 10% while retaining hue.
 * Keep metal, coded bands and printed polarity/IC markings on their exact colors. */
export function subduedBodyColor(color: string): Color {
  return new Color(color).convertLinearToSRGB().multiplyScalar(.9).convertSRGBToLinear()
}

export function createPackageBodyMaterial(parameters: MeshStandardMaterialParameters & { color: string }) {
  return createCoatingMaterial({ ...parameters, color: subduedBodyColor(parameters.color) })
}

/** Resistor body: mandatory sRGB #4A90E2 albedo, smooth slight-gloss coating. */
export function createResistorMaterial() {
  return new MeshStandardMaterial({
    color: '#4A90E2',
    roughness: .38,
    metalness: 0,
    envMapIntensity: .5,
  })
}

/** Signal diode body: charcoal/black epoxy molding with soft satin sheen. */
export function createDiodeMaterial(sealed = false) {
  return new MeshStandardMaterial({
    color: sealed ? '#1D2023' : '#1b1e22',
    roughness: .4,
    metalness: 0,
    envMapIntensity: .4,
  })
}

/** Zener diode body: DO-35 transparent/translucent glass envelope with reflections. */
export function createZenerGlassMaterial(sealedDiameterMm?: number) {
  const sealed = sealedDiameterMm !== undefined
  return new MeshPhysicalMaterial({
    color: sealed ? '#C9654B' : '#e86a3e',
    roughness: sealed ? .26 : .14,
    metalness: 0,
    transmission: sealed ? .28 : .72,
    opacity: 1,
    transparent: true,
    ior: 1.52,
    thickness: sealed ? sealedDiameterMm * MM_TO_WORLD : .025,
    attenuationColor: sealed ? new Color('#C9654B') : new Color('#ffffff'),
    attenuationDistance: sealed ? sealedDiameterMm * 1.5 * MM_TO_WORLD : Infinity,
    envMapIntensity: sealed ? .65 : .95,
    depthWrite: sealed,
  })
}

/** Electrolytic capacitor: smooth blue PVC sleeve with subtle sheen. */
export function createElectrolyticSleeveMaterial(color = '#2b6cb0') {
  return new MeshStandardMaterial({
    color,
    roughness: .38,
    metalness: 0,
    envMapIntensity: .45,
  })
}

/** Ceramic capacitor: golden-brown caramel lacquer/resin dipped finish. */
export function createCeramicMaterial(sealed = false) {
  return new MeshStandardMaterial({
    color: sealed ? '#B87832' : '#b87d32',
    roughness: .42,
    metalness: 0,
    envMapIntensity: .4,
  })
}

/** Radial LED: colored translucent resin lens with soft highlight and internal depth. */
/** Dark resin preserves the chosen hue without changing document properties or emitted hue. */
export function darkLedResinColor(color: string): Color {
  const hue = new Color(color), hsl = { h: 0, s: 0, l: 0 }; hue.getHSL(hsl, SRGBColorSpace)
  const wine = new Color('#781521'), wineHsl = { h: 0, s: 0, l: 0 }; wine.getHSL(wineHsl, SRGBColorSpace)
  // Red's subtle wine tint is intentional; other hues follow the user's selection.
  const redDistance = Math.min(hsl.h, 1 - hsl.h)
  return redDistance < .045 && hsl.s > .25 ? wine : new Color().setHSL(hsl.h, hsl.s * .74, wineHsl.l, SRGBColorSpace)
}

/** Three already tints transmitted light by the surface diffuse color. Keep
 * the separate volume absorption mild so dark wine pigment is not applied a
 * second time and the enclosed leadframe can remain faintly visible. */
export function ledResinAbsorptionColor(color: string): Color {
  return darkLedResinColor(color).lerp(new Color('#ffffff'), .8)
}

export function createLedLensMaterial(color = '#ba3434', sealedDiameterMm?: number) {
  const sealed = sealedDiameterMm !== undefined, c = sealed ? darkLedResinColor(color) : new Color(color)
  return new MeshPhysicalMaterial({
    color: c,
    roughness: sealed ? .25 : .14,
    metalness: 0,
    transmission: sealed ? .28 : .62,
    // A faint direct interior signal complements screen-space refraction,
    // which can miss enclosed opaque geometry at a full-volume exit sample.
    // A small direct signal reveals the enclosed frame without the strong
    // background ghosting seen at lower opacity over a bright breadboard.
    opacity: sealed ? .98 : 1,
    transparent: true,
    ior: 1.54,
    thickness: sealed ? sealedDiameterMm * MM_TO_WORLD : .04,
    attenuationColor: sealed ? ledResinAbsorptionColor(color) : c,
    attenuationDistance: sealed ? sealedDiameterMm * 1.5 * MM_TO_WORLD : .08,
    envMapIntensity: sealed ? .65 : .9,
    emissive: '#000000',
    emissiveIntensity: 0,
  })
}

/** Materials belong to a single model; removing a model cannot invalidate a peer. */
export function createPackageMaterials(subduedBody = false) {
  return {
    metal: new MeshStandardMaterial({ color: '#d8dce0', roughness: .29, metalness: .86, envMapIntensity: .85 }),
    plastic: subduedBody ? createCoatingMaterial({ color: subduedBodyColor('#24272b'), roughness: .8 }) : new MeshStandardMaterial({ color: '#24272b', roughness: .65, metalness: .02 }),
    ink: new MeshStandardMaterial({ color: '#c9ccc1', roughness: .88 }),
    dark: new MeshStandardMaterial({ color: '#080b0e', roughness: .8 }),
  }
}

export const RESISTOR_BAND_COLORS = {
  black: '#1c1d20', brown: '#704725', red: '#bb3728', orange: '#e27724', yellow: '#e9c83e', green: '#387149', blue: '#315b97', violet: '#824986', grey: '#8c9197', white: '#e4e3da', gold: '#bea047', silver: '#a8aeb5',
} as const
