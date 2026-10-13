# Lab-First Experiment Controller

EP4CE6E22C8N prototype, **no external SDRAM**; future EP4CE10E22C8N instrument target. Canonical authority: ../../docs/ARCHITECTURE.md.

Current rtl/top.v is a compile-safe **control scaffold / electrical integration placeholder**. Mini PC uses Hardware Service FpgaTransport, with Serial/USB-SPI adapters unavailable until actual hardware is selected. No physical transport decoder, topology measurement, switching matrix or protection circuit exists here.

The abstract controller follows SAFE → SCANNING → SCANNED → PREPARED → ROUTED → POWERED → ARMED → RUNNING. Successful scan is observational readiness, never topology correctness. Safe condition and plan permits come from verified safety/protection integration; no boolean alone proves electrical safety.

Reset enters SAFE with routing/drive/clock off. Routing is infrastructure-only and defaults open. Drive requires explicit safe plan, route readiness, independent protection and armed watchdog; permits remain live while powered. Fault/watchdog assertion immediately gates outputs off and latches FAULT even for a short pulse; RESET after input clearance invalidates earlier scan/plan sequence. Invalid commands/sequences disable outputs. Clock uses a prepared half-period in abstract control-clock ticks, with no assumed board frequency/voltage/current.

Real implementation requires TBD_BY_HARDWARE_DESIGN: schematic and exact pins, switching/protected-output design, interlock/reset/watchdog behavior, synchronizers/reset release, input pulse requirements, clock source/constraints, supported endpoint resources and measured operating limits. Async latch logic is a simulation boundary; target-device synthesis/timing are unverified.

Simulation testbench covers reset, invalid sequences, no route/drive before guards, valid clock activity, short fault pulse, watchdog, lost routing permission, STOP, invalid command and unavailable future instruments. Local slang compilation can run without Icarus; Icarus/vvp behavioral test is mandatory in FPGA CI when installed. Neither compilation nor simulation proves electrical protection.
