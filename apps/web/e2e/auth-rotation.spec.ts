import {test,expect,type Page,type WebSocket} from '@playwright/test'
import {parseStructural} from '../src/contracts/structural'

const eventSocket=(page:Page)=>page.waitForEvent('websocket',socket=>new URL(socket.url()).pathname==='/ws/events')

async function holdRotationUntilPriorSocketCloses(page:Page,path:string,prior:WebSocket){
 const closed=prior.isClosed()?Promise.resolve():new Promise<void>(resolve=>prior.once('close',()=>resolve()))
 let calls=0
 await page.route(`**${path}`,async route=>{
  calls++
  // The server commits/revokes the prior session before its response is delivered.
  const response=await route.fetch();expect(response.status()).toBe(200)
  await closed
  await route.fulfill({response})
 })
 return()=>calls
}

test('committed login and same-principal claim survive prior native socket closure before their responses',async({page,context})=>{
 const initial=eventSocket(page)
 await page.goto('/');const guestSocket=await initial
 await expect(page.locator('.connection-status')).toContainText('connected')
 const loginCalls=await holdRotationUntilPriorSocketCloses(page,'/api/auth/login',guestSocket)
 await page.getByRole('button',{name:'Open account',exact:true}).click()
 await page.getByLabel('Username',{exact:true}).fill('e2e_admin')
 await page.getByLabel('Password',{exact:true}).fill(process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!)
 const next=eventSocket(page)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()
 const userSocket=await next
 await expect(page.locator('.connection-status')).toContainText('connected')
 const claimCalls=await holdRotationUntilPriorSocketCloses(page,'/api/auth/claim-guest',userSocket)
 await page.getByLabel('Confirm guest data transfer',{exact:true}).check()
 const claimed=eventSocket(page)
 await page.getByRole('button',{name:'Claim guest data',exact:true}).click()
 await expect(page.getByLabel('Guest data transfer',{exact:true})).toBeHidden()
 await claimed
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()
 await expect(page.locator('.connection-status')).toContainText('connected')
 const session=parseStructural('SessionView',await(await context.request.get('/api/auth/session')).json())
 expect(session.authenticated).toBe(true);expect(session.principal?.username).toBe('e2e_admin');expect(session.claim_available).toBe(false)
 expect(loginCalls()).toBe(1);expect(claimCalls()).toBe(1)
})
