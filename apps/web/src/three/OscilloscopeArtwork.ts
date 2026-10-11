import { CH1_COLOR, CH2_COLOR, SCOPE_THEME, SCOPE_SECTIONS, SCOPE_LABELS, SCOPE_KEYS } from '../data/instrumentVisuals'
export { CH1_COLOR, CH2_COLOR } from '../data/instrumentVisuals'

// One drawing recipe drives the live CanvasTextures and the exported PNG decals.
// These two traces are illustrative; no sampling rate, bandwidth or acquisition
// status is inferred from the reference picture or from the visual instrument.
export type ArtworkCommand =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string; r?: number }
  | { kind: 'path'; points: [number, number][]; color: string; width: number; dash?: number[] }
  | { kind: 'polygon'; points: [number, number][]; color: string }
  | { kind: 'text'; text: string; x: number; y: number; size: number; color: string; align?: 'left' | 'center' | 'right' }
export interface ScopeArtwork { width: number; height: number; commands: ArtworkCommand[] }


// World-space front layout shared by geometry, CanvasTexture legends and the
// exported palette preview. Keep control centers here so labels cannot drift.
export const SCOPE_LAYOUT = {
  screen: { x: -0.98, y: 2.22, w: 3.48, h: 2.18 },
  recess: { x: -0.98, y: 2.22, w: 3.80, h: 2.46 },
  panels: [
    { name: 'horizontal_panel', x: 1.94, y: 3.055, w: 1.90, h: 1.01 },
    { name: 'trigger_panel', x: 1.94, y: 2.185, w: 1.90, h: 0.70 },
    { name: 'vertical_panel', x: 1.94, y: 1.225, w: 1.90, h: 1.19 },
  ],
  knobs: [
    { name: 'time_div_knob', x: 1.38, y: 3.06, r: 0.235, accent: CH2_COLOR },
    { name: 'horizontal_position', x: 2.04, y: 3.06, r: 0.145, accent: '#b7c4cf' },
    { name: 'trigger_level', x: 1.55, y: 2.18, r: 0.18, accent: '#b7c4cf' },
    { name: 'ch1_volts_div', x: 1.48, y: 1.25, r: 0.19, accent: CH1_COLOR },
    { name: 'ch1_position', x: 1.48, y: 0.815, r: 0.105, accent: CH1_COLOR },
    { name: 'ch2_volts_div', x: 2.46, y: 1.25, r: 0.19, accent: CH2_COLOR },
    { name: 'ch2_position', x: 2.46, y: 0.815, r: 0.105, accent: CH2_COLOR },
  ],
  buttons: [
    { name: 'auto_set_button', ...SCOPE_KEYS.auto_set_button, x: 2.61, y: 3.29, w: 0.46, h: 0.17 },
    { name: 'run_stop_button', ...SCOPE_KEYS.run_stop_button, x: 2.61, y: 3.08, w: 0.46, h: 0.17 },
    { name: 'single_button', ...SCOPE_KEYS.single_button, x: 2.61, y: 2.87, w: 0.46, h: 0.17 },
    { name: 'default_button', ...SCOPE_KEYS.default_button, x: 2.61, y: 2.66, w: 0.46, h: 0.17 },
    { name: 'trigger_mode_button', ...SCOPE_KEYS.trigger_mode_button, x: 2.16, y: 2.31, w: 0.40, h: 0.17 },
    { name: 'trigger_source_button', ...SCOPE_KEYS.trigger_source_button, x: 2.65, y: 2.31, w: 0.40, h: 0.17 },
    { name: 'trigger_slope_button', ...SCOPE_KEYS.trigger_slope_button, x: 2.16, y: 2.08, w: 0.40, h: 0.17 },
    { name: 'trigger_menu_button', ...SCOPE_KEYS.trigger_menu_button, x: 2.65, y: 2.08, w: 0.40, h: 0.17 },
    { name: 'power_button', label: '', x: -2.47, y: 0.62, w: 0.32, h: 0.30, color: '#272e33' },
  ],
  bncs: [
    { name: 'ch1_bnc', label: 'CH1', x: -1.30, y: 0.60, accent: CH1_COLOR, channel: 1 },
    { name: 'ch2_bnc', label: 'CH2', x: -0.49, y: 0.60, accent: CH2_COLOR, channel: 2 },
    { name: 'trig_out_bnc', label: 'Trig Out', x: 0.32, y: 0.60, accent: '#b7c4cf', channel: null },
  ],
  led: { x: -2.19, y: 0.62 },
  owl: { x: -2.53, y: 3.605, size: 0.22 },
} as const

export function scopeScreenArtwork(): ScopeArtwork {
  const commands: ArtworkCommand[] = [{ kind: 'rect', x: 0, y: 0, w: 1024, h: 704, color: SCOPE_THEME.screen }]
  const line = (points: [number, number][], color: string, width = 1, dash?: number[]) => commands.push({ kind: 'path', points, color, width, dash })
  const text = (text: string, x: number, y: number, color: string, size = 22) => commands.push({ kind: 'text', text, x, y, color, size })
  // Ten horizontal divisions, eight vertical divisions. Restrained minor ticks
  // leave the channel colors dominant, even when the model is zoomed out.
  for (let i = 0; i <= 10; i++) line([[32 + i * 96, 60], [32 + i * 96, 620]], i === 5 ? '#7a8b93' : '#45545d', i === 5 ? 1.6 : 1.2, i === 5 ? undefined : [2, 6])
  for (let i = 0; i <= 8; i++) line([[32, 60 + i * 70], [992, 60 + i * 70]], i === 4 ? '#7a8b93' : '#45545d', i === 4 ? 1.6 : 1.2, i === 4 ? undefined : [2, 6])
  for (let x = 32; x <= 992; x += 19.2) line([[x, 337], [x, 343]], '#71838b')
  for (let y = 60; y <= 620; y += 14) line([[509, y], [515, y]], '#71838b')
  const square: [number, number][] = [[32, 264]]
  for (let i = 0; i < 5; i++) {
    const x = 32 + i * 192
    square.push([x + 32, 264], [x + 32, 152], [x + 128, 152], [x + 128, 264], [x + 192, 264])
  }
  line(square, CH1_COLOR, 4)
  line(Array.from({ length: 401 }, (_, i) => [32 + i * 2.4, 484 - Math.sin(i / 400 * Math.PI * 10) * 73] as [number, number]), CH2_COLOR, 4)
  // Scope-like status and channel bands. Preview is explicit: the image does
  // not assert a running acquisition, calibrated readings or device ratings.
  text('PREVIEW', 32, 30, '#36d790', 20); text('T = —', 195, 30, '#dce5e9', 20)
  text('TIMEBASE —', 670, 30, '#dce5e9', 20); text('TRIG —', 888, 30, '#36d790', 18)
  line([[166, 14], [166, 46]], '#6d7f88'); line([[868, 14], [868, 46]], '#6d7f88')
  line([[500, 22], [512, 42], [524, 22], [500, 22]], '#efa431', 3)
  commands.push({ kind: 'rect', x: 4, y: 208, w: 23, h: 32, color: CH1_COLOR }, { kind: 'rect', x: 4, y: 480, w: 23, h: 32, color: CH2_COLOR })
  text('1', 9, 224, '#050b10', 22); text('2', 9, 496, '#050b10', 22)
  commands.push({ kind: 'rect', x: 16, y: 641, w: 992, h: 51, color: '#07131c' })
  text('CH1  — V/div', 32, 667, CH1_COLOR, 23); text('CH2  — V/div', 386, 667, CH2_COLOR, 23)
  text('T  — s/div', 798, 667, '#dce5e9', 23)
  line([[16, 640], [1008, 640]], '#667b86'); line([[352, 642], [352, 692]], '#667b86'); line([[768, 642], [768, 692]], '#667b86')
  return { width: 1024, height: 704, commands }
}

export function scopeLegendsArtwork(): ScopeArtwork {
  const commands: ArtworkCommand[] = []
  const px = (x: number) => (x / 6 + 0.5) * 1536, py = (y: number) => (1 - y / 3.8) * 960
  const text = (text: string, x: number, y: number, size = 28, color = '#dae3e7', align: 'left' | 'center' = 'center') => commands.push({ kind: 'text', text, x: px(x), y: py(y), size, color, align })
  const line = (a: [number, number], b: [number, number], color = '#b3c2c9', width = 2) => commands.push({ kind: 'path', points: [[px(a[0]), py(a[1])], [px(b[0]), py(b[1])]], color, width })
  const ring = (x: number, y: number, radius: number, color = '#c9d6dc') => {
    for (let i = 0; i <= 10; i++) {
      const angle = -Math.PI * 0.75 + i / 10 * Math.PI * 1.5
      line([x + Math.sin(angle) * radius, y + Math.cos(angle) * radius], [x + Math.sin(angle) * (radius + 0.025), y + Math.cos(angle) * (radius + 0.025)], color)
    }
  }
  text('net', -2.36, 3.60, 37, '#e6eff3', 'left'); text('*CIRCUIT', -2.14, 3.60, 37, CH2_COLOR, 'left')
  line([-0.81, 3.49], [-0.81, 3.71], '#869aa4')
  text('HD111977', -0.66, 3.60, 26, '#e2e9ed', 'left')
  line([0.02, 3.49], [0.02, 3.71], '#869aa4')
  text('DIGITAL OSCILLOSCOPE', 0.16, 3.65, 16, '#c6d2d9', 'left')
  text('2 Channel  100MHz  1GSa/s', 0.16, 3.53, 14, '#9fb0ba', 'left')
  for (const [i, title] of SCOPE_SECTIONS.entries()) {
    const panel = SCOPE_LAYOUT.panels[i]
    text(title, panel.x - panel.w / 2 + 0.08, panel.y + panel.h / 2 - (title === 'Vertical' ? 0.06 : 0.10), 27, '#e2e9ed', 'left')
  }
  const control = (name: string) => SCOPE_LAYOUT.knobs.find((knob) => knob.name === name)!
  const time = control('time_div_knob'), position = control('horizontal_position'), level = control('trigger_level')
  text(SCOPE_LABELS.timeDiv, time.x, time.y - 0.35, 22); text(SCOPE_LABELS.position, position.x, position.y - 0.26, 21)
  text('s', time.x - 0.14, time.y + 0.33, 17, CH2_COLOR); text('ms', time.x + 0.21, time.y + 0.33, 17)
  text('µs', time.x + 0.32, time.y + 0.17, 16); text('ns', time.x + 0.35, time.y + 0.01, 16)
  // Professional solid filled left / right chevron triangles above Horizontal Position knob
  commands.push(
    { kind: 'polygon', points: [[px(position.x - 0.13), py(position.y + 0.25)], [px(position.x - 0.05), py(position.y + 0.295)], [px(position.x - 0.05), py(position.y + 0.205)]], color: '#e1e8ec' },
    { kind: 'polygon', points: [[px(position.x + 0.13), py(position.y + 0.25)], [px(position.x + 0.05), py(position.y + 0.295)], [px(position.x + 0.05), py(position.y + 0.205)]], color: '#e1e8ec' }
  )
  for (const button of SCOPE_LAYOUT.buttons) if (button.label) text(button.label, button.x, button.y, 18, ['auto_set_button', 'run_stop_button'].includes(button.name) ? '#07181e' : '#e1e8ec')
  text(SCOPE_LABELS.level, level.x, level.y - 0.26, 21)
  line([level.x - 0.48, level.y - 0.02], [level.x - 0.44, level.y - 0.02]); line([level.x - 0.44, level.y - 0.02], [level.x - 0.40, level.y + 0.04]); line([level.x - 0.40, level.y + 0.04], [level.x - 0.36, level.y + 0.04])
  text('Trig', level.x - 0.43, level.y - 0.23, 16, '#b8c7ce')
  for (const [channel, color] of [[1, CH1_COLOR], [2, CH2_COLOR]] as const) {
    const volts = control(`ch${channel}_volts_div`), pos = control(`ch${channel}_position`)
    // Rounded rectangular badge for CH1 and CH2 headers
    commands.push({ kind: 'rect', x: px(volts.x - 0.335), y: py(volts.y + 0.44), w: 0.67 * 256, h: 0.105 / 3.8 * 960, color, r: 8 })
    text(`CH${channel}`, volts.x, volts.y + 0.387, 22, '#07181e'); text(SCOPE_LABELS.voltsDiv, volts.x, volts.y + 0.285, 19)
    text(SCOPE_LABELS.position, pos.x, pos.y + 0.20, 19)
    // Professional solid filled up / down chevron triangles for Vertical Position knob
    commands.push(
      { kind: 'polygon', points: [[px(pos.x - 0.22), py(pos.y + 0.08)], [px(pos.x - 0.17), py(pos.y + 0.02)], [px(pos.x - 0.27), py(pos.y + 0.02)]], color: '#e1e8ec' },
      { kind: 'polygon', points: [[px(pos.x - 0.22), py(pos.y - 0.08)], [px(pos.x - 0.17), py(pos.y - 0.02)], [px(pos.x - 0.27), py(pos.y - 0.02)]], color: '#e1e8ec' }
    )
    text('mV', volts.x - 0.28, volts.y - 0.15, 16); text('V', volts.x + 0.28, volts.y - 0.15, 16)
  }
  line([1.96, 0.70], [1.96, 1.69], '#4d626e'); line([1.98, 0.70], [1.98, 1.69], CH2_COLOR, 1)
  for (const knob of SCOPE_LAYOUT.knobs) ring(knob.x, knob.y, knob.r + 0.025, knob.accent)
  for (const port of SCOPE_LAYOUT.bncs) {
    text(port.label, port.x, port.y + 0.30, 24, '#dae3e7')
    // Keep annotations safely cleared from the outer ring (radius 0.21) by placing at +0.40
    const specX = port.x + 0.40
    if (port.channel !== null) {
      // Warning triangle icon
      const warnY = port.y + 0.16
      line([specX - 0.06, warnY - 0.05], [specX, warnY + 0.06], '#e1e8ec', 2)
      line([specX, warnY + 0.06], [specX + 0.06, warnY - 0.05], '#e1e8ec', 2)
      line([specX + 0.06, warnY - 0.05], [specX - 0.06, warnY - 0.05], '#e1e8ec', 2)
      line([specX, warnY + 0.03], [specX, warnY - 0.01], '#e1e8ec', 2)
      line([specX, warnY - 0.03], [specX, warnY - 0.038], '#e1e8ec', 2)

      // Ratings text
      text('1 MΩ', specX, port.y + 0.04, 15, '#c7d5dd')
      text('300 Vpk', specX, port.y - 0.07, 15, '#c7d5dd')
    } else {
      // Trig Out ratings text
      text('50 Ω', specX, port.y + 0.04, 15, '#c7d5dd')
      text('5 Vpp', specX, port.y - 0.07, 15, '#c7d5dd')
    }

    // Ground symbol (vertical stem + 3 descending horizontal lines)
    const gndY = port.y - 0.16
    line([specX, gndY + 0.04], [specX, gndY - 0.01], '#9ab0bd', 2)
    line([specX - 0.05, gndY - 0.01], [specX + 0.05, gndY - 0.01], '#9ab0bd', 2)
    line([specX - 0.033, gndY - 0.03], [specX + 0.033, gndY - 0.03], '#9ab0bd', 2)
    line([specX - 0.016, gndY - 0.05], [specX + 0.016, gndY - 0.05], '#9ab0bd', 2)
  }
  // Printed power glyph over an independent button and a separate status LED.
  const { x, y } = SCOPE_LAYOUT.buttons.find((button) => button.name === 'power_button')!
  const arc = Array.from({ length: 25 }, (_, i) => { const a = Math.PI * 0.23 + i / 24 * Math.PI * 1.54; return [px(x + Math.sin(a) * 0.087), py(y + Math.cos(a) * 0.087)] as [number, number] })
  commands.push({ kind: 'path', points: arc, color: '#e1e8ec', width: 6 }); line([x, y + 0.105], [x, y + 0.012], '#e1e8ec', 6)
  return { width: 1536, height: 960, commands }
}

export function drawScopeArtwork(ctx: CanvasRenderingContext2D, artwork: ScopeArtwork) {
  ctx.clearRect(0, 0, artwork.width, artwork.height)
  ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const command of artwork.commands) {
    if (command.kind === 'rect') {
      ctx.fillStyle = command.color
      if (command.r && typeof ctx.roundRect === 'function') {
        ctx.beginPath(); ctx.roundRect(command.x, command.y, command.w, command.h, command.r); ctx.fill()
      } else {
        ctx.fillRect(command.x, command.y, command.w, command.h)
      }
    }
    else if (command.kind === 'polygon') {
      ctx.fillStyle = command.color; ctx.beginPath()
      command.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
      ctx.closePath(); ctx.fill()
    }
    else if (command.kind === 'text') { ctx.fillStyle = command.color; ctx.font = `500 ${command.size}px Arial, sans-serif`; ctx.textAlign = command.align ?? 'left'; ctx.fillText(command.text, command.x, command.y) }
    else {
      ctx.strokeStyle = command.color; ctx.lineWidth = command.width; ctx.setLineDash(command.dash ?? []); ctx.beginPath()
      command.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
    }
  }
}

// Exporters render this same recipe to PNG, avoiding a second, drifting layout.
export function scopeArtworkSvg(artwork: ScopeArtwork): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artwork.width}" height="${artwork.height}" viewBox="0 0 ${artwork.width} ${artwork.height}">${artwork.commands.map((c) => c.kind === 'rect'
    ? `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"${c.r ? ` rx="${c.r}" ry="${c.r}"` : ''} fill="${c.color}"/>`
    : c.kind === 'polygon' ? `<polygon points="${c.points.map((p) => p.join(',')).join(' ')}" fill="${c.color}"/>`
    : c.kind === 'text' ? `<text x="${c.x}" y="${c.y}" fill="${c.color}" font-family="Arial, sans-serif" font-size="${c.size}" font-weight="500" text-anchor="${c.align === 'center' ? 'middle' : c.align === 'right' ? 'end' : 'start'}" dominant-baseline="central">${escape(c.text)}</text>`
      : `<polyline points="${c.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${c.color}" stroke-width="${c.width}"${c.dash ? ` stroke-dasharray="${c.dash.join(' ')}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`).join('')}</svg>`
}
