import { type ArtworkCommand, type InstrumentArtwork } from './InstrumentArtwork'
export { drawInstrumentArtwork, instrumentArtworkSvg } from './InstrumentArtwork'

export const GENERATOR_CH1 = '#ffe04a', GENERATOR_CH2 = '#20d4ee', GENERATOR_SYNC = '#35dd73'
export const GENERATOR_THEME = { screen: '#030b0f', bezel: '#30383e', panel: '#272e33' } as const
export const GENERATOR_PARAMETER_LABELS = ['Frequency', 'Amplitude', 'Offset', 'Duty', 'Phase'] as const
// Shared world-space centers keep the live mesh, decals and palette SVG aligned.
export const GENERATOR_LAYOUT = {
  screen: { x: -1.54, y: 2.10, w: 2.34, h: 1.80 },
  recess: { x: -1.54, y: 2.10, w: 2.50, h: 1.96 },
  panel: { x: 0.92, y: 2.61, w: 1.39, h: 0.94 },
  owl: { x: -2.55, y: 3.27, size: 0.20 },
  softKeys: Array.from({ length: 6 }, (_, i) => ({ name: `soft_key_${i + 1}`, x: -0.06, y: 2.83 - i * 0.30 })),
  buttons: [
    { name: 'waveform_button', label: 'Waveform', x: 0.45, y: 2.70, color: GENERATOR_CH1 },
    { name: 'sweep_button', label: 'Sweep', x: 0.92, y: 2.70, color: '#35434e' },
    { name: 'vco_button', label: 'VCO', x: 1.39, y: 2.70, color: '#35434e' },
    { name: 'counter_button', label: 'Counter', x: 0.45, y: 2.36, color: '#35434e' },
    { name: 'system_button', label: 'System', x: 0.92, y: 2.36, color: '#35434e' },
    { name: 'utility_button', label: 'Utility', x: 1.39, y: 2.36, color: '#35434e' },
    { name: 'ch1_button', label: 'CH1', x: 0.57, y: 1.70, color: '#272e33', accent: GENERATOR_CH1, w: 0.34 },
    { name: 'ok_button', label: 'OK', x: 1.035, y: 1.70, color: '#35434e', w: 0.34 },
    { name: 'ch2_button', label: 'CH2', x: 1.50, y: 1.70, color: '#272e33', accent: GENERATOR_CH2, w: 0.34 },
  ] as { name: string; label: string; x: number; y: number; color: string; accent?: string; w?: number; h?: number }[],
  encoder: { x: 2.22, y: 2.405, r: 0.35 },
  arrows: [{ name: 'left_button', x: 1.97, y: 1.70, direction: -1 }, { name: 'right_button', x: 2.47, y: 1.70, direction: 1 }],
  outputs: [
    { name: 'ch1_output', label: 'CH1 Output', x: 0.63, y: 0.91, accent: GENERATOR_CH1, channel: 1 },
    { name: 'ch2_output', label: 'CH2 Output', x: 1.44, y: 0.91, accent: GENERATOR_CH2, channel: 2 },
    { name: 'sync_counter', label: 'Sync / Counter', x: 2.25, y: 0.91, accent: GENERATOR_SYNC, channel: null },
  ],
  power: { x: -2.32, y: 0.91 },
} as const

// These values and traces are display artwork, not a synthesized signal or a
// physical device rating. A later DDS integration can update the separate screen.
export function generatorScreenArtwork(): InstrumentArtwork {
  const commands: ArtworkCommand[] = [{ kind: 'rect', x: 0, y: 0, w: 1024, h: 768, color: GENERATOR_THEME.screen }]
  const text = (text: string, x: number, y: number, color: string, size = 29) => commands.push({ kind: 'text', text, x, y, color, size })
  const path = (points: [number, number][], color: string, width = 2, dash?: number[]) => commands.push({ kind: 'path', points, color, width, dash })
  for (const [i, color] of [GENERATOR_CH1, GENERATOR_CH2].entries()) {
    const top = 18 + i * 368
    commands.push({ kind: 'rect', x: 16, y: top, w: 992, h: 350, color, r: 12 }, { kind: 'rect', x: 20, y: top + 4, w: 984, h: 342, color: GENERATOR_THEME.screen, r: 9 })
    commands.push({ kind: 'polygon', points: [[20, top + 4], [174, top + 4], [202, top + 36], [174, top + 68], [20, top + 68]], color })
    text(`CH${i + 1}`, 40, top + 36, '#06141a', 42)
    text(i === 0 ? 'Sine' : 'Square', 238, top + 37, color, 31)
    commands.push({ kind: 'rect', x: 912, y: top + 12, w: 76, h: 46, color, r: 8 })
    text('ON', 925, top + 35, '#06141a', 30)
    path([[205, top + 68], [989, top + 68]], color, 1.5)
    const labels = GENERATOR_PARAMETER_LABELS
    const values = i === 0 ? ['1.000 000 kHz', '5.000 Vpp', '0.000 V', '50.0 %', '0.0 °'] : ['10.000 000 kHz', '3.000 Vpp', '0.000 V', '50.0 %', '90.0 °']
    labels.forEach((label, j) => { text(label, 38, top + 108 + j * 48, '#dfe8ec', 28); text(':', 223, top + 108 + j * 48, '#dfe8ec', 28); text(values[j], 250, top + 108 + j * 48, j === 0 ? color : '#e4edf0', 28) })
    const plot = { x: 616, y: top + 88, w: 368, h: 242 }
    for (let k = 0; k <= 8; k++) path([[plot.x + k * plot.w / 8, plot.y], [plot.x + k * plot.w / 8, plot.y + plot.h]], '#29494f', 1, [2, 5])
    for (let k = 0; k <= 4; k++) path([[plot.x, plot.y + k * plot.h / 4], [plot.x + plot.w, plot.y + k * plot.h / 4]], '#29494f', 1, [2, 5])
    path([[plot.x, plot.y], [plot.x + plot.w, plot.y], [plot.x + plot.w, plot.y + plot.h], [plot.x, plot.y + plot.h], [plot.x, plot.y]], color, 1.5)
    if (i === 0) path(Array.from({ length: 161 }, (_, k) => [plot.x + k / 160 * plot.w, plot.y + plot.h / 2 - Math.sin(k / 160 * Math.PI * 4) * 80] as [number, number]), color, 5)
    else {
      const square: [number, number][] = [[plot.x, plot.y + 180]]
      for (let k = 0; k < 2; k++) { const x = plot.x + k * 184; square.push([x, plot.y + 62], [x + 92, plot.y + 62], [x + 92, plot.y + 180], [x + 184, plot.y + 180]) }
      path(square, color, 5)
    }
  }
  return { width: 1024, height: 768, commands }
}

export function generatorLegendsArtwork(): InstrumentArtwork {
  const commands: ArtworkCommand[] = []
  const px = (x: number) => (x / 6 + 0.5) * 1536, py = (y: number) => (1 - y / 3.6) * 922
  const text = (text: string, x: number, y: number, size = 25, color = '#e1e8ec', align: 'left' | 'center' = 'center') => commands.push({ kind: 'text', text, x: px(x), y: py(y), size, color, align })
  const path = (points: [number, number][], color = '#7b919b', width = 2) => commands.push({ kind: 'path', points: points.map(([x, y]) => [px(x), py(y)]), color, width })
  text('net', -2.39, 3.27, 34, '#e6eff3', 'left'); text('*CIRCUIT', -2.18, 3.27, 34, GENERATOR_CH2, 'left')
  path([[-1.39, 3.18], [-1.39, 3.36]], GENERATOR_CH2)
  text('L1571979', -1.18, 3.27, 28, '#e1e8ec', 'left')
  path([[-0.49, 3.18], [-0.49, 3.36]], GENERATOR_CH2)
  text('DDS Function / Arbitrary Waveform Generator', -0.28, 3.27, 22, '#e1e8ec', 'left')
  path([[1.945, 3.19], [2.445, 3.19], [2.495, 3.35], [1.995, 3.35], [1.945, 3.19]], GENERATOR_CH1, 2)
  text('2 Channel', 2.22, 3.27, 24, GENERATOR_CH1)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    path([[GENERATOR_LAYOUT.encoder.x + Math.cos(a) * 0.395, GENERATOR_LAYOUT.encoder.y + Math.sin(a) * 0.395], [GENERATOR_LAYOUT.encoder.x + Math.cos(a) * 0.420, GENERATOR_LAYOUT.encoder.y + Math.sin(a) * 0.420]], '#415967', 1.5)
  }
  text('FUNCTION', 0.29, 2.975, 25, '#e1e8ec', 'left')
  for (const key of GENERATOR_LAYOUT.buttons) text(key.label, key.x, key.y - (key.accent ? 0.026 : 0), key.label === 'Waveform' ? 18 : 21, key.accent ?? (key.name === 'waveform_button' ? '#142027' : '#e1e8ec'))
  for (const key of GENERATOR_LAYOUT.softKeys) path([[key.x - 0.16, key.y], [-0.27, key.y]], '#b6c4cb', 2)
  for (const key of GENERATOR_LAYOUT.arrows) commands.push({ kind: 'polygon', points: [[px(key.x + key.direction * 0.06), py(key.y)], [px(key.x - key.direction * 0.045), py(key.y + 0.065)], [px(key.x - key.direction * 0.045), py(key.y - 0.065)]], color: '#e1e8ec' })
  const circlePath = (cx: number, cy: number, r: number, seg = 20): [number, number][] =>
    Array.from({ length: seg + 1 }, (_, i) => {
      const a = (i / seg) * Math.PI * 2
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    })
  const circlePoly = (cx: number, cy: number, r: number, seg = 14): [number, number][] =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2
      return [px(cx + Math.cos(a) * r), py(cy + Math.sin(a) * r)]
    })
  const gndColor = '#b6c4cb'
  for (const output of GENERATOR_LAYOUT.outputs) {
    const width = output.channel === null ? 0.72 : 0.63
    commands.push({ kind: 'rect', x: px(output.x - width / 2), y: py(1.40), w: width * 256, h: 0.15 / 3.6 * 922, color: output.accent, r: 16 })
    text(output.label, output.x, 1.325, output.channel === null ? 18 : 20, '#06141a')

    // Coaxial Ground (GND) schematic symbol beside each BNC socket (IEC 60417-5019)
    const gndX = output.x + 0.27, gndY = output.y, circleR = 0.038, dotR = 0.013
    path([[output.x + 0.20, gndY], [gndX - circleR, gndY]], gndColor, 2)
    path(circlePath(gndX, gndY, circleR), gndColor, 2)
    commands.push({ kind: 'polygon', points: circlePoly(gndX, gndY, dotR), color: gndColor })
    const stemBotY = gndY - circleR - 0.038
    path([[gndX, gndY - circleR], [gndX, stemBotY]], gndColor, 2)
    const barWidths = [0.084, 0.054, 0.024]
    barWidths.forEach((w, i) => {
      const barY = stemBotY - i * 0.018
      path([[gndX - w / 2, barY], [gndX + w / 2, barY]], gndColor, 2)
    })
  }
  return { width: 1536, height: 922, commands }
}
