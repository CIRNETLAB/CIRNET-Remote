/** Prefix compatibility for tools that can run before Contracts is installed. */
export function exportEnvironment(environment=process.env) {
  const result={...environment}
  for(const key of Object.keys(environment)){
    if(!key.startsWith('CIRNET_')&&!key.startsWith('NETCIRCUIT_'))continue
    const suffix=key.slice(key.indexOf('_')+1)
    const value=environment['CIRNET_'+suffix]??environment['NETCIRCUIT_'+suffix]
    result['CIRNET_'+suffix]=result['NETCIRCUIT_'+suffix]=value
  }
  return result
}
