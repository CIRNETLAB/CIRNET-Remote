import type { WireVisual } from '../types/circuit'

// Rendering defaults do not rewrite saved v1 visual metadata.
export const MIN_WIRE_DIAMETER = .052
export const WIRE_RADIAL_SEGMENTS = 16
export const WIRE_CORNER_RADIUS = 2 * .13 / 2.54
export const WIRE_MIN_BEND_RADIUS = 1 * .13 / 2.54
export const NEW_WIRE_DIAMETER = 1.5 * .13 / 2.54
export const NEW_WIRE_CORE_DIAMETER = .62 * .13 / 2.54
export const COPPER_COLOR = '#d9dfe5' // Silver-plated copper; highlights come from scene lighting.
export const COPPER_RADIUS_RATIO = .62 / (1.5 * 2)
export const CONTACT_COPPER_LENGTH = .042
export const FREE_COPPER_LENGTH = .065
export const COPPER_EMBED_LENGTH = .006 // Hidden overlap, independent of insertion.
export const WIRE_SURFACE_CLEARANCE = .004
export const PARALLEL_LANE_GAP = .05 // Ratio of rendered diameter, not contact pitch.
export const CROSSING_CLEARANCE = .05 // Ratio of the larger rendered diameter.
export const TERMINAL_CLEARANCE = .4 // Collar height above deck, as a diameter ratio.
export const renderWireDiameter = (visual: Pick<WireVisual, 'thickness'>) => Math.max(MIN_WIRE_DIAMETER, visual.thickness)
