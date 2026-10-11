// Presentation metadata only. No capture capability, device rating or sample
// data is implied by these colors and front-panel labels.
export const CH1_COLOR = '#ffe04a', CH2_COLOR = '#20d4ee'
export const SUPPLY_THEME = { voltage: '#ff493c', current: '#30b4ff', bezel: '#30383e', panel: '#272e33' } as const
export const SCOPE_THEME = { ch1: CH1_COLOR, ch2: CH2_COLOR, run: '#36d790', bezel: '#30383e', panel: '#272e33', screen: '#050b10' } as const
export const SCOPE_SECTIONS = ['Horizontal', 'Trigger', 'Vertical'] as const
export const SCOPE_LABELS = { timeDiv: 'Time / Div', position: 'Position', level: 'Level', voltsDiv: 'Volts / Div' } as const
export const SCOPE_KEYS = {
  auto_set_button: { label: 'Auto Set', color: SCOPE_THEME.ch2 },
  run_stop_button: { label: 'Run/Stop', color: SCOPE_THEME.run },
  single_button: { label: 'Single', color: '#35434e' },
  default_button: { label: 'Default', color: '#35434e' },
  trigger_mode_button: { label: 'Mode', color: '#35434e' },
  trigger_source_button: { label: 'Source', color: '#35434e' },
  trigger_slope_button: { label: 'Slope', color: '#35434e' },
  trigger_menu_button: { label: 'Menu', color: '#35434e' },
} as const
export const instrumentThemeStyle = {
  '--instrument-ch1': SCOPE_THEME.ch1, '--instrument-ch2': SCOPE_THEME.ch2,
  '--instrument-run': SCOPE_THEME.run, '--instrument-bezel': SCOPE_THEME.bezel,
  '--instrument-panel': SCOPE_THEME.panel, '--instrument-screen': SCOPE_THEME.screen,
}
