# Lab-First FPGA workspace

Canonical authority: ../docs/ARCHITECTURE.md. Mini PC host boundary is FpgaTransport (serial/USB-SPI, future USB3/Ethernet), with transport-independent protocol.

EP4CE6E22C8N prototype has no external SDRAM. R7 aligns compile-safe reset/safe-state, protocol/control, topology scan, protected drive, routing, experiment clock and fault interlock.

Future EP4CE10E22C8N + external SDRAM supports Logic Analyzer, Scope 2CH + ADC/AFE and Generator 2CH + DAC/output stage with shared SDRAM arbiter, trigger/timestamps/CDC. These are target interfaces only; no working acquisition/timing/routing/protection claim. Part/pin/timing/electrical inputs: TBD_BY_HARDWARE_DESIGN.
