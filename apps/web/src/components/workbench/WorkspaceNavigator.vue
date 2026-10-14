<script setup lang="ts">
import { computed, ref } from 'vue'
import { Quaternion, Matrix4, Vector3 } from 'three'
import type { OrientationAxis } from '../../three/SceneManager'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { buildCubeGeometry, projectCube, projectCompass, ORIENTATION_DIRECTIONS } from './viewCubeMath'

const props = defineProps<{
  axes?: OrientationAxis[]
  cameraQuaternion?: [number, number, number, number]
}>()

const emit = defineEmits<{
  orbit: [degrees: number, pitch?: number]
  pan: [horizontal: number, forward: number]
  setView: [direction: string]
  resetView: []
}>()

const hoveredRegion = ref<string | null>(null)
let isPointerDown = false
let isDragging = false
let suppressClick = false
let startX = 0
let startY = 0
let lastX = 0
let lastY = 0

const currentQuaternion = computed(() => {
  if (props.cameraQuaternion) {
    return new Quaternion(...props.cameraQuaternion)
  }
  if (props.axes && props.axes.length >= 3) {
    const x = props.axes.find((a) => a.label === 'X')
    const y = props.axes.find((a) => a.label === 'Y')
    const z = props.axes.find((a) => a.label === 'Z')
    if (x && y && z) {
      const m = new Matrix4().set(
        x.x, -x.y, x.depth, 0,
        y.x, -y.y, y.depth, 0,
        z.x, -z.y, z.depth, 0,
        0, 0, 0, 1
      ).transpose()
      return new Quaternion().setFromRotationMatrix(m).invert()
    }
  }
  return new Quaternion()
})

const regions = buildCubeGeometry(27, 4)

const projectedRegions = computed(() => {
  return projectCube(regions, currentQuaternion.value, 55, 68)
})

const compass = computed(() => projectCompass(currentQuaternion.value))
const compassViews = { W: 'LEFT', N: 'BACK', E: 'RIGHT', S: 'FRONT' } as const

const activeOrientation = computed(() => {
  const dir = new Vector3(0, 0, 1).applyQuaternion(currentQuaternion.value)
  return Object.entries(ORIENTATION_DIRECTIONS).find(([, direction]) => dir.dot(direction) > 0.9995)?.[0] ?? null
})

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.stopPropagation()
  isPointerDown = true
  isDragging = false
  suppressClick = false
  startX = e.clientX
  startY = e.clientY
  lastX = e.clientX
  lastY = e.clientY
}

function onPointerMove(e: PointerEvent) {
  if (!isPointerDown) return
  e.stopPropagation()
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  const dist = Math.hypot(e.clientX - startX, e.clientY - startY)
  if (dist > 3) {
    if (!isDragging) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    isDragging = true
    const yaw = -dx * 0.5
    const pitch = dy * 0.5
    emit('orbit', yaw, pitch)
    lastX = e.clientX
    lastY = e.clientY
  }
}

function onPointerUp(e: PointerEvent) {
  if (!isPointerDown) return
  e.stopPropagation()
  isPointerDown = false
  suppressClick = isDragging
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  } catch {}
  if (isDragging) {
    isDragging = false
  }
}

function onPointerCancel() {
  isPointerDown = false
  isDragging = false
  suppressClick = false
}

function onPointerLeave() { if (isPointerDown && !isDragging) onPointerCancel() }

function onWidgetClick(e: MouseEvent) {
  if (!suppressClick) return
  e.stopPropagation(); e.preventDefault(); suppressClick = false
}

function onRegionClick(id: string) {
  if (isDragging || !isOrientation(id)) return
  emit('setView', id)
}

function isOrientation(id: string) { return Object.hasOwn(ORIENTATION_DIRECTIONS, id) }

</script>

<template>
  <div class="workspace-navigator" role="region" aria-label="Workspace orientation and navigation">
    <button
      class="view-cube-home"
      data-action="home"
      aria-label="Home view"
      title="Reset to default orientation"
      @click.stop="emit('resetView')"
    >
      <WorkbenchIcon name="home" />
    </button>
    <div
      class="view-cube-widget"
      role="group"
      aria-label="Interactive 3D ViewCube"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
      @click.capture="onWidgetClick"
    >
      <svg
        viewBox="0 0 110 120"
        class="view-cube-svg"
        role="group"
        aria-label="CAD ViewCube orientation controls"
      >
        <defs>
          <linearGradient id="view-cube-front" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stop-color="#344a5d" />
            <stop offset="100%" stop-color="#223342" />
          </linearGradient>
          <linearGradient id="view-cube-top" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#617d90" />
            <stop offset="100%" stop-color="#40596c" />
          </linearGradient>
          <linearGradient id="view-cube-side" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3e566a" />
            <stop offset="100%" stop-color="#293d4e" />
          </linearGradient>
        </defs>

        <g class="compass-group">
          <path :d="compass.path" class="compass-ring" vector-effect="non-scaling-stroke" />
          <g
            v-for="marker in compass.markers"
            :key="marker.label"
            class="compass-marker"
            :data-compass="marker.label"
            role="button"
            :aria-label="`Orient to ${marker.label}`"
            tabindex="0"
            @click.stop="onRegionClick(compassViews[marker.label])"
            @keydown.enter.stop="onRegionClick(compassViews[marker.label])"
            @keydown.space.stop="onRegionClick(compassViews[marker.label])"
          >
            <circle :cx="marker.x" :cy="marker.y" r="8" class="compass-hit" />
            <text :x="marker.x" :y="marker.y" text-anchor="middle" dominant-baseline="central" class="compass-text">
              {{ marker.label }}
            </text>
          </g>
        </g>

        <!-- 3D Cube Faces, Edges, Corners -->
        <g class="cube-mesh">
          <g
            v-for="region in projectedRegions"
            :key="region.id"
            :class="['cube-region', `region-${region.type}`, { hovered: hoveredRegion === region.id, selected: activeOrientation === region.id, 'face-top': region.id === 'TOP', 'face-front': region.id === 'FRONT' || region.id === 'BACK' }]"
            :data-region-id="region.id"
            :data-face="region.type === 'face' ? region.id.toLowerCase() : undefined"
            :data-edge="region.type === 'edge' ? region.id.toLowerCase() : undefined"
            :data-corner="region.type === 'corner' ? region.id.toLowerCase() : undefined"
            :role="isOrientation(region.id) ? 'button' : undefined"
            :aria-pressed="isOrientation(region.id) ? activeOrientation === region.id : undefined"
            :aria-label="isOrientation(region.id) ? `View ${region.id}` : undefined"
            :tabindex="isOrientation(region.id) ? 0 : undefined"
            @pointerenter="isOrientation(region.id) && (hoveredRegion = region.id)"
            @pointerleave="hoveredRegion === region.id ? (hoveredRegion = null) : undefined"
            @click.stop="onRegionClick(region.id)"
            @keydown.enter.stop="onRegionClick(region.id)"
            @keydown.space.stop="onRegionClick(region.id)"
          >
            <polygon :points="region.points" class="region-polygon" vector-effect="non-scaling-stroke" />
            <text
              v-if="region.label && region.normalDepth > 0.25"
              :transform="region.labelTransform"
              text-anchor="middle"
              dominant-baseline="central"
              class="cube-label"
            >
              {{ region.label }}
            </text>
          </g>
        </g>

      </svg>
    </div>
  </div>
</template>
