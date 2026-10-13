<script setup lang="ts">
import { computed, ref } from 'vue'
import { Quaternion, Matrix4, Vector3 } from 'three'
import type { OrientationAxis } from '../../three/SceneManager'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { buildCubeGeometry, projectCube, projectCompass } from './viewCubeMath'

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

const regions = buildCubeGeometry(24, 6)

const projectedRegions = computed(() => {
  return projectCube(regions, currentQuaternion.value, 68, 68)
})

const compass = computed(() => {
  return projectCompass(currentQuaternion.value, 46, -26, 68, 68)
})

const currentViewLabel = computed(() => {
  const dir = new Vector3(0, 0, 1).applyQuaternion(currentQuaternion.value)
  if (dir.y > 0.95) return 'TOP'
  if (dir.y < -0.95) return 'BOTTOM'
  if (dir.z > 0.95) return 'FRONT'
  if (dir.z < -0.95) return 'BACK'
  if (dir.x > 0.95) return 'RIGHT'
  if (dir.x < -0.95) return 'LEFT'
  return 'WCS'
})

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.stopPropagation()
  isPointerDown = true
  isDragging = false
  startX = e.clientX
  startY = e.clientY
  lastX = e.clientX
  lastY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isPointerDown) return
  e.stopPropagation()
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  const dist = Math.hypot(e.clientX - startX, e.clientY - startY)
  if (dist > 3) {
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
}

function onRegionClick(id: string) {
  if (isDragging) return
  emit('setView', id)
}

function onCompassClick(label: string) {
  if (isDragging) return
  if (label === 'N') emit('setView', 'BACK')
  else if (label === 'S') emit('setView', 'FRONT')
  else if (label === 'E') emit('setView', 'RIGHT')
  else if (label === 'W') emit('setView', 'LEFT')
}
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
      role="application"
      aria-label="Interactive 3D ViewCube"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <svg
        viewBox="0 0 136 136"
        class="view-cube-svg"
        role="img"
        aria-label="CAD ViewCube orientation controls"
      >
        <defs>
          <filter id="cube-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#00e676" flood-opacity="0.6" />
          </filter>
          <linearGradient id="face-grad-front" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#24384d" />
            <stop offset="100%" stop-color="#182736" />
          </linearGradient>
          <linearGradient id="face-grad-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2c455e" />
            <stop offset="100%" stop-color="#1c2d3d" />
          </linearGradient>
        </defs>

        <!-- Compass Ring -->
        <g class="compass-group">
          <path :d="compass.path" class="compass-ring" />
          <g
            v-for="marker in compass.markers"
            :key="marker.label"
            class="compass-marker"
            :class="{ 'marker-active': hoveredRegion === marker.label }"
            :data-compass="marker.label"
            role="button"
            :aria-label="`Orient to ${marker.label}`"
            tabindex="0"
            @pointerenter="hoveredRegion = marker.label"
            @pointerleave="hoveredRegion === marker.label ? (hoveredRegion = null) : undefined"
            @click.stop="onCompassClick(marker.label)"
            @keydown.enter.stop="onCompassClick(marker.label)"
            @keydown.space.stop="onCompassClick(marker.label)"
          >
            <circle :cx="marker.x" :cy="marker.y" r="8" class="compass-marker-hit" />
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
            :class="['cube-region', `region-${region.type}`, { hovered: hoveredRegion === region.id }]"
            :data-region-id="region.id"
            :data-face="region.type === 'face' ? region.id.toLowerCase() : undefined"
            :data-edge="region.type === 'edge' ? region.id.toLowerCase() : undefined"
            :data-corner="region.type === 'corner' ? region.id.toLowerCase() : undefined"
            role="button"
            :aria-label="`View ${region.id}`"
            tabindex="0"
            @pointerenter="hoveredRegion = region.id"
            @pointerleave="hoveredRegion === region.id ? (hoveredRegion = null) : undefined"
            @click.stop="onRegionClick(region.id)"
            @keydown.enter.stop="onRegionClick(region.id)"
            @keydown.space.stop="onRegionClick(region.id)"
          >
            <polygon :points="region.points" class="region-polygon" />
            <text
              v-if="region.label && region.normalDepth > 0.18"
              :x="region.centerX"
              :y="region.centerY"
              text-anchor="middle"
              dominant-baseline="central"
              class="cube-label"
            >
              {{ region.label }}
            </text>
          </g>
        </g>

        <!-- Technical Coordinate Badge -->
        <g class="cube-badge" role="presentation" aria-hidden="true">
          <rect x="47" y="119" width="42" height="14" rx="2" class="badge-bg" />
          <text x="68" y="126" text-anchor="middle" dominant-baseline="central" class="badge-text">
            {{ currentViewLabel }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>
