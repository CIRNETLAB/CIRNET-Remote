# Physical lab safety

[Tiếng Việt](../../vi/architecture/physical-lab-safety.md) · [Canonical safety contract](physical-lab-safety-contract.md) · [System architecture](system.md)

Safety and correctness are independent. Unknown component identity remains `UNKNOWN`. Running a safe unknown circuit requires demonstrated protection and executable endpoint bindings and uses `RUN_GUARDED`.

| Boundary | Required behavior | Electrical parameters |
| --- | --- | --- |
| Supply | Limit and sense current, cut off quickly, energize in stages | `TBD_BY_HARDWARE_DESIGN` |
| Drive | Default to tri-state and protect digital drive and contention | `TBD_BY_HARDWARE_DESIGN` |
| Switching | Default routing to open, switch safely and preserve student wiring | `TBD_BY_HARDWARE_DESIGN` |
| Startup | Guard power-up with fresh scan, safety result and applied executable plan | `TBD_BY_HARDWARE_DESIGN` |
| Runtime | Enforce watchdog, heartbeat, fault interlock and runtime protection | `TBD_BY_HARDWARE_DESIGN` |
| Cleanup | Bound safe-state transition, disable sources/clock/generator and release or quarantine | `TBD_BY_HARDWARE_DESIGN` |

Faults include VCC/GND shorts, hazardous contention, polarity/voltage/current risk, failed protection, stale scans or plans, driver disconnect/error, timeouts and protocol mismatch. `UNSAFE` or `INDETERMINATE` prevents power-up and start. A missing driver leaves `hardware_applied=false` and reports unavailable. A failed safe cleanup retains quarantine instead of making the station available again.

The scan must provide valid node, connection and pin references and unique pin IDs. Malformed evidence yields `DRIVER_ERROR` and safe fallback before routing or power-up. `TopologyResolver` maps reference endpoints onto actual observed nodes. Unresolved required bindings yield `BLOCK_UNEXECUTABLE`. Topology mismatch and assessment remain separate diagnostics. For example, a guarded run with an opaque component can produce a functional `FAIL` without changing its already evaluated safety result. Functional outcomes include `PASS`, `FAIL`, `PARTIAL`, `NO_RESPONSE` and `NOT_EVALUATED`.

The plan validates baseline Generator settings before guarded power-up. A live change requires declared runtime support, `RUNNING`, the owner and active lease, fresh driver safety, and specified profile limits. Scope and Generator have zero channels and live Apply is unavailable in the baseline without the required ADC/DAC/AFE. Two-slot admission tests check scheduler behavior. A physical multi-slot profile requires independent protected partitions. [Control isolation](control-isolation-and-runtime-index.md) · [FPGA conformance](fpga-contract-conformance.md)

Electrical safety claims require schematics, selected-part datasheets and pin mapping, and measurements. State-machine and RTL tests establish control invariants. The [0.1.4 local release report](../history/verification/2026-11-05-cirnet-release-0.1.4.md) lists physical FPGA verification as `NOT RUN` for that run.
