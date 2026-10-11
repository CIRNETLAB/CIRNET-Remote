<script setup lang="ts">
defineProps<{ label: string; caption: string; value: string; compact?: boolean }>()
</script>
<template>
  <div class="instrument-dial" :class="{ compact }">
    <span class="dial-caption">{{ caption }}</span>
    <button type="button" disabled class="dial-knob" :aria-label="label" title="Control unavailable · acquisition is not connected"><span aria-hidden="true" /></button>
    <span class="dial-value">{{ value }}</span>
  </div>
</template>
<style scoped>
.instrument-dial { display: grid; justify-items: center; gap: 4px; min-width: 0; color: #c2cfd5; }
.dial-caption { font-size: 9px; line-height: 12px; white-space: nowrap; }
.dial-knob { position: relative; display: grid; place-items: center; width: 46px; height: 46px; min-height: 0; padding: 4px; border: 1px solid var(--dial-accent, #91a5b0); border-radius: 50%; background: repeating-conic-gradient(#72838d 0deg 2deg, #182126 2deg 18deg); box-shadow: 0 2px 3px #0008; opacity: 1; cursor: not-allowed; }
.dial-knob > span { width: 100%; height: 100%; border: 2px solid #0b1218; border-radius: 50%; background: radial-gradient(circle at 35% 25%, #47535b, #202a31 75%); }
.dial-knob::after { content: ''; position: absolute; top: 8px; left: calc(50% - 1px); width: 2px; height: 9px; border-radius: 1px; background: #dae4e9; }
.dial-value { font: 10px/12px Consolas, monospace; color: var(--dial-accent, #a7bdc9); white-space: nowrap; }
.compact { gap: 3px; }
.compact .dial-knob { width: 28px; height: 28px; padding: 3px; }
.compact .dial-knob::after { top: 6px; height: 5px; }
</style>
