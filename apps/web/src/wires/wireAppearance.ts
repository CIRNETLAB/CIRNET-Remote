import type { WireVisual } from '../types/circuit'

// Rendering defaults do not rewrite saved v1 visual metadata.
export const MIN_WIRE_DIAMETER = .052
export const WIRE_RADIAL_SEGMENTS = 16
export const WIRE_CORNER_RADIUS = .065
export const COPPER_COLOR = '#d9dfe5' // Silver-plated copper; highlights come from scene lighting.
export const COPPER_RADIUS_RATIO = .22
export const CONTACT_COPPER_LENGTH = .042
export const FREE_COPPER_LENGTH = .065
export const COPPER_EMBED_LENGTH = .006 // Hidden overlap, independent of insertion.
export const WIRE_SURFACE_CLEARANCE = .004
export const PARALLEL_LANE_GAP = .05 // Ratio of rendered diameter, not contact pitch.
export const CROSSING_CLEARANCE = .05 // Ratio of the larger rendered diameter.
export const TERMINAL_CLEARANCE = .4 // Collar height above deck, as a diameter ratio.
export const renderWireDiameter = (visual: Pick<WireVisual, 'thickness'>) => Math.max(MIN_WIRE_DIAMETER, visual.thickness)
