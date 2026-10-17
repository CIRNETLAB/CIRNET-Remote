<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import type { CircuitModule } from '../../types/circuit'
import { packageThumbnailCacheKey, packageThumbnails, type PackageThumbnailCache, type PackageThumbnailLease, type PackageThumbnailPriority } from '../../three/PackageThumbnails'
import { observeThumbnailVisibility } from '../../composables/thumbnailVisibility'
import WorkbenchIcon from './WorkbenchIcon.vue'

const props = withDefaults(defineProps<{ type: string; properties?: Record<string, unknown>; module?: CircuitModule; modules?: readonly CircuitModule[]; alt?: string; lazy?: boolean; visibilityRoot?: Element; priority?: PackageThumbnailPriority; fallbackIcon?: string }>(), { alt: '', lazy: false, priority: 'high' })
const support = computed(() => props.module?.mount ? props.modules?.find(item => item.id === props.module!.mount!.boardId) : undefined)
const thumbnails = inject<PackageThumbnailCache>(packageThumbnailCacheKey, packageThumbnails)
const source = ref<string | null>(null), target = ref<HTMLElement>(), fallbackFailed = ref(false)
let lease: PackageThumbnailLease | null = null, generation = 0
let demand: PackageThumbnailPriority | null = props.lazy ? null : props.priority
function release() { generation++; lease?.release(); lease = null }
function acquire() {
  if (!demand || lease) return
  const current = ++generation
  lease = thumbnails.acquire(props.type, props.properties ?? props.module?.properties, { priority: demand, module: props.module, modules: support.value ? [support.value] : undefined })
  void lease.ready.then(image => { if (current === generation) source.value = image }, () => { if (current === generation) source.value = null })
}
function setDemand(priority: PackageThumbnailPriority | null) {
  if (demand === priority) return
  demand = priority
  if (!priority) release()
  else if (lease) lease.setPriority?.(priority)
  else acquire()
}
watch(() => [props.type, props.properties, props.module, support.value], () => {
  release(); source.value = null; fallbackFailed.value = false; acquire()
}, { deep: true, immediate: true })
watch(() => [props.lazy, props.visibilityRoot, target.value] as const, (_value, _previous, onCleanup) => {
  if (!props.lazy) { setDemand(props.priority); return }
  setDemand(null)
  if (props.visibilityRoot && target.value) onCleanup(observeThumbnailVisibility(props.visibilityRoot, target.value, setDemand))
}, { immediate: true, flush: 'post' })
watch(() => props.priority, priority => { if (!props.lazy) setDemand(priority) })
onUnmounted(release)
</script>
<template>
  <span ref="target" class="component-thumbnail" :data-thumbnail-type="type">
    <img v-if="source" :src="source" :alt="alt" width="256" height="192" draggable="false" @error="source = null" />
    <img v-else-if="fallbackIcon && !fallbackFailed" :src="fallbackIcon" alt="" width="58" height="58" draggable="false" @error="fallbackFailed = true" />
    <WorkbenchIcon v-else name="chip" />
  </span>
</template>
