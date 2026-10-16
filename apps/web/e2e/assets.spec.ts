import { test,expect } from '@playwright/test'

for(const kind of ['oscilloscope','function-generator']) {
  test(`${kind} preview uses the owned imported GLB through the shared provider`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(`/${kind}-preview.html`)
    await expect(page.locator('canvas')).toHaveAttribute('data-asset-source','imported')
    await expect(page.locator('#status')).toContainText('GLB loaded')
    const canvas=page.locator('canvas');await canvas.evaluate(element=>element.setAttribute('data-preview-owner','same'))
    await page.locator('#side-view').click();await page.locator('#canvas-test').click()
    await expect(canvas).toHaveAttribute('data-preview-owner','same')
    await expect(page.locator('#status')).toContainText('CanvasTexture applied')
    expect(errors).toEqual([])
  })
}
test('missing imported instrument retains a working procedural preview with an explicit fallback status',async({page})=>{
  await page.route('**/models/oscilloscope-2ch/*.glb',route=>route.fulfill({status:503,body:'unavailable'}))
  await page.goto('/oscilloscope-preview.html')
  await expect(page.locator('canvas')).toHaveAttribute('data-asset-source','procedural')
  await expect(page.locator('#status')).toContainText('Procedural fallback')
  await expect(page.locator('#canvas-test')).toBeEnabled()
  await page.locator('#canvas-test').click()
  await expect(page.locator('#status')).toContainText('CanvasTexture applied')
})
