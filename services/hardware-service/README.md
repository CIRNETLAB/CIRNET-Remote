# Lab-First Hardware Service

Local-only process on the Mini PC, behind FastAPI. Authority: ../../docs/ARCHITECTURE.md. HardwareStation abstracts Virtual/Physical; physical start requires scan/safety, typed plan, routing and guarded power-up. Unavailable hardware never returns a physical success.

RPC 2.0 lives in contracts/hardware/v2/rpc_v2.proto. Parent v1 protos are deprecated. Install from root: pip install -e . -e './services/hardware-service[dev]'. Generate before startup: python scripts/generate_hardware_rpc.py. Generated bindings are ignored, not committed. R3 registers lifecycle handlers. Bind only loopback/Unix.

Physical operations validate current driver/profile capabilities, scan freshness (configurable software TTL, default 30 seconds), runtime safety, endpoint/resource coverage, guarded power/watchdog policy and acknowledged driver actions. Faults attempt safe fallback and invalidate plans; missing driver reports OFFLINE/hardware_applied=false. Runtime hardware interlock/watchdog must protect independently of software polling. Two virtual breadboards are editor fixtures, not a physical capacity claim. R5 integrates digital execution; until then virtual execution/capture reports NOT_IMPLEMENTED.

Tests: pytest -q services/hardware-service/tests tests/contracts. Codegen tests compile/inspect v2 in temporary directories and verify deterministic output. Stable domain errors: HARDWARE_UNAVAILABLE, INVALID_STATE, UNSAFE, SAFETY_INDETERMINATE, UNEXECUTABLE, RESOURCE_CONFLICT, PROTOCOL_MISMATCH, TIMEOUT, DRIVER_ERROR. The browser never talks directly to this service.
