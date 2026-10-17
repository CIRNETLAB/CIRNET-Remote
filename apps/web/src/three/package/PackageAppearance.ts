import { Group, Mesh, MeshStandardMaterial } from 'three'
import { engineeringInput, fiveBandResistorCode } from '../../data/componentProperties'
import type { PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { RESISTOR_BAND_COLORS, subduedBodyColor } from './PackageMaterials'
import { updatePackageMarking } from './PackageMarking'
import { updatePackageLeads } from './PackageLeads'

export function canUpdatePackageAppearance(part: PartDefinition) {
  return part.editorType === 'GENERIC_LED' || part.package.family === 'radial-capacitor' || part.package.family === 'axial' && (part.package.visualVariant === 'resistor' || part.function === 'resistor')
}

function displayNumber(value: number) { return String(value) }
function resistanceLabel(value: number) {
  const exponent = value >= 1e6 ? 6 : value >= 1e3 ? 3 : 0
  return `${engineeringInput(value, exponent)} ${exponent === 6 ? 'MΩ' : exponent === 3 ? 'kΩ' : 'Ω'}`
}
function capacitanceLabel(value: number) {
  const [exponent, unit] = value >= 1e-3 ? [-3, 'mF'] : value >= 1e-6 ? [-6, 'µF'] : value >= 1e-9 ? [-9, 'nF'] : [-12, 'pF']
  return `${engineeringInput(value, Number(exponent))} ${unit}`
}

/** Paint edits retain all geometry. Explicit lead edits replace only the owned
 * sweeps and move body artwork; placement and electrical target identities stay. */
export function updatePackageAppearance(group: Group, module: CircuitModule, part: PartDefinition): void {
  if (!canUpdatePackageAppearance(part)) return
  const properties = { ...part.editor.defaults, ...module.properties }
  if (part.editorType === 'GENERIC_LED') {
    const raw = properties.color
    const color = typeof raw === 'string' && raw.length === 7 && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : String(part.editor.defaults.color ?? '#ce3935')
    group.userData.ledColor = color
    group.traverse(object => {
      if (!(object instanceof Mesh) || !object.userData.ledLens || !(object.material instanceof MeshStandardMaterial)) return
      object.material.color.copy(subduedBodyColor(color))
      // A paint edit retains observed emission evidence; it never enables it.
      if (group.userData.ledOn === true) object.material.emissive.set(color)
    })
    return
  }
  updatePackageLeads(group, module, part)
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
