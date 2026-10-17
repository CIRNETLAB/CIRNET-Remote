import type {CircuitModule as RigidModule} from '../../contracts/generated/dto'
import type {CircuitConnection,CircuitGraph,CircuitModule} from '../../types/circuit'
import {isFlexibleMount} from '../../electrical/flexibleGeometry'

/** Preserve readable legacy versions; adding flexible geometry is an explicit upgrade. */
export function withCircuitModules(graph:CircuitGraph,modules:CircuitModule[],connections:CircuitConnection[]=graph.connections):CircuitGraph{
 if(graph.schema_version==='1.2'||modules.some(module=>isFlexibleMount(module.mount)||module.physicalDescriptor!==undefined))return{...graph,schema_version:'1.2',modules,connections}
 const legacy=modules.filter((module):module is RigidModule=>!isFlexibleMount(module.mount))
 return{...graph,modules:legacy,connections}
}
