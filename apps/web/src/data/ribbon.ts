import type { WindowKind } from '../types/windows'
import deviceMetadata from './deviceMetadata.json'
import { getDefinition } from './editorCatalog'
import { getPartForType, partCatalog } from './partCatalog'

export const iconUrl = (filename: string) => new URL(`../assets/icons/${filename}.svg`, import.meta.url).href
export interface LibraryComponent {
  type: string; name: string; description: string; icon?: string; glyph?: string; window?: WindowKind
  metadata?: Record<string, unknown>
  support?: string
}
export interface RibbonGroup { id: string; label: string; icon?: string; glyph?: string; items: LibraryComponent[] }
const artwork = (type: string, name: string, icon: string): LibraryComponent => ({ type, name, icon, description: 'Supplied artwork preview. Placement and model integration are planned for the circuit editor.' })
const future = (type: string, name: string, glyph: string): LibraryComponent => ({ type, name, glyph, description: 'Reserved library entry. Device metadata and editor integration are not connected yet.' })
const physical = (type: string, icon: string): LibraryComponent => {
  const part = getPartForType(type)!
  return { type, name: part.name, icon, description: `${part.function.replaceAll('-', ' ')} · ${part.package.pins.length} pins · ${part.package.id}`, support: 'Place / wire', metadata: { definitionId: part.id, revision: part.revision } }
}
export const ribbonGroups: RibbonGroup[] = [
  { id: 'structure', label: 'Structure', icon: 'breadboard_830', items: [
    { ...artwork('BREADBOARD', 'Breadboard 830', 'breadboard_830'), metadata: deviceMetadata['generic-full-size'] },
    { ...artwork('BREADBOARD_630', 'Breadboard 630', 'breadboard_630'), description: '630 tie-point half-size solderless breadboard terminal strip without power distribution rails.' },
    { ...artwork('BREADBOARD_100', 'Power Breadboard', 'breadboard_100'), description: '100 tie-point dual bus power distribution strip (+ / - rails) for modular breadboard assembly.' },
    physical('DC_SUPPLY', 'power_supply_upright'),
    { ...artwork('JUMPER', 'Wire tool', 'Wire'), description: 'Connect holes or ports and route colored jumper wires.' },
  ] },
  { id: 'passive', label: 'Passive', icon: 'resistor', items: [physical('RESISTOR_AXIAL', 'resistor'), physical('CAPACITOR_CERAMIC', 'capacitor'), physical('CAPACITOR_ELECTROLYTIC', 'capacitor')] },
  { id: 'active', label: 'Active', icon: 'transistor', items: [physical('TRANSISTOR_2N3904', 'transistor'), physical('DIODE_1N4148', 'diode'), physical('ZENER_1N4733A', 'diode_zener')] },
  { id: 'output', label: 'Output', icon: 'led', items: [physical('LED_LTL307EE', 'led'), physical('BUZZER_PS1240', 'buzzer_chip')] },
  { id: 'input', label: 'Contacts', icon: 'Input', items: [physical('TOGGLE_SWITCH_200MSP1', 'Input'), physical('PUSH_BUTTON_B3F1000', 'Input'), physical('DIP_SWITCH_A6D4100', 'Input')] },
  { id: 'logic', label: 'Logic ICs', icon: 'ic_logic', items: [
    ...partCatalog.filter(part => part.package.family === 'dip').map(part => physical(part.editorType, 'ic_logic')),
  ] },
  { id: 'arithmetic', label: 'Arithmetic ICs', icon: 'ic_arithmetic', items: [artwork('ADDER', 'Adder abstraction', 'ic_arithmetic'), artwork('MULTIPLIER', 'Multiplier abstraction', 'ic_arithmetic')] },
  { id: 'display', label: 'Display', icon: '7doan1', items: [physical('SEGMENT_SC5611EWA', '7doan1'), physical('SEGMENT_DC5611EWA', '7doan2'), physical('SEGMENT_CC5612EWA', '7doan4')] },
  { id: 'instruments', label: 'Instruments', icon: 'oscilloscope_2ch', items: [
    { type: 'OSCILLOSCOPE', name: 'Oscilloscope · 2 channels', icon: 'oscilloscope_2ch', description: 'Two-channel bench oscilloscope visual with independent control pivots and waveform preview.' },
    { type: 'GENERATOR', name: 'Function Generator · 2 channels', icon: 'function_generator_2ch', description: 'L1571979 bench generator visual with two channel displays, encoder pivot and three BNC connectors.' },
    { type: 'SIGNAL_MONITOR', name: 'Signal Monitor', icon: 'signal_monitor', description: 'Digital acquisition window shell.', window: 'monitor' },
  ] },
  { id: 'notation', label: 'Notation', glyph: 'tag', items: [future('LABEL', 'Label', 'tag'), future('PROBE', 'Probe annotation', 'probe')] },
]
export const libraryComponents = ribbonGroups.flatMap((group) => group.items)
const normalTypes = new Set(libraryComponents.map(item => item.type))
export const isNormallyAddable = (type: string) => normalTypes.has(type) && !!getDefinition(type)
for (const item of libraryComponents) {
  const definition = getDefinition(item.type)
  if (definition) {
    if (!getPartForType(item.type)) item.description = definition.breadboardTopologyRef ? 'Breadboard contacts with declared virtual strip and continuous rail nodes. Click holes with Wire; physical station mapping is separate.' : definition.visualOnly ? 'Visual structure only. Placement creates no source, electrical nodes or physical hardware.' : 'Ideal logical editor tool. No physical package or breadboard mounting; existing file semantics are preserved.'
    item.metadata = { ...item.metadata, editor_contract: definition }
  }
}
