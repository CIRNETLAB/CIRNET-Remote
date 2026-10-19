import { fileCommand, expectEventConnection } from './workbench-ui'
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import {readFileSync} from 'node:fs'
import { parseStructural } from '../src/contracts/structural'
const fixtures=JSON.parse(readFileSync(new URL('../../../contracts/design-models/fixtures/flexible-mounting-parity.json',import.meta.url),'utf8')) as {cases:{graph:Record<string,unknown>}[]}

test('actual authoring UI creates, reopens, updates and publishes a private Graph 1.2 assignment reference without replacing the canvas', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(120_000)
  const name = `Flexible reference ${randomUUID()}`
  const graph = parseStructural('CircuitGraphV12', { ...fixtures.cases[0]!.graph, metadata: { name, opaque: { retain: ['reference', 12] } } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open account', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('e2e_admin')
  await page.getByLabel('Password', { exact: true }).fill(process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close account', exact: true }).click()
  await expectEventConnection(page)
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'reference-1.2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect(page.locator('.project-title')).toContainText(name)
  const canvas = page.getByLabel('Three-dimensional circuit workspace', { exact: true })
  await canvas.evaluate(element => element.setAttribute('data-assignment-reference-canvas', 'same'))
  await fileCommand(page, 'Assignment')
  const panel = page.getByRole('region', { name: 'Assignments', exact: true })
  await panel.getByRole('button', { name: 'New assignment draft', exact: true }).click()
  const title = `${name} original`
  await panel.getByLabel('Assignment title', { exact: true }).fill(title)
  await panel.getByLabel('Assignment title', { exact: true }).press('Tab')
  await panel.getByLabel('Assessment policy', { exact: true }).selectOption('STRICT_TOPOLOGY')
  await panel.getByRole('button', { name: 'Use current circuit as reference', exact: true }).click()
  const id = await panel.getByLabel('Assignment ID', { exact: true }).inputValue()
  const base = `/api/v2/assignment-documents/${id}`
  const creating = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v2/assignment-documents')
  await panel.getByRole('button', { name: 'Save assignment draft', exact: true }).click()
  const create = parseStructural('AssignmentAuthoringCreateV2', (await creating).postDataJSON())
  expect(create.definition.schema_version).toBe('2.0'); expect(create.definition.reference_design_graph).toEqual(graph)
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('revision 1')
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('saved')
  const savedResponse = await context.request.get(base)
  expect(savedResponse.status()).toBe(200)
  const saved = parseStructural('AssignmentAuthoringDocumentV2', await savedResponse.json())
  expect(saved.definition.reference_design_graph).toEqual(graph); expect(saved.revision).toBe(1)
  // The UI performs its own real read; authoritative response bodies are read
  // through the context request API so router navigation cannot discard CDP data.
  // Use a distinct local value so "original" can become true only when the
  // confirmed reload has actually reached the store and rendered the form.
  await panel.getByLabel('Assignment title', { exact: true }).fill(`${name} local discard`)
  await panel.getByLabel('Assignment title', { exact: true }).press('Tab')
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('dirty')
  const reopening = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === base)
  await panel.getByRole('button', { name: 'Reload assignment draft', exact: true }).click()
  await panel.getByRole('button', { name: 'Replace assignment draft', exact: true }).click()
  const reloaded = await reopening
  expect(reloaded.status()).toBe(200); expect(await reloaded.finished()).toBeNull()
  await expect(panel.getByLabel('Assignment title', { exact: true })).toHaveValue(title)
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('saved')
  await panel.getByLabel('Assignment title', { exact: true }).fill(`${name} revised`)
  await panel.getByLabel('Assignment title', { exact: true }).press('Tab')
  const updating = page.waitForRequest(request => request.method() === 'PUT' && new URL(request.url()).pathname === base)
  await panel.getByRole('button', { name: 'Save assignment draft', exact: true }).click()
  const update = parseStructural('AssignmentAuthoringSaveV2', (await updating).postDataJSON())
  expect(update.base_revision).toBe(1); expect(update.definition.reference_design_graph).toEqual(graph)
  expect(update.definition.title).toBe(`${name} revised`)
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('revision 2')
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('saved')
  const revised = parseStructural('AssignmentAuthoringDocumentV2', await (await context.request.get(base)).json())
  expect(revised.title).toBe(`${name} revised`); expect(revised.definition.reference_design_graph).toEqual(graph)
  await panel.getByRole('button', { name: 'Publish saved assignment', exact: true }).click()
  await expect(panel.getByLabel('Assignment save status', { exact: true })).toContainText('published revision 3')
  const published = parseStructural('AssignmentAuthoringDocumentV2', await (await context.request.get(base)).json())
  expect(published.published_revision).toBe(3); expect(published.definition.reference_design_graph).toEqual(graph)
  const student = await browser.newContext({ baseURL: 'http://127.0.0.1:14173' })
  try {
    expect((await student.request.get('/api/auth/session')).status()).toBe(200)
    const response = await student.request.get(`/api/v2/assignments/${id}`)
    expect(response.status()).toBe(200)
    const view = parseStructural('AssignmentViewV2', await response.json())
    expect(view.document_kind).toBe('student'); expect(view).not.toHaveProperty('reference_design_graph'); expect(view).not.toHaveProperty('expected_behavior')
  } finally { await student.close() }
  await expect(canvas).toHaveAttribute('data-assignment-reference-canvas', 'same')
  await expect(page.locator('.project-title')).toContainText(name)
  await testInfo.attach('graph-1.2-assignment-reference', { body: Buffer.from(JSON.stringify({ assignment_id: id, revision: published.revision, published_revision: published.published_revision, graph })), contentType: 'application/json' })
})
