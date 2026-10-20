import { fileCommand } from './workbench-ui'
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { observeNativeScene, sceneReady, workspaceCanvas, projectContact, projectModuleCenter, projectFlexibleHandle, projectFormerBodyHandle, exportedNativeGraph, nativeSceneEvidence, nativeComponentBody } from './native-scene'
import {readFileSync} from 'node:fs'
import type {CircuitGraph} from '../src/types/circuit'
import {build} from 'esbuild'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import type {solveFlexibleMount as Solver} from '../src/electrical/flexibleGeometry'

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
  const expand = page.getByRole('button', { name: 'Expand Ribbon', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.locator(`[data-group="${group}"]`).click()
  await page.locator(`[data-component-type="${type}"]`).click()
  await expect(info(page)).toBeVisible()
}
async function clickContact(page: Page, id: string) { const point = await projectContact(page, 'BB', id); await page.mouse.click(point.x, point.y) }
async function hoverContact(page: Page, id: string) { const point = await projectContact(page, 'BB', id); await page.mouse.move(point.x, point.y); return point }
async function screenshot(page: Page, testInfo: TestInfo, name: string) { const path = testInfo.outputPath(`${name}.png`); await page.screenshot({ path }); await testInfo.attach(name, { path, contentType: 'image/png' }) }
async function settleCamera(page:Page){let previous='',stable=0;await expect.poll(async()=>{const camera=JSON.stringify((await nativeSceneEvidence(page)).camera.map(value=>Math.round(value*1e7)));stable=camera===previous?stable+1:0;previous=camera;return stable},{intervals:[100]}).toBeGreaterThanOrEqual(2)}

test('native two-pin placement preserves exact contacts, camera, automatic reanchor and persisted undo history without body-pose tools', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
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
  // A right click cannot introduce a component bend override.
  const corner = await hoverContact(page, 'terminal:A:13')
  await page.mouse.click(corner.x, corner.y, { button: 'right' })
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
  expect((await nativeSceneEvidence(page)).handleNames).toEqual(['pin-0','pin-1'])
  for(const name of ['lift','tilt'] as const){
    const point=await projectFormerBodyHandle(page,resistor.id,name)
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+12,point.y-12,{steps:6});await page.mouse.up()
    const current=(await exportedNativeGraph(page)).modules.find(module=>module.id===resistor.id)!
    if(current.mount?.kind!=='breadboard-flexible')throw Error('Component disappeared at former body handle.')
    expect(current.mount.bodyPose.position.y).toBe(changed.mount.bodyPose.position.y)
    expect(current.mount.bodyPose.rotation.x).toBe(changed.mount.bodyPose.rotation.x);expect(current.mount.bodyPose.rotation.z).toBe(changed.mount.bodyPose.rotation.z)
    expect(current.mount.contacts.map(binding=>binding.pinId)).toEqual(changed.mount.contacts.map(binding=>binding.pinId))
  }
  const lifted=await exportedNativeGraph(page)
  await choose(page, 'output', 'GENERIC_LED'); await clickContact(page, 'terminal:C:25'); await workspaceCanvas(page).press('Escape')
  expect(await exportedNativeGraph(page)).toEqual(lifted)
  const nativeBeforeReload = await nativeSceneEvidence(page)
  expect(nativeBeforeReload.trustedPointerDowns).toBeGreaterThanOrEqual(6)
  expect(nativeBeforeReload.trustedContextMenus).toBeGreaterThanOrEqual(1)
  await fileCommand(page, 'Open Project')
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
  test.setTimeout(600_000) // Draft captures plus native video at two viewport sizes on software WebGL.
  await page.setViewportSize({ width: 1280, height: 720 })
  await openBoard(page)
  for (const [group, type, label] of [['passive', 'GENERIC_RESISTOR', 'Resistor'], ['passive', 'GENERIC_CAPACITOR', 'Ceramic Capacitor'], ['passive', 'GENERIC_CAPACITOR_ELECTROLYTIC', 'Electrolytic Capacitor'], ['active', 'GENERIC_DIODE', 'Diode'], ['active', 'GENERIC_ZENER_DIODE', 'Zener Diode'], ['output', 'GENERIC_LED', 'LED'], ['output', 'GENERIC_BUZZER', 'Buzzer'], ['active', 'GENERIC_BJT', 'Transistor']] as const) {
    await choose(page, group, type)
    await expect(info(page).getByRole('heading', { name: label, exact: true })).toBeVisible()
    await expect(info(page).getByRole('button', { name: 'Update component properties', exact: true })).toHaveCount(1)
    await expect(info(page).getByRole('button', { name: 'Edit leads', exact: true })).toHaveCount(0)
    if (type === 'GENERIC_LED') { await info(page).getByRole('button', { name: 'Blue LED', exact: true }).click(); await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click() }
    if (type === 'GENERIC_CAPACITOR' || type === 'GENERIC_CAPACITOR_ELECTROLYTIC') {
      await expect(info(page).getByLabel('Type', { exact: true })).toHaveCount(0)
      await info(page).getByLabel('Capacitance', { exact: true }).fill(type === 'GENERIC_CAPACITOR' ? '100' : '47')
      await info(page).getByLabel('Capacitance unit', { exact: true }).selectOption(type === 'GENERIC_CAPACITOR' ? 'nF' : 'µF')
      await info(page).getByRole('button', { name: 'Update component properties', exact: true }).click()
      await expect(info(page).locator('[data-thumbnail-type]')).toHaveAttribute('data-thumbnail-type', type)
    }
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
  expect(capacitor.mount.contacts.map(binding => binding.pinId)).toEqual(['A', 'B'])
  expect(capacitor.properties?.capacitorType).toBe('CERAMIC')
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
  await choose(page,'passive','GENERIC_CAPACITOR_ELECTROLYTIC')
  await expect(info(page).getByLabel('Type',{exact:true})).toHaveCount(0)
  await info(page).getByLabel('Capacitance',{exact:true}).fill('47');await info(page).getByLabel('Capacitance unit',{exact:true}).selectOption('µF')
  await info(page).getByRole('button',{name:'Update component properties',exact:true}).click()
  // At 1280px the contextual panel covers E51; dismiss it through its real UI
  // before sending the two exact native contact clicks.
  await info(page).getByRole('button',{name:'Close Component Info',exact:true}).click()
  await expect(info(page)).toBeHidden()
  await clickContact(page,'terminal:E:50');await clickContact(page,'terminal:E:51')
  const electro=(await exportedNativeGraph(page)).modules.find(module=>module.type==='GENERIC_CAPACITOR_ELECTROLYTIC')!
  if(electro?.mount?.kind!=='breadboard-flexible')throw Error('Compact electrolytic did not commit.')
  expect(electro.mount.bodyPose.rotation.x).toBe(0);expect(electro.mount.bodyPose.rotation.z).toBe(0)
  expect(electro.mount.contacts.map(binding=>binding.pinId)).toEqual(['PLUS','MINUS']);expect(electro.properties?.capacitorType).toBe('ELECTROLYTIC');expect(electro.properties?.capacitanceFarads).toBe(47e-6)
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
    for (const direction of ['TOP', 'FRONT', 'TOP-FRONT-RIGHT']) {
      await page.getByRole('button', { name: `View ${direction}`, exact: true }).press('Enter')
      await expect(page.getByRole('button', { name: `View ${direction}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await settleCamera(page)
      await screenshot(page, testInfo, `${viewport.width}x${viewport.height}-${direction.toLowerCase()}`)
    }
    const center = await projectModuleCenter(page, capacitor.id)
    await page.mouse.click(center.x, center.y)
    await expect(info(page).getByRole('heading', { name: 'Ceramic Capacitor', exact: true })).toBeVisible()
    await expect(info(page).locator('.component-thumbnail img')).toBeVisible()
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(center.x - 65, center.y - 65); await page.mouse.down(); await page.mouse.move(center.x + 65, center.y + 65, { steps: 10 }); await page.mouse.up()
    await screenshot(page, testInfo, `${viewport.width}x${viewport.height}-closeup`)
    await page.getByRole('button',{name:'Zoom To View Entire Circuit',exact:true}).click()
    await info(page).getByRole('button',{name:'Close Component Info',exact:true}).click()
    const can=await projectModuleCenter(page,electro.id);await page.mouse.click(can.x,can.y)
    // Selecting the body opens Info again; keep the following area gesture on
    // the canvas rather than on that contextual overlay.
    await info(page).getByRole('button',{name:'Close Component Info',exact:true}).click()
    await page.getByRole('button',{name:'Zoom To Area',exact:true}).click();await page.mouse.move(can.x-65,can.y-65);await page.mouse.down();await page.mouse.move(can.x+65,can.y+65,{steps:10});await page.mouse.up()
    await screenshot(page,testInfo,`${viewport.width}x${viewport.height}-compact-electrolytic`)
  }
  await testInfo.attach('native-dragdrop-evidence', { body: Buffer.from(JSON.stringify({ graph, scene: await nativeSceneEvidence(page) })), contentType: 'application/json' })
})

test('native diode and Zener spans and whole-assembly Move preserve stable pin bonds without manual bend or body-pose controls',async({page},testInfo)=>{
 test.setTimeout(600_000);await openBoard(page)
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
 await choose(page,'passive','GENERIC_RESISTOR')
 // The Info panel overlays the right-hand holes in this view. Closing it keeps
 // both placement and right-click assertions on the actual workspace canvas.
 await info(page).getByRole('button',{name:'Close Component Info',exact:true}).click()
 await expect(info(page)).toBeHidden()
 await clickContact(page,'terminal:A:50');await hoverContact(page,'terminal:A:58')
 const bend=await hoverContact(page,'terminal:C:57');await page.mouse.click(bend.x,bend.y,{button:'right'});await clickContact(page,'terminal:A:58')
 const bent=(await exportedNativeGraph(page)).modules.find(m=>m.type==='GENERIC_RESISTOR')!
 if(bent?.mount?.kind!=='breadboard-flexible')throw Error('Automatic placement did not commit.')
 expect(bent.mount.version).toBe(2);expect((await nativeSceneEvidence(page)).handleNames).toEqual(['pin-0','pin-1'])
 await expect(info(page).getByRole('button',{name:/lift|tilt|edit leads/i})).toHaveCount(0)
 const tilted=bent
 await info(page).getByRole('button',{name:'Close Component Info',exact:true}).click()
 await expect(info(page)).toBeHidden()
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

test('native explicit rebuild previews historical geometry, cancels and applies with one Undo while preserving saved overrides',async({page},testInfo)=>{
 test.setTimeout(600_000);await openBoard(page)
 const graph=JSON.parse(readFileSync(new URL('../../../contracts/design-models/fixtures/component-mechanics-legacy.json',import.meta.url),'utf8')) as CircuitGraph,module=graph.modules.find(module=>module.mount)!
 await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:'historical-component.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(graph))})
 await page.getByRole('button',{name:'Zoom To View Entire Circuit',exact:true}).click()
 const before=await exportedNativeGraph(page),point=await projectModuleCenter(page,module.id);await page.mouse.click(point.x,point.y)
 const originalBody=await nativeComponentBody(page,module.id)
 await expect(info(page).getByRole('button',{name:'Rebuild component geometry',exact:true})).toBeVisible()
 await info(page).getByRole('button',{name:'Rebuild component geometry',exact:true}).click()
 await expect(info(page).getByRole('button',{name:'Apply rebuilt component geometry',exact:true})).toBeVisible();expect(await exportedNativeGraph(page)).toEqual(before)
 const compactBody=await nativeComponentBody(page,module.id);expect(compactBody.model).not.toBe(originalBody.model);expect(compactBody.size).not.toEqual(originalBody.size)
 await screenshot(page,testInfo,'historical-rebuild-preview')
 await info(page).getByRole('button',{name:'Cancel component geometry rebuild',exact:true}).click();expect(await exportedNativeGraph(page)).toEqual(before);expect((await nativeComponentBody(page,module.id)).size).toEqual(originalBody.size)
 await info(page).getByRole('button',{name:'Rebuild component geometry',exact:true}).click();await info(page).getByRole('button',{name:'Apply rebuilt component geometry',exact:true}).click()
 const rebuilt=await exportedNativeGraph(page),changed=rebuilt.modules.find(candidate=>candidate.id===module.id)!
 const current=JSON.parse(readFileSync(new URL('../src/data/editorParts.json',import.meta.url),'utf8')).parts.find((part:{editorType:string})=>part.editorType===module.type)
 expect(changed.mount?.version).toBe(2);expect(changed.mount?.partRevision).toBe(current.revision);expect(changed.mount?.packageRevision).toBe(current.package.revision);expect(changed.mount?.contacts).toEqual(module.mount?.contacts);expect(changed.properties).toEqual(module.properties);expect(rebuilt.connections).toEqual(before.connections);expect((await nativeComponentBody(page,module.id)).size).toEqual(compactBody.size)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await exportedNativeGraph(page)).toEqual(before);expect((await nativeComponentBody(page,module.id)).size).toEqual(originalBody.size)
 await page.getByRole('button',{name:'Redo',exact:true}).click();expect(await exportedNativeGraph(page)).toEqual(rebuilt);expect((await nativeComponentBody(page,module.id)).size).toEqual(compactBody.size)
 await screenshot(page,testInfo,'historical-rebuilt-geometry')
})

test('native place, reanchor, Escape and delete cycles release component GPU geometry and stale handles',async({page},testInfo)=>{
 test.setTimeout(600_000);await openBoard(page)
 const samples=[]
 for(let cycle=0;cycle<3;cycle++){
  await choose(page,'passive','GENERIC_RESISTOR');await clickContact(page,'terminal:C:20');await clickContact(page,'terminal:C:24')
  const graph=await exportedNativeGraph(page),module=graph.modules.find(module=>module.type==='GENERIC_RESISTOR')!
  const body=await projectModuleCenter(page,module.id);await page.mouse.click(body.x,body.y)
  const pin=await projectFlexibleHandle(page,'pin-1'),target=await projectContact(page,'BB','terminal:C:25')
  await page.mouse.move(pin.x,pin.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:10});await workspaceCanvas(page).press('Escape');await page.mouse.up()
  expect(await exportedNativeGraph(page)).toEqual(graph)
  const again=await projectModuleCenter(page,module.id);await page.mouse.click(again.x,again.y);await workspaceCanvas(page).press('Delete')
  expect((await exportedNativeGraph(page)).modules).toHaveLength(1)
  await expect.poll(async()=>(await nativeSceneEvidence(page)).handles).toBe(false)
  samples.push((await nativeSceneEvidence(page)).memory)
 }
 expect(samples[2].geometries).toBeLessThanOrEqual(samples[0].geometries);expect(samples[2].textures).toBeLessThanOrEqual(samples[0].textures)
 await testInfo.attach('native-gpu-lifecycle',{body:Buffer.from(JSON.stringify(samples)),contentType:'application/json'})
})

test('actual unselected component closeups show automatic axial templates and upright radial proportions',async({page},testInfo)=>{
 test.setTimeout(600_000);await openBoard(page);await page.setViewportSize({width:1920,height:1080})
 const solverPath=resolve('.test-build/native-mechanics-solver.mjs')
 await build({stdin:{contents:"export {solveFlexibleMount} from './src/electrical/flexibleGeometry'",resolveDir:process.cwd(),loader:'ts'},outfile:solverPath,bundle:true,platform:'node',format:'esm',packages:'external'})
 const {solveFlexibleMount}=await import(pathToFileURL(solverPath).href) as {solveFlexibleMount:typeof Solver}
 const board={id:'BB',type:'BREADBOARD',position:{x:0,y:0,z:0}}
 const cases=[['resistor-standing','GENERIC_RESISTOR',11],['resistor-horizontal','GENERIC_RESISTOR',13],['diode-standing','GENERIC_DIODE',11],['diode-horizontal','GENERIC_DIODE',13],['zener-standing','GENERIC_ZENER_DIODE',11],['zener-horizontal','GENERIC_ZENER_DIODE',13],['electrolytic-upright','GENERIC_CAPACITOR_ELECTROLYTIC',11],['ceramic-upright','GENERIC_CAPACITOR',11],['led-upright','GENERIC_LED',11]] as const
 for(const [name,type,last] of cases){
  const solution=solveFlexibleMount(type,'BB','terminal:C:10',`terminal:C:${last}`,[board]);expect(solution.valid,solution.reason).toBe(true)
  const graph={schema_version:'1.2',circuit_id:`gallery-${name}`,modules:[board,{id:'PART',type,mount:solution.mount,properties:type==='GENERIC_RESISTOR'?{resistanceOhms:4700,tolerancePercent:1}:undefined}],connections:[]}
  await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:`${name}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(graph))})
  await page.getByRole('button',{name:'View TOP-FRONT-RIGHT',exact:true}).press('Enter');await settleCamera(page);await page.getByRole('button',{name:'Zoom To View Entire Circuit',exact:true}).click()
  const close=page.getByRole('button',{name:'Close Component Info',exact:true});if(await close.isVisible())await close.click()
  const point=await projectModuleCenter(page,'PART');await page.getByRole('button',{name:'Zoom To Area',exact:true}).click()
  await page.mouse.move(point.x-45,point.y-45);await page.mouse.down();await page.mouse.move(point.x+45,point.y+45,{steps:10});await page.mouse.up()
  await expect.poll(async()=>(await nativeSceneEvidence(page)).handles).toBe(false)
  const path=testInfo.outputPath(`${name}.png`);await workspaceCanvas(page).screenshot({path});await testInfo.attach(name,{path,contentType:'image/png'})
 }
})
