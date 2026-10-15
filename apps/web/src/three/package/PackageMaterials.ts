import { Color, MeshStandardMaterial, type MeshStandardMaterialParameters } from 'three'

/** Body paint only: reduce display-space brightness by 10% while retaining hue.
 * Keep metal, coded bands and printed polarity/IC markings on their exact colors. */
export function subduedBodyColor(color: string): Color {
  return new Color(color).convertLinearToSRGB().multiplyScalar(.9).convertSRGBToLinear()
}

export function createPackageBodyMaterial(parameters: MeshStandardMaterialParameters & { color: string }) {
  return new MeshStandardMaterial({ ...parameters, color: subduedBodyColor(parameters.color) })
}

/** Materials belong to a single model; removing a model cannot invalidate a peer. */
export function createPackageMaterials(subduedBody = false) {
  return {
    metal: new MeshStandardMaterial({ color: '#d8dce0', roughness: .29, metalness: .86, envMapIntensity: .85 }),
    plastic: new MeshStandardMaterial({ color: subduedBody ? subduedBodyColor('#24272b') : '#24272b', roughness: .65, metalness: .02 }),
    ink: new MeshStandardMaterial({ color: '#c9ccc1', roughness: .88 }),
    dark: new MeshStandardMaterial({ color: '#080b0e', roughness: .8 }),
  }
}

export const RESISTOR_BAND_COLORS = {
  black: '#1c1d20', brown: '#704725', red: '#bb3728', orange: '#e27724', yellow: '#e9c83e', green: '#387149', blue: '#315b97', violet: '#824986', grey: '#8c9197', white: '#e4e3da', gold: '#bea047', silver: '#a8aeb5',
} as const
