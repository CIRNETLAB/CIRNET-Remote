import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import type { Camera, Mesh, Object3D } from 'three'
import type { CircuitGraph, CircuitModule } from '../src/types/circuit'
import type * as Catalog from '../src/data/partCatalog'
import { moduleLocalToWorld, worldToModuleLocal } from '../src/electrical/modulePose'
import { exportedNativeGraph, nativeSceneEvidence, observeNativeScene, projectContact, sceneReady, workspaceCanvas } from './native-scene'

test.use({ video: { mode: 'on', size: { width: 1920, height: 1080 } } })
const info = (page: Page) => page.getByRole('complementary', { name: 'Component Info', exact: true })
const projects = (page: Page) => page.getByRole('region', { name: 'Project Manager', exact: true })
const moduleById = (graph: CircuitGraph, id: string) => {
  const module = graph.modules.find(module => module.id === id)
  if (!module) throw new Error(`Exported module ${id} is missing.`)
  return module
}
const labels = (graph: CircuitGraph) => graph.modules.filter(module => module.type === 'LABEL')
const boardGraph = (name: string): CircuitGraph => ({ schema_version: '1.2', circuit_id: name, modules: [{ id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }], connections: [], metadata: { name } })

async function contactCatalog(): Promise<Pick<typeof Catalog, 'getPartForType' | 'physicalDescriptorForPart'>> {
  // Bundle the application's JSON-backed catalog for Node's ESM test runtime.
  const filename = resolve('.test-build', `native-label-contact-catalog-${process.pid}.mjs`)
  await build({ stdin: { contents: "export {getPartForType, physicalDescriptorForPart} from './src/data/partCatalog'", resolveDir: process.cwd(), loader: 'ts' }, outfile: filename, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  return import(pathToFileURL(filename).href) as Promise<Pick<typeof Catalog, 'getPartForType' | 'physicalDescriptorForPart'>>
}

async function openNative(page: Page, graph: CircuitGraph) {
  await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'labels-contacts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await page.getByRole('button', { name: 'View TOP', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'View TOP', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
}
async function selectTool(page: Page, tool: 'Select' | 'Move' | 'Rotate') {
  const expand = page.getByRole('button', { name: 'Expand Tools', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('button', { name: tool, exact: true }).click()
}
async function chooseLabel(page: Page, text: string) {
  const expand = page.getByRole('button', { name: 'Expand Components', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.locator('[data-group="notation"]').click()
  await page.locator('[data-component-type="LABEL"]').click()
  await expect(info(page).getByLabel('Label text', { exact: true })).toBeVisible()
  await info(page).getByLabel('Label text', { exact: true }).fill(text)
  await info(page).getByRole('button', { name: 'Preview Label', exact: true }).click()
}
async function placeLabel(page: Page, text: string, contact = 'terminal:D:28') {
  const before = await exportedNativeGraph(page)
  await chooseLabel(page, text)
  const point = await projectContact(page, 'BB', contact)
  await page.mouse.move(point.x, point.y)
  await expect.poll(async () => (await nativeSceneEvidence(page)).preview).toBe(true)
  expect(await exportedNativeGraph(page), 'preview stays outside the document').toEqual(before)
  await page.mouse.click(point.x, point.y)
  const after = await exportedNativeGraph(page)
  const label = labels(after).find(module => !before.modules.some(previous => previous.id === module.id))
  if (!label) throw new Error('A native board click did not commit the Label.')
  expect(label.properties?.text).toBe(text); expect(label.properties?.boardId).toBe('BB')
  expect(label.mount).toBeUndefined(); expect(label.physicalDescriptor).toBeUndefined()
  expect(after.connections).toEqual(before.connections)
  return { before, after, label }
}
async function historyRoundTrip(page: Page, before: CircuitGraph, after: CircuitGraph) {
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await exportedNativeGraph(page), 'one Undo restores the complete prior graph').toEqual(before)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect(await exportedNativeGraph(page), 'one Redo restores the complete operation').toEqual(after)
}
async function moduleClickPoint(page: Page, id: string) {
  return workspaceCanvas(page).evaluate((element, id) => {
    const canvas = element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: Camera } }, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The native renderer observer is missing.')
    let model: Object3D | undefined
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    if (!model) throw new Error(`Rendered module ${id} is unavailable.`)
    let point = model.getWorldPosition(model.position.clone())
    if (model.userData.type === 'LABEL') {
      const sheet = model.getObjectByName('label-sheet') as Mesh | undefined
      if (!sheet?.geometry) throw new Error(`Rendered Label sheet ${id} is unavailable.`)
      sheet.updateWorldMatrix(true, false); sheet.geometry.computeBoundingBox()
      const box = sheet.geometry.boundingBox!
      // The selected note's center belongs to the XZ transform gizmo. Use a
      // real sheet corner, inset from its rounded edge, for body interactions.
      point = sheet.position.clone().set(box.min.x + (box.max.x - box.min.x) * .12, box.max.y, box.min.z + (box.max.z - box.min.z) * .12).applyMatrix4(sheet.matrixWorld)
    }
    point.project(probe.camera)
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, id)
}
async function clickModule(page: Page, id: string) {
  const point = await moduleClickPoint(page, id)
  await page.mouse.click(point.x, point.y)
  return point
}
async function cancelPointer(page: Page) {
  // Browsers expose cancellation as an event, rather than a mouse button action.
  // All presses and drags preceding this signal use Playwright's native mouse.
  await workspaceCanvas(page).dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true, isPrimary: true })
  await page.mouse.up()
}
async function attachEvidence(page: Page, testInfo: TestInfo, name: string, graph: CircuitGraph) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  const evidence = JSON.stringify({ graph, scene: await nativeSceneEvidence(page) }, null, 2) + '\n'
  const directory = resolve('.test-build', 'labels-contact-evidence')
  await mkdir(directory, { recursive: true })
  await copyFile(path, resolve(directory, `${name}.png`))
  await writeFile(resolve(directory, `${name}.json`), evidence, 'utf8')
  await testInfo.attach(name, { path, contentType: 'image/png' })
  await testInfo.attach(`${name}-evidence`, { body: Buffer.from(evidence), contentType: 'application/json' })
}

test('native Label placement, Unicode edit, transforms, duplicate/delete and cancelled previews retain history and persistence', async ({ page, context }, testInfo) => {
  test.setTimeout(240_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const name = `Native Labels ${randomUUID()}`
  await openNative(page, boardGraph(name))
  const placed = await placeLabel(page, 'Điện trở < 1 kΩ\nNguồn 5 V')
  await historyRoundTrip(page, placed.before, placed.after)
  await selectTool(page, 'Select')
  const center = await moduleClickPoint(page, placed.label.id)
  await page.mouse.dblclick(center.x, center.y)
  const text = 'Nhãn tiếng Việt 😀\n<script>chỉ là chữ</script>\nĐèn xanh'
  await expect(info(page).getByLabel('Label text', { exact: true })).toBeFocused()
  await info(page).getByLabel('Label text', { exact: true }).fill(text)
  await info(page).getByRole('button', { name: 'Update Label', exact: true }).click()
  const edited = await exportedNativeGraph(page)
  expect(moduleById(edited, placed.label.id).properties?.text).toBe(text)
  expect(moduleById(edited, placed.label.id).properties?.boardId).toBe('BB')
  await historyRoundTrip(page, placed.after, edited)

  await selectTool(page, 'Move')
  const start = await moduleClickPoint(page, placed.label.id)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 45, start.y + 18, { steps: 8 }); await page.mouse.up()
  const moved = await exportedNativeGraph(page)
  expect(moduleById(moved, placed.label.id).position).not.toEqual(moduleById(edited, placed.label.id).position)
  await historyRoundTrip(page, edited, moved)

  const cancelStart = await moduleClickPoint(page, placed.label.id)
  await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down(); await page.mouse.move(cancelStart.x + 30, cancelStart.y - 20, { steps: 5 })
  await cancelPointer(page)
  expect(await exportedNativeGraph(page), 'a cancelled Move rolls back its preview').toEqual(moved)

  await selectTool(page, 'Rotate'); await clickModule(page, placed.label.id)
  const rotated = await exportedNativeGraph(page)
  expect(moduleById(rotated, placed.label.id).rotation).toBe(((moduleById(moved, placed.label.id).rotation ?? 0) + 90) % 360)
  await historyRoundTrip(page, moved, rotated)
  await selectTool(page, 'Select'); await clickModule(page, placed.label.id)
  await workspaceCanvas(page).press('Control+d')
  const destination = await projectContact(page, 'BB', 'terminal:D:45')
  await page.mouse.move(destination.x, destination.y); await page.mouse.click(destination.x, destination.y)
  await workspaceCanvas(page).press('Escape')
  const duplicated = await exportedNativeGraph(page), duplicate = labels(duplicated).find(module => module.id !== placed.label.id)
  if (!duplicate) throw new Error('The native Duplicate command did not create a Label.')
  expect(duplicate.properties).toEqual(moduleById(rotated, placed.label.id).properties)
  await historyRoundTrip(page, rotated, duplicated)
  await selectTool(page, 'Select'); await clickModule(page, duplicate.id); await workspaceCanvas(page).press('Delete')
  const deleted = await exportedNativeGraph(page)
  expect(deleted.modules.some(module => module.id === duplicate.id)).toBe(false)
  await historyRoundTrip(page, duplicated, deleted)

  for (const cancellation of ['Escape', 'pointercancel'] as const) {
    await chooseLabel(page, `Cancelled ${cancellation}`)
    const point = await projectContact(page, 'BB', 'terminal:A:10'); await page.mouse.move(point.x, point.y)
    await expect.poll(async () => (await nativeSceneEvidence(page)).preview).toBe(true)
    if (cancellation === 'Escape') await workspaceCanvas(page).press('Escape')
    else await cancelPointer(page)
    await expect.poll(async () => (await nativeSceneEvidence(page)).preview).toBe(false)
    expect(await exportedNativeGraph(page)).toEqual(deleted)
  }
  await attachEvidence(page, testInfo, 'native-label-edited', deleted)

  // Refresh the recovery list through the UI; do not force a checkpoint. Seeing
  // the new draft proves the ordinary automatic local-save path completed.
  await page.getByRole('button', { name: 'Open Project Manager', exact: true }).click()
  await expect.poll(async () => {
    await projects(page).getByRole('button', { name: 'Refresh recovery', exact: true }).click()
    return projects(page).getByRole('button', { name: `Recover ${name}`, exact: true }).count()
  }).toBeGreaterThan(0)
  await page.reload(); await sceneReady(page)
  if (!(await projects(page).isVisible())) await page.getByRole('button', { name: 'Open Project Manager', exact: true }).click()
  await projects(page).getByRole('button', { name: 'Refresh recovery', exact: true }).click()
  await projects(page).getByRole('button', { name: `Recover ${name}`, exact: true }).first().click()
  await projects(page).getByRole('button', { name: 'Confirm project action', exact: true }).click()
  expect(await exportedNativeGraph(page)).toEqual(deleted)
  await projects(page).getByLabel('New project name', { exact: true }).fill(name)
  await projects(page).getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(projects(page).getByRole('button', { name: 'Save circuit as new server document', exact: true })).toBeEnabled()
  await projects(page).getByRole('button', { name: 'Save circuit as new server document', exact: true }).click()
  await expect(projects(page).getByLabel('Server save status', { exact: true })).toContainText('saved')
  await expect(page).toHaveURL(/\/projects\/[^/]+\/circuits\/[^/]+$/)
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const response = await context.request.get(`/api/v2/circuits/${id}`)
  expect(response.ok()).toBe(true); expect((await response.json()).graph).toEqual(deleted)
  await page.reload(); await sceneReady(page)
  if (!(await projects(page).isVisible())) await page.getByRole('button', { name: 'Open Project Manager', exact: true }).click()
  await expect(projects(page).getByLabel('Server save status', { exact: true })).toContainText('saved')
  await expect(projects(page).getByLabel('Current circuit name', { exact: true })).toHaveValue(name)
  expect(await exportedNativeGraph(page)).toEqual(deleted)
  expect(errors).toEqual([])
})

test('native board transforms carry Labels, board copy remaps association and board deletion detaches without moving the sheet', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await openNative(page, boardGraph(`Label board association ${randomUUID()}`))
  const placed = await placeLabel(page, 'Gắn với breadboard')
  await selectTool(page, 'Select')
  const boardPoint = await projectContact(page, 'BB', 'terminal:A:03')
  await page.mouse.click(boardPoint.x, boardPoint.y)
  const labelPoint = await moduleClickPoint(page, placed.label.id)
  await page.keyboard.down('Control'); await page.mouse.click(labelPoint.x, labelPoint.y); await page.keyboard.up('Control')
  await workspaceCanvas(page).press('Control+c'); await workspaceCanvas(page).press('Control+v')
  const copied = await exportedNativeGraph(page)
  const copiedBoard = copied.modules.find(module => module.type === 'BREADBOARD' && module.id !== 'BB')
  const copiedLabel = labels(copied).find(module => module.id !== placed.label.id)
  if (!copiedBoard || !copiedLabel) throw new Error('Native board-plus-label Copy/Paste did not preserve the complete selection.')
  expect(copiedLabel.properties?.boardId).toBe(copiedBoard.id)
  expect(copiedLabel.properties?.text).toBe(placed.label.properties?.text)
  await historyRoundTrip(page, placed.after, copied)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await exportedNativeGraph(page)).toEqual(placed.after)

  await selectTool(page, 'Move')
  const start = await projectContact(page, 'BB', 'terminal:A:03')
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 38, start.y + 15, { steps: 8 }); await page.mouse.up()
  const moved = await exportedNativeGraph(page), oldBoard = moduleById(placed.after, 'BB'), movedBoard = moduleById(moved, 'BB')
  const oldLabel = moduleById(placed.after, placed.label.id), movedLabel = moduleById(moved, placed.label.id)
  expect(movedBoard.position).not.toEqual(oldBoard.position)
  for (const axis of ['x', 'y', 'z'] as const) expect((movedLabel.position?.[axis] ?? 0) - (oldLabel.position?.[axis] ?? 0)).toBeCloseTo((movedBoard.position?.[axis] ?? 0) - (oldBoard.position?.[axis] ?? 0), 8)
  await historyRoundTrip(page, placed.after, moved)

  await selectTool(page, 'Rotate')
  const rotatePoint = await projectContact(page, 'BB', 'terminal:A:03'); await page.mouse.click(rotatePoint.x, rotatePoint.y)
  const rotated = await exportedNativeGraph(page), rotatedBoard = moduleById(rotated, 'BB'), rotatedLabel = moduleById(rotated, placed.label.id)
  const expected = moduleLocalToWorld(worldToModuleLocal({ x: movedLabel.position?.x ?? 0, y: movedLabel.position?.y ?? 0, z: movedLabel.position?.z ?? 0 }, movedBoard), rotatedBoard)
  for (const axis of ['x', 'y', 'z'] as const) expect(rotatedLabel.position?.[axis]).toBeCloseTo(expected[axis], 8)
  expect(rotatedLabel.rotation).toBe(((movedLabel.rotation ?? 0) + 90) % 360)
  await historyRoundTrip(page, moved, rotated)

  await selectTool(page, 'Select')
  const removePoint = await projectContact(page, 'BB', 'terminal:A:03'); await page.mouse.click(removePoint.x, removePoint.y)
  await workspaceCanvas(page).press('Delete')
  const detached = await exportedNativeGraph(page), note = moduleById(detached, placed.label.id)
  expect(detached.modules.some(module => module.id === 'BB')).toBe(false)
  expect(note.properties?.boardId).toBeUndefined(); expect(note.position).toEqual(rotatedLabel.position); expect(note.rotation).toBe(rotatedLabel.rotation)
  expect(detached.connections).toEqual(rotated.connections)
  await historyRoundTrip(page, rotated, detached)
  await attachEvidence(page, testInfo, 'native-label-detached', detached)
})

/** Project the center of the actual rendered actuator mesh, never an inferred
 * HTML overlay or a test-only store command. worldY also observes real travel. */
async function actuatorPoint(page: Page, id: string, name = 'package-switch-actuator') {
  return workspaceCanvas(page).evaluate((element, { id, name }) => {
    const canvas = element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: Camera } }, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The native renderer observer is missing.')
    let model: Object3D | undefined
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    const actuator = model?.getObjectByName(name) as Mesh | undefined
    if (!actuator?.geometry || !actuator.userData.switchActuator) throw new Error(`Rendered actuator ${id}/${name} is unavailable.`)
    actuator.updateWorldMatrix(true, false); actuator.geometry.computeBoundingBox()
    const box = actuator.geometry.boundingBox!
    const world = actuator.position.clone().copy(box.min).add(box.max).multiplyScalar(.5).applyMatrix4(actuator.matrixWorld)
    const worldY = world.y, projected = world.project(probe.camera), rect = canvas.getBoundingClientRect()
    if (Math.abs(projected.x) >= 1 || Math.abs(projected.y) >= 1 || Math.abs(projected.z) >= 1) throw new Error('The actual actuator is outside the camera.')
    return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2, worldY }
  }, { id, name })
}

test('native SS12D10, independent DIP bits and tactile press/release/cancel use their actual actuator meshes', async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const { getPartForType, physicalDescriptorForPart } = await contactCatalog()
  const modules: CircuitModule[] = [
    ['S', 'SLIDE_SWITCH_SS12D10', 0], ['D', 'DIP_SWITCH_A6D4100', 2], ['T', 'PUSH_BUTTON_B3F1000', -2],
  ].map(([id, type, x]) => {
    const part = getPartForType(String(type))!
    return { id: String(id), type: String(type), position: { x: Number(x), y: .5, z: 0 }, properties: { ...part.editor.defaults }, physicalDescriptor: physicalDescriptorForPart(part) }
  })
  await openNative(page, { schema_version: '1.2', circuit_id: 'native-contact-controls', modules, connections: [] })
  await selectTool(page, 'Select')
  let before = await exportedNativeGraph(page)
  for (const state of [true, false]) {
    const point = await actuatorPoint(page, 'S'); await page.mouse.click(point.x, point.y)
    const after = await exportedNativeGraph(page)
    expect(moduleById(after, 'S').properties?.state).toBe(state)
    expect(after.connections).toEqual([])
    await historyRoundTrip(page, before, after); before = after
  }
  for (const bit of [0, 2]) {
    const point = await actuatorPoint(page, 'D', `package-switch-actuator-${bit}`); await page.mouse.click(point.x, point.y)
    const after = await exportedNativeGraph(page)
    expect([0, 1, 2, 3].map(index => moduleById(after, 'D').properties?.[`position${index}`])).toEqual(bit === 0 ? [true, false, false, false] : [true, false, true, false])
    await historyRoundTrip(page, before, after); before = after
  }
  const dipCancel = await actuatorPoint(page, 'D', 'package-switch-actuator-1')
  await page.mouse.move(dipCancel.x, dipCancel.y); await page.mouse.down(); await cancelPointer(page)
  expect(await exportedNativeGraph(page), 'cancelled latching input has no transaction').toEqual(before)

  for (const release of ['pointerup', 'pointercancel'] as const) {
    const point = await actuatorPoint(page, 'T'); await page.mouse.move(point.x, point.y); await page.mouse.down()
    await expect.poll(async () => (await actuatorPoint(page, 'T')).worldY).toBeLessThan(point.worldY - .0001)
    if (release === 'pointerup') await page.mouse.up(); else await cancelPointer(page)
    await expect.poll(async () => (await actuatorPoint(page, 'T')).worldY).toBeCloseTo(point.worldY, 8)
    expect(moduleById(await exportedNativeGraph(page), 'T').properties?.pressed).toBe(false)
  }
  const after = await exportedNativeGraph(page)
  expect(after.connections).toEqual([])
  expect((await nativeSceneEvidence(page)).trustedPointerDowns).toBeGreaterThanOrEqual(7)
  await attachEvidence(page, testInfo, 'native-contact-controls', after)
})
