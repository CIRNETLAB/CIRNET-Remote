# Lab-First FPGA control boundary

Status: **1.0-scaffold**, software control contract only. Authority: ../../docs/ARCHITECTURE.md. The Mini PC Hardware Service owns FpgaTransport; browser/API never access FPGA commands directly.

control.schema.json defines the transport-independent logical envelope: protocol_version, sequence and operation. It does not encode bytes, a register address, CRC, routing data or a board pin. The final frame/register ABI requires selected transport hardware and measurements.

| Operation | Scaffold test ID | Required state / effect |
|---|---:|---|
| SAFE_STATE | 0 | Disable drive/routes; preserve latched FAULT |
| SCAN_BEGIN | 1 | SAFE → SCANNING; no energized drive |
| PREPARE | 2 | Successful completed scan, safe_condition, plan_valid, nonzero clock tick setting |
| ROUTE_APPLY | 3 | PREPARED + valid safe plan + routing_ready → ROUTED |
| POWER_UP | 4 | ROUTED + protection_ready + watchdog_armed + routing_ready + safe_condition + plan_valid |
| ARM | 5 | POWERED with live protected permit |
| START | 6 | ARMED with live protected permit and prepared clock |
| STOP | 7 | Disable drive/routes; preserve latched FAULT |
| RESET | 8 | Clear state/clock after fault inputs clear; invalidate earlier sequence |
| STATUS | 9 | Acknowledge current status; never enables outputs |

These numeric IDs are local RTL simulation/control-boundary IDs, **not a frozen physical packet ABI**. Decoder/framing/watchdog driver are unimplemented. Unknown/invalid sequences reject and return to SAFE; FAULT remains latched until RESET. Abstract RTL errors: OK0, INVALID_STATE1, SAFETY_BLOCK2, SCAN_FAILED3, INVALID_COMMAND4, INTERLOCK_FAULT5; Hardware RPC errors remain separate v2 codes.

scan_success means usable scan observation, never topology MATCH. A safe student wiring mismatch/unknown IC cannot be blocked by correctness. The compiler supplies approved endpoint/instrument allocations; it never sends expected internal student wiring to repair the circuit.
