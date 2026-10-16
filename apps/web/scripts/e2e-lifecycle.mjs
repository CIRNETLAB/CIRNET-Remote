async function boundedExit(closed,timeoutMs) {
  let timer
  try {
    return await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs)})])
  } finally {clearTimeout(timer)}
}

/** Close only the API process owned by this harness, using its parent pipe. */
export async function stopOwnedBackend(owned,{timeoutMs=10_000,reapTimeoutMs=5_000}={}) {
  owned.child.stdin.end()
  const stopped=await boundedExit(owned.closed,timeoutMs)
  if(stopped===null) {
    owned.child.kill()
    if(await boundedExit(owned.closed,reapTimeoutMs)===null) throw new Error('The E2E API could not be reaped after its shutdown bound.')
    throw new Error('The E2E API failed to close within its shutdown bound.')
  }
  if(stopped!==0) throw new Error(`The E2E API exited with status ${stopped} during shutdown.`)
  return stopped
}
