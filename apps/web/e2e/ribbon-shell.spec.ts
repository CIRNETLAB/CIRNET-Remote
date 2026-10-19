import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { exportedNativeGraph, nativeShellEvidence, observeNativeScene, sceneReady, workspaceCanvas } from './native-scene'
import { fileCommand } from './workbench-ui'

const directory = resolve('.test-build/ribbon-shell')
const fileItems = ['New', 'Open Project', 'Save', 'Save As', 'Import', 'Export', 'History', 'Assignment']
const tab = (page: Page, name: 'Component' | 'Run') => page.getByRole('tab', { name, exact: true })
const file = (page: Page) => page.getByRole('button', { name: 'File', exact: true })
const menu = (page: Page) => page.getByRole('menu', { name: 'File', exact: true })
const message = (page: Page) => page.locator('.system-message-text:not(:empty)')
const footer = (page: Page) => page.locator('.simulation-statusbar')
const graph = { schema_version: '1.2', circuit_id: 'ribbon-native', modules: [
  { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } },
  { id: 'LED', type: 'LED', position: { x: 3, y: 0, z: 0 } },
  { id: 'SCOPE', type: 'OSCILLOSCOPE', position: { x: -8, y: 0, z: -4 } },
  { id: 'GEN', type: 'GENERATOR', position: { x: 9, y: 0, z: -4 } },
  { id: 'DISPLAY', type: 'SEGMENT_SC5611EWA', position: { x: 0, y: .33, z: 0 }, physicalDescriptor: { version: 1, partId: 'KINGBRIGHT-SC56-11EWA', partRevision: 2, packageId: 'SC56-11EWA-TH-BBI3', packageRevision: 2 } },
], connections: [], metadata: { name: 'Native Ribbon acceptance', retain: ['unchanged', 42] } }

async function start(page: Page) {
  page.setDefaultTimeout(15_000)
  await observeNativeScene(page)
  await page.goto('/')
  await sceneReady(page)
  await expect(page.getByRole('button', { name: 'Open account', exact: true })).toHaveText('Guest', { timeout: 30_000 })
  await mkdir(directory, { recursive: true })
}
async function importGraph(page: Page, name = 'ribbon-native.json') {
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect(page.locator('.project-title')).toContainText('Native Ribbon acceptance')
  await stable(page)
}
async function stable(page: Page) {
  let previous = '', count = 0
  await expect.poll(async () => {
    const state = await nativeShellEvidence(page)
    const pose = JSON.stringify([state.position, state.quaternion, state.projection])
    count = pose === previous ? count + 1 : 0; previous = pose
    return count
  }, { intervals: [100], timeout: 30_000 }).toBeGreaterThanOrEqual(2)
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(directory, name + '.png'), fullPage: true, timeout: 45_000 })
}
async function singleRow(page: Page) {
  await expect(page.locator('.component-panel')).toHaveCount(1)
  await expect(footer(page).locator('.execution-buttons,.simulation-state,.mode,.verification,.connection-status,.component-count,.wire-count')).toHaveCount(0)
  await expect(footer(page).getByRole('button', { name: 'Zoom In', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(message(page)).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(message(page)).toHaveCSS('opacity', '1')
}

test('Header order, File menu keyboard focus and manual Component/Run tab activation', async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  await expect(tab(page, 'Component')).toHaveAttribute('aria-selected', 'true')
  await expect(file(page)).toHaveAttribute('aria-haspopup', 'menu')
  const header = page.locator('.app-titlebar')
  const ordered = [header.locator('.brand'), header.getByRole('button', { name: 'Undo', exact: true }), header.getByRole('button', { name: 'Redo', exact: true }), file(page), tab(page, 'Component'), tab(page, 'Run'), header.locator('.project-title'), header.getByRole('button', { name: 'Open account', exact: true }), header.getByRole('button', { name: 'Open Inspector', exact: true })]
  const boxes = await Promise.all(ordered.map(item => item.boundingBox()))
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index]!.x).toBeGreaterThanOrEqual(boxes[index - 1]!.x)
    expect(Math.abs(boxes[index]!.y + boxes[index]!.height / 2 - boxes[0]!.y - boxes[0]!.height / 2)).toBeLessThan(15)
    expect(await ordered[index - 1]!.evaluate((element, next) => !!(element.compareDocumentPosition(next as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await ordered[index]!.elementHandle())).toBe(true)
  }
  await file(page).focus(); await page.keyboard.press('Enter')
  await expect(menu(page).getByRole('menuitem').locator('span')).toHaveText(fileItems)
  await expect(menu(page).getByRole('menuitem', { name: 'New', exact: true })).toBeFocused()
  await page.keyboard.press('End'); await expect(menu(page).getByRole('menuitem', { name: 'Assignment', exact: true })).toBeFocused()
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown')
  await expect(menu(page).getByRole('menuitem', { name: 'Open Project', exact: true })).toBeFocused()
  await screenshot(page, 'after-file')
  await page.keyboard.press('Escape'); await expect(menu(page)).toBeHidden(); await expect(file(page)).toBeFocused()
  await page.keyboard.press('Space'); await expect(menu(page)).toBeVisible(); await page.keyboard.press('Tab'); await expect(menu(page)).toBeHidden()
  await file(page).click(); await tab(page, 'Component').click(); await expect(menu(page)).toBeHidden()
  await tab(page, 'Component').focus(); await page.keyboard.press('ArrowRight')
  await expect(tab(page, 'Run')).toBeFocused(); await expect(tab(page, 'Component')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter'); await expect(tab(page, 'Run')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#workbench-panel-run')).toHaveAttribute('aria-labelledby', 'workbench-tab-run')
  await file(page).click(); await expect(tab(page, 'Run')).toHaveAttribute('aria-selected', 'true'); await page.keyboard.press('Escape')
  await fileCommand(page, 'Open Project')
  const projects = page.getByRole('region', { name: 'Project Manager', exact: true })
  await expect(projects).toBeVisible()
  expect(await projects.evaluate(element => element.closest('[role="dialog"]')?.contains(document.activeElement) ?? element.contains(document.activeElement))).toBe(true)
  await expect(file(page)).not.toBeFocused()
  await singleRow(page)
})

test('native canvas identity, camera, graph, selection and undo survive tabs, File, collapse and messages', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page); await importGraph(page)
  await page.getByRole('button', { name: 'Open Inspector', exact: true }).click()
  await page.getByLabel('Select component').selectOption('LED')
  await page.getByLabel('Component X', { exact: true }).fill('4'); await page.getByLabel('Component X', { exact: true }).press('Tab')
  await page.getByRole('button', { name: 'Close Inspector', exact: true }).click()
  await stable(page)
  const before = await nativeShellEvidence(page), saved = await exportedNativeGraph(page), zoom = await page.getByLabel('Workspace magnification', { exact: true }).textContent()
  expect(before.globalListeners['window:keydown:false']).toBeGreaterThan(0)
  expect(before.globalListeners['document:keydown:false']).toBeGreaterThan(0)
  await workspaceCanvas(page).evaluate(element => element.setAttribute('data-ribbon-identity', 'native-original'))
  let mutations = 0, sockets = 0
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/experiments(?:\/|$)/.test(new URL(request.url()).pathname)) mutations++ })
  page.on('websocket', () => sockets++)
  for (let index = 0; index < 8; index++) {
    await tab(page, index % 2 ? 'Component' : 'Run').click()
    await file(page).click(); await page.keyboard.press('Escape')
  }
  await screenshot(page, 'after-component')
  await tab(page, 'Run').click()
  await expect(page.getByRole('toolbar', { name: 'Execution controls', exact: true }).getByRole('button', { name: 'Run', exact: true })).toBeVisible()
  for (const name of ['Pause', 'Step']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  await page.locator('#execution-capability-help').focus(); await expect(page.locator('#execution-capability-help')).toBeFocused()
  await expect(page.locator('#execution-capability-help')).toContainText(/not support|unavailable|unsupported/i)
  await screenshot(page, 'after-run')
  for (const name of ['Run', 'Component'] as const) {
    await tab(page, name).click()
    await page.getByRole('button', { name: 'Collapse Ribbon', exact: true }).click()
    await expect(page.locator('.component-panel')).toHaveAttribute('data-drawer-occupied', 'false')
    await tab(page, name).click()
    await expect(page.getByRole('button', { name: 'Collapse Ribbon', exact: true })).toBeVisible()
    await expect(page.locator('.component-panel')).toHaveAttribute('data-drawer-occupied', 'true')
  }
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
  await expect(message(page)).toContainText(/Error:/)
  await page.getByRole('button', { name: 'Dismiss system message', exact: true }).click()
  await stable(page)
  expect(await nativeShellEvidence(page)).toEqual(before)
  await expect(workspaceCanvas(page)).toHaveAttribute('data-ribbon-identity', 'native-original')
  expect(await exportedNativeGraph(page)).toEqual(saved)
  await expect(page.getByLabel('Workspace magnification', { exact: true })).toHaveText(zoom!)
  await page.getByRole('button', { name: 'Open Inspector', exact: true }).click()
  await expect(page.getByLabel('Select component')).toHaveValue('LED')
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByLabel('Component X', { exact: true })).toHaveValue('3')
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.getByLabel('Component X', { exact: true })).toHaveValue('4')
  expect(mutations).toBe(0); expect(sockets).toBe(0)
  await writeFile(resolve(directory, 'native-stability.json'), JSON.stringify({ before, after: await nativeShellEvidence(page), mutations, sockets, graph: saved }, null, 2))
})

test('Component groups, search, real drag placement and no ghost palette across Run', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page)
  const families = page.getByRole('toolbar', { name: 'Component families', exact: true })
  await expect(families.locator('button[data-group]')).toHaveText(['Structure', 'Passive', 'Active', 'Output', 'Contacts', 'Logic ICs', 'Arithmetic ICs', 'Display', 'Instruments', 'Notation'])
  await expect(families.locator('[data-group="input"]')).toContainText('Contacts')
  await families.locator('[data-group="logic"]').click()
  const search = page.getByRole('searchbox', { name: 'Search components', exact: true })
  await search.fill('74HC08'); await expect(page.locator('.palette-items [data-component-type="SN74HC08N"]')).toBeVisible()
  await page.getByRole('button', { name: 'Clear component search', exact: true }).click(); await expect(search).toHaveValue('')
  await search.fill('74HC08')
  const canvas = workspaceCanvas(page), bounds = await canvas.boundingBox()
  await page.locator('.palette-items [data-component-type="SN74HC08N"]').dragTo(canvas, { targetPosition: { x: bounds!.width * .65, y: bounds!.height * .65 } })
  await expect.poll(async () => (await exportedNativeGraph(page)).modules.filter(module => module.type === 'SN74HC08N').length).toBeGreaterThan(0)
  await tab(page, 'Run').click(); await expect(page.locator('#ribbon-palette')).toBeHidden(); await expect(search).toBeHidden()
  await tab(page, 'Component').click(); await expect(page.locator('#ribbon-palette')).toBeHidden()
  await families.locator('[data-group="logic"]').click(); await expect(search).toBeVisible()
  await page.getByRole('button', { name: 'Collapse Ribbon', exact: true }).click(); await expect(page.locator('#ribbon-palette')).toBeHidden()
  await tab(page, 'Run').click(); await expect(page.locator('#ribbon-palette')).toBeHidden()
})

test('footer shows real import failure before export info, exposes full text and clears context hints', async ({ page }) => {
  test.setTimeout(120_000)
  await start(page); await importGraph(page)
  const before = await nativeShellEvidence(page), initialFooter = await footer(page).boundingBox()
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
  await expect(message(page)).toContainText('Error:')
  const error = await message(page).textContent()
  await screenshot(page, 'after-error-message')
  await exportedNativeGraph(page); await expect(message(page)).toHaveText(error!)
  await page.getByRole('button', { name: 'Read full system message', exact: true }).click()
  await expect(page.locator('#system-message-details')).toBeFocused(); await expect(page.locator('#system-message-details')).toContainText(error!)
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Read full system message', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Dismiss system message', exact: true }).click(); await expect(message(page)).not.toHaveText(error!)
  await importGraph(page, 'long-' + 'filename-'.repeat(25) + '.json')
  await expect(message(page)).toContainText('filename-')
  await screenshot(page, 'after-long-message')
  expect(await footer(page).boundingBox()).toEqual(initialFooter)
  expect((await nativeShellEvidence(page)).rect).toEqual(before.rect)
  await singleRow(page)
  await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click(); await expect(message(page)).toContainText(/zoom|rectangle/i)
  await page.keyboard.press('Escape'); await expect(message(page)).not.toContainText(/drag.*rectangle/i)
  await expect(page.locator('.file-error,.editor-error,.graphics-notice,.placement-notice,.zoom-area-notice,.marquee-notice,.duplicate-notice')).toHaveCount(0)
})

for (const dpr of [1, 2]) test(`responsive native Ribbon at DPR ${dpr}, reduced motion and rapid toggles`, async ({ browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:14173', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const layouts: unknown[] = []
  try {
    await start(page); await importGraph(page)
    for (const width of [1440, 1280, 900, 480]) {
      await page.setViewportSize({ width, height: 1000 }); await tab(page, 'Component').click(); await stable(page)
      await singleRow(page)
      const before = await nativeShellEvidence(page), footerBefore = await footer(page).boundingBox()
      await file(page).click()
      const menuBounds = await menu(page).boundingBox()
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0); expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width)
      await page.keyboard.press('Escape')
      for (let index = 0; index < 5; index++) {
        await tab(page, index % 2 ? 'Component' : 'Run').click()
        await page.getByRole('button', { name: 'Collapse Ribbon', exact: true }).click()
        await tab(page, index % 2 ? 'Component' : 'Run').click()
      }
      await tab(page, 'Component').click()
      await expect(page.locator('.component-panel')).toHaveAttribute('data-drawer-occupied', 'true')
      await stable(page)
      expect(await nativeShellEvidence(page)).toEqual(before)
      expect(await footer(page).boundingBox()).toEqual(footerBefore)
      await singleRow(page)
      await screenshot(page, `after-${width}-dpr${dpr}`)
      layouts.push({ width, dpr, native: await nativeShellEvidence(page), header: await page.locator('.app-titlebar').boundingBox(), footer: await footer(page).boundingBox(), message: await message(page).boundingBox(), viewportControls: await footer(page).getByRole('toolbar', { name: 'Workspace view controls', exact: true }).evaluateAll(elements => elements.map(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }))) })
    }
    await writeFile(resolve(directory, `after-layout-dpr${dpr}.json`), JSON.stringify(layouts, null, 2))
  } finally { await context.close() }
})

for (const cancel of [true, false]) test(`native pending physical preflight keeps one owner across tab/collapse changes (${cancel ? 'Cancel' : 'release'})`, async ({ page }) => {
  test.setTimeout(90_000)
  await start(page)
  const fixture = JSON.parse(await readFile('../../contracts/circuit-schema/examples/physical-hc08-led.json', 'utf8'))
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'physical-preflight.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) })
  await expect(page.locator('.project-title')).toContainText(String(fixture.metadata.name))
  let release!: () => void, reached!: () => void, previews = 0, creates = 0, runs = 0
  const held = new Promise<void>(resolve => release = resolve), fetched = new Promise<void>(resolve => reached = resolve)
  page.on('request', request => {
    if (request.method() !== 'POST') return
    const path = new URL(request.url()).pathname
    if (path === '/api/experiments') creates++
    if (/\/api\/experiments\/[^/]+\/run$/.test(path)) runs++
  })
  await page.route('**/api/circuits/physical-preview', async route => {
    previews++
    const response = await route.fetch({ maxRetries: 0 })
    expect(response.status()).toBe(200)
    reached()
    await held
    await route.fulfill({ response })
  })
  await tab(page, 'Run').click()
  const controls = page.getByRole('toolbar', { name: 'Execution controls', exact: true })
  await expect(controls.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await controls.getByRole('button', { name: 'Run', exact: true }).click()
  await fetched
  await expect(controls.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  await workspaceCanvas(page).evaluate(element => element.setAttribute('data-preflight-canvas', 'original'))
  for (let index = 0; index < 2; index++) {
    await tab(page, 'Component').click()
    await page.getByRole('button', { name: 'Collapse Ribbon', exact: true }).click()
    await tab(page, 'Run').click()
    await expect(controls.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  }
  expect(previews).toBe(1); expect(creates).toBe(0); expect(runs).toBe(0)
  if (cancel) {
    await controls.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(controls.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  }
  release()
  if (cancel) {
    await expect(controls.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
    expect(creates).toBe(0); expect(runs).toBe(0)
  } else {
    await expect.poll(() => runs, { timeout: 30_000 }).toBe(1)
    expect(creates).toBe(1); expect(previews).toBe(1)
  }
  await expect(workspaceCanvas(page)).toHaveAttribute('data-preflight-canvas', 'original')
  await writeFile(resolve(directory, `preflight-${cancel ? 'cancel' : 'release'}.json`), JSON.stringify({ previews, creates, runs, native: await nativeShellEvidence(page) }, null, 2))
})
