import type { PartDefinition } from '../../data/partCatalog'

export type ObservedPinLevels = Readonly<Record<string, unknown>>

/** Maps observed terminal levels through the existing catalog pin names. This
 * is presentation only: it never enables the unsupported per-diode simulator
 * or fabricates multiplex evidence from a requested digit value. */
export function displaySegmentsFromPinEvidence(part: PartDefinition, moduleId: string, levels: ObservedPinLevels, status: string | undefined): string[] {
  if (part.package.family !== 'seven-segment' || !['SUPPORTED', 'POWERED', 'ON'].includes(status ?? '')) return []
  const digits = part.package.digits ?? 1, segments: string[] = []
  for (let digit = 0; digit < digits; digit++) {
    const numberedCommon = part.package.pins.filter(pin => /^(CC|CA)\d+$/.test(pin.name) && Number(pin.name.slice(2)) === digit + 1)
    const common = numberedCommon.length ? numberedCommon : digits === 1 ? part.package.pins.filter(pin => /^(CC|CA)$/.test(pin.name)) : []
    if (!common.length) continue
    const cathode = common.every(pin => pin.name.startsWith('CC')), commonLevel = cathode ? 0 : 1, segmentLevel = cathode ? 1 : 0
    // Multiple package common terminals are one declared electrode. Missing or
    // conflicting observations withhold illumination rather than guessing.
    if (!common.every(pin => levels[`${moduleId}.${pin.id}`] === commonLevel)) continue
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'DP']) {
      const pin = part.package.pins.find(pin => pin.name === `${name}${digit + 1}`) ?? part.package.pins.find(pin => pin.name === name)
      if (pin && levels[`${moduleId}.${pin.id}`] === segmentLevel) segments.push(`${digit}.${name}`)
    }
  }
  return segments
}
