import type { WireVisual } from '../types/circuit'

// Rendering defaults do not rewrite saved v1 visual metadata.
export const MIN_WIRE_DIAMETER = .052
export const WIRE_RADIAL_SEGMENTS = 16
export const WIRE_CORNER_RADIUS = .065
export const COPPER_COLOR = '#c4cbd2' // Tinned copper, without emissive brightness.
export const COPPER_RADIUS_RATIO = .22
export const CONTACT_COPPER_LENGTH = .042
export const FREE_COPPER_LENGTH = .065
export const COPPER_EMBED_LENGTH = .006 // Hidden overlap, independent of insertion.
export const WIRE_LAYER_GAP = .012
export const renderWireDiameter = (visual: Pick<WireVisual, 'thickness'>) => Math.max(MIN_WIRE_DIAMETER, visual.thickness)
