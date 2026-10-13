# Physical Lab Safety Contract

Canonical authority: ARCHITECTURE.md. Safety and correctness are independent; unknown identity is not automatically unsafe.

| Boundary | Required behavior | Electrical parameters |
|---|---|---|
| Supply | current limiting, current sensing, fast cutoff, staged energization | TBD_BY_HARDWARE_DESIGN |
| Drive | tri-state default, protected digital drive, contention protection | TBD_BY_HARDWARE_DESIGN |
| Switching | routing default-open, safe switching, preserve student wiring | TBD_BY_HARDWARE_DESIGN |
| Startup | guarded power-up after fresh scan/safety/applied executable plan | TBD_BY_HARDWARE_DESIGN |
| Runtime | watchdog, heartbeat, fault interlock, runtime protection | TBD_BY_HARDWARE_DESIGN |
| Cleanup | safe-state timeout, disabled sources/clock/generator, release or quarantine | TBD_BY_HARDWARE_DESIGN |

Faults: VCC/GND short, hazardous contention, polarity/voltage/current risk, failed protection, stale scan/plan, driver disconnect/error, timeout/protocol mismatch. UNSAFE/INDETERMINATE prevents power-up/start. Missing driver cannot acknowledge electrical safety: hardware_applied=false, unavailable. Failed safe cleanup quarantines rather than releasing electrical resources.

Safe opaque/wrong components can run guarded only when protection/endpoint executability are demonstrated; observed behavior determines PASS/FAIL/PARTIAL/NO_RESPONSE. Require schematic, selected part datasheets/pin mapping and measurements before electrical safety claims. State-machine/RTL tests establish control invariants only.

Post-R7 observations require valid detected node/connection/pin references, unique pin IDs and opaque identity UNKNOWN. Malformed driver evidence becomes DRIVER_ERROR with safe fallback before routing/power-up. TopologyResolver maps reference endpoints to actual observed student nodes; unresolved required endpoints block executability, while topology mismatch/ambiguity and assessment remain separate from electrical safety.

Generator baseline settings are checked in the execution plan before guarded power-up. Live updates require declared runtime support, RUNNING, owner/active lease, fresh driver safety and specified profile limits. No ADC/DAC/AFE design means zero Scope/Generator channels and no live Apply. Capability slots=2 is admission-test evidence only, never proof of safe electrical parallelism; actual profiles require independent protected partitions. All missing electrical limits remain TBD_BY_HARDWARE_DESIGN.
