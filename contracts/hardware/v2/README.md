# Hardware RPC 2.0

Package netcircuit.hardware.v2. Typed InstrumentationExecutionPlan/ExecutionDecision align with physical-lab 1.0. StartExecution accepts station/experiment identity only. ConfigureVirtualCircuit is virtual-only; physical stations refuse it. Stable error enum; consumers validate domain JSON results.

Generate at build: python scripts/generate_hardware_rpc.py after installing grpcio-tools. Default output contracts/generated is shared by API/Hardware Service, ignored and never committed. Generate before a wheel/package build. One proto plus deterministic relative-import normalization gives repeatable generation within a toolchain. Runtime grpcio/protobuf must match the generating toolchain.

Handlers validate ownership, state and domain payloads; server binds loopback/Unix behind FastAPI. No raw register writer. Parent v1 protos are deprecated and unavailable to new consumers.
