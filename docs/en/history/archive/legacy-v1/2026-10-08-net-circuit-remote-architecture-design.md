SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md

# net*CIRCUIT Remote — Project Architecture Design Specification

**Date:** 2026-10-08  
**Status:** Proposed — awaiting final written-spec approval  
**Repository:** `net-Circuit-Remote/net-Circuit-Remote`

---

## 1. Purpose

`net*CIRCUIT Remote` is a remote digital-electronics laboratory platform. Users interact through a Web browser, build digital circuits on a virtual breadboard-style workspace, run experiments through simulation first, and later execute the same experiment model on real logic IC hardware controlled by FPGA through a Raspberry Pi 5 application server.

The project is deliberately **Web-first, simulation-first, hardware-later**. The Web platform must reach a stable Virtual Hardware milestone before FPGA integration begins.

---

## 2. V1 Architectural Decisions

### 2.1 Main controller

- Raspberry Pi 5
- Raspberry Pi OS 64-bit
- Nginx
- systemd
- SQLite for V1

### 2.2 Frontend

- Vue 3
- TypeScript
- Vite
- Pinia
- Three.js for the interactive laboratory/breadboard workspace
- SVG and/or Canvas for wiring and digital waveform visualization

### 2.3 Application backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- REST API
- WebSocket

### 2.4 Hardware backend

- Python
- gRPC + Protobuf
- Hardware Abstraction Layer
- Hardware Station abstraction
- Simulation and physical hardware must implement compatible contracts

### 2.5 FPGA development path

#### Prototype target

- Intel/Altera Cyclone IV `EP4CE6E22C8N`
- No external SDRAM
- Used only to validate the **Experiment Controller**
- Initial scope:
  - clock/reset
  - device/version registers
  - SPI/control interface
  - GPIO
  - safe-state FSM
  - basic routing/MUX control
  - basic experiment clock

#### V1 final target

- Intel/Altera Cyclone IV `EP4CE10E22C8N`
- External SDR SDRAM
- 16-bit data bus
- **64 MB capacity**
- Single-FPGA V1 architecture
- RTL must remain portable from EP4CE6 to EP4CE10 where practical

### 2.6 Breadboard target

- V1 target: at least 2 physical breadboards
- Breadboard physical holes are not equivalent to FPGA GPIO or independent routing channels
- Routing must be represented as:

```text
Physical Contact
        ↓
Electrical Node
        ↓
Routing Resource
        ↓
MUX / Crosspoint / Switching Fabric
        ↓
FPGA-controlled Source / Destination
```

The exact routable channel count remains a hardware-design decision and must not be inferred directly from breadboard hole count.

---

## 3. Repository Strategy

The project begins as a **modular monorepo**.

Logical subsystem boundaries are established immediately so that the project can be split into multiple repositories later without redesigning the architecture.

Initial repository:

```text
net-Circuit-Remote/
├── apps/
│   └── web/
├── services/
│   ├── api/
│   └── hardware-service/
├── simulator/
│   └── circuit-simulator/
├── fpga/
│   ├── common/
│   ├── experiment-controller/
│   ├── instrument/
│   ├── simulation/
│   ├── constraints/
│   └── quartus/
├── contracts/
│   ├── circuit-schema/
│   ├── api/
│   ├── hardware/
│   └── fpga-protocol/
├── device-library/
│   ├── logic-ic/
│   ├── instruments/
│   └── breadboards/
├── deployment/
│   ├── nginx/
│   ├── systemd/
│   └── raspberry-pi/
├── tests/
│   ├── integration/
│   └── end-to-end/
├── scripts/
├── docs/
├── .github/
│   └── workflows/
├── .gitignore
├── LICENSE
└── README.md
```

Future split, only after V1 contracts stabilize:

```text
net-circuit-web
net-circuit-server
net-circuit-hardware
net-circuit-simulator
net-circuit-fpga
```

Two FPGA functions should initially remain in one future `net-circuit-fpga` repository because they are expected to share common RTL, protocol, test infrastructure, and build tooling.

---

## 4. Core Architectural Abstractions

### 4.1 Circuit Graph

The Circuit Graph is the application-level representation shared by:

- Frontend
- Simulator
- Application Backend
- Validator
- Hardware Service
- Integration tests

Example:

```json
{
  "schema_version": "1.0",
  "circuit_id": "exp-001",
  "modules": [
    {"id": "SW1", "type": "DIGITAL_SWITCH"},
    {"id": "U1", "type": "74HC08"},
    {"id": "LED1", "type": "LED"}
  ],
  "connections": [
    {"source": "SW1.OUT", "destination": "U1.1"},
    {"source": "U1.3", "destination": "LED1.IN"}
  ]
}
```

The frontend must never encode raw MUX addresses or direct FPGA register writes.

### 4.2 Hardware Station

The backend sees a **Hardware Station**, not a specific FPGA topology.

Conceptual model:

```text
Hardware Station
├── Experiment Controller
├── Instrument Controller
├── Routing Fabric
├── Breadboard[]
├── Logic IC Resources
└── Measurement Resources
```

This allows the physical design to evolve from one FPGA to multiple FPGA devices later without rewriting the Web application contract.

### 4.3 Virtual and Physical Hardware

A common conceptual interface is required:

```text
get_capabilities()
validate_configuration()
apply_circuit()
set_input()
configure_clock()
configure_generator()
configure_trigger()
arm_capture()
run()
stop()
read_capture()
safe_state()
reset()
```

Implementations:

```text
VirtualHardwareStation
PhysicalHardwareStation
```

The Web and Application Backend should not need to know which implementation is active.

---

## 5. Contracts

The `contracts/` area is the formal compatibility boundary between subsystems.

```text
contracts/
├── circuit-schema/
│   ├── circuit.schema.json
│   ├── module.schema.json
│   ├── connection.schema.json
│   └── README.md
├── api/
├── hardware/
│   ├── station.proto
│   ├── experiment.proto
│   └── instrument.proto
└── fpga-protocol/
    ├── commands.md
    ├── register-map.md
    ├── packet-format.md
    └── versions.md
```

Contract changes require:

1. consumer impact review;
2. version update when incompatible;
3. tests;
4. documentation update;
5. CHANGELOG update when release-visible.

Version domains remain independent:

- application release version;
- Circuit Schema version;
- Web API version;
- Hardware RPC version;
- FPGA Protocol version;
- FPGA Register Map version.

---

## 6. Control Plane and Data Plane

### 6.1 Control Plane

```text
Browser
  ↓
REST / WebSocket Command
  ↓
FastAPI
  ↓
Experiment Manager
  ↓
Hardware Service
  ↓
FPGA Control Registers
  ↓
Routing / Clock / Trigger / Experiment Control
```

### 6.2 Data Plane

```text
Real IC / ADC / Digital Signal
        ↓
FPGA Capture
        ↓
FIFO / SDRAM
        ↓
Hardware Service
        ↓
Application Backend
        ↓
WebSocket Binary Frames
        ↓
Browser Waveform Viewer
```

Bulk waveform samples should not be transported as sample-by-sample JSON when binary transport is appropriate.

---

## 7. Experiment Transaction

Standard physical experiment flow:

```text
User Builds Circuit
        ↓
Circuit Graph
        ↓
Validate
        ↓
Electrical / Logical / Resource Validation
        ↓
Acquire Hardware Station Lock
        ↓
Translate to Routing Plan
        ↓
Safe State
        ↓
Apply Routing
        ↓
Configure Inputs / Clock / Generator
        ↓
Arm Trigger
        ↓
Run
        ↓
Capture
        ↓
Stop
        ↓
Read Data
        ↓
Release Hardware Station
        ↓
Return Results to Browser
```

Only the currently authorized experiment may control exclusive physical resources.

---

## 8. Failure Handling

All hardware faults must converge to a safe path:

```text
FAULT
  ↓
STOP CLOCK
  ↓
DISABLE GENERATOR
  ↓
SAFE ROUTING
  ↓
STOP CAPTURE
  ↓
SET ERROR STATE
  ↓
LOG
  ↓
RELEASE OR QUARANTINE STATION
```

Examples:

- FPGA timeout
- invalid route
- hardware busy
- SDRAM failure
- capture overflow
- WebSocket disconnect
- user timeout
- protocol/version mismatch
- instrument failure

---

## 9. Instrument Architecture

V1 uses a single FPGA architecture, but RTL must be logically partitioned.

```text
FPGA
├── Experiment Control Domain
│   ├── Routing Manager
│   ├── MUX/Crosspoint Control
│   ├── GPIO
│   ├── Experiment Clock
│   └── Safety FSM
└── Instrument Domain
    ├── Trigger
    ├── Logic Analyzer
    ├── Generator
    ├── Acquisition
    ├── SDRAM Controller
    └── Capture Buffer
```

If a future instrument workload justifies a second FPGA, the Instrument Domain may be moved to an Instrument FPGA without changing the Web-facing Hardware Station contract.

An analog oscilloscope requires external analog front-end and ADC hardware. An analog/arbitrary waveform generator may require DAC and analog output circuitry. The FPGA alone does not provide analog measurement/generation.

---

## 10. Web-first Development Gate

FPGA integration must not begin merely because the UI looks complete.

Milestone:

## W1 — Web Platform Ready for FPGA Integration

Required:

- Vue application shell
- breadboard/lab workspace
- component placement/removal
- wire/unwire
- Circuit Graph generation
- save/load circuit
- Circuit Validator
- simulator
- basic logic IC models
- virtual clock
- virtual Logic Analyzer
- waveform rendering
- FastAPI
- WebSocket
- Hardware Service
- Hardware Station abstraction
- simulation adapter
- session/resource locking
- structured error handling
- Raspberry Pi deployment
- automated tests
- end-to-end virtual experiment

Only after W1 is reached should EP4CE6 Experiment Controller integration begin.

---

## 11. Development Roadmap

```text
Phase 0  Project Architecture
Phase 1  Web Foundation
Phase 2  Circuit Workspace
Phase 3  Simulator
Phase 4  Application Backend
Phase 5  Hardware Service
Phase 6  Virtual End-to-End
Phase 7  Raspberry Pi Deployment
--------- W1: Web Platform Ready for FPGA Integration ---------
Phase 8  EP4CE6 Experiment Controller
Phase 9  Raspberry Pi ↔ FPGA Integration
Phase 10 Routing Hardware
Phase 11 EP4CE10 Migration
Phase 12 64 MB SDR SDRAM
Phase 13 Logic Analyzer
Phase 14 Generator
Phase 15 Oscilloscope Acquisition
Phase 16 2+ Breadboard Integration
Phase 17 Multi-user Validation
Phase 18 Thesis V1
```

Hardware phase ordering may be refined once exact IC, ADC, DAC, MUX, crosspoint, SDRAM part numbers and electrical constraints are selected.

---

## 12. Git and Release Strategy

Use lightweight trunk-based development:

```text
main
├── feature/*
└── fix/*
```

Rules:

- `main` should build and test successfully.
- feature changes should merge through pull requests.
- do not introduce a long-lived `develop` branch unless team size or release workflow later justifies it.

Application release versioning:

```text
MAJOR.MINOR.PATCH
```

Example progression:

```text
0.1.0 Architecture baseline
0.2.0 Web workspace
0.3.0 Simulator
0.4.0 Hardware Service
0.5.0 Raspberry Pi deployment
0.6.0 EP4CE6 Experiment Controller
...
1.0.0 Thesis V1
```

---

## 13. CI and Testing

Planned workflows:

```text
.github/workflows/
├── frontend.yml
├── backend.yml
├── hardware-service.yml
├── simulator.yml
├── integration.yml
├── docs.yml
└── fpga.yml
```

Test layers:

1. Unit tests
2. Contract tests
3. Integration tests
4. End-to-end tests
5. FPGA RTL testbench/simulation
6. Physical hardware validation later

Initial FPGA CI may use open-source syntax/simulation tools where appropriate. Full Quartus compilation may run locally or on a future self-hosted runner.

---

## 14. Documentation and AI Context Strategy

Required documents:

```text
docs/
├── ARCHITECTURE.md
├── CIRCUIT_SPEC.md
├── ROADMAP.md
├── CHANGELOG.md
├── CONTEXT.md
└── DEV_LOG.md
```

Responsibilities:

### `ARCHITECTURE.md`

System boundaries, component responsibilities, diagrams, data flow, control/data planes, experiment flow, hardware abstraction.

### `CIRCUIT_SPEC.md`

Electrical assumptions, logical device model, breadboard model, protocol/register information, pinout sections once exact hardware is selected.

Unverified part numbers, electrical limits, or timing values must not be invented.

### `ROADMAP.md`

Phases, milestone status, dependencies, acceptance criteria.

### `CHANGELOG.md`

Release-facing history.

### `CONTEXT.md`

Project constitution and AI rules. It contains architectural decisions that may not be silently changed.

### `DEV_LOG.md`

Current development state and short-term handoff information.

---

## 15. AI Session Protocol

Before modifying code, an AI contributor must read:

1. `docs/CONTEXT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/ROADMAP.md`
4. `docs/DEV_LOG.md`
5. task-specific specs
6. related source files

At the end of a meaningful development session, update `DEV_LOG.md`.

Required handoff fields:

```text
What changed
Files modified
Decisions made
Tests executed
Known failures
Next recommended task
Context required for next session
```

`DEV_LOG.md` should remain compact. Older logs may be archived under:

```text
docs/dev-log/
```

---

## 16. Immutable-until-approved Context Rules

The following may not be changed silently:

- Raspberry Pi 5 is the V1 main controller.
- Vue 3 + TypeScript + Vite is the frontend stack.
- FastAPI/Python is the application backend.
- Python + gRPC/Protobuf is the hardware backend.
- SQLite is the V1 database baseline.
- Web platform development precedes FPGA integration.
- EP4CE6E22C8N without SDRAM is the Experiment Controller prototype target.
- EP4CE10E22C8N is the V1 final FPGA target.
- V1 external memory is 64 MB SDR SDRAM, 16-bit.
- V1 uses one FPGA architecture.
- V1 targets at least two breadboards.
- Frontend does not directly control FPGA registers or raw MUX addresses.
- timing-critical operations remain in FPGA.
- physical breadboard holes are not assumed to equal independent routing channels.
- RTL should be portable from EP4CE6 to EP4CE10 where practical.
- unknown electrical or timing values are not invented.

Changing an architectural rule requires:

1. explicit reasoning;
2. trade-off analysis;
3. user approval;
4. architecture/context documentation update;
5. changelog update when appropriate.

---

## 17. Definition of Done

A development task is complete only when:

```text
Implementation complete
        ↓
Relevant tests pass
        ↓
No known regression
        ↓
Affected documentation updated
        ↓
DEV_LOG updated
```

If verification is unavailable, status must be reported as:

> IMPLEMENTED — NOT VERIFIED

not as complete.

---

## 18. Initial Project Skeleton Scope

After this design specification is approved, the initial scaffold will include:

- complete repository folder structure;
- root README;
- architecture/spec/context/roadmap/changelog/dev-log documentation;
- frontend Vue/Vite/TypeScript skeleton;
- FastAPI skeleton;
- hardware-service Python skeleton;
- Protobuf contract placeholders;
- Circuit Graph JSON Schema starter;
- circuit simulator Python skeleton;
- FPGA directory structure with placeholder RTL/readmes only;
- deployment placeholders for Nginx/systemd/Raspberry Pi;
- tests directory and starter smoke tests;
- GitHub Actions starter workflows;
- project `.gitignore`;
- environment example files where appropriate;
- no invented PCB pinout or SDRAM part-number assumptions.

The scaffold is intended to be runnable at the software-shell level while leaving unimplemented hardware functions explicitly marked as stubs/placeholders rather than pretending they work.

---

## 19. Success Criterion for the Initial Scaffold

A new human or AI contributor should be able to:

1. open the repository;
2. read `CONTEXT.md`;
3. understand the system from `ARCHITECTURE.md`;
4. see the current phase in `ROADMAP.md` and `DEV_LOG.md`;
5. identify frontend/backend/hardware/simulator/FPGA boundaries;
6. start the frontend/backend skeleton locally after dependencies are installed;
7. understand which hardware assumptions are confirmed and which are not;
8. continue development without reconstructing project intent from chat history.
