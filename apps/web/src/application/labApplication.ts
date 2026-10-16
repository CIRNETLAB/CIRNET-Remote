import type {ExperimentPresentationPort,GeneratorTransport,InstrumentAccessTransport,InstrumentCommandTransport,InstrumentControlPort} from './ports/lab'
import type {Experiment} from '../types/experiment'
import type {StationDescriptor} from '../types/station'
interface ExperimentState {
 readonly active:Experiment|null
 readonly currentExecution:Experiment|null
 readonly controlledExperimentId:string|null
 attachPresentation(port:ExperimentPresentationPort):()=>void
}
interface InstrumentPresentation extends ExperimentPresentationPort {attachControl(port:InstrumentControlPort):()=>void}
interface StationState {readonly executionTarget:StationDescriptor|null;readonly canExecute:boolean}
/** Composition supplies current execution authority independently of the selected historical evidence. */
export function createLabApplication(options:{experiment:ExperimentState;instrument:InstrumentPresentation;station:StationState;configureGenerator:GeneratorTransport;getInstrumentAccess:InstrumentAccessTransport;getInstrumentCommand:InstrumentCommandTransport}){
 const {experiment,instrument,station}=options
 const detachPresentation=experiment.attachPresentation({useCapture:metadata=>instrument.useCapture(metadata),log:(message,level)=>instrument.log(message,level)})
 const detachControl=instrument.attachControl({
  context:()=>({experiment:experiment.currentExecution,controlledExperimentId:experiment.controlledExperimentId,target:station.executionTarget,connected:station.canExecute}),
  access:options.getInstrumentAccess,send:options.configureGenerator,get:options.getInstrumentCommand,
 })
 instrument.useCapture(experiment.active?.capture??null)
 let disposed=false
 return {dispose(){if(disposed)return;disposed=true;detachPresentation();detachControl()}}
}
