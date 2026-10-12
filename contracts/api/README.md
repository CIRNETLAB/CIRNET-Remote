# Application API Contract

FastAPI is the public dynamic interface for the Lab-First browser. Canonical authority: ../../docs/ARCHITECTURE.md. R4 adds assignment/experiment/queue/result contracts; R6 validates responses and displays SAFETY / TOPOLOGY / FUNCTION independently. Preserve health/station/structural CircuitGraph compatibility. Interfaces below describe pre-R4 source, not physical safety approval.

## Implemented endpoints

| Endpoint | Response |
|---|---|
| `GET /api/health` | `{status: string, service: string, hardware_mode: "simulation" \| "hardware"}` |
| `GET /api/stations` | `[{station_id: string, mode: "simulation" \| "hardware", state: "ready" \| "unavailable" \| "busy" \| "error"}]` |
| `POST /api/circuits/validate` | Circuit Graph v1.0 body; `{valid: boolean, code: string, message: string}`; HTTP 200 for valid structure, 422 for a rejected graph |
| `WS /ws/events` | JSON event envelopes described below |

Validation confirms structure only; it is not execution or electrical approval. Physical mode currently reports an unavailable station rather than simulated success.

## Frontend status adapter

The frontend keeps its presentation model separate from the station wire descriptor: error → `FAULT`, unavailable → `HARDWARE_OFFLINE`, busy → `HARDWARE_BUSY`; ready hardware → `HARDWARE_AVAILABLE`, ready simulation → `SIMULATION`. Selected targets become offline when discovery fails, events disconnect, the target disappears, or its reported mode conflicts with the explicitly selected mode. Default local simulation mode does not assert backend or simulator availability.

## Events

Implemented backend messages:

```json
{"type":"hello","service":"netcircuit-api"}
{"type":"echo","payload":"a client message"}
```

The Phase 1 client also recognizes this reserved future envelope; the backend does not emit it yet:

```json
{"type":"station.updated","station":{"station_id":"station-01","mode":"hardware","state":"busy"}}
```

Unknown/malformed messages must not update station state. Reconnection triggers fresh station discovery; callers can close the lifecycle client with `disconnect()`.

## Future backend interfaces

The frontend's typed experiment service reserves `GET /api/experiments` and `GET /api/experiments/{id}` returning `{experiment_id, circuit_id, station_id, state}` (or an array). These endpoints are **not implemented**. The approved Single Workspace frontend must not depend on them until backend support exists. Persistence, experiment actions, station reservation and capture remain subsequent-phase work.

## Single Workspace Phase 1 consumers

The migrated shell uses station discovery/events continuously and invokes structural validation from its floating Inspector. New/Open/Save operate on local schema v1 JSON (maximum 2,000,000 UTF-8 bytes); they do not imply server persistence or issue new requests. Run/Stop/Step, waveform acquisition, generator output and Hex Editor writes remain unavailable because their public contracts are absent. This migration changes no REST/WebSocket wire format.
