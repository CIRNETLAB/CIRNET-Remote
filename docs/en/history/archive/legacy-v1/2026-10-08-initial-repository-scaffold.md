SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md

# net*CIRCUIT Remote Initial Repository Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a complete, modular, AI-handoff-friendly initial monorepo scaffold for `net*CIRCUIT Remote`, including architecture documentation, contracts, runnable software shells, FPGA placeholders, deployment templates, tests, CI starters, and a distributable ZIP.

**Architecture:** The repository is a modular monorepo with strict subsystem boundaries: Vue/Vite frontend, FastAPI application backend, Python gRPC hardware service, circuit simulator, FPGA workspace, formal contracts, deployment configuration, and documentation. The software must work at shell/smoke-test level without pretending unfinished hardware functions are implemented; Virtual Hardware precedes Physical Hardware.

**Tech Stack:** Vue 3, TypeScript, Vite, Pinia, Three.js, Python 3, FastAPI, Pydantic, SQLAlchemy, gRPC/Protobuf, SQLite, Nginx, systemd, Verilog HDL, Quartus Prime, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-08-net-circuit-remote-architecture-design.md`

## Global Constraints

- Main controller: Raspberry Pi 5.
- OS baseline: Raspberry Pi OS 64-bit.
- Frontend: Vue 3 + TypeScript + Vite + Pinia + Three.js.
- Application backend: Python + FastAPI + Pydantic + SQLAlchemy + WebSocket.
- Hardware backend: Python + gRPC + Protobuf + Hardware Abstraction Layer.
- Database baseline: SQLite.
- Reverse proxy: Nginx.
- Process management: systemd.
- FPGA prototype target: EP4CE6E22C8N without SDRAM, Experiment Controller only.
- FPGA V1 target: EP4CE10E22C8N.
- External V1 memory: 64 MB SDR SDRAM, 16-bit.
- V1 FPGA philosophy: one FPGA architecture.
- Breadboard target: at least two physical breadboards.
- Physical breadboard holes are not equivalent to independent routing channels or FPGA GPIO.
- Frontend must never access raw FPGA registers or MUX addresses directly.
- Timing-critical hardware operations remain in FPGA.
- Web and Virtual Hardware development precedes FPGA integration.
- Unknown electrical limits, FPGA pinouts, SDRAM part numbers, ADC/DAC part numbers, and timing values must not be invented.
- Unimplemented hardware features must be explicitly labeled placeholder/stub, not represented as working.

## Review Focus

1. **Missing hardware configuration:** the software shell must start without FPGA/SDRAM hardware and report Virtual/Unavailable hardware states cleanly.
2. **Malformed Circuit Graph:** contract validation must reject missing schema version, missing modules, and malformed connection endpoints.
3. **Boundary violation:** frontend source must contain no direct FPGA register or raw physical-routing control interface.
4. **Protocol/version mismatch preparation:** documentation and placeholder protocol structures must reserve explicit version fields rather than relying on application release version.
5. **Context drift:** a new contributor must be able to determine current architecture, current phase, immutable decisions, and next task from the documentation set alone.

---

## File Map

The implementation creates the following responsibility boundaries:

```text
net-Circuit-Remote/
├── apps/web/                         Vue browser application shell
├── services/api/                     FastAPI application/session API shell
├── services/hardware-service/        Hardware Station abstraction + gRPC shell
├── simulator/circuit-simulator/      Virtual digital hardware shell
├── fpga/                             RTL workspace and target placeholders
├── contracts/                        Circuit/API/hardware/FPGA compatibility contracts
├── device-library/                   Declarative device and breadboard metadata
├── deployment/                       Nginx/systemd/Raspberry Pi deployment templates
├── tests/                            Cross-subsystem integration/E2E smoke tests
├── scripts/                          Local development/bootstrap helpers
├── docs/                             Architecture, specs, roadmap, AI handoff context
├── docs/superpowers/specs/           Approved design specification
├── docs/superpowers/plans/           This implementation plan
└── .github/workflows/                CI starter workflows
```

---

### Task 1: Repository constitution and documentation baseline

**Files:**
- Create: `README.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/CIRCUIT_SPEC.md`
- Create: `docs/ROADMAP.md`
- Create: `docs/CHANGELOG.md`
- Create: `docs/CONTEXT.md`
- Create: `docs/DEV_LOG.md`
- Create: `docs/superpowers/specs/2026-10-08-net-circuit-remote-architecture-design.md`
- Create: `docs/superpowers/plans/2026-10-08-initial-repository-scaffold.md`
- Create: `docs/dev-log/.gitkeep`

**Interfaces:**
- Consumes: approved architecture design.
- Produces: canonical project context that all later tasks must follow.

- [ ] **Step 1: Write documentation consistency checks**
  - Verify all seven requested root/project docs exist.
  - Verify `CONTEXT.md` contains EP4CE6 prototype, EP4CE10 final, 64 MB SDR SDRAM, Web-first rule, no raw FPGA control from frontend.
  - Verify `DEV_LOG.md` exposes current phase and next task.

- [ ] **Step 2: Run the checks and confirm they fail before files exist**

- [ ] **Step 3: Create the documentation set**
  - `ARCHITECTURE.md`: system blocks, subsystem boundaries, data/control planes, Hardware Station, Virtual/Physical station, failure flow.
  - `CIRCUIT_SPEC.md`: confirmed electrical/model assumptions only; distinguish physical holes/electrical nodes/routing resources/FPGA GPIO; protocol placeholders.
  - `ROADMAP.md`: Phase 0 through Phase 18 and W1 gate.
  - `CHANGELOG.md`: Keep a Changelog style with initial unreleased entry.
  - `CONTEXT.md`: AI constitution, immutable decisions, session protocol, Definition of Done.
  - `DEV_LOG.md`: machine-readable front matter + current state + AI handoff.

- [ ] **Step 4: Re-run documentation consistency checks and verify PASS**

- [ ] **Step 5: Commit**
  `docs: establish project architecture and AI context baseline`

---

### Task 2: Root development configuration

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `Makefile`
- Create: `scripts/check_context.py`
- Create: `scripts/dev-info.py`

**Interfaces:**
- Consumes: documentation rules from Task 1.
- Produces: common repository commands and documentation/context validation helpers.

- [ ] **Step 1: Add tests/checks for required environment keys and context files**
- [ ] **Step 2: Verify the checks fail for missing configuration**
- [ ] **Step 3: Implement root config and scripts**
  - `make context-check`
  - `make test`
  - `make dev-info`
- [ ] **Step 4: Run context/config checks and verify PASS**
- [ ] **Step 5: Commit**
  `chore: add repository development configuration`

---

### Task 3: Circuit Graph contracts

**Files:**
- Create: `contracts/circuit-schema/circuit.schema.json`
- Create: `contracts/circuit-schema/module.schema.json`
- Create: `contracts/circuit-schema/connection.schema.json`
- Create: `contracts/circuit-schema/README.md`
- Create: `contracts/api/README.md`
- Create: `contracts/fpga-protocol/commands.md`
- Create: `contracts/fpga-protocol/register-map.md`
- Create: `contracts/fpga-protocol/packet-format.md`
- Create: `contracts/fpga-protocol/versions.md`
- Create: `tests/contracts/test_circuit_schema.py`

**Interfaces:**
- Consumes: Circuit Graph shape from the design spec.
- Produces: Circuit Graph schema version `1.0`; FPGA protocol placeholders with independent version domains.

- [ ] **Step 1: Write failing schema tests**
  - Accept a valid `schema_version=1.0` graph.
  - Reject missing `schema_version`.
  - Reject module without `id` or `type`.
  - Reject connection without source/destination endpoint.
- [ ] **Step 2: Run contract tests and verify FAIL**
- [ ] **Step 3: Implement JSON Schemas and protocol documentation**
- [ ] **Step 4: Run contract tests and verify PASS**
- [ ] **Step 5: Commit**
  `feat: define initial circuit and fpga contracts`

---

### Task 4: Frontend Vue/Vite shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.ts`
- Create: `apps/web/src/App.vue`
- Create: `apps/web/src/stores/station.ts`
- Create: `apps/web/src/services/api.ts`
- Create: `apps/web/src/services/websocket.ts`
- Create: `apps/web/src/components/LabWorkspace.vue`
- Create: `apps/web/src/components/HardwareStatus.vue`
- Create: `apps/web/src/components/LogicAnalyzer.vue`
- Create: `apps/web/src/types/circuit.ts`
- Create: `apps/web/src/style.css`
- Create: `apps/web/README.md`

**Interfaces:**
- Consumes: Circuit Graph contract and application API only.
- Produces: runnable UI shell with Simulation/Hardware status concepts and no direct FPGA access.

- [ ] **Step 1: Add frontend smoke/type checks**
  - App renders project title.
  - HardwareStatus supports simulation/unavailable states.
  - Static source scan rejects `register`, `spidev`, or raw MUX address APIs in frontend service code.
- [ ] **Step 2: Run checks and verify FAIL**
- [ ] **Step 3: Implement minimal Vue shell**
  - No production 3D editor yet.
  - `LabWorkspace` is an explicit placeholder boundary for Three.js.
- [ ] **Step 4: Run TypeScript/build/smoke checks and verify PASS**
- [ ] **Step 5: Commit**
  `feat: add frontend application shell`

---

### Task 5: FastAPI application backend shell

**Files:**
- Create: `services/api/pyproject.toml`
- Create: `services/api/app/__init__.py`
- Create: `services/api/app/main.py`
- Create: `services/api/app/config.py`
- Create: `services/api/app/models/circuit.py`
- Create: `services/api/app/api/health.py`
- Create: `services/api/app/api/circuits.py`
- Create: `services/api/app/api/stations.py`
- Create: `services/api/app/websocket/events.py`
- Create: `services/api/app/services/circuit_validator.py`
- Create: `services/api/tests/test_health.py`
- Create: `services/api/tests/test_circuit_validation.py`
- Create: `services/api/README.md`

**Interfaces:**
- Consumes: Circuit Graph schema `1.0`.
- Produces:
  - `GET /api/health`
  - `POST /api/circuits/validate`
  - `GET /api/stations`
  - WebSocket namespace placeholder `/ws/events`

- [ ] **Step 1: Write failing health and circuit-validation tests**
- [ ] **Step 2: Run pytest and verify FAIL**
- [ ] **Step 3: Implement minimal FastAPI application and structured validation errors**
- [ ] **Step 4: Run pytest and verify PASS**
- [ ] **Step 5: Commit**
  `feat: add FastAPI application backend shell`

---

### Task 6: Hardware Service contract and abstraction

**Files:**
- Create: `contracts/hardware/station.proto`
- Create: `contracts/hardware/experiment.proto`
- Create: `contracts/hardware/instrument.proto`
- Create: `services/hardware-service/pyproject.toml`
- Create: `services/hardware-service/hardware_service/__init__.py`
- Create: `services/hardware-service/hardware_service/models.py`
- Create: `services/hardware-service/hardware_service/station/base.py`
- Create: `services/hardware-service/hardware_service/station/virtual.py`
- Create: `services/hardware-service/hardware_service/station/physical.py`
- Create: `services/hardware-service/hardware_service/server.py`
- Create: `services/hardware-service/tests/test_virtual_station.py`
- Create: `services/hardware-service/tests/test_physical_station.py`
- Create: `services/hardware-service/README.md`

**Interfaces:**
- Produces conceptual `HardwareStation` operations:
  - `get_capabilities()`
  - `validate_configuration()`
  - `apply_circuit()`
  - `set_input()`
  - `configure_clock()`
  - `configure_generator()`
  - `configure_trigger()`
  - `arm_capture()`
  - `run()`
  - `stop()`
  - `read_capture()`
  - `safe_state()`
  - `reset()`
- Physical station must report unavailable/not implemented without FPGA rather than emulate success.

- [ ] **Step 1: Write failing Virtual/Physical Hardware Station tests**
  - Virtual station returns capability descriptor.
  - Physical station reports unavailable in no-hardware scaffold.
  - `safe_state()` remains callable in both modes.
- [ ] **Step 2: Run tests and verify FAIL**
- [ ] **Step 3: Implement abstract station plus safe scaffold implementations**
- [ ] **Step 4: Run tests and verify PASS**
- [ ] **Step 5: Commit**
  `feat: add hardware station abstraction`

---

### Task 7: Circuit simulator shell and starter device library

**Files:**
- Create: `simulator/circuit-simulator/pyproject.toml`
- Create: `simulator/circuit-simulator/netcircuit_sim/__init__.py`
- Create: `simulator/circuit-simulator/netcircuit_sim/logic.py`
- Create: `simulator/circuit-simulator/netcircuit_sim/circuit.py`
- Create: `simulator/circuit-simulator/netcircuit_sim/waveform.py`
- Create: `simulator/circuit-simulator/tests/test_logic.py`
- Create: `simulator/circuit-simulator/README.md`
- Create: `device-library/logic-ic/74hc08.json`
- Create: `device-library/instruments/logic-analyzer.json`
- Create: `device-library/breadboards/generic-full-size.json`
- Create: `device-library/README.md`

**Interfaces:**
- Consumes: Circuit Graph/module identifiers.
- Produces: deterministic starter AND-gate logic and virtual sample/waveform structures.

- [ ] **Step 1: Write failing truth-table tests for 74HC08 AND behavior**
- [ ] **Step 2: Run tests and verify FAIL**
- [ ] **Step 3: Implement minimal deterministic logic engine and starter metadata**
- [ ] **Step 4: Run tests and verify PASS**
- [ ] **Step 5: Commit**
  `feat: add circuit simulator foundation`

---

### Task 8: FPGA workspace scaffold

**Files:**
- Create: `fpga/README.md`
- Create: `fpga/common/README.md`
- Create: `fpga/experiment-controller/README.md`
- Create: `fpga/experiment-controller/rtl/top.v`
- Create: `fpga/instrument/README.md`
- Create: `fpga/instrument/rtl/.gitkeep`
- Create: `fpga/simulation/README.md`
- Create: `fpga/constraints/README.md`
- Create: `fpga/quartus/README.md`

**Interfaces:**
- Consumes: FPGA architecture rules.
- Produces: clearly separated placeholder workspace for EP4CE6 prototype and EP4CE10 V1.
- `top.v` may only contain a compile-safe placeholder module; it must not claim SPI/routing/SDRAM features are implemented.

- [ ] **Step 1: Add source-content assertions for target names and placeholder status**
- [ ] **Step 2: Verify assertions fail before workspace exists**
- [ ] **Step 3: Create FPGA directories, documentation, and compile-safe placeholder top module**
- [ ] **Step 4: Run optional `iverilog` syntax check when installed; otherwise report SKIPPED**
- [ ] **Step 5: Commit**
  `chore: scaffold portable fpga workspace`

---

### Task 9: Raspberry Pi deployment templates

**Files:**
- Create: `deployment/nginx/netcircuit.conf`
- Create: `deployment/systemd/netcircuit-api.service`
- Create: `deployment/systemd/netcircuit-hardware.service`
- Create: `deployment/raspberry-pi/README.md`
- Create: `deployment/README.md`

**Interfaces:**
- Consumes: frontend dist path, API port, hardware-service local-only boundary.
- Produces: deployment templates only; no claim of production hardening.

- [ ] **Step 1: Add configuration checks**
  - Nginx serves frontend and proxies `/api` and `/ws`.
  - Hardware service template is not exposed publicly.
- [ ] **Step 2: Verify checks fail before templates exist**
- [ ] **Step 3: Create Nginx/systemd templates with clear editable placeholders**
- [ ] **Step 4: Run static checks and verify PASS**
- [ ] **Step 5: Commit**
  `chore: add raspberry pi deployment templates`

---

### Task 10: Integration smoke tests and CI starters

**Files:**
- Create: `tests/integration/test_repository_boundaries.py`
- Create: `tests/integration/test_context_integrity.py`
- Create: `tests/end-to-end/README.md`
- Create: `.github/workflows/frontend.yml`
- Create: `.github/workflows/backend.yml`
- Create: `.github/workflows/hardware-service.yml`
- Create: `.github/workflows/simulator.yml`
- Create: `.github/workflows/integration.yml`
- Create: `.github/workflows/docs.yml`
- Create: `.github/workflows/fpga.yml`

**Interfaces:**
- Consumes: all previous subsystem shells.
- Produces: CI definition that tests each area independently and does not require physical FPGA hardware.

- [ ] **Step 1: Write integration tests for required paths, boundary rules, and immutable decisions**
- [ ] **Step 2: Run tests and address any failures**
- [ ] **Step 3: Add CI starter workflows using subsystem-specific commands**
- [ ] **Step 4: Validate YAML syntax and run all locally available tests**
- [ ] **Step 5: Commit**
  `ci: add subsystem and integration workflows`

---

### Task 11: Final documentation handoff and ZIP packaging

**Files:**
- Modify: `docs/DEV_LOG.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `README.md`
- Create: distributable `net-Circuit-Remote-initial.zip`

**Interfaces:**
- Consumes: completed scaffold and verification outputs.
- Produces: user-deliverable ZIP and accurate handoff state.

- [ ] **Step 1: Run final verification**
  - repository tree check;
  - Python tests;
  - JSON schema tests;
  - frontend build if Node/npm available;
  - FPGA syntax check if iverilog available;
  - context consistency check.
- [ ] **Step 2: Update documentation with actual verification results**
  - Never mark unavailable checks as passed.
  - Use `IMPLEMENTED — NOT VERIFIED` where appropriate.
- [ ] **Step 3: Update `DEV_LOG.md` AI Handoff and `CHANGELOG.md`**
- [ ] **Step 4: Package the repository root into `/mnt/data/net-Circuit-Remote-initial.zip`**
- [ ] **Step 5: Inspect ZIP contents and confirm required files are present**
- [ ] **Step 6: Deliver links to ZIP, design spec, and implementation plan**

---

## Self-Review Result

- **Spec coverage:** repository boundaries, contracts, Virtual/Physical Hardware Station, Web-first gate, FPGA targets, 64 MB SDR SDRAM, documentation lifecycle, CI/testing, deployment, context-drift prevention, and packaging are each assigned to a task.
- **Type/interface consistency:** application-level circuit contract and Hardware Station operation names remain consistent throughout the plan.
- **Review Focus coverage:** no-hardware state is covered in Task 6; malformed Circuit Graph in Task 3/5; frontend boundary violation in Task 4/10; protocol version independence in Task 3; context drift in Task 1/10.
- **Scope:** this plan intentionally scaffolds the repository and runnable shells only. It does not implement the production 3D editor, complete simulator, FPGA Experiment Controller, SDRAM controller, Generator, or Oscilloscope.
