import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./e2e',outputDir:'.test-build/playwright',fullyParallel:false,workers:1,retries:0,
  timeout:45_000,expect:{timeout:10_000},reporter:'list',
  use:{baseURL:'http://127.0.0.1:14173',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
})
