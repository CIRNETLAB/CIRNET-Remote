import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
const apiTarget=process.env.NETCIRCUIT_DEV_API_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [vue()],
  // Windows linked worktrees can allow normal reads while native realpath fails.
  // Keep module resolution in this checkout's declared path on that platform.
  resolve: { preserveSymlinks: process.platform === 'win32' },
  build: { rollupOptions: { input: {
    main:fileURLToPath(new URL('./index.html',import.meta.url)),
    oscilloscope:fileURLToPath(new URL('./oscilloscope-preview.html',import.meta.url)),
    generator:fileURLToPath(new URL('./function-generator-preview.html',import.meta.url))
  } } },
  server: {
    watch: { ignored:['**/.test-build/**','**/.runtime/**'] },
    proxy: {
      '/api': apiTarget,
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true }
    }
  }
})
