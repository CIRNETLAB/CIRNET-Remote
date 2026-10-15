import { MeshStandardMaterial } from 'three'

/** Materials belong to a single model; removing a model cannot invalidate a peer. */
export function createPackageMaterials() {
  return {
    metal: new MeshStandardMaterial({ color: '#d8dce0', roughness: .29, metalness: .86, envMapIntensity: .85 }),
    plastic: new MeshStandardMaterial({ color: '#24272b', roughness: .65, metalness: .02 }),
    ink: new MeshStandardMaterial({ color: '#c9ccc1', roughness: .88 }),
    dark: new MeshStandardMaterial({ color: '#080b0e', roughness: .8 }),
  }
}

export const RESISTOR_BAND_COLORS = {
  black: '#1c1d20', brown: '#704725', red: '#bb3728', orange: '#e27724', yellow: '#e9c83e', green: '#387149', blue: '#315b97', violet: '#824986', grey: '#8c9197', white: '#e4e3da', gold: '#bea047', silver: '#a8aeb5',
} as const
