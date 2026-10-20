import { defineConfig } from '@playwright/test'
import { basename, dirname, resolve } from 'node:path'
import { getArtifactDirectory, validateArtifactDirectory } from '../../scripts/artifact-paths.mjs'
import {prepareContractProfile} from './src/contracts/structural'

// API/graph assertions run in Playwright's Node worker, independently of the
// browser's workflow loading. Preparing this test process cannot preload Vite.
await Promise.all((['structural','editor','transport'] as const).map(profile=>prepareContractProfile(profile)))

const outputDirectory = getArtifactDirectory('playwright')
for (let index = 0; index < process.argv.length; index++) {
  const output = /^(--output|-o)(?:=(.*))?$/.exec(process.argv[index])
  if (!output) continue
  const directory = output[2] ?? process.argv[++index]
  if (!directory || validateArtifactDirectory(resolve(directory)) !== outputDirectory) {
    throw new Error('Select the external artifact parent with NETCIRCUIT_ARTIFACTS_DIR or use scripts/e2e.mjs to allocate an owned --output directory.')
  }
}
const reporterDirectory = getArtifactDirectory('playwright-reporters')
for (const reporter of ['JUNIT', 'JSON']) {
  const prefix = `PLAYWRIGHT_${reporter}_OUTPUT`
  const configuredFile = process.env[`${prefix}_FILE`]
  const configuredDirectory = process.env[`${prefix}_DIR`]
  const name = process.env[`${prefix}_NAME`] || (reporter === 'JUNIT' ? 'junit.xml' : 'results.json')
  const filename = configuredFile ? basename(resolve(configuredFile)) : name
  if (!filename || filename === '.' || filename === '..' || name !== basename(name)) throw new Error(`${prefix}_NAME must be a filename; select an external directory with ${prefix}_DIR.`)
  const directory = configuredFile || configuredDirectory
    ? getArtifactDirectory('', { directory: configuredFile ? dirname(resolve(configuredFile)) : configuredDirectory })
    : reporterDirectory
  process.env[`${prefix}_FILE`] = resolve(directory, filename)
  process.env[`${prefix}_DIR`] = directory
}
process.env.PLAYWRIGHT_HTML_OUTPUT_DIR = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
  ? getArtifactDirectory('', { directory: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR })
  : getArtifactDirectory('playwright-reporters/html')

export default defineConfig({
  testDir:'./e2e',outputDir:outputDirectory,fullyParallel:false,workers:1,retries:0,
  timeout:45_000,expect:{timeout:10_000},reporter:'list',
  use:{baseURL:'http://127.0.0.1:14173',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure',
    launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      `--log-file=${resolve(getArtifactDirectory('browser-logs'),'chromium-debug.log')}`]}},
})
