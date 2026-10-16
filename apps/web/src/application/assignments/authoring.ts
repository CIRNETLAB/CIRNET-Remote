import type { AssignmentDefinition,CircuitGraph } from '../../contracts/generated/dto'
import { parseLab } from '../../contracts/validation'
import { parseDocumentJson } from '../../domain/document/json'
import { parseCircuitFile } from '../../domain/document/circuitFile'

export function parseBitAssignments(text:string):Record<string,0|1> {
  if(!text.trim())return {}
  const entries:[string,0|1][]=[],names=new Set<string>()
  for(const part of text.split(',')) {
    const match=/^\s*([^\s,=]+)\s*=\s*([01])\s*$/.exec(part)
    if(!match)throw new Error('Use explicit binary assignments, for example x=0, y=1.')
    const name=match[1]!
    if(names.has(name))throw new Error(`Duplicate signal ${name}.`)
    names.add(name);entries.push([name,match[2]==='1'?1:0])
  }
  return Object.fromEntries(entries)
}

export function parseAuthoringDefinition(text:string):AssignmentDefinition {
  return parseLab('AssignmentDefinition',parseDocumentJson(text))
}

export function copyReferenceDesign(definition:AssignmentDefinition,graph:CircuitGraph):AssignmentDefinition {
  return parseAuthoringDefinition(JSON.stringify({...definition,reference_design_graph:parseCircuitFile(JSON.stringify(graph))}))
}
