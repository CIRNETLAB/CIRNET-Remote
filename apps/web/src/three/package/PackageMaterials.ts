import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type MeshStandardMaterialParameters } from 'three'
import { createCoatingMaterial } from '../StudioEnvironment'

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
export function createDiodeMaterial() {
  return new MeshStandardMaterial({
    color: '#1b1e22',
    roughness: .4,
    metalness: 0,
    envMapIntensity: .4,
  })
}

/** Zener diode body: DO-35 transparent/translucent glass envelope with reflections. */
export function createZenerGlassMaterial() {
  return new MeshPhysicalMaterial({
    color: '#e86a3e',
    roughness: .14,
    metalness: 0,
    transmission: .72,
    opacity: 1,
    transparent: true,
    ior: 1.52,
    thickness: .025,
    envMapIntensity: .95,
    depthWrite: false,
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
export function createCeramicMaterial() {
  return new MeshStandardMaterial({
    color: '#b87d32',
    roughness: .42,
    metalness: 0,
    envMapIntensity: .4,
  })
}

/** Radial LED: colored translucent resin lens with soft highlight and internal depth. */
export function createLedLensMaterial(color = '#ba3434') {
  const c = new Color(color)
  return new MeshPhysicalMaterial({
    color: c,
    roughness: .14,
    metalness: 0,
    transmission: .62,
    opacity: 1,
    transparent: true,
    ior: 1.54,
    thickness: .04,
    attenuationColor: c,
    attenuationDistance: .08,
    envMapIntensity: .9,
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
