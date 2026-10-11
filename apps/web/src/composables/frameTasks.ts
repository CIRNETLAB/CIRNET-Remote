interface FrameClock {
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
}
interface ElementSize { width: number; height: number }

export function createFrameTask(callback: () => void, { requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }: FrameClock = {}) {
  let frame: number | null = null
  return {
    schedule() {
      if (frame !== null) return
      frame = requestFrame(() => { frame = null; callback() })
    },
    cancel() { if (frame !== null) cancelFrame(frame); frame = null },
  }
}

// Consume the observer's layout result instead of forcing another DOM measurement.
export function observeElementSize(element: Element, apply: (width: number, height: number) => void, options: FrameClock & { Observer?: typeof ResizeObserver } = {}) {
  let pending: ElementSize | null = null
  let applied: ElementSize | null = null, stopped = false
  const task = createFrameTask(() => {
    const size = pending; pending = null
    if (stopped || !size) return
    applied = size; apply(size.width, size.height)
  }, options)
  const observer = new (options.Observer ?? ResizeObserver)((entries) => {
    if (stopped) return
    for (const entry of entries) {
      if (entry.target !== element) continue
      const { width, height } = entry.contentRect
      if (!Number.isFinite(width) || !Number.isFinite(height)) continue
      const size = { width: Math.max(0, width), height: Math.max(0, height) }
      if (applied?.width === size.width && applied.height === size.height) { pending = null; task.cancel(); continue }
      pending = size; task.schedule()
    }
  })
  observer.observe(element)
  return { disconnect() { stopped = true; observer.disconnect(); pending = null; task.cancel() } }
}
