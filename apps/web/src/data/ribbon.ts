import type { WindowKind } from '../types/windows'
import deviceMetadata from './deviceMetadata.json'
import { getDefinition } from './editorCatalog'

export const iconUrl = (filename: string) => new URL(`../assets/icons/${filename}.svg`, import.meta.url).href
export interface LibraryComponent {
  type: string; name: string; description: string; icon?: string; glyph?: string; window?: WindowKind
  metadata?: Record<string, unknown>
}
export interface RibbonGroup { id: string; label: string; icon?: string; glyph?: string; items: LibraryComponent[] }
const artwork = (type: string, name: string, icon: string): LibraryComponent => ({ type, name, icon, description: 'Supplied artwork preview. Placement and model integration are planned for the circuit editor.' })
const future = (type: string, name: string, glyph: string): LibraryComponent => ({ type, name, glyph, description: 'Reserved library entry. Device metadata and editor integration are not connected yet.' })
export const ribbonGroups: RibbonGroup[] = [
  { id: 'structure', label: 'Structure', icon: 'breadboard_830', items: [
    { ...artwork('BREADBOARD', 'Breadboard 830', 'breadboard_830'), metadata: deviceMetadata['generic-full-size'] },
    { ...artwork('BREADBOARD_630', 'Breadboard 630', 'breadboard_630'), description: '630 tie-point half-size solderless breadboard terminal strip without power distribution rails.' },
    { ...artwork('BREADBOARD_100', 'Power Breadboard', 'breadboard_100'), description: '100 tie-point dual bus power distribution strip (+ / - rails) for modular breadboard assembly.' },
    artwork('POWER_SUPPLY', 'Power Supply', 'power_supply_upright'),
    { ...artwork('JUMPER', 'Wire tool', 'Wire'), description: 'Connect holes or ports and route colored jumper wires.' },
  ] },
  { id: 'passive', label: 'Passive', icon: 'resistor', items: [artwork('RESISTOR', 'Resistor', 'resistor'), artwork('CAPACITOR', 'Capacitor', 'capacitor')] },
  { id: 'active', label: 'Active', icon: 'transistor', items: [artwork('TRANSISTOR', 'Transistor', 'transistor'), artwork('DIODE', 'Diode', 'diode'), artwork('ZENER', 'Zener diode', 'diode_zener')] },
  { id: 'output', label: 'Output', icon: 'led', items: [artwork('LED', 'LED indicator', 'led'), future('PROBE', 'Logical probe', 'probe'), future('DISPLAY', 'Digital display', 'memory'), artwork('BUZZER', 'Buzzer', 'buzzer_chip')] },
  { id: 'input', label: 'Input', icon: 'Input', items: [artwork('DIGITAL_SWITCH', 'Toggle switch', 'Input'), future('PUSH_BUTTON', 'Push button', 'plus'), future('DIP_SWITCH', 'DIP switch', 'chip'), future('CLOCK', 'Clock', 'clock')] },
  { id: 'logic', label: 'Logic ICs', icon: 'ic_logic', items: [
    { type: '74HC08', name: '74HC08 · AND', icon: 'ic_logic', description: 'Quad two-input AND gate. Starter logical metadata only; browser simulation integration is pending.', metadata: deviceMetadata['74HC08'] },
  ] },
  { id: 'arithmetic', label: 'Arithmetic ICs', icon: 'ic_arithmetic', items: [artwork('ADDER', 'Adder abstraction', 'ic_arithmetic'), artwork('MULTIPLIER', 'Multiplier abstraction', 'ic_arithmetic')] },
  { id: 'memory', label: 'Memory', glyph: 'memory', items: [future('MEMORY', 'Generic byte memory', 'memory')] },
  { id: 'display', label: 'Display', icon: '7doan1', items: [artwork('SEGMENT_1', '7-segment · single', '7doan1'), artwork('SEGMENT_2', '7-segment · dual', '7doan2'), artwork('SEGMENT_4', '7-segment · quad', '7doan4')] },
  { id: 'embedded', label: 'Embedded/Controller', glyph: 'chip', items: [future('CONTROLLER', 'Controller', 'chip')] },
  { id: 'instruments', label: 'Instruments', icon: 'oscilloscope_2ch', items: [
    { type: 'OSCILLOSCOPE', name: 'Oscilloscope · 2 channels', icon: 'oscilloscope_2ch', description: 'Two-channel bench oscilloscope visual with independent control pivots and waveform preview.' },
    { type: 'GENERATOR', name: 'Function Generator · 2 channels', icon: 'function_generator_2ch', description: 'L1571979 bench generator visual with two channel displays, encoder pivot and three BNC connectors.' },
    { type: 'SIGNAL_MONITOR', name: 'Signal Monitor', icon: 'signal_monitor', description: 'Digital acquisition window shell.', window: 'monitor' },
  ] },
  { id: 'notation', label: 'Notation', glyph: 'tag', items: [future('LABEL', 'Label', 'tag'), future('PROBE', 'Probe annotation', 'probe')] },
]
export const libraryComponents = ribbonGroups.flatMap((group) => group.items)
for (const item of libraryComponents) {
  const definition = getDefinition(item.type)
  if (definition) {
    item.description = definition.breadboardTopologyRef ? 'Breadboard contacts with declared virtual strip and continuous rail nodes. Click holes with Wire; physical station mapping is separate.' : definition.visualOnly ? 'Visual structure only. Placement creates no source, electrical nodes or physical hardware.' : 'Functional editor model with named logical ports. Physical pin mapping is separate.'
    item.metadata = { ...item.metadata, editor_contract: definition }
  }
}
