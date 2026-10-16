import type {CaptureMetadata} from '../../types/lab'
import type {InstrumentCommandPorts} from '../instruments/commands'

export interface ExperimentPresentationPort {
 useCapture(metadata:CaptureMetadata|null):void
 log(message:string,level:'info'|'error'):void
}
export type InstrumentControlPort=Pick<InstrumentCommandPorts,'context'|'access'|'send'|'get'>
export type GeneratorTransport=InstrumentCommandPorts['send']
export type InstrumentAccessTransport=InstrumentCommandPorts['access']
export type InstrumentCommandTransport=InstrumentCommandPorts['get']
