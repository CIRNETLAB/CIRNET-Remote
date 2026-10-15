import { Group, Mesh, MeshStandardMaterial } from 'three'
import { fiveBandResistorCode } from '../../data/componentProperties'
import type { PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { RESISTOR_BAND_COLORS } from './PackageMaterials'
import { updatePackageMarking } from './PackageMarking'

export function canUpdatePackageAppearance(part: PartDefinition) {
  return part.package.family === 'radial-capacitor' || part.package.family === 'axial' && (part.package.visualVariant === 'resistor' || part.function === 'resistor')
}

function displayNumber(value: number) { return Number(value.toPrecision(12)).toString() }
function resistanceLabel(value: number) {
  const scale = value >= 1e6 ? 1e6 : value >= 1e3 ? 1e3 : 1
  return `${displayNumber(value / scale)} ${scale === 1e6 ? 'MΩ' : scale === 1e3 ? 'kΩ' : 'Ω'}`
}
function capacitanceLabel(value: number) {
  const [scale, unit] = value >= 1e-3 ? [1e-3, 'mF'] : value >= 1e-6 ? [1e-6, 'µF'] : value >= 1e-9 ? [1e-9, 'nF'] : [1e-12, 'pF']
  return `${displayNumber(value / Number(scale))} ${unit}`
}

/** Mutate paint and the existing marking texture only. Placement, leads, target
 * identities, materials and geometry remain owned by the same component. */
export function updatePackageAppearance(group: Group, module: CircuitModule, part: PartDefinition): void {
  if (!canUpdatePackageAppearance(part)) return
  const properties = { ...part.editor.defaults, ...module.properties }
  const marking = group.getObjectByName('package-property-marking') as Mesh | undefined
  if (part.package.family === 'axial') {
    const resistanceOhms = Number(properties.resistanceOhms ?? 1000), tolerancePercent = Number(properties.tolerancePercent ?? 1), powerWatts = Number(properties.powerWatts ?? .25)
    const code = fiveBandResistorCode(resistanceOhms, tolerancePercent)
    for (let i = 0; i < 5; i++) {
      const band = group.getObjectByName(`package-resistor-band-${i}`) as Mesh<any, MeshStandardMaterial> | undefined
      if (!band) continue
      band.visible = code.ok
      if (code.ok) band.material.color.set(RESISTOR_BAND_COLORS[code.bands[i]!])
    }
    const label = `${resistanceLabel(resistanceOhms)} · ${displayNumber(powerWatts)} W · ±${displayNumber(tolerancePercent)}%`
    updatePackageMarking(marking, label)
    if (marking) marking.visible = !code.ok && !!marking.material && !!(marking.material as MeshStandardMaterial).map
    group.userData.appearance = { resistanceOhms, powerWatts, tolerancePercent, label, warning: code.ok ? null : code.reason }
  } else {
    const capacitanceFarads = Number(properties.capacitanceFarads ?? 100e-9), voltageRatingVolts = Number(properties.voltageRatingVolts ?? 50)
    const label = `${capacitanceLabel(capacitanceFarads)} / ${displayNumber(voltageRatingVolts)} V`
    updatePackageMarking(marking, label)
    group.userData.appearance = { capacitanceFarads, voltageRatingVolts, label }
  }
}
