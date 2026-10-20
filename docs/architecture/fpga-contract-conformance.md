# Current Contracts and FPGA proposal revision 2.1

Status: IMPLEMENTED mapping and software conformance checks; OPEN-HARDWARE.
Authority is [Lab-First v3.1](../ARCHITECTURE.md), with schema identity/visibility
from [manifest.json](../../contracts/manifest.json). The retained
FPGA proposal revision 2.1 (`docs/Hardware/net-Circuit-Remote_FPGA_Architecture_Lab-First_v2.md`)
remains PROPOSED / NEEDS_REVIEW. This current mapping does not rewrite its
historical statement about which inputs were supplied when it was drafted.

| Proposal concept | Current source and mapping | Evidence boundary / remaining gate |
| --- | --- | --- |
| PhysicalExecutionPlan; CT-01/02 | The executable internal contract is InstrumentationExecutionPlan 1.0 in `contracts/physical-lab/lab.schema.json`; compiler is `services/api/app/services/lab_compiler.py`. It binds station/experiment identity, power/safety profile, infrastructure endpoint/routing/instrument allocations and clock/generator/capture/test-vector configuration. | PhysicalExecutionPlan is not a registered alias. No contract rename or automatic conversion is implied. The plan routes approved lab endpoints, never expected student internal wiring. |
| FpgaExecutionImage | Proposed board-local compiled image. The current Hardware Service validates InstrumentationExecutionPlan and delegates to its physical driver boundary. | No image encoder, schema or proven board ABI exists. OPEN-ABI: selected driver must define image validation, atomic install, identity/revision and compatibility. |
| Safety versus topology/function; CT-03–06 | Independent SafetyVerificationResult, TopologyVerificationResult, FunctionalVerificationResult and ExecutionDecision. `ExecutionPolicy` blocks UNSAFE/INDETERMINATE; physical station rechecks live safety before energizing. | Mismatch/unknown identity alone does not become a correctness-based energy gate. Software fixtures/RTL assertions do not certify electrical cut-off or measured protection. |
| Execution identity and freshness | API ties control to owner/session/tab, reservation generation and aggregate revision. Physical station invalidates plan/scan on safe-state/reset/fault, checks station/experiment identity and uses a monotonic scan TTL (default 30 s). Virtual station has its own cancellation generation. | These are distinct software fences. OPEN-FRESHNESS: FPGA boot/session epoch, image/route revision, reset replay protection, bridge purge and measured watchdog behavior are not established by an API reservation UUID or logical sequence number. |
| Control lifecycle; CT-07–10 | Hardware RPC 2.0 exposes safe-state, scan, prepare, routing, guarded power, arm, start, Stop and capture. `contracts/fpga-protocol/control.schema.json` defines internal logical envelope 1.0-scaffold; controller RTL has abstract SAFE/scan/prepare/route/power/arm/run/fault behavior. | Accepted RPC is not electrical application. API keeps a lease until acknowledged safe cleanup; failed cleanup quarantines it. OPEN-HARDWARE: independent inhibit/watchdog latency and board reset behavior require physical evidence. |
| Capability and versions; CT-11 | StationCapabilities 1.0 separates Hardware RPC, FPGA protocol, firmware and profile versions. PublicStationCapabilities excludes private routing details. Channels=0 and runtime_reconfiguration_supported=false remain authoritative. | Graph 1.2, Lab 1.0, RPC 2.0, logical 1.0-scaffold and binary/register status are independent. The target example is unavailable; no channel target becomes a runtime guarantee. |
| Capture lifecycle and memory ownership | Current NCAP v1 producer is bounded digital events, persisted as owner-scoped sealed files with CaptureMetadata 1.0, byte count and SHA256. Capture retirement retains historical generation identity. | It does not implement the proposal's FPGA memory ALLOCATED/ARMED/CAPTURING/SEALED_COMPLETE/SEALED_PARTIAL protocol. OPEN-ABI: memory handles, atomic seal, valid-prefix/loss status, retention and readback rules need a versioned driver/producer mapping. Raw SDRAM addresses remain private. |
| Sample time and quality; CT-21 | sampled-v2 AnalogCaptureHeader/Descriptor 2.0 and codecs describe generation, source/provenance, channels/calibration, rational sample rate, clock reference/anchor, exact loss/gaps/invalidity/clipping and termination reason. Shared synthetic fixtures test structural/semantic/binary agreement. | Decoder/helper availability does not supply samples. There is no default runtime sampled-v2 network source or ADC/DAC producer. NCAP v1 remains unchanged; adding v2 requires explicit capability, versioned transport and real producer evidence. |
| Transport, scan, routing and instruments | FpgaTransport is private to Hardware Service. SerialFpgaTransport and UsbSpiFpgaTransport truthfully raise HARDWARE_UNAVAILABLE. Physical station without driver reports unavailable, zero slots and zero instrument channels. | OPEN-ABI: binary framing, opcodes/register widths/addresses, sequence/replay negotiation, corruption detection, selected bridge and profile. OPEN-HARDWARE: selected ADC/AFE/DAC/SDRAM, board pinout/protection, CDC, synthesis, timing, calibration and bandwidth/overflow measurements. |

The register-map document remains **1.0-reserved**. Logical command IDs used by
RTL simulations are not a frozen physical wire opcode. Public Web Contracts
never gain raw FPGA register/MUX/SDRAM addresses, USB/SPI frames or private RPC
controls from this mapping. Sampled capture fixtures remain labelled
`simulation` / `synthetic_fixture`; they do not become measured evidence.

Software conformance is covered by
`tests/contracts/test_fpga_proposal_mapping.py`, existing sampled-format and
instrument-capability tests, physical-station lifecycle/freshness tests and
FPGA scaffold tests. These check plan naming/visibility, rejection of private
transport fields, truthful unavailable adapters and producer separation.
`tests/fpga/test_lab_first_control.py` has optional local RTL compiler/simulation
checks whose availability/results must be reported separately. Passing a
software suite does not close OPEN-ABI, OPEN-FRESHNESS or OPEN-HARDWARE.

Future hardware promotion requires a selected versioned ICD and driver/profile,
actual image/capture fixtures from that hardware, reset/replay/stale-evidence
and safe-state conformance tests, synthesis/timing/CDC closure, electrical
protection tests and measured acquisition/output quality. Until then no ADC,
DAC, analog routing, SDRAM or physical station capability is advertised.
