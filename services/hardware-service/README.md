# Hardware Service

This local-only process owns HardwareStation, FPGA transport and the Lab-First safety lifecycle on the Mini PC. Current authority: ../../docs/ARCHITECTURE.md. Physical start requires scan/safety/plan/routing/guarded power-up. R2 versions RPC; R3 implements lifecycle. Scaffold/codegen below describes pre-migration source, not physical Run approval.

## Current scaffold

- `VirtualHardwareStation` is usable for early Web/backend integration.
- `PhysicalHardwareStation` intentionally reports unavailable when no driver is provided; it does not fake successful hardware actions.
- Protobuf contracts live in `contracts/hardware/`.
- `server.py` creates the local gRPC server shell, but service bindings are intentionally not registered until generated Protobuf modules and RPC handlers are implemented.

## Generate Protobuf bindings later

From the repository root, after installing `grpcio-tools`:

```bash
python -m grpc_tools.protoc \
  -I contracts/hardware \
  --python_out=services/hardware-service/hardware_service/generated \
  --grpc_python_out=services/hardware-service/hardware_service/generated \
  contracts/hardware/*.proto
```

The Hardware Service should normally bind only to localhost/Unix-domain transport behind the Application Backend.
