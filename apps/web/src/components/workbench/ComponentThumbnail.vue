<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import { packageThumbnailCacheKey, packageThumbnails, type PackageThumbnailCache } from '../../three/PackageThumbnails'
import WorkbenchIcon from './WorkbenchIcon.vue'

const props = withDefaults(defineProps<{ type: string; properties?: Record<string, unknown>; alt?: string }>(), { alt: '' })
const thumbnails = inject<PackageThumbnailCache>(packageThumbnailCacheKey, packageThumbnails)
const source = ref<string | null>(null)
watch(() => [props.type, props.properties], (_value, _previous, onCleanup) => {
  source.value = null
  const lease = thumbnails.acquire(props.type, props.properties)
  let current = true
  void lease.ready.then(image => { if (current) source.value = image })
  onCleanup(() => { current = false; lease.release() })
}, { deep: true, immediate: true })
</script>
<template>
  <span class="component-thumbnail">
    <img v-if="source" :src="source" :alt="alt" width="256" height="192" draggable="false" @error="source = null" />
    <WorkbenchIcon v-else name="chip" />
  </span>
</template>
