import { fileCommand, expectEventConnection } from './workbench-ui'
import {test,expect,type Page} from '@playwright/test'
import {parseStructural} from '../src/contracts/structural'

type ContextProbe={gl:WebGL2RenderingContext;extension:WEBGL_lose_context;draws:number;successfulDraws:number;losses:number;restores:number;trustedLoss:boolean;trustedRestore:boolean}
type ProbedCanvas=HTMLCanvasElement&{contextProbe?:ContextProbe}

async function exportedGraph(page:Page){
 const pending=page.waitForEvent('download');await fileCommand(page, 'Export');const download=await pending,stream=await download.createReadStream()
 if(!stream)throw new Error('The exported graph stream is unavailable.')
 const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk))
 return parseStructural('CircuitGraph',JSON.parse(Buffer.concat(chunks).toString('utf8')))
}

test('native WebGL context loss and restoration resume actual drawing without replacing canvas, graph, history or UI',async({page},testInfo)=>{
 test.setTimeout(90_000)
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('/');await expectEventConnection(page)
 const graph={schema_version:'1.0',circuit_id:'native-webgl-recovery',modules:[{id:'S',type:'DIGITAL_SWITCH',position:{x:0,y:0,z:0},properties:{state:false}},{id:'L',type:'LED',position:{x:3,y:0,z:0}}],connections:[{source:'S.OUT',destination:'L.IN'}],metadata:{name:'Native graphics recovery',opaque_extension:{retain:['exact',7]}}}
 await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:'graphics.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(graph))});await expect(page.locator('.project-title')).toContainText('Native graphics recovery')
 await page.getByRole('button',{name:'Open Inspector',exact:true}).click();const inspector=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Component editor',exact:true})});await expect(inspector).toBeVisible();await inspector.getByLabel('Select component').selectOption('L');await inspector.getByLabel('Component X',{exact:true}).fill('4');await inspector.getByLabel('Component X',{exact:true}).press('Tab')
 await page.getByRole('button',{name:'Move',exact:true}).click();await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Redo',exact:true})).toBeDisabled()
 const before=await exportedGraph(page),canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true})
 expect(before.modules.find(module=>module.id==='L')?.position?.x).toBe(4)
 await inspector.evaluate(element=>element.setAttribute('data-recovery-ui','same'))
 await canvas.evaluate(element=>{
  const canvas=element as ProbedCanvas,gl=canvas.getContext('webgl2')
  if(!gl||gl.isContextLost())throw new Error('An active native WebGL2 context is required.')
  const extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw new Error('Native WEBGL_lose_context is required by this release gate.')
  const probe:ContextProbe={gl,extension,draws:0,successfulDraws:0,losses:0,restores:0,trustedLoss:false,trustedRestore:false};canvas.contextProbe=probe;canvas.dataset.recoveryCanvas='same'
  canvas.addEventListener('webglcontextlost',event=>{probe.losses++;probe.trustedLoss=event.isTrusted})
  canvas.addEventListener('webglcontextrestored',event=>{probe.restores++;probe.trustedRestore=event.isTrusted})
  // Observe the real methods and always invoke their original native implementation.
  const observed=(draw:()=>void)=>{draw();probe.draws++;if(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR)probe.successfulDraws++}
  const elements=gl.drawElements.bind(gl),arrays=gl.drawArrays.bind(gl),elementsInstanced=gl.drawElementsInstanced.bind(gl),arraysInstanced=gl.drawArraysInstanced.bind(gl)
  gl.drawElements=(...args:Parameters<WebGL2RenderingContext['drawElements']>)=>observed(()=>elements(...args))
  gl.drawArrays=(...args:Parameters<WebGL2RenderingContext['drawArrays']>)=>observed(()=>arrays(...args))
  gl.drawElementsInstanced=(...args:Parameters<WebGL2RenderingContext['drawElementsInstanced']>)=>observed(()=>elementsInstanced(...args))
  gl.drawArraysInstanced=(...args:Parameters<WebGL2RenderingContext['drawArraysInstanced']>)=>observed(()=>arraysInstanced(...args))
 })
 await page.getByRole('button',{name:'Zoom Out',exact:true}).click();await expect.poll(()=>canvas.evaluate(element=>(element as ProbedCanvas).contextProbe!.successfulDraws)).toBeGreaterThan(0)
 await canvas.evaluate(element=>(element as ProbedCanvas).contextProbe!.extension.loseContext())
 await expect.poll(()=>canvas.evaluate(element=>{const probe=(element as ProbedCanvas).contextProbe!;return {lost:probe.gl.isContextLost(),events:probe.losses,trusted:probe.trustedLoss}})).toEqual({lost:true,events:1,trusted:true})
 await expect(page.locator('.system-message').getByRole('alert').filter({hasText:'Graphics context interrupted'})).toBeVisible()
 const drawsAtLoss=await canvas.evaluate(element=>(element as ProbedCanvas).contextProbe!.successfulDraws)
 await canvas.evaluate(element=>(element as ProbedCanvas).contextProbe!.extension.restoreContext())
 await expect.poll(()=>canvas.evaluate(element=>{const probe=(element as ProbedCanvas).contextProbe!;return {lost:probe.gl.isContextLost(),events:probe.restores,trusted:probe.trustedRestore}})).toEqual({lost:false,events:1,trusted:true})
 await expect.poll(()=>canvas.evaluate(element=>(element as ProbedCanvas).contextProbe!.successfulDraws)).toBeGreaterThan(drawsAtLoss)
 await expect(page.locator('.system-message').getByRole('alert').filter({hasText:'Graphics context interrupted'})).toHaveCount(0)
 await expect(canvas).toHaveAttribute('data-recovery-canvas','same');await expect(inspector).toHaveAttribute('data-recovery-ui','same');await expect(inspector.getByLabel('Select component')).toHaveValue('L');await expect(inspector.getByLabel('Component X',{exact:true})).toHaveValue('4');await expect(page.getByRole('button',{name:'Move',exact:true})).toHaveAttribute('aria-pressed','true');expect(await exportedGraph(page)).toEqual(before)
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(inspector.getByLabel('Component X',{exact:true})).toHaveValue('3');await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(inspector.getByLabel('Component X',{exact:true})).toHaveValue('4');expect(await exportedGraph(page)).toEqual(before);expect(errors).toEqual([])
 const evidence=await canvas.evaluate(element=>{const probe=(element as ProbedCanvas).contextProbe!;return {extension:'WEBGL_lose_context',contextLost:probe.gl.isContextLost(),losses:probe.losses,restores:probe.restores,trustedLoss:probe.trustedLoss,trustedRestore:probe.trustedRestore,nativeDrawCalls:probe.draws,successfulNativeDrawCalls:probe.successfulDraws}})
 await testInfo.attach('native-webgl-recovery',{body:Buffer.from(JSON.stringify({...evidence,successfulDrawsBeforeLoss:drawsAtLoss})),contentType:'application/json'})
})
