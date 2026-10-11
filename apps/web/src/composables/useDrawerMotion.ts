import { onScopeDispose, ref, watch, watchEffect } from 'vue'

// Target state stays in Pinia. This only retains the drawer's obstacle until
// its CSS transition finishes; it never drives layout, timers or render frames.
export function useDrawerMotion(options: {
  collapsed: () => boolean
  drawer: () => HTMLElement | undefined
  media?: MediaQueryList
}) {
  const media = options.media ?? window.matchMedia('(prefers-reduced-motion: reduce)')
  const reducedMotion = ref(media.matches)
  const occupied = ref(!options.collapsed())
  const settle = () => { occupied.value = !options.collapsed() }
  watch(options.collapsed, (collapsed) => {
    if (!collapsed) occupied.value = true
    else if (reducedMotion.value) settle()
  }, { flush: 'sync' })
  watchEffect(() => {
    if (!options.collapsed() || !occupied.value) return
    const drawer = options.drawer()
    // Vue can batch expand + collapse into an unchanged transform. No CSS
    // transition then exists to emit an end event. Check only after DOM commit.
    if (drawer && !drawer.getAnimations().some((animation) => animation.playState === 'running')) settle()
  }, { flush: 'post' })
  function preferenceChanged() {
    reducedMotion.value = media.matches
    if (reducedMotion.value) settle()
  }
  function transitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    // Reversing an in-flight transition cancels the old one. Ignore any stale
    // completion while a replacement transition is still running.
    if ((event.currentTarget as HTMLElement).getAnimations().some((animation) => animation.playState === 'running')) return
    settle()
  }
  media.addEventListener('change', preferenceChanged)
  onScopeDispose(() => media.removeEventListener('change', preferenceChanged))
  return { occupied, reducedMotion, transitionEnd }
}
