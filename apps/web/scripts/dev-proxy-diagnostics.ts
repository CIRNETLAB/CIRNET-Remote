import { stripVTControlCharacters } from 'node:util'
import type { Logger, Plugin } from 'vite'

const configuredLoggers = new WeakSet<Logger>()

export function devProxyDiagnostics(): Plugin {
  return {
    name: 'netcircuit-dev-proxy-diagnostics',
    apply: 'serve',
    configureServer({ config: { logger } }) {
      // Keep Vite's resolved log level, state and existing proxy cleanup listeners.
      if (configuredLoggers.has(logger)) return
      configuredLoggers.add(logger)
      const reportError = logger.error.bind(logger)
      logger.error = (message, options) => {
        const cause = options?.error as NodeJS.ErrnoException | null | undefined
        // Vite 6 identifies the browser-side socket with this specific prefix.
        // Never downgrade upstream failures or infer errno from a stack string.
        if (stripVTControlCharacters(message).startsWith('ws proxy socket error:\n')
          && cause?.code === 'ECONNABORTED' && cause.syscall === 'write') {
          logger.warn('Browser WebSocket write aborted (ECONNABORTED). This can occur on reload/close or a client network interruption.', {
            timestamp: options?.timestamp, clear: options?.clear, environment: options?.environment,
          })
          return
        }
        reportError(message, options)
      }
    },
  }
}
