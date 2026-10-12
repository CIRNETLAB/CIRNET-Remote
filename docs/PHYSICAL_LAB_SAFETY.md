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
