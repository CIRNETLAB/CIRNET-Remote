<script setup lang="ts">
import type { WireRouteMode } from '../../types/circuit'
import { JUMPER_COLORS } from '../../wires/wireVisual'
import WorkbenchIcon from './WorkbenchIcon.vue'

withDefaults(defineProps<{
  color?: string
  routeMode?: WireRouteMode
  canAdd?: boolean
  canRemove?: boolean
  hint?: string
  layer?: number
  canStack?: boolean
  canCycleStack?: boolean
  canLowerStack?: boolean
  canRaiseStack?: boolean
}>(), {
  color: '#d8493f',
  routeMode: 'FREE',
  canAdd: false,
  canRemove: false,
  hint: '',
  layer: 0,
  canStack: false,
  canCycleStack: false,
  canLowerStack: false,
  canRaiseStack: true,
})

const descriptions: Record<WireRouteMode, string> = {
  FREE: 'Manual path: straight or diagonal runs through your anchors.',
  ORTHOGONAL: 'Right angles: X/Z runs; plugged endpoints stay fixed when editing.',
  AUTO: 'Convenient route: board jumpers use automatic right angles.',
}

const emit = defineEmits<{
  color: [value: string]
  mode: [value: WireRouteMode]
  add: []
  remove: []
  routeKey: [event: KeyboardEvent]
  stack: [action: 'up' | 'down' | 'top']
  cycleStack: []
}>()

function routeKey(event: KeyboardEvent) {
  if (event.key === 'Escape' || (['Backspace', 'Delete'].includes(event.key) && (event.target as HTMLElement)?.tagName !== 'SELECT' && (event.target as HTMLElement)?.tagName !== 'INPUT' && (event.target as HTMLElement)?.tagName !== 'TEXTAREA')) {
    emit('routeKey', event)
  }
}
</script>

<template>
  <section class="wire-options contextual-panel" aria-label="Jumper wire options" @pointerdown.stop @keydown.stop="routeKey">
    <div class="wire-options-heading">WIRE <span>JUMPER</span></div>
    <div class="wire-palette" role="group" aria-label="Wire colors">
      <button
        v-for="swatch in JUMPER_COLORS"
        :key="swatch.name"
        type="button"
        :aria-label="swatch.name + ' wire'"
        :title="swatch.name"
        :aria-pressed="color === swatch.value"
        :style="{ '--swatch': swatch.value }"
        @click="emit('color', swatch.value)"
      />
    </div>

    <div class="wire-instructions">
      <p id="wire-route-description" class="wire-instruction-line">{{ descriptions[routeMode] || descriptions.FREE }}</p>
      <p class="wire-instruction-line">Parallel: lane order · Crossing: over/under</p>
      <p class="wire-instruction-line">{{ hint || 'Drag a user bend or segment · Double-click: add an anchor · Alt: no snap' }}</p>
    </div>

    <hr class="wire-divider" />

    <div class="wire-tool-section">
      <div class="wire-tool-heading">
        <strong>Tool</strong>
        <span class="wire-priority" role="status">Priority {{ layer }}</span>
      </div>

      <div class="wire-route-buttons" role="group" aria-label="Wire route mode">
        <button
          type="button"
          class="wire-mode-btn"
          :class="{ active: routeMode === 'FREE' }"
          :aria-pressed="routeMode === 'FREE'"
          aria-label="Manual route mode"
          title="Manual: straight or diagonal runs through your anchors"
          @click="emit('mode', 'FREE')"
        >
          Manual
        </button>
        <button
          type="button"
          class="wire-mode-btn"
          :class="{ active: routeMode === 'ORTHOGONAL' }"
          :aria-pressed="routeMode === 'ORTHOGONAL'"
          aria-label="Orthogonal 90° route mode"
          title="Orthogonal 90°: right angles along X/Z axes"
          @click="emit('mode', 'ORTHOGONAL')"
        >
          Orthogonal 90°
        </button>
      </div>

      <div class="wire-action-buttons" role="group" aria-label="Wire edit tools">
        <button
          type="button"
          class="wire-icon-btn"
          aria-label="Add bend to selected segment"
          title="Add bend"
          :disabled="!canAdd"
          @click="emit('add')"
        >
          <WorkbenchIcon name="bend-add" />
        </button>
        <button
          type="button"
          class="wire-icon-btn"
          aria-label="Remove selected bend"
          title="Remove bend"
          :disabled="!canRemove"
          @click="emit('remove')"
        >
          <WorkbenchIcon name="bend-remove" />
        </button>
        <button
          type="button"
          class="wire-icon-btn"
          aria-label="Lower wire priority"
          title="Down"
          :disabled="!canStack || !canLowerStack"
          @click="emit('stack', 'down')"
        >
          <WorkbenchIcon name="down" />
        </button>
        <button
          type="button"
          class="wire-icon-btn"
          aria-label="Raise wire priority"
          title="Up"
          :disabled="!canStack || !canRaiseStack"
          @click="emit('stack', 'up')"
        >
          <WorkbenchIcon name="up" />
        </button>
        <button
          type="button"
          class="wire-icon-btn"
          aria-label="Move wire above overlapping wires"
          title="Top"
          :disabled="!canStack || !canRaiseStack"
          @click="emit('stack', 'top')"
        >
          <WorkbenchIcon name="top" />
        </button>
      </div>

      <button
        v-if="canCycleStack"
        type="button"
        class="wire-stack-cycle"
        aria-label="Select next overlapping wire"
        title="Select next overlapping wire"
        @click="emit('cycleStack')"
      >
        Select next overlapping wire
      </button>
    </div>
  </section>
</template>

<style scoped>
.wire-options {
  padding: 14px 16px;
  border: 1px solid #36495a;
  border-radius: 6px;
  background: #101923;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: #d7dce2;
  z-index: 4;
  font-size: 11px;
  pointer-events: auto;
  max-height: calc(100% - var(--drawer-top) - 142px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: #3b5066 #101923;
}

.wire-options-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1.2px;
  color: #f0b13d;
  margin-bottom: 12px;
}

.wire-options-heading span {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1px;
  color: #8da2b5;
}

.wire-palette {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px 6px;
  justify-items: center;
  margin: 0 0 16px;
}

.wire-palette button {
  width: 32px;
  height: 32px;
  background: var(--swatch);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.15), 0 2px 4px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s ease, outline 0.1s ease;
}

.wire-palette button:hover {
  transform: scale(1.06);
  border-color: #f0b13d;
}

.wire-palette button[aria-pressed="true"] {
  outline: 2px solid #f0b13d;
  outline-offset: 2px;
  border-color: #f0b13d;
}

.wire-instructions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.wire-instruction-line {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #8ea1b4;
}

.wire-divider {
  border: none;
  border-top: 1px solid #233242;
  margin: 0 0 12px;
}

.wire-tool-section {
  display: flex;
  flex-direction: column;
}

.wire-tool-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.wire-tool-heading strong {
  font-size: 13px;
  font-weight: 600;
  color: #f0b13d;
}

.wire-priority {
  font-size: 11.5px;
  color: #8ea1b4;
}

.wire-route-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.wire-mode-btn {
  flex: 1;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #14202c;
  border: 1px solid #2d3e4f;
  border-radius: 5px;
  color: #cdd5dd;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wire-mode-btn:hover:not(.active) {
  background: #1a2a3a;
  border-color: #485f75;
  color: #ffffff;
}

.wire-mode-btn.active {
  border-color: #f0b13d;
  color: #ffffff;
  background: #182837;
  box-shadow: 0 0 0 1px #f0b13d44;
}

.wire-action-buttons {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 2px;
}

.wire-icon-btn {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #14202c;
  border: 1px solid #2d3e4f;
  border-radius: 5px;
  color: #d7dce2;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.wire-icon-btn:hover:not(:disabled) {
  background: #1c2c3c;
  border-color: #4a6278;
  color: #ffffff;
}

.wire-icon-btn:active:not(:disabled) {
  background: #101a24;
}

.wire-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: #202b36;
  color: #526373;
}

.wire-icon-btn :deep(.workbench-icon) {
  width: 18px;
  height: 18px;
}

.wire-options button:focus-visible {
  outline: 2px solid #f0b13d;
  outline-offset: 2px;
}

.wire-stack-cycle {
  margin-top: 8px;
  width: 100%;
  padding: 6px 8px;
  font-size: 10.5px;
  background: #14202c;
  border: 1px solid #2d3e4f;
  border-radius: 4px;
  color: #8ea1b4;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.wire-stack-cycle:hover {
  background: #1c2c3c;
  color: #d7dce2;
  border-color: #4a6278;
}
</style>
