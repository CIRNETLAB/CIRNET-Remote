# Lab-First Hardware Service

Local-only process on the Mini PC, behind FastAPI. Authority: ../../docs/ARCHITECTURE.md. HardwareStation abstracts Virtual/Physical; physical start requires scan/safety, typed plan, routing and guarded power-up. Unavailable hardware never returns a physical success.

RPC 2.0 lives in contracts/hardware/v2/rpc_v2.proto. Parent v1 protos are deprecated. Install the hardware package with dev extras and shared root contracts package. Generate before startup: python scripts/generate_hardware_rpc.py from repository root. Generated Python bindings are ignored, not committed. R3 registers lifecycle handlers; the R2 server still has no handlers. Bind only loopback/Unix.

Tests: pytest -q services/hardware-service/tests tests/contracts. Codegen tests compile/inspect v2 in temporary directories and verify deterministic output. Stable domain errors: HARDWARE_UNAVAILABLE, INVALID_STATE, UNSAFE, SAFETY_INDETERMINATE, UNEXECUTABLE, RESOURCE_CONFLICT, PROTOCOL_MISMATCH, TIMEOUT, DRIVER_ERROR. The browser never talks directly to this service.
