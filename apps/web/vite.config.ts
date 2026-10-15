import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
const apiTarget=process.env.NETCIRCUIT_DEV_API_TARGET || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [vue()],
  // Windows linked worktrees can allow normal reads while native realpath fails.
  // Keep module resolution in this checkout's declared path on that platform.
  resolve: { preserveSymlinks: process.platform === 'win32' },
  server: {
    proxy: {
      '/api': apiTarget,
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true }
    }
  }
})
