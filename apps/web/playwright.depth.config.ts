import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./e2e',testMatch:'depth-artifacts.spec.ts',outputDir:'.test-build/depth-playwright',workers:1,timeout:360000,reporter:'list',use:{baseURL:'http://127.0.0.1:14179',headless:true,viewport:{width:1916,height:908},launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 14179 --strictPort',url:'http://127.0.0.1:14179/e2e/depth-harness.html',reuseExistingServer:true,timeout:30000}})


