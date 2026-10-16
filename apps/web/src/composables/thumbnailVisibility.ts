import type { PackageThumbnailPriority } from '../three/PackageThumbnails'

type Demand = PackageThumbnailPriority | null
interface Subscription { apply(priority: Demand): void; near: boolean; intersecting: boolean; priority: Demand }
interface SharedObserver { subscribe(target: Element, apply: Subscription['apply']): () => void; refresh(): void }
const roots = new WeakMap<Element, SharedObserver>()
export const THUMBNAIL_PRELOAD_MARGIN = 72
const overlaps = (a: DOMRectReadOnly, b: DOMRectReadOnly, margin = 0) => a.bottom > b.top - margin && a.top < b.bottom + margin && a.right > b.left && a.left < b.right

/** Filtering repositions surviving cards even in browsers without IO. */
export function refreshThumbnailVisibility(root: Element | undefined): void { if (root) roots.get(root)?.refresh() }

/** One observer per scroll container; cards themselves never own GPU work. */
export function observeThumbnailVisibility(root: Element, target: Element, apply: Subscription['apply']): () => void {
  let shared = roots.get(root)
  if (!shared) {
    const subscribers = new Map<Element, Subscription>()
    let active = true
    const measureRoot = () => root.getBoundingClientRect?.()
    const publish = (subscription: Subscription, bounds: DOMRectReadOnly | undefined, viewport: DOMRectReadOnly | null | undefined) => {
      const priority: Demand = !subscription.near ? null : bounds && viewport ? overlaps(bounds, viewport) ? 'visible' : 'preload' : 'visible'
      if (priority !== subscription.priority) { subscription.priority = priority; subscription.apply(priority) }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (!active) return
      const viewport = measureRoot() ?? entries[0]?.rootBounds
      for (const entry of entries) {
        const subscription = subscribers.get(entry.target)
        if (!subscription) continue // A queued callback may outlive a search result.
        subscription.intersecting = entry.isIntersecting; subscription.near = entry.isIntersecting
        publish(subscription, entry.boundingClientRect, viewport)
      }
    }, { root, rootMargin: `${THUMBNAIL_PRELOAD_MARGIN}px 0px`, threshold: 0 })
    const refresh = (all = false) => {
      if (!active) return
      const viewport = measureRoot()
      if (!viewport) return
      for (const [element, subscription] of subscribers) {
        // IO discovers new nearby cards. Scroll only remeasures the small active
        // set to promote preload jobs and promptly cancel jobs that left it.
        // A scroll can leave and re-enter between IO samples. Retain the last
        // IO candidate until IO itself confirms exit, even if measured demand
        // was canceled in the meantime; otherwise its image can stay missing.
        if (observer && !all && !subscription.intersecting && !subscription.near) continue
        const bounds = element.getBoundingClientRect?.()
        if (!bounds) continue
        subscription.near = overlaps(bounds, viewport, THUMBNAIL_PRELOAD_MARGIN)
        publish(subscription, bounds, viewport)
      }
    }
    const onScroll = () => refresh()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => refresh())
    resize?.observe(root)
    root.addEventListener?.('scroll', onScroll, { passive: true })
    shared = {
      refresh() { refresh(true) },
      subscribe(element, listener) {
        const subscription: Subscription = { apply: listener, near: false, intersecting: false, priority: null }
        subscribers.set(element, subscription)
        if (observer) observer.observe(element)
        else refresh() // Geometry fallback still limits demand when IO is unavailable.
        let stopped = false
        return () => {
          if (stopped) return
          stopped = true; observer?.unobserve(element); subscribers.delete(element)
          if (!subscribers.size) {
            active = false; observer?.disconnect(); resize?.disconnect(); root.removeEventListener?.('scroll', onScroll); roots.delete(root)
          }
        }
      },
    }
    roots.set(root, shared)
  }
  return shared.subscribe(target, apply)
}
