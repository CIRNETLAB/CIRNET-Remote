# Contracts and FPGA proposal conformance

[Tiếng Việt](../../vi/architecture/fpga-contract-conformance.md) · [Full original note](../../architecture/fpga-contract-conformance.md)

The FPGA proposal revision 2.1 remains a design reference pending hardware and ABI review. The current [system architecture](system.md) and installed Contracts govern runtime behavior. System 0.1.4 selects Contracts 0.1.2 and FPGA scaffold 0.1.2. Hardware RPC 2.0, logical FPGA `1.0-scaffold` and register map `1.0-reserved` are independent version domains. The historical M5 ruling explains why the unavailable example's `2.0-scaffold` target label cannot satisfy the registered logical envelope.

## Executable boundary

| Proposal area | Current software boundary |
| --- | --- |
| Execution plan | The internal `InstrumentationExecutionPlan` 1.0 binds experiment, station, power profile, approved endpoints and routing, allocations, clock, generator, capture and test vectors. The compiler routes infrastructure. `PhysicalExecutionPlan` has no registered alias. |
| Board execution image | Hardware Service validates the plan and delegates to its driver boundary. There is no board image encoder or proven ABI for atomic install, version and identity. |
| Safety and freshness | Safety, topology and functional results are independent. Physical execution rechecks live safety before energizing. The API fences control by owner, session, tab, revision and reservation generation. Physical scan validity uses a separate monotonic TTL, default 30 seconds, and resets on safe-state, reset or fault. Board boot epochs, bridge purge and reset/replay behavior still require proof. |
| Control and capabilities | RPC exposes safe-state, scan, prepare, routing, guarded power, arm, start, Stop and capture. The API retains the lease until safe cleanup is acknowledged. Failed cleanup quarantines the lease. Public capabilities omit private routing and report unavailable channels as zero. Logical RTL commands do not define a physical wire opcode. |
| Capture | NCAP v1 seals bounded digital events with byte count and SHA-256 and keeps owner-scoped generations. Sampled-v2 contracts and synthetic fixtures define format and quality metadata. A sampled producer, FPGA memory lifecycle and measured acquisition remain open. |

Serial and USB/SPI placeholders report `HARDWARE_UNAVAILABLE`. Browser contracts contain no raw FPGA register, MUX, SDRAM or transport controls. A missing physical driver reports zero execution slots and zero instrument channels. The scaffold demonstrates logical and behavioral conformance. Board timing and CDC closure, independent electrical inhibition, ADC/DAC, SDRAM, calibration and acquisition quality need hardware evidence.

The FPGA repository owns the pinned slang and Icarus/vvp RTL gates. Remote checks the selected FPGA source against installed Contracts and Hardware. The original note retains the proposal concept mapping and the dated M5 compatibility ruling. See [physical lab safety](physical-lab-safety.md) and [signal domains and simulation](signal-domains-and-simulation.md).
