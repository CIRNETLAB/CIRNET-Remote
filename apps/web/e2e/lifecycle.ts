import { readFile,writeFile,rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'
export async function restartApiProcess() {
  const directory=process.env.NETCIRCUIT_E2E_DATA_DIR
  if(!directory) throw new Error('The owned real API harness is required for process restart.')
  const before=JSON.parse(await readFile(resolve(directory,'backend.json'),'utf8')) as {pid:number;generation:number}
  const id=randomUUID()
  const temporary=resolve(directory,`restart-${id}.tmp`)
  await writeFile(temporary,JSON.stringify({id,action:'restart'}))
  await rename(temporary,resolve(directory,`restart-${id}.json`))
  let result:{ok:boolean;pid:number;generation:number;message?:string}|undefined
  await expect.poll(async()=>{
    try {result=JSON.parse(await readFile(resolve(directory,`reply-${id}.json`),'utf8'));return true}
    catch(error) {if(error instanceof SyntaxError||typeof error==='object'&&error!==null&&'code'in error&&error.code==='ENOENT')return false;throw error}
  },{timeout:30_000}).toBe(true)
  if(!result?.ok) throw new Error(result?.message??'API restart failed.')
  expect(result.pid).not.toBe(before.pid);expect(result.generation).toBe(before.generation+1)
  return result
}
