export const ZOOM_MIN = 50
export const ZOOM_MAX = 1000
export const ZOOM_DEFAULT = 100
export const ZOOM_STEP = 10
export const CAMERA_NEAR = .005
export const CAMERA_MIN_NEAR = .00001
export const CAMERA_FAR = 150
export const MIN_ZOOM_REFERENCE_DISTANCE = CAMERA_MIN_NEAR * 4 * ZOOM_MAX / ZOOM_DEFAULT
export const cameraNearForDistance = (distance: number) => Math.min(CAMERA_NEAR, Math.max(CAMERA_MIN_NEAR, distance * .01))
export const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
