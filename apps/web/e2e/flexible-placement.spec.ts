import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { observeNativeScene, sceneReady, workspaceCanvas, projectContact, projectModuleCenter, projectFlexibleHandle, exportedNativeGraph, nativeSceneEvidence } from './native-scene'

test.use({ video: { mode: 'on', size: { width: 1920, height: 1080 } } })
const info = (page: Page) => page.getByRole('complementary', { name: 'Component Info', exact: true })
async function openBoard(page: Page) {
  await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'native-placement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: '1.1', circuit_id: 'native-flexible-authoring', modules: [{ id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }], connections: [], metadata: { name: 'Native component placement', opaque: { retained: ['placement', 12] } } })) })
  await page.getByRole('button', { name: 'View TOP', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'View TOP', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
}
async function choose(page: Page, group: string, type: string) {
  const expand = page.getByRole('button', { name: 'Expand Components', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.locator(`[data-group="${group}"]`).click()
  await page.locator(`[data-component-type="${type}"]`).click()
  await expect(info(page)).toBeVisible()
}
async function clickContact(page: Page, id: string) { const point = await projectContact(page, 'BB', id); await page.mouse.click(point.x, point.y) }
async function hoverContact(page: Page, id: string) { const point = await projectContact(page, 'BB', id); await page.mouse.move(point.x, point.y); return point }
async function screenshot(page: Page, testInfo: TestInfo, name: string) { const path = testInfo.outputPath(`${name}.png`); await page.screenshot({ path }); await testInfo.attach(name, { path, contentType: 'image/png' }) }

test('native two-pin placement preserves draft intent, exact contacts, right-drag camera, reanchor, body editing and persisted undo history', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await openBoard(page)
  const original = await exportedNativeGraph(page)
  await choose(page, 'passive', 'GENERIC_RESISTOR')
  await expect(info(page).getByLabel('Resistance', { exact: true })).toBeVisible()
  expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  await clickContact(page, 'terminal:A:10')
  await expect(workspaceCanvas(page)).toHaveAttribute('title', /Choose pin B|second hole/i)
  expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  // Editing authoring values after choosing A must retain that exact anchor.
  await info(page).getByLabel('Resistance', { exact: true }).fill('4.7')
  await info(page).getByLabel('Resistance unit', { exact: true }).selectOption('kΩ')
  await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click()
  await clickContact(page, 'terminal:A:10')
  await expect(workspaceCanvas(page)).toHaveAttribute('title', /same|distinct|occupied/i)
  expect(await exportedNativeGraph(page)).toEqual(original)
  const second = await hoverContact(page, 'terminal:A:14')
  await expect.poll(async () => (await nativeSceneEvidence(page)).preview).toBe(true)
  const beforeOrbit = await nativeSceneEvidence(page)
  await page.mouse.down({ button: 'right' }); await page.mouse.move(second.x + 30, second.y + 18, { steps: 8 }); await page.mouse.up({ button: 'right' })
  await expect.poll(async () => (await nativeSceneEvidence(page)).camera).not.toEqual(beforeOrbit.camera)
  expect(await exportedNativeGraph(page)).toEqual(original)
  await page.getByRole('button', { name: 'View TOP', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'View TOP', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // A right click creates draft intent only. Backspace removes the last bend.
  const corner = await hoverContact(page, 'terminal:A:13')
  await page.mouse.click(corner.x, corner.y, { button: 'right' }); await workspaceCanvas(page).press('Backspace')
  expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  await clickContact(page, 'terminal:A:14')
  const placed = await exportedNativeGraph(page), resistor = placed.modules.find(module => module.type === 'GENERIC_RESISTOR')
  if (!resistor || resistor.mount?.kind !== 'breadboard-flexible') throw new Error('Two native hole clicks did not create a canonical flexible resistor.')
  expect(placed.schema_version).toBe('1.2'); expect(resistor.properties?.resistanceOhms).toBe(4700)
  expect(resistor.mount.contacts.map(binding => [binding.pinId, binding.contactId])).toEqual([['A', 'terminal:A:10'], ['B', 'terminal:A:14']])
  expect(placed.connections).toEqual([])
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(placed)
  // Select through the actual physical body. Pin handles edit one endpoint only.
  const body = await projectModuleCenter(page, resistor.id)
  await page.mouse.click(body.x, body.y)
  await expect.poll(async () => (await nativeSceneEvidence(page)).handles).toBe(true)
  const pin = await projectFlexibleHandle(page, 'pin-1'), target = await projectContact(page, 'BB', 'terminal:A:15')
  await page.mouse.move(pin.x, pin.y); await page.mouse.down()
  expect(await workspaceCanvas(page).evaluate(element=>element.hasPointerCapture(1)),'pin handle owns the native pointer').toBe(true)
  await page.mouse.move(target.x, target.y, { steps: 12 })
  const pinEditHint=await workspaceCanvas(page).getAttribute('title')
  await page.mouse.up()
  const reanchored = await exportedNativeGraph(page), changed = reanchored.modules.find(module => module.id === resistor.id)
  if (changed?.mount?.kind !== 'breadboard-flexible') throw new Error('Reanchored flexible module is missing.')
  expect(changed.mount.contacts.map(binding => binding.contactId),`Reanchor diagnostic: ${pinEditHint}`).toEqual(['terminal:A:10', 'terminal:A:15'])
  const lift = await projectFlexibleHandle(page, 'lift')
  await page.mouse.move(lift.x, lift.y); await page.mouse.down(); await page.mouse.move(lift.x, lift.y - 10, { steps: 6 }); await page.mouse.up()
  const lifted = await exportedNativeGraph(page), raised = lifted.modules.find(module => module.id === resistor.id)
  if (raised?.mount?.kind !== 'breadboard-flexible') throw new Error('Lifted flexible module is missing.')
  expect(raised.mount.contacts).toEqual(changed.mount.contacts); expect(raised.mount.bodyPose.position.y).toBeGreaterThan(changed.mount.bodyPose.position.y)
  await choose(page, 'output', 'GENERIC_LED'); await clickContact(page, 'terminal:C:25'); await workspaceCanvas(page).press('Escape')
  expect(await exportedNativeGraph(page)).toEqual(lifted)
  const nativeBeforeReload = await nativeSceneEvidence(page)
  expect(nativeBeforeReload.trustedPointerDowns).toBeGreaterThanOrEqual(6)
  expect(nativeBeforeReload.trustedContextMenus).toBeGreaterThanOrEqual(1)
  await page.getByRole('button', { name: 'Open Project Manager', exact: true }).click()
  const projects = page.getByRole('region', { name: 'Project Manager', exact: true })
  await projects.getByLabel('New project name', { exact: true }).fill(`Native placement ${randomUUID()}`)
  await projects.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(projects.getByRole('button', { name: 'Save circuit as new server document', exact: true })).toBeEnabled()
  await projects.getByRole('button', { name: 'Save circuit as new server document', exact: true }).click()
  await expect(projects.getByLabel('Server save status', { exact: true })).toContainText('saved')
  await page.reload(); await sceneReady(page)
  await expect(projects.getByLabel('Server save status', { exact: true })).toContainText('saved')
  expect(await exportedNativeGraph(page)).toEqual(lifted)
  expect(errors).toEqual([])
  await testInfo.attach('native-placement-evidence', { body: Buffer.from(JSON.stringify({ graph: lifted, nativeBeforeReload, sceneAfterReload: await nativeSceneEvidence(page) })), contentType: 'application/json' })
})

test('generic property drafts and native drag-drop produce compact forms and actual multiview visual evidence at both viewport sizes', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await openBoard(page)
  for (const [group, type, label] of [['passive', 'GENERIC_RESISTOR', 'Resistor'], ['passive', 'GENERIC_CAPACITOR', 'Capacitor'], ['active', 'GENERIC_DIODE', 'Diode'], ['active', 'GENERIC_ZENER_DIODE', 'Zener Diode'], ['output', 'GENERIC_LED', 'LED'], ['output', 'GENERIC_BUZZER', 'Buzzer'], ['active', 'GENERIC_BJT', 'Transistor']] as const) {
    await choose(page, group, type)
    await expect(info(page).getByRole('heading', { name: label, exact: true })).toBeVisible()
    await expect(info(page).getByRole('button', { name: 'Update component properties', exact: true })).toHaveCount(1)
    await expect(info(page).getByRole('button', { name: 'Edit leads', exact: true })).toHaveCount(0)
    if (type === 'GENERIC_LED') { await info(page).getByRole('button', { name: 'Blue LED', exact: true }).click(); await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click() }
    if (type === 'GENERIC_CAPACITOR') { await info(page).getByLabel('Type', { exact: true }).selectOption('ELECTROLYTIC'); await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click(); await expect(info(page).locator('[data-thumbnail-type]')).toHaveAttribute('data-thumbnail-type', 'GENERIC_CAPACITOR_ELECTROLYTIC') }
    await expect(info(page).locator('.component-thumbnail img')).toBeVisible()
    await screenshot(page, testInfo, `${type.toLowerCase()}-draft`)
    expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
    await workspaceCanvas(page).press('Escape')
  }
  // A native HTML drag/drop selects pin A only; a subsequent native click commits B.
  await page.locator('[data-group="passive"]').click()
  const point = await projectContact(page, 'BB', 'terminal:C:20'), canvas = workspaceCanvas(page), rect = await canvas.boundingBox()
  if (!rect) throw new Error('Missing actual canvas bounds.')
  await page.locator('[data-component-type="GENERIC_CAPACITOR"]').dragTo(canvas, { targetPosition: { x: point.x - rect.x, y: point.y - rect.y } })
  await expect(info(page)).toBeVisible(); expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  await expect(canvas).toHaveAttribute('title', /Choose pin B|second hole/i)
  await clickContact(page, 'terminal:C:24')
  const dropped = await exportedNativeGraph(page), capacitor = dropped.modules.find(module => module.type === 'GENERIC_CAPACITOR')
  if (capacitor?.mount?.kind !== 'breadboard-flexible') throw new Error('Native drop followed by a hole click did not create the capacitor.')
  expect(capacitor.mount.contacts.map(binding => binding.contactId)).toEqual(['terminal:C:20', 'terminal:C:24'])
  await choose(page, 'passive', 'GENERIC_RESISTOR'); await clickContact(page, 'terminal:E:30'); await clickContact(page, 'terminal:E:31')
  const standing = (await exportedNativeGraph(page)).modules.find(module => module.type === 'GENERIC_RESISTOR')
  if (standing?.mount?.kind !== 'breadboard-flexible') throw new Error('Native close-hole placement did not create a standing resistor.')
  expect(Math.abs(standing.mount.bodyPose.rotation.z)).toBeGreaterThan(60)
  await choose(page, 'output', 'GENERIC_LED')
  await info(page).getByRole('button', { name: 'Blue LED', exact: true }).click(); await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click()
  await clickContact(page, 'terminal:C:40'); await clickContact(page, 'terminal:C:41')
  const graph = await exportedNativeGraph(page), led = graph.modules.find(module => module.type === 'GENERIC_LED')
  if (led?.mount?.kind !== 'breadboard-flexible') throw new Error('Native two-pin placement did not create the blue LED.')
  expect(led.properties?.color).toBe('#3a78dc')
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
    for (const direction of ['TOP', 'FRONT', 'TOP-FRONT-RIGHT']) {
      await page.getByRole('button', { name: `View ${direction}`, exact: true }).press('Enter')
      await expect(page.getByRole('button', { name: `View ${direction}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await screenshot(page, testInfo, `${viewport.width}x${viewport.height}-${direction.toLowerCase()}`)
    }
    const center = await projectModuleCenter(page, capacitor.id)
    await page.mouse.click(center.x, center.y)
    await expect(info(page).getByRole('heading', { name: 'Capacitor', exact: true })).toBeVisible()
    await expect(info(page).locator('.component-thumbnail img')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(center.x - 65, center.y - 65); await page.mouse.down(); await page.mouse.move(center.x + 65, center.y + 65, { steps: 10 }); await page.mouse.up()
    await screenshot(page, testInfo, `${viewport.width}x${viewport.height}-closeup`)
  }
  await testInfo.attach('native-dragdrop-evidence', { body: Buffer.from(JSON.stringify({ graph, scene: await nativeSceneEvidence(page) })), contentType: 'application/json' })
})

test('native diode and Zener spans, persisted manual bend, body tilt and whole-assembly Move preserve stable pin bonds',async({page},testInfo)=>{
 test.setTimeout(180_000);await openBoard(page)
 for(const [type,row] of [['GENERIC_DIODE','A'],['GENERIC_ZENER_DIODE','J']] as const){
  const rotations=[]
  for(const [first,last] of [[10,11],[24,28],[38,46]]){
   await choose(page,'active',type);await clickContact(page,`terminal:${row}:${first}`);await clickContact(page,`terminal:${row}:${last}`)
   const module=(await exportedNativeGraph(page)).modules.filter(m=>m.type===type).at(-1)!
   if(module?.mount?.kind!=='breadboard-flexible')throw Error(`Native ${type} span did not commit.`)
   expect(module.mount.contacts.map(c=>c.pinId)).toEqual(['A','K']);expect(module.mount.contacts.map(c=>c.contactId)).toEqual([`terminal:${row}:${first}`,`terminal:${row}:${last}`]);rotations.push(module.mount.bodyPose.rotation.z)
  }
  expect(new Set(rotations).size).toBeGreaterThan(1)
 }
 await choose(page,'passive','GENERIC_RESISTOR');await clickContact(page,'terminal:A:50');await hoverContact(page,'terminal:A:58')
 const bend=await hoverContact(page,'terminal:C:57');await page.mouse.click(bend.x,bend.y,{button:'right'});await clickContact(page,'terminal:A:58')
 const bent=(await exportedNativeGraph(page)).modules.find(m=>m.type==='GENERIC_RESISTOR')!
 if(bent?.mount?.kind!=='breadboard-flexible')throw Error('Manual bend placement did not commit.')
 expect(bent.mount.leads[1].controlPoints.length).toBeGreaterThan(1)
 const tilt=await projectFlexibleHandle(page,'tilt');await page.mouse.move(tilt.x,tilt.y);await page.mouse.down();await page.mouse.move(tilt.x+8,tilt.y,{steps:8});await page.mouse.up()
 const tilted=(await exportedNativeGraph(page)).modules.find(m=>m.id===bent.id)!
 if(tilted.mount?.kind!=='breadboard-flexible')throw Error('Tilted assembly disappeared.')
 expect(tilted.mount.contacts).toEqual(bent.mount.contacts);expect(tilted.mount.bodyPose.rotation.z).not.toBe(bent.mount.bodyPose.rotation.z)
 await page.getByRole('button',{name:'Move',exact:true}).click()
 const body=await projectModuleCenter(page,bent.id),a=await projectContact(page,'BB','terminal:A:50'),b=await projectContact(page,'BB','terminal:A:51')
 await page.mouse.move(body.x,body.y);await page.mouse.down();await page.mouse.move(body.x+b.x-a.x,body.y+b.y-a.y,{steps:10});await page.mouse.up()
 const moved=await exportedNativeGraph(page),module=moved.modules.find(m=>m.id===bent.id)!
 expect(module.mount!.contacts.map(c=>c.contactId)).toEqual(['terminal:A:51','terminal:A:59']);expect(module.mount!.kind).toBe('breadboard-flexible')
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await exportedNativeGraph(page)).modules.find(m=>m.id===bent.id)).toEqual(tilted)
 await page.getByRole('button',{name:'Redo',exact:true}).click();expect(await exportedNativeGraph(page)).toEqual(moved)
 await page.getByRole('button',{name:'Select',exact:true}).click();await page.getByRole('button',{name:'View TOP-FRONT-RIGHT',exact:true}).press('Enter')
 await screenshot(page,testInfo,'native-axial-families-and-authored-bend')
})
