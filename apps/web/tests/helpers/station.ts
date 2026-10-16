import type { StationDescriptor } from '../../src/contracts/generated/dto'
import type { ExperimentRecord } from '../../src/types/lab'

export function stationFixture(station_id='v1',mode:StationDescriptor['mode']='simulation',state:StationDescriptor['state']='ready'): StationDescriptor {
  return { station_id, mode, state, capabilities: {
    schema_version: '1.0', station_id, mode, available: true,
    virtual_digital: true, virtual_analog: false, physical_digital: false, physical_analog_routing: false, physical_execution_slots: 0,
    topology_scan_supported: false, safety_gate_supported: false, guarded_run_supported: false, component_resolution_modes: [],
    instrument_capabilities: {
      logic_analyzer: { channels: 4, runtime_reconfiguration_supported: false },
      oscilloscope: { channels: 0, runtime_reconfiguration_supported: false },
      generator: { channels: 0, runtime_reconfiguration_supported: false },
    },
    hardware_rpc_version: '2.0', fpga_protocol_version: 'UNAVAILABLE', firmware_version: 'virtual-events-1.0', hardware_profile_version: 'virtual-1.0',
  } }
}

export function runningExperiment(state: ExperimentRecord['state'] = 'RUNNING'): ExperimentRecord {
  return { schema_version: '1.0', experiment_id: 'e1', station_id: 'v1', circuit_id: 'c1', assignment_id: null, mode: 'simulation',
    state, state_history: ['CREATED', state], revision: 1, execution_decision: null, safety_verification: null, topology_verification: null,
    functional_verification: { schema_version: '1.0', status: 'NOT_EVALUATED', issues: [] }, capture: null, error_code: null, queue_position: null, lease_expires_at: 10000 }
}
