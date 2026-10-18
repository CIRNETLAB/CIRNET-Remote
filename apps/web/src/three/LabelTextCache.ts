import { CanvasTexture, SRGBColorSpace } from 'three'
import { normalizeLabelProperties, type LabelPropertiesV1 } from '../data/labelProperties'

export interface LabelTextLayout { widthMm: number; heightMm: number; fontSizeMm: number; lineHeightMm: number; lines: string[] }
export interface LabelBitmapLease { texture: CanvasTexture | null; layout: LabelTextLayout; release(): void }
interface CacheOptions { createCanvas?: () => HTMLCanvasElement | null; maxEntries?: number }
interface Entry { texture: CanvasTexture; layout: LabelTextLayout; references: number }
const font = (pixels: number) => `700 ${pixels}px "Segoe UI", Arial, sans-serif`
const browserCanvas = () => typeof document === 'undefined' ? null : document.createElement('canvas')

/** A requested 2–6 mm font auto-fits without truncating the stored plain text. */
function layout(properties: LabelPropertiesV1, context: CanvasRenderingContext2D | null): LabelTextLayout {
  const lines = properties.text.split('\n'), requested = properties.fontSizeMm, padding = properties.paddingMm
  if (context) context.font = font(128)
  const widths = lines.map(line => context ? context.measureText(line).width / 128 * requested : Array.from(line).length * requested * .6)
  const measured = Math.max(requested, ...widths), factor = Math.min(1, (60 - 2 * padding) / measured, (25 - 2 * padding) / (lines.length * requested * 1.2))
  const fontSizeMm = requested * factor, lineHeightMm = fontSizeMm * 1.2
  return { widthMm: Math.min(60, measured * factor + 2 * padding), heightMm: Math.min(25, lines.length * lineHeightMm + 2 * padding), fontSizeMm, lineHeightMm, lines }
}

/** Only live leases are retained. The cache has a fixed entry limit; excess
 * unique live notes own uncached textures and release them normally. */
export function createLabelTextureCache({ createCanvas = browserCanvas, maxEntries = 64 }: CacheOptions = {}) {
  const entries = new Map<string, Entry>()
  return {
    get size() { return entries.size },
    acquire(values: Record<string, unknown>, fontEpoch = 0): LabelBitmapLease {
      const properties = normalizeLabelProperties(values), key = JSON.stringify([fontEpoch, properties.text, properties.fontSizeMm, properties.textColor, properties.paddingMm])
      let entry = entries.get(key)
      if (!entry) {
        const canvas = createCanvas(), context = canvas?.getContext('2d') ?? null, measured = layout(properties, context)
        if (!canvas || !context) return { texture: null, layout: measured, release() {} }
        const density = Math.min(48, 1024 / Math.max(measured.widthMm, measured.heightMm))
        canvas.width = Math.min(1024, Math.max(1, Math.ceil(measured.widthMm * density)))
        canvas.height = Math.min(1024, Math.max(1, Math.ceil(measured.heightMm * density)))
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.font = font(measured.fontSizeMm * density); context.fillStyle = properties.textColor
        context.textAlign = 'left'; context.textBaseline = 'top'
        measured.lines.forEach((line, i) => context.fillText(line, properties.paddingMm * density, (properties.paddingMm + i * measured.lineHeightMm) * density, canvas.width - 2 * properties.paddingMm * density))
        const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8
        entry = { texture, layout: measured, references: 0 }
        if (entries.size < maxEntries) entries.set(key, entry)
      }
      entry.references++
      const owned = entry; let released = false
      return { texture: owned.texture, layout: owned.layout, release() {
        if (released) return
        released = true
        if (--owned.references === 0) { if (entries.get(key) === owned) entries.delete(key); owned.texture.dispose() }
      } }
    },
  }
}

export const labelTextureCache = createLabelTextureCache()
