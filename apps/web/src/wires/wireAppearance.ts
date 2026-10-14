import type { WireVisual } from '../types/circuit'

// Rendering defaults do not rewrite saved v1 visual metadata.
export const MIN_WIRE_DIAMETER = .052
export const WIRE_RADIAL_SEGMENTS = 10
export const WIRE_CORNER_RADIUS = .065
export const renderWireDiameter = (visual: Pick<WireVisual, 'thickness'>) => Math.max(MIN_WIRE_DIAMETER, visual.thickness)
