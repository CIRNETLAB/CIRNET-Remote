import {cp,readdir,stat} from 'node:fs/promises'
import {basename,join} from 'node:path'

async function checkWindowsLaunchPaths(source,destination) {
  for(const entry of await readdir(source,{withFileTypes:true})) {
    const input=join(source,entry.name),output=join(destination,entry.name)
    const directory=entry.isDirectory()||entry.isSymbolicLink()&&(await stat(input)).isDirectory()
    if(directory)await checkWindowsLaunchPaths(input,output)
    else if(/\.exe$/i.test(entry.name)&&output.length>259)throw new Error(
      'Windows cannot launch copied executable paths longer than 259 characters. Choose a shorter external parent with NETCIRCUIT_ARTIFACTS_DIR before running E2E.')
  }
}

/** Copy installed browser bytes before launch. The composition root supplies a
 * fresh destination from the shared artifact allocator. Windows headless GPU
 * children can write debug.log beside their executable despite log-file flags.
 * Public PLAYWRIGHT_BROWSERS_PATH resolves the copied cache without depending
 * on private Playwright APIs, platform layouts or a hardcoded browser revision. */
export async function copyBrowserRuntime(source,destination,{platform=process.platform}={}) {
  let entries
  try {entries=await readdir(source,{withFileTypes:true})}
  catch(error) {throw new Error('Installed Playwright browser cache is unavailable. Run npm run test:e2e:install first.',{cause:error})}
  const installed=[]
  for(const entry of entries) {
    if(entry.name.startsWith('.'))continue
    if(entry.isDirectory()||entry.isSymbolicLink()&&(await stat(join(source,entry.name))).isDirectory())installed.push(entry.name)
  }
  if(!installed.length)throw new Error('Installed Playwright browser cache is empty. Run npm run test:e2e:install first.')
  if(platform==='win32')for(const name of installed)await checkWindowsLaunchPaths(join(source,name),join(destination,name))
  for(const name of installed)await cp(join(source,name),join(destination,name),{
    recursive:true,dereference:true,errorOnExist:true,force:false,
    filter:file=>!['debug.log','chrome_debug.log'].includes(basename(file).toLowerCase()),
  })
  return destination
}
