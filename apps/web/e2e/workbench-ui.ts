import { expect, type Page } from '@playwright/test'

export type FileCommand = 'New' | 'Open Project' | 'Save' | 'Save As' | 'Import' | 'Export' | 'History' | 'Assignment'

/** Use the same public menu path as a person; never revive removed header controls. */
export async function fileCommand(page: Page, name: FileCommand) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menu', { name: 'File', exact: true }).getByRole('menuitem', { name, exact: true }).click()
}

export async function selectRun(page: Page) {
  await page.getByRole('tab', { name: 'Run', exact: true }).click()
  return page.getByRole('toolbar', { name: 'Execution controls', exact: true })
}

/** Connection detail moved into Inspector; retain the real event connection assertion. */
export async function expectEventConnection(page: Page) {
  const accountClose = page.getByRole('button', { name: 'Close account', exact: true })
  const accountWasOpen = await accountClose.isVisible()
  if (accountWasOpen) await accountClose.click()
  const close = page.getByRole('button', { name: 'Close Inspector', exact: true })
  const wasOpen = await close.isVisible()
  if (!wasOpen) await page.getByRole('button', { name: 'Open Inspector', exact: true }).click()
  await expect(page.locator('.window-note').filter({ hasText: /^Events: connected\./ })).toBeVisible()
  if (!wasOpen) await close.click()
  if (accountWasOpen) await page.getByRole('button', { name: 'Open account', exact: true }).click()
}
