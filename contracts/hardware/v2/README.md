# Hardware RPC 2.0

Package netcircuit.hardware.v2. Typed InstrumentationExecutionPlan / ExecutionDecision contracts align with physical-lab 1.0; StartExecution accepts station/experiment identity only. ConfigureVirtualCircuit is explicitly virtual-only and cannot authorize physical wiring. Errors use stable enum codes rather than exception text. Domain JSON in results remains schema-validated by consumers.

Generate at build: python scripts/generate_hardware_rpc.py. Install grpcio-tools first; generated bindings are ignored and never committed. One proto file and deterministic package import normalization make generation reproducible within a toolchain. Compile/descriptor tests run generation in a temporary directory. Rebuild after RPC/toolchain changes. Runtime dependencies must be compatible with the generating grpcio/protobuf version.

The service binds loopback/Unix only behind FastAPI. R3 registers lifecycle handlers; no raw register writer is exposed. Legacy parent-directory v1 contracts are deprecated and prohibited for new consumers.
