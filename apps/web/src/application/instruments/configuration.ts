import type {CaptureConfiguration,ClockConfiguration,GeneratorConfiguration,TestVector,PublicStationCapabilities} from '../../contracts/generated/dto'
import {parseLab} from '../../contracts/validation'
import {generatorConfigurationIssue} from '../../types/station'

export interface RequestedRunConfiguration {
 capture:CaptureConfiguration
 clock:ClockConfiguration|null
 generators:GeneratorConfiguration[]
 testVectors:TestVector[]
}
export interface PreRunConfiguration {
 capture_config:CaptureConfiguration
 clock_config?:ClockConfiguration
 generator_config?:GeneratorConfiguration[]
 test_vectors?:TestVector[]
}
function freeze<T>(value:T):T {
 if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}
 return value
}
/** Requested values are validated at the I/O boundary and detached from every UI draft. */
export function buildPreRunConfiguration(draft:RequestedRunConfiguration,caps:PublicStationCapabilities):PreRunConfiguration {
 parseLab('PublicStationCapabilities',caps)
 if(!caps.available)throw new Error('Station capabilities are unavailable.')
 const capture=parseLab('CaptureConfiguration',draft.capture)
 if(capture.trigger)throw new Error('Trigger acquisition is unavailable on the current adapters; its draft is local-only.')
 if(capture.signals.length>caps.instrument_capabilities.logic_analyzer.channels)throw new Error('Capture signals exceed the declared logic analyzer channel count.')
 const configuration:PreRunConfiguration={capture_config:capture}
 if(draft.clock){
  const clock=parseLab('ClockConfiguration',draft.clock)
  if(caps.mode!=='simulation'||!caps.virtual_digital)throw new Error('Clock configuration is available only for the confirmed virtual digital clock path.')
  configuration.clock_config=clock
 }
 const channels=new Set<number>()
 for(const generator of draft.generators){
  parseLab('GeneratorConfiguration',generator)
  if(channels.has(generator.channel))throw new Error('Duplicate generator channel configuration.')
  channels.add(generator.channel)
  const capability=caps.instrument_capabilities.generator
  if(generator.channel>capability.channels)throw new Error('Generator channel is unavailable on the selected station.')
  const issue=generatorConfigurationIssue(capability,generator);if(issue)throw new Error(issue)
 }
 if(draft.generators.length)configuration.generator_config=draft.generators
 for(const vector of draft.testVectors)parseLab('TestVector',vector)
 if(draft.testVectors.length)configuration.test_vectors=draft.testVectors
 parseLab('ExperimentCreate',{station_id:caps.station_id,...configuration})
 return freeze(JSON.parse(JSON.stringify(configuration)) as PreRunConfiguration)
}
