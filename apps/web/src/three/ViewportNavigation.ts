import { PerspectiveCamera, Vector3 } from 'three'
import { solveOverview, type FramingPose, type FramingSnapshot, type NdcRect } from './CameraFraming'
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from '../config/workbenchViewport'

const DEFAULT_DISTANCE = Math.hypot(11, 10)
const MIN_CAMERA_DISTANCE = 1e-4
export interface NavigationSnapshot {
  zoom: number
  minZoom: number
  maxZoom: number
  referenceDistance: number
  overviewTarget: [number, number, number]
  boundsRevision: number
}

/** Projection bounds can change without rebasing magnification. Only explicit
 * Fit/Home establishes a reference. Ordinary dolly preserves its focal point
 * and reference, and limits physical distance before updating controls. */
export function createViewportNavigation(camera: PerspectiveCamera, target: () => Vector3, bounds: () => FramingSnapshot) {
  let rect: NdcRect = {left:-1,right:1,bottom:-1,top:1}, key = ''
  let overview: FramingPose | null = null, revision = 0, collisionDistance = 0, referenceDistance = DEFAULT_DISTANCE
  const fallback = (): FramingPose => ({target:new Vector3(),position:new Vector3(0,11,10),distance:DEFAULT_DISTANCE,safeDepth:MIN_CAMERA_DISTANCE,points:[],rect})
  const calibrate = () => {
    const snapshot = bounds(), view = camera.view
    // Ignore roundoff introduced by OrbitControls.lookAt during a pure pan.
    const orientation = camera.quaternion.toArray().map(value => Math.round(value*1e10)/1e10)
    const next = JSON.stringify([snapshot.revision,...orientation,camera.fov,camera.aspect,camera.zoom,camera.filmGauge,camera.filmOffset,view,rect])
    if (next !== key) {
      overview = solveOverview(camera,snapshot,rect) ?? fallback()
      revision=snapshot.revision;collisionDistance=0;key=next
    }
    return overview ?? fallback()
  }
  const minimumDistance = (includeCollision=true) => {
    calibrate()
    return Math.max(MIN_CAMERA_DISTANCE,referenceDistance*ZOOM_DEFAULT/ZOOM_MAX,includeCollision?collisionDistance:0)
  }
  const maximumZoom = () => Math.max(ZOOM_MIN,Math.min(ZOOM_MAX,referenceDistance*ZOOM_DEFAULT/minimumDistance()))
  const read = (): NavigationSnapshot => {
    const pose=calibrate(),distance=camera.position.distanceTo(target())
    return {zoom:distance>0?referenceDistance*ZOOM_DEFAULT/distance:ZOOM_DEFAULT,minZoom:ZOOM_MIN,maxZoom:maximumZoom(),referenceDistance,overviewTarget:pose.target.toArray(),boundsRevision:revision}
  }
  return {
    overview:calibrate, snapshot:read, minimumDistance,
    commitOverview(pose:Pick<FramingPose,'distance'>) {
      if(Number.isFinite(pose.distance)&&pose.distance>0){referenceDistance=pose.distance;collisionDistance=0}
    },
    setRect(next:NdcRect) {
      if([next.left,next.right,next.bottom,next.top].every(Number.isFinite)&&next.right>next.left&&next.top>next.bottom)rect={...next}
    },
    resetCollision(){collisionDistance=0},
    limitAtDistance(distance:number){if(Number.isFinite(distance)&&distance>0)collisionDistance=Math.max(collisionDistance,distance)},
    zoomPose(requested:number):{target:Vector3;position:Vector3;distance:number}|null {
      if(!Number.isFinite(requested))return null
      const state=read(),percent=Math.max(ZOOM_MIN,Math.min(state.maxZoom,requested)),origin=target().clone()
      const direction=camera.position.clone().sub(origin).normalize()
      if(!direction.lengthSq())direction.set(0,0,1).applyQuaternion(camera.quaternion)
      const distance=Math.max(minimumDistance(),referenceDistance*ZOOM_DEFAULT/percent)
      return{target:origin,position:origin.clone().addScaledVector(direction,distance),distance}
    },
  }
}
