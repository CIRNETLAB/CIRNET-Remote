# Lab-First Application API 1.0

FastAPI public boundary; authority ../../docs/ARCHITECTURE.md. Browser uses REST and owner-scoped WebSocket lifecycle events. CircuitGraph schema stays 1.0, structural validation does not authorize physical execution.

| Endpoint | Contract |
|---|---|
| GET /api/health | Existing service/mode health descriptor |
| POST /api/circuits/validate | Existing structural CircuitGraph validation |
| GET /api/stations | Existing station_id/mode/state, plus validated capabilities |
| GET /api/stations/{id}/capabilities | StationCapabilities 1.0 |
| GET /api/stations/{id}/queue | Counts/busy and caller's positions |
| POST /api/assignments | AssignmentDefinition 1.0 (201) |
| GET /api/assignments, /api/assignments/{id} | Assignment list/definition |
| POST /api/experiments | station_id, optional assignment_id; virtual circuit_graph; optional clock_config, generator_config, capture_config, test_vectors (201) |
| GET /api/experiments, /api/experiments/{id} | Owner-scoped lifecycle/result records |
| POST /api/experiments/{id}/run, /stop | Queue/admission or stop lifecycle |
| GET /api/experiments/{id}/results | Independent verification and bounded digital capture |
| POST /api/experiments/{id}/instruments | instrument/configuration; actual supported active configurations only |

Lifecycle records are schema_version 1.0 with experiment/circuit/station/assignment identity, mode, state/history, queue_position, lease_expires_at, execution_decision, safety_verification, topology_verification, functional_verification, capture and error_code. Unavailable/not-yet-observed results are null; function initially NOT_EVALUATED.

Capture metadata: schema_version, capture_id, source (simulation/hardware), instrument, encoding, available, sample_count, samples [{signal,time_ns,value}]. Bounded digital event results use JSON; no fake analog/physical acquisition. Large binary acquisition remains unavailable.

Server-issued HTTP-only netcircuit_session establishes anonymous ownership; production cookie is Secure. Session identity is not a login/RBAC claim. Full authenticated roles remain deployment work. API errors expose stable code/message; owner mismatch 403, missing 404, invalid contract 422, rate/queue 429, state/resource conflict 409, gateway unavailable 503.

WebSocket retains hello/echo and binary close 1003. New event: {type:experiment.updated, experiment:<record>}, scoped to the owner. Last owner subscription disconnect cleans active work; HTTP leases/max run time also clean abandoned work. Queues/events are bounded. One API scheduler worker V1; shared physical slot=1, independent virtual sessions bounded by workers. Failed safe cleanup quarantines persisted lease; operator recovery needs acknowledged hardware safety.

Only safety/executability gates Run. Topology diagnostics never gate; function evaluates observed signals. Initial functional comparison handles explicit expected_signals; unresolved semantic topology matching reports UNKNOWN/AMBIGUOUS instead of guessing equivalence.
