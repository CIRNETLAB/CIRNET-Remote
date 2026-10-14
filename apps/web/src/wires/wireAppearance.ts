import type { WireVisual } from '../types/circuit'

// Rendering defaults do not rewrite saved v1 visual metadata.
export const MIN_WIRE_DIAMETER = .052
export const WIRE_RADIAL_SEGMENTS = 10
export const WIRE_CORNER_RADIUS = .065
export const COPPER_COLOR = '#bb824b'
export const COPPER_RADIUS_RATIO = .22
export const CONTACT_COPPER_LENGTH = .033
export const FREE_COPPER_LENGTH = .04
export const COPPER_EMBED_LENGTH = .003
export const renderWireDiameter = (visual: Pick<WireVisual, 'thickness'>) => Math.max(MIN_WIRE_DIAMETER, visual.thickness)
