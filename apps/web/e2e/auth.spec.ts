import { test,expect,type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const password=()=>`test-${randomUUID()}`
async function account(page:Page) {await page.getByRole('button',{name:'Open account',exact:true}).click()}
async function login(page:Page,username:string,secret:string) {
  await account(page)
  await page.getByLabel('Username',{exact:true}).fill(username)
  await page.getByLabel('Password',{exact:true}).fill(secret)
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()
}
async function createUser(page:Page,username:string,secret:string,role:'STUDENT'|'INSTRUCTOR') {
  await page.getByLabel('New username',{exact:true}).fill(username)
  await page.getByLabel('Display name',{exact:true}).fill(username)
  await page.getByLabel('Initial password',{exact:true}).fill(secret)
  await page.getByLabel('New user role',{exact:true}).selectOption(role)
  await page.getByRole('button',{name:'Create user',exact:true}).click()
  await expect(page.getByLabel(`Role for ${username}`,{exact:true})).toHaveValue(role)
}

test('real login, explicit guest claim, logout and account controls preserve the workbench canvas',async({page,context})=>{
  await page.goto('/')
  const canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true})
  await expect(canvas).toBeVisible()
  await canvas.evaluate(element=>element.setAttribute('data-auth-canvas','preserved'))
  await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:'auth-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema_version:'1.0',circuit_id:'auth-draft',modules:[],connections:[],metadata:{name:'Auth draft'}}))})
  await expect(page.locator('.project-title')).toContainText('Auth draft')
  const guest=await (await context.request.get('/api/auth/session')).json()
  const created=await context.request.post('/api/experiments',{headers:{Origin:'http://127.0.0.1:14173','X-CSRF-Token':guest.csrf_token},data:{station_id:'virtual-station-01',circuit_graph:{schema_version:'1.0',circuit_id:'guest-created',modules:[],connections:[]}}})
  expect(created.status()).toBe(201)
  const experiment=await created.json()
  await login(page,'e2e_admin',process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!)
  await expect(page.locator('.project-title')).not.toContainText('Auth draft')
  await expect(page.getByRole('region',{name:'User administration'})).toBeVisible()
  const before=await (await context.request.get('/api/experiments')).json()
  expect(before.some((record:{experiment_id:string})=>record.experiment_id===experiment.experiment_id)).toBe(false)
  await expect(page.getByRole('button',{name:'Claim guest data',exact:true})).toBeDisabled()
  await page.getByLabel('Confirm guest data transfer',{exact:true}).check()
  await page.getByRole('button',{name:'Claim guest data',exact:true}).click()
  await expect(page.getByLabel('Guest data transfer',{exact:true})).toBeHidden()
  const after=await (await context.request.get('/api/experiments')).json()
  expect(after.some((record:{experiment_id:string})=>record.experiment_id===experiment.experiment_id)).toBe(true)
  const cookie=(await context.cookies()).find(cookie=>cookie.name==='netcircuit_session')!
  expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Lax');expect(cookie.path).toBe('/')
  expect(await page.evaluate(()=>document.cookie)).not.toContain('netcircuit_session')
  const active=await (await context.request.get('/api/auth/session')).json()
  const stored=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))
  expect(stored).not.toContain(active.csrf_token);expect(stored).not.toContain(cookie.value)
  await page.getByRole('button',{name:'Sign out',exact:true}).click()
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Close account',exact:true}).click()
  await expect(canvas).toHaveAttribute('data-auth-canvas','preserved')
  await expect(page.locator('.project-title')).not.toContainText('Auth draft')
})

test('administrator creates users and revocation removes a live student session without remounting its canvas',async({page,browser})=>{
  const suffix=randomUUID().slice(0,8),student=`student_${suffix}`,instructor=`teacher_${suffix}`,secret=password()
  await page.goto('/');await login(page,'e2e_admin',process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!)
  await createUser(page,student,secret,'STUDENT');await createUser(page,instructor,password(),'INSTRUCTOR')
  const studentContext=await browser.newContext({baseURL:'http://127.0.0.1:14173'}),studentPage=await studentContext.newPage()
  try {
    await studentPage.goto('/');await login(studentPage,student,secret)
    await expect(studentPage.getByRole('region',{name:'User administration'})).toBeHidden()
    await studentPage.getByRole('button',{name:'Close account',exact:true}).click()
    const canvas=studentPage.getByLabel('Three-dimensional circuit workspace',{exact:true})
    await canvas.evaluate(element=>element.setAttribute('data-auth-canvas','student-preserved'))
    await expect(studentPage.locator('.connection-status')).toContainText('connected')
    const denied=await studentContext.request.get('/api/admin/users');expect(denied.status()).toBe(403)
    await page.getByRole('button',{name:`Disable ${student}`,exact:true}).click()
    await expect(page.getByRole('button',{name:`Enable ${student}`,exact:true})).toBeVisible()
    await expect(studentPage.getByRole('button',{name:'Open account',exact:true})).toHaveText('Account')
    await expect(canvas).toHaveAttribute('data-auth-canvas','student-preserved')
    await account(studentPage);await expect(studentPage.getByRole('button',{name:'Sign in',exact:true})).toBeVisible()
  } finally {await studentContext.close()}
})
