# Reserved FPGA register domains

Register map status: **1.0-reserved**, conceptual structure only. No addresses, word widths, pin map or binary ABI are frozen.

Reserved domains: identification/version/capabilities; safe-state/control/fault/watchdog; topology scan status; approved endpoint routing; protected drive status; experiment clock configuration; Logic Analyzer capture; Scope 2CH; Generator 2CH; Trigger; Timestamp; SDRAM Arbiter/status; CDC/domain handshakes.

Scaffold top-level control signals are synchronous handshakes/permits, not memory-mapped registers. Fault/watchdog lines asynchronously disable outputs and latch FAULT in the abstract controller; board-specific synchronization, electrical cutoff/reset behavior and timing constraints require evidence.

Hardware profile, firmware, FPGA protocol, register map and Hardware RPC versions remain independently negotiated. Capabilities stay unavailable until implemented, measured and compatible.
