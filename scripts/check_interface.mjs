/** Run a product-owned npm gate in the explicitly selected Interface artifact. */
import {spawn} from 'node:child_process'
import {interfaceProduct} from './e2e-interface-target.mjs'
const command=process.argv[2]
if(!['check:boundaries','test','build'].includes(command))throw new Error('Select an Interface product gate: check:boundaries, test or build.')
const product=interfaceProduct()
const child=spawn(process.platform==='win32'?'npm.cmd':'npm',['run',command],{
  cwd:product,env:process.env,stdio:'inherit',windowsHide:true,shell:process.platform==='win32',
})
const code=await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',code=>accept(code??1))})
process.exit(code)
