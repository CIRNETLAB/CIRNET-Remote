import { test,expect,type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { restartApiProcess } from './lifecycle'
import { readFile } from 'node:fs/promises'
const panel=(page:Page)=>page.getByRole('region',{name:'Project Manager',exact:true})
async function projects(page:Page){await page.getByRole('button',{name:'Open Project Manager',exact:true}).click();await expect(panel(page)).toBeVisible()}
async function importGraph(page:Page,graph:unknown){await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:'circuit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(graph))})}
async function rename(page:Page,name:string){await panel(page).getByLabel('Current circuit name',{exact:true}).fill(name);await panel(page).getByLabel('Current circuit name',{exact:true}).press('Tab')}
async function createProject(page:Page,name:string){await panel(page).getByLabel('New project name',{exact:true}).fill(name);await panel(page).getByRole('button',{name:'Create project',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Update project',exact:true})).toBeEnabled()}
async function saveAs(page:Page){await panel(page).getByRole('button',{name:'Save circuit as new server document',exact:true}).click();await expect(panel(page).getByLabel('Server save status',{exact:true})).toContainText('saved');await expect(page).toHaveURL(/\/projects\/[^/]+\/circuits\/[^/]+$/);return new URL(page.url()).pathname}
async function confirm(page:Page){await panel(page).getByRole('button',{name:'Confirm project action',exact:true}).click()}
async function login(page:Page){await page.getByRole('button',{name:'Open account',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill('e2e_admin');await page.getByLabel('Password',{exact:true}).fill(process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close account',exact:true}).click()}

test('server Save As, reload and a real API process restart preserve exact document data and the session',async({page,context})=>{
  test.setTimeout(90_000)
  await page.goto('/');await projects(page)
  const canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true})
  await canvas.evaluate(element=>element.setAttribute('data-project-navigation','preserved'))
  const graph=JSON.parse(await readFile('../../contracts/circuit-schema/examples/physical-hc08-led.json','utf8'))
  graph.metadata={...graph.metadata,name:'Original graph',unknown_extension:{nested:['retain',42]}}
  await importGraph(page,graph);await expect(page.locator('.project-title')).toContainText('Original graph')
  await createProject(page,`Persistence ${randomUUID()}`)
  const address=await saveAs(page),id=address.split('/').at(-1)!
  await expect(canvas).toHaveAttribute('data-project-navigation','preserved')
  const saved=await (await context.request.get(`/api/circuits/${id}`)).json()
  expect(saved.graph).toEqual(graph);expect(saved.revision).toBe(1)
  await page.reload();await expect(panel(page).getByLabel('Current circuit name',{exact:true})).toHaveValue('Original graph')
  await expect(panel(page).getByLabel('Server save status',{exact:true})).toContainText('saved')
  await rename(page,'Unsaved browser edit')
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export circuit JSON',exact:true}).click();await download
  await expect(panel(page).getByLabel('Server save status',{exact:true})).toContainText('dirty')
  expect((await (await context.request.get(`/api/circuits/${id}`)).json()).revision).toBe(1)
  await panel(page).getByRole('button',{name:'Save server circuit',exact:true}).click()
  await expect(panel(page).getByLabel('Server save status',{exact:true})).toContainText('revision 2')
  const principal=(await (await context.request.get('/api/auth/session')).json()).principal.principal_id
  await restartApiProcess()
  expect((await (await context.request.get('/api/auth/session')).json()).principal.principal_id).toBe(principal)
  await page.reload();await expect(panel(page).getByLabel('Current circuit name',{exact:true})).toHaveValue('Unsaved browser edit')
  const after=await (await context.request.get(`/api/circuits/${id}`)).json()
  expect(after.graph).toEqual(graph);expect(after.revision).toBe(2)
})

test('unknown and inaccessible project addresses show an error inside the mounted workspace',async({page})=>{
  await page.goto('/unknown/workspace/resource')
  await expect(panel(page).getByRole('alert')).toContainText('does not exist')
  await expect(page).toHaveURL(/\/unknown\/workspace\/resource$/)
  await expect(page.getByLabel('Three-dimensional circuit workspace',{exact:true})).toBeVisible()
  await page.goto('/projects/missing-project/circuits/missing-document')
  await expect(panel(page).getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/projects\/missing-project\/circuits\/missing-document$/)
  await expect(page.getByLabel('Three-dimensional circuit workspace',{exact:true})).toBeVisible()
})

test('two real tabs preserve a conflicting local edit and Save As leaves the original server revision intact',async({page,context})=>{
  await page.goto('/');await projects(page);await createProject(page,`Conflict ${randomUUID()}`)
  await rename(page,'Original');const address=await saveAs(page),id=address.split('/').at(-1)!
  const other=await context.newPage()
  try{
    await other.goto(address);await expect(panel(other).getByLabel('Server save status',{exact:true})).toContainText('saved')
    await rename(page,'First writer');await panel(page).getByRole('button',{name:'Save server circuit',exact:true}).click();await expect(panel(page).getByLabel('Server save status',{exact:true})).toContainText('revision 2')
    await rename(other,'Second local edit');await panel(other).getByRole('button',{name:'Save server circuit',exact:true}).click()
    await expect(panel(other).getByLabel('Server save status',{exact:true})).toContainText('conflict')
    await expect(panel(other).getByLabel('Current circuit name',{exact:true})).toHaveValue('Second local edit')
    const duplicate=await saveAs(other);expect(duplicate).not.toBe(address)
    expect((await (await context.request.get(`/api/circuits/${id}`)).json()).name).toBe('First writer')
    await panel(other).getByRole('button',{name:'Delete project',exact:true}).click();await confirm(other)
    await expect(panel(other).getByLabel('Current circuit name',{exact:true})).toHaveValue('Second local edit')
    await expect(panel(other).getByLabel('Server save status',{exact:true})).toContainText('local')
  }finally{await other.close()}
})

test('actual IndexedDB recovery survives refresh and remains private across account changes until an explicit guest claim',async({page})=>{
  await page.goto('/');await projects(page)
  const canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true});await canvas.evaluate(element=>element.setAttribute('data-project-canvas','same'))
  const name=`Private recovery ${randomUUID()}`
  await importGraph(page,{schema_version:'1.1',circuit_id:'recovery-original',modules:[],connections:[],metadata:{name,custom:{retained:true}}})
  await expect(page.locator('.project-title')).toContainText(name)
  await panel(page).getByRole('button',{name:'Checkpoint local recovery',exact:true}).click()
  await expect(panel(page).getByRole('button',{name:`Recover ${name}`,exact:true})).toBeVisible()
  await page.reload();await projects(page)
  await panel(page).getByRole('button',{name:`Recover ${name}`,exact:true}).click();await confirm(page)
  await expect(panel(page).getByLabel('Current circuit name',{exact:true})).toHaveValue(name)
  await canvas.evaluate(element=>element.setAttribute('data-project-canvas','same'))
  await login(page)
  await expect(canvas).toHaveAttribute('data-project-canvas','same')
  await expect(page.locator('.project-title')).not.toContainText(name)
  await projects(page);await expect(panel(page).getByRole('button',{name:`Recover ${name}`,exact:true})).toBeHidden()
  await page.getByRole('button',{name:'Open account',exact:true}).click();await page.getByLabel('Confirm guest data transfer',{exact:true}).check();await page.getByRole('button',{name:'Claim guest data',exact:true}).click();await expect(page.getByLabel('Guest data transfer',{exact:true})).toBeHidden();await page.getByRole('button',{name:'Close account',exact:true}).click()
  await panel(page).getByRole('button',{name:'Refresh recovery',exact:true}).click()
  await expect(panel(page).getByRole('button',{name:`Recover ${name}`,exact:true}).first()).toBeVisible()
  await panel(page).getByRole('button',{name:`Recover ${name}`,exact:true}).first().click();await confirm(page)
  await expect(panel(page).getByLabel('Current circuit name',{exact:true})).toHaveValue(name)
  await page.getByRole('button',{name:'Open account',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Close account',exact:true}).click()
  await expect(canvas).toHaveAttribute('data-project-canvas','same');await expect(page.locator('.project-title')).not.toContainText(name)
  await projects(page);await expect(panel(page).getByRole('button',{name:`Recover ${name}`,exact:true})).toBeHidden()
})
