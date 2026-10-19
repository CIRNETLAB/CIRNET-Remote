import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testMatch: 'unified-camera-framing.spec.ts',
  outputDir: '.test-build/unified-camera/playwright',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  projects: [
    { name: 'wide-dpr1', use: { viewport: { width: 1680, height: 711 }, deviceScaleFactor: 1 } },
    { name: 'wide-dpr2', use: { viewport: { width: 1680, height: 711 }, deviceScaleFactor: 2 } },
    { name: 'portrait-dpr1', use: { viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 } },
    { name: 'portrait-dpr2', use: { viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 } },
  ],
})
