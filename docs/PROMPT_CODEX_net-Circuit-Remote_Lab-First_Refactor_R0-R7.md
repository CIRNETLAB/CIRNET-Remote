# MASTER PROMPT FOR CODEX
## net*CIRCUIT Remote — Refactor R0 → R7 theo kiến trúc Lab-First

> **Mục đích:** Dùng prompt này trong Codex tại worktree/branch `refactor` để tái cấu trúc repository hiện tại theo kiến trúc **Safety-Gated, Lab-First, Contract-Driven Virtual-to-Physical Laboratory Architecture**.
>
> **Chiến lược đã được người dùng duyệt:** Cách A — giữ một branch `refactor`, thực hiện tuần tự **R0 → R7**, mỗi phase đúng **một commit chính**, kiểm thử bắt buộc trước khi sang phase kế tiếp. Sau R7 chỉ báo cáo và để người dùng review/merge; **không tự merge, không tự push vào branch chính**.

---

# 0. Vai trò và cách làm việc

Bạn là **Senior Software Architect + Senior Full-Stack/Embedded Engineer** chịu trách nhiệm refactor repository `net-Circuit-Remote`.

Bạn phải:

1. Đọc source thật trước khi sửa.
2. Tôn trọng phần code hiện đã hoạt động.
3. Tái cấu trúc theo contract và boundary, không rewrite tùy tiện.
4. Làm từng phase R0→R7.
5. Trong mỗi phase dùng TDD/verification trước khi commit.
6. Mỗi phase chỉ hoàn thành khi acceptance gate của phase đó PASS.
7. Sau mỗi phase tạo **một commit** đúng phạm vi phase.
8. Không trộn implementation của phase sau vào phase trước.
9. Không giả vờ phần cứng đã hoạt động nếu chưa có hardware/part number/pinout/driver thật.
10. Khi phát hiện mâu thuẫn giữa tài liệu cũ và kiến trúc mới, kiến trúc Lab-First mới là authority.

Nếu Superpowers skills có sẵn trong Codex:

- Xác nhận đang ở worktree cô lập bằng `using-git-worktrees`; **không tạo worktree lồng nhau** nếu đã ở worktree branch `refactor`.
- Dùng `executing-plans` để triển khai tuần tự.
- Dùng `test-driven-development` cho code mới/refactor.
- Khi test bất ngờ fail, dùng `systematic-debugging`.
- Trước khi tuyên bố hoàn thành phase hoặc toàn branch, dùng `verification-before-completion`.
- Cuối R7 dùng workflow review/finishing branch, nhưng **dừng trước merge/push**.

---

# 1. Authority — tài liệu nào được quyền quyết định?

Trước khi sửa bất cứ file application nào, đọc theo thứ tự:

1. `docs/net-Circuit-Remote_Architecture_v3_Lab-First.md`
2. `docs/net-Circuit-Remote_Lab-First_Architecture_Audit_and_Restructure_Plan.md`
3. Source code hiện tại.
4. Các test hiện tại.
5. Các tài liệu lịch sử chỉ để hiểu bối cảnh, **không được dùng làm authority nếu mâu thuẫn với 1–2**.

## 1.1 Quy tắc khi v3 còn sót nội dung v2

File Lab-First v3 hiện có một số đoạn cũ còn mang semantics:

```text
Topology match → mới compile/run
generic ERC → reject unsupported/wrong components
whole logical circuit → physical routing
```

Đây **không còn là authority** nếu mâu thuẫn với triết lý Lab-First.

Authority cuối cùng là:

```text
Computer checks SAFETY
        ↓
Safe circuit is allowed to run
        ↓
Real hardware / physics produces behavior
        ↓
Software observes, compares and teaches
```

Và:

```text
SAFETY != CORRECTNESS
```

Do đó:

```text
UNSAFE                     → BLOCK_SAFETY
UNEXECUTABLE               → BLOCK_UNEXECUTABLE
SAFE + WRONG CIRCUIT       → RUN
SAFE + WRONG IC            → RUN / RUN_GUARDED
SAFE + UNKNOWN IC          → RUN_GUARDED
SAFE + TOPOLOGY MISMATCH   → RUN
```

`TopologyVerificationResult` chỉ phục vụ diagnostics/grading/feedback.

`FunctionalVerificationResult` mới phản ánh circuit thật có cho kết quả đúng hay không.

---

# 2. Bối cảnh source hiện tại — phải bảo tồn

Source hiện tại đã có phần frontend tương đối trưởng thành. Không rewrite chỉ vì refactor kiến trúc.

## 2.1 Những phần PHẢI bảo tồn trừ khi test chứng minh cần sửa

```text
apps/web/src/stores/circuit.ts
apps/web/src/composables/useCircuitEditor.ts
apps/web/src/three/SceneManager.ts
apps/web/src/three/WireLayer.ts
apps/web/src/three/ComponentModel.ts
apps/web/src/three/ComponentTransformGizmo.ts
apps/web/src/components/workbench/*
apps/web/src/components/windows/*
```

Các nguyên tắc hiện đang đúng:

```text
CircuitGraph = source of truth cho logical DesignGraph
Three.js Scene = projection/rendering
3D coordinates != electrical nets
placement ghost != CircuitGraph module trước khi commit
frontend không biết FPGA register/MUX/raw transport
```

Không phá các boundary này.

## 2.2 Một boundary đặc biệt phải giữ

Editor logical hiện reject duplicate edge, invalid direction, invalid width, extra input driver.

Đó là **DesignGraph authoring rule**.

Không tái sử dụng validator/editor rule đó để biểu diễn circuit vật lý sinh viên đã cắm.

Physical Lab cần graph riêng:

```text
DetectedTopologyGraph
```

Graph này được phép chứa:

- sai dây;
- thiếu dây;
- connection bất ngờ;
- component không biết;
- component sai;
- ambiguity;
- lỗi topology an toàn.

Không được “sanitize” Physical Graph thành circuit đúng.

---

# 3. Pre-flight bắt buộc trước R0

Bạn đang làm trên branch:

```text
refactor
```

Không tạo branch khác trừ khi user yêu cầu.

Chạy và ghi lại:

```bash
git status
git branch --show-current
git log -1 --oneline
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master
```

Yêu cầu:

```text
branch == refactor
```

Nếu working tree có thay đổi chưa commit từ người dùng:
- không reset;
- không xóa;
- báo rõ file nào đang dirty;
- bảo tồn thay đổi;
- chỉ tiếp tục nếu có thể không ghi đè.

## 3.1 Baseline verification

Chạy:

```bash
python scripts/check_context.py
pytest -q
```

Frontend:

```bash
cd apps/web
npm test
npm run build
```

Nếu dependencies chưa cài:

```bash
npm ci --no-audit --no-fund
```

Sau đó quay về root.

Nếu Icarus Verilog có sẵn:

```bash
iverilog -tnull fpga/experiment-controller/rtl/top.v
```

### Baseline đã biết

Người dùng đã chạy trên Windows branch `refactor`:

```text
npm run build → PASS
147 modules transformed
vite build successful
```

Có warning bundle:

```text
index JS ≈ 906 kB
chunk > 500 kB
```

Warning này **không phải mục tiêu của refactor R0→R7**. Không tối ưu bundle chỉ để xóa warning nếu không có regression do thay đổi của bạn.

`npm run dev` cũng chạy thành công; port 5173 đang bận nên Vite dùng 5174. Đây không phải lỗi.

Trong snapshot ZIP được audit, `pytest -q` có thể thấy hai failure:

1. `tests/deployment/test_deployment_templates.py` vẫn yêu cầu `raspberry-pi/README.md` trong khi source đã có `deployment/Mini-PC/README.md`.
   - Đây là stale architecture test và thuộc **R0**.
2. `tests/frontend/test_frontend_shell.py` có thể mismatch `output_bytes` 1 byte do CRLF khi đóng gói ZIP/Windows.
   - Reproduce trên worktree Git thật trước khi sửa.
   - Nếu local Git checkout PASS thì không sửa assets/manifest.
   - Nếu local thật sự FAIL, sửa theo nguyên nhân line-ending/manifest, không thay artwork.

Ghi baseline thực tế của worktree vào:

```text
docs/MIGRATION_LAB_FIRST.md
```

sau khi file này được tạo ở R0.

---

# 4. Quy tắc commit

Mỗi phase chỉ có **một commit chính**.

Commit messages bắt buộc:

```text
R0  refactor(r0): establish Lab-First architecture authority
R1  refactor(r1): add Lab-First domain contracts
R2  refactor(r2): version hardware RPC for safe execution
R3  refactor(r3): enforce hardware safety lifecycle
R4  refactor(r4): add Lab-First backend lifecycle
R5  refactor(r5): implement virtual discrete-event execution
R6  refactor(r6): integrate Lab-First frontend execution
R7  refactor(r7): align FPGA and physical hardware scaffold
```

Trong phase có thể sửa nhiều lần, nhưng chỉ commit khi gate của phase PASS.

Không amend commit của phase trước sau khi đã bắt đầu phase kế tiếp, trừ khi lỗi nghiêm trọng buộc phải sửa dependency; nếu phải làm, ghi rõ ruling trong migration log.

---

# 5. R0 — Architecture Authority Cleanup

## Goal

Đạt trạng thái:

```text
one current architecture
zero contradictory active architecture authority
```

Không triển khai feature application mới trong R0.

## 5.1 Canonical architecture

Tạo/cập nhật:

```text
docs/ARCHITECTURE.md
```

thành **Lab-First v3.1 canonical**.

Nguồn là:

```text
docs/net-Circuit-Remote_Architecture_v3_Lab-First.md
```

nhưng phải làm sạch các residue v2.

Canonical flow phải là:

```text
Physical Run
  ↓
SAFE_STATE
  ↓
Topology Scan
  ├─────────────┐
  ↓             ↓
Safety       Topology
Verify       Verify
  │             │ diagnostic only
  └──────┬──────┘
         ↓
ExecutionDecision
 ┌───────┴────────┐
 ↓                ↓
BLOCK          RUN/GUARDED
                  ↓
Lab Execution Compiler
                  ↓
Infrastructure Routing
                  ↓
Guarded Power-Up
                  ↓
Real Student Circuit
                  ↓
Observed Signals
                  ↓
Functional Verification
```

### Critical correction: Physical Compiler

Trong manual breadboard Lab-First V1, **không compile reference circuit để FPGA sửa/dựng lại internal student wiring**.

Internal circuit là:

```text
IC thật + jumper thật do sinh viên cắm
```

Compiler V1 phải là:

```text
Lab Execution Compiler
```

hoặc một tên tương đương rõ semantics.

Nó chỉ compile hạ tầng phòng thí nghiệm:

```text
VCC/GND routing
safe power policy
INPUT_SOURCE routing
CLOCK routing
Function Generator routing
OUTPUT_SENSE routing
Oscilloscope routing
Logic Analyzer routing
trigger/capture configuration
test vector sequence
runtime protection policy
```

Target plan nên được gọi rõ kiểu:

```text
InstrumentationExecutionPlan
```

hoặc tên tương đương.

Không route lại internal logical nets để “sửa hộ” sinh viên.

## 5.2 Documentation cleanup

Rewrite/update:

```text
README.md
docs/ARCHITECTURE.md
docs/CONTEXT.md
docs/ROADMAP.md
docs/CIRCUIT_SPEC.md
deployment/README.md
deployment/mini-pc/README.md
fpga/README.md
fpga/experiment-controller/README.md
services/api/README.md
services/hardware-service/README.md
simulator/circuit-simulator/README.md
contracts/api/README.md
```

README có English + Vietnamese, phải cập nhật **cả hai phần**.

Target deployment:

```text
Mini PC
Intel Xeon W-1370
16 GB RAM
256 GB SSD
Linux
Nginx
systemd
FastAPI
Hardware Service
PostgreSQL production
```

Không còn gọi Raspberry Pi 5 là controller hiện hành.

SQLite:
- có thể giữ cho unit test/development nếu hữu ích;
- không được mô tả là production architecture baseline.

Rename thống nhất:

```text
deployment/Mini-PC/
```

thành:

```text
deployment/mini-pc/
```

để tránh case mismatch Linux.

Lưu ý: `deployment/Mini-PC/README.md` hiện vẫn có heading/nội dung Raspberry Pi; phải rewrite thật, không chỉ rename folder.

## 5.3 Archive legacy docs

Các file cũ không được ở vị trí có thể bị AI hiểu là current authority.

Di chuyển hợp lý vào:

```text
docs/archive/legacy-v1/
```

hoặc `docs/history/` tùy loại.

Các ứng viên architecture/prompt legacy gồm ít nhất:

```text
docs/superpowers/specs/2026-10-08-net-circuit-remote-architecture-design.md
docs/superpowers/plans/2026-10-08-initial-repository-scaffold.md
docs/superpowers/plans/2026-10-08-web-foundation.md
docs/PROMPT_SINGLE_WORKSPACE_UI_AI.md
SINGLE_WORKSPACE_DOCS_MANIFEST.md
```

Không xóa verification/history có giá trị chỉ vì cũ.

Giữ:

```text
docs/CHANGELOG.md
docs/DEV_LOG.md
docs/SOURCE_ANALYSIS_*.md
docs/verification/*.md
```

Các file archive phải có banner:

```text
SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md
```

## 5.4 Tạo tài liệu migration/safety

Tạo:

```text
docs/MIGRATION_LAB_FIRST.md
docs/PHYSICAL_LAB_SAFETY.md
```

`MIGRATION_LAB_FIRST.md` phải chứa:
- baseline tests;
- phase R0→R7;
- phase status;
- commit SHA sau mỗi phase;
- rulings/deviations;
- blockers.

`PHYSICAL_LAB_SAFETY.md` phải mô tả contract-level safety, không bịa giá trị điện chưa được xác nhận.

Bao gồm:

```text
current limiting
current sensing
fast cutoff
tri-state default
routing default-open
protected digital drive
guarded power-up
watchdog
runtime protection
safe-state timeout
```

Các giá trị điện cụ thể chưa được phần cứng xác nhận phải ghi `TBD_BY_HARDWARE_DESIGN`, không tự đoán.

## 5.5 Architecture guardrail tests

Refactor:

```text
scripts/check_context.py
tests/test_docs_baseline.py
tests/integration/test_context_integrity.py
tests/deployment/test_deployment_templates.py
```

Các marker Lab-First tối thiểu:

```text
Mini PC
Lab-First
Safety-gated
AssignmentDefinition
LabEndpoint
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
ExecutionDecision
HardwareStation
PostgreSQL
```

Không ép file archive cũ làm current architecture.

Deployment test phải kiểm tra:

```text
deployment/mini-pc/README.md
```

Không còn yêu cầu Raspberry Pi.

## 5.6 R0 stale-marker audit

Sau rewrite, chạy search trong **active docs/source**, không tính archive/history/audit/changelog khi đó là mô tả lịch sử:

```bash
grep -RIn "Raspberry Pi 5" README.md docs deployment fpga contracts services simulator tests scripts
grep -RIn "SQLite.*baseline\|Database baseline.*SQLite" README.md docs deployment fpga contracts services simulator tests scripts
grep -RIn "2026-10-08-net-circuit-remote-architecture-design" README.md docs deployment fpga contracts services simulator tests scripts
```

Không được còn stale active authority.

## R0 acceptance gate

```bash
python scripts/check_context.py
pytest -q tests/test_docs_baseline.py tests/integration/test_context_integrity.py tests/deployment
pytest -q
cd apps/web && npm test && npm run build
```

Nếu PASS:

```bash
git add -A
git commit -m "refactor(r0): establish Lab-First architecture authority"
```

Ghi commit SHA vào migration log.

---

# 6. R1 — Contract-First Lab Domain

## Goal

Định nghĩa contract trước implementation.

Không sửa 3D editor behavior trong R1.

## 6.1 Giữ Circuit Graph v1.0 ổn định

Không nhét physical scan data vào:

```text
contracts/circuit-schema/
```

nếu không thực sự là DesignGraph concern.

`CircuitGraph` tiếp tục mô tả logical intent/editor.

Physical circuit dùng contract riêng.

## 6.2 Tạo contract packages

Tạo tối thiểu:

```text
contracts/assignment/
contracts/physical-lab/
```

Dùng JSON Schema 2020-12 giống style hiện tại khi phù hợp.

Các contract cần có:

```text
AssignmentDefinition
LabEndpoint

DetectedTopologyGraph
DetectedNode / DetectedConnection
ObservedPhysicalComponent
OpaquePhysicalComponent

SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult

ExecutionDecision

StationCapabilities

InstrumentationExecutionPlan
```

Tên field dùng convention hiện có:

```text
snake_case
```

và schema có version rõ.

## 6.3 AssignmentDefinition

Phải có khả năng biểu diễn:

```text
assignment_id
title
reference_design_graph? / reference topology reference
expected_component_set?
instructor_pin_profiles?
lab_endpoints[]
expected_behavior?
assessment_policy
```

`LabEndpoint` role tối thiểu:

```text
INPUT_SOURCE
OUTPUT_SENSE
CLOCK
VCC
GND
GENERATOR
SCOPE
LOGIC_ANALYZER
```

Không bắt buộc mọi assignment có mọi endpoint.

## 6.4 Component resolution

Contracts phải hỗ trợ:

```text
AUTO_DISCOVERY
INSTRUCTOR_PROFILE
HYBRID
```

HYBRID là V1 recommended mode.

Unknown physical part:

```text
OPAQUE_PHYSICAL_COMPONENT
```

không tự động == unsafe.

## 6.5 Verification contracts

Tách ba result:

```text
SafetyVerificationResult:
    SAFE
    UNSAFE
    INDETERMINATE

TopologyVerificationResult:
    MATCH
    MISMATCH
    UNKNOWN
    AMBIGUOUS

FunctionalVerificationResult:
    PASS
    FAIL
    PARTIAL
    NO_RESPONSE
    NOT_EVALUATED
```

`ExecutionDecision`:

```text
BLOCK_SAFETY
BLOCK_UNEXECUTABLE
RUN_NORMAL
RUN_GUARDED
```

Không tạo status “WRONG → BLOCK”.

## 6.6 StationCapabilities

Phải mở rộng để thể hiện tối thiểu:

```text
virtual_digital
virtual_analog
physical_digital
physical_analog_routing
physical_execution_slots

topology_scan_supported
safety_gate_supported
guarded_run_supported
component_resolution_modes

logic_analyzer_channels
oscilloscope_channels
generator_channels

routing/resources summary
hardware_rpc_version
fpga_protocol_version
firmware_version
hardware_profile_version
```

Giá trị V1 target:

```text
physical_analog_routing = false
oscilloscope_channels = 2
generator_channels = 2
physical_execution_slots = 1
```

Không hard-code `>=2 breadboards` nếu hardware thực tế chưa chốt.

## 6.7 InstrumentationExecutionPlan

Plan này dành cho hạ tầng lab, không tái tạo expected student circuit.

Phải có khả năng mô tả:

```text
station_id
experiment_id
power policy
endpoint bindings
routing allocations
instrument allocations
clock config
generator config
capture config
test vectors
runtime safety policy
```

Không chứa raw FPGA register.

## 6.8 Contract tests

Tạo test cho:
- valid minimal assignment;
- endpoint uniqueness;
- opaque component;
- safe topology mismatch;
- `RUN_GUARDED`;
- V1 capabilities Scope=2/Generator=2;
- execution plan không chứa raw FPGA/MUX/Linux transport identifiers;
- DesignGraph schema vẫn round-trip/version 1.0.

## R1 acceptance gate

```bash
pytest -q tests/contracts
pytest -q tests/integration/test_repository_boundaries.py
pytest -q
cd apps/web && npm test && npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r1): add Lab-First domain contracts"
```

---

# 7. R2 — Hardware RPC vNext

## Goal

Thay raw/direct physical RPC cũ bằng contract phản ánh safety lifecycle.

Hiện tại:

```text
contracts/hardware/experiment.proto
```

có:

```text
ApplyCircuit(raw circuit_graph_json)
Run(raw circuit_graph_json)
Stop(...)
```

Đây không được là final physical interface.

## 7.1 Version RPC

Tạo vNext rõ version, ví dụ:

```text
contracts/hardware/v2/
```

Package Protobuf:

```text
netcircuit.hardware.v2
```

Nếu giữ v1 làm legacy, đánh dấu rõ deprecated; không để code mới phụ thuộc v1.

## 7.2 RPC surface

Tối thiểu cần có concept tương đương:

```text
GetCapabilities
EnterSafeState
ScanTopology
PrepareExecution
ApplyRouting
GuardedPowerUp
ConfigureInstrument
ArmCapture
StartExecution
StopExecution
ReadCapture
Reset
```

Không expose raw register write cho API/frontend.

`StartExecution` không được nhận `CircuitGraph` rồi tự bỏ qua safety.

`PrepareExecution`/`ApplyRouting` phải dùng plan/contract từ R1.

## 7.3 RPC errors

Định nghĩa stable codes tối thiểu:

```text
HARDWARE_UNAVAILABLE
INVALID_STATE
UNSAFE
SAFETY_INDETERMINATE
UNEXECUTABLE
RESOURCE_CONFLICT
PROTOCOL_MISMATCH
TIMEOUT
DRIVER_ERROR
```

Không dùng exception text làm public protocol.

## 7.4 Protobuf build/test

Hiện hardware package có:

```text
grpcio
protobuf
grpcio-tools [dev]
```

Thêm deterministic codegen/test workflow phù hợp repository.

Không commit generated code nếu repository quyết định tiếp tục generate-at-build; nếu thay đổi policy phải document và test.

Test ít nhất:
- proto syntax compile;
- service methods tồn tại;
- không còn physical vNext `Run(CircuitGraph JSON)`;
- v2 capability fields match R1;
- local-only hardware service boundary vẫn giữ.

## R2 acceptance gate

```bash
pytest -q services/hardware-service/tests
pytest -q tests/contracts
pytest -q
cd apps/web && npm test && npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r2): version hardware RPC for safe execution"
```

---

# 8. R3 — Hardware Service Safety Lifecycle

## Goal

Biến `HardwareStation` từ generic adapter thành abstraction không cho phép physical execution bypass safety.

## 8.1 Refactor interface

Hiện tại có generic:

```python
apply_circuit()
run()
```

Physical driver có thể bị gọi trực tiếp.

Refactor thành các operation tương đương:

```text
get_capabilities
enter_safe_state
scan_topology
read_runtime_safety
prepare_execution
apply_routing
guarded_power_up
configure_clock
configure_generator
configure_trigger
arm_capture
start_execution
stop_execution
read_capture
reset
```

Tên có thể điều chỉnh theo style codebase, nhưng semantics phải đúng.

Application-level “Run” là lifecycle orchestration, không phải unguarded primitive.

## 8.2 State machine

Implement explicit state model:

```text
OFFLINE
IDLE
RESERVED
SAFE_STATE
TOPOLOGY_SCAN
SAFETY_CHECK
ROUTE_PREPARE
GUARDED_POWER_UP
READY
ARMED
RUNNING
CAPTURING
VERIFYING
STOPPING
RELEASE
FAULT
```

Không cần ép mọi Virtual Station đi qua electrical scan giả. Có thể có mode-specific legal transitions, nhưng interface/result contract phải nhất quán.

## 8.3 Physical station invariants

Tests bắt buộc:

1. Không driver → unavailable, không fake success.
2. `enter_safe_state()` gọi được khi driver unavailable và trả trạng thái truthful.
3. Không `start_execution` trước safety decision/plan.
4. `UNSAFE` → không guarded power-up.
5. `INDETERMINATE` → block mặc định.
6. `SAFE + unknown component` có thể đi `RUN_GUARDED` nếu plan executable.
7. Driver error → FAULT / safe fallback.
8. Stop/reset → đưa station về safe state.
9. Invalid state transition → stable `INVALID_STATE`.
10. Capabilities không hard-code hai breadboards nếu hardware profile không nói vậy.

## 8.4 VirtualHardwareStation

Không để virtual station chỉ:

```text
store graph
return running
```

ở trạng thái cuối R5.

Trong R3 chỉ refactor interface/state machine đủ để R5 plug simulator.

## R3 acceptance gate

```bash
pytest -q services/hardware-service/tests
pytest -q
cd apps/web && npm test && npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r3): enforce hardware safety lifecycle"
```

---

# 9. R4 — Application Backend Modular-Monolith Expansion

## Goal

Xây lifecycle ở Mini PC nhưng vẫn giữ **modular monolith**, không tách full microservices.

## 9.1 Module boundaries

Tạo module/service rõ trách nhiệm cho:

```text
assignments
experiments
stations
verification
execution_policy
captures
persistence
```

Không gom tất cả vào `main.py`.

## 9.2 Persistence

Production architecture:

```text
PostgreSQL
```

Test/development có thể dùng SQLite in-memory nếu giúp test nhanh.

Không được mô tả SQLite là production baseline.

Nếu thêm PostgreSQL driver:
- chọn dependency nhỏ, phổ biến và cần thiết;
- document;
- không thêm Redis/Kafka/RabbitMQ.

## 9.3 Experiment lifecycle

Backend phải orchestration:

```text
QUEUED
RESERVED
SAFE_STATE
TOPOLOGY_SCAN
SAFETY_CHECK
EXECUTION_DECISION
ROUTE_PREPARE
GUARDED_POWER_UP
RUNNING
CAPTURING
FUNCTIONAL_VERIFY
COMPLETE
RELEASE
FAULT
```

Physical V1:

```text
physical_execution_slots = 1
```

## 9.4 Scheduler / lease / queue

Cần:
- FIFO queue V1;
- lease;
- maximum execution time;
- per-user rate limit hợp lý ở application boundary;
- cleanup khi disconnect/timeout;
- không giả định “30–50 user sẽ không bấm Run cùng lúc”.

30–50 connected users != 30–50 simultaneous physical executions.

Không thêm message broker V1.

## 9.5 Verification services

Tách:

```text
SafetyVerificationService
TopologyVerificationService
FunctionalVerificationService
ExecutionPolicy
```

Safety gate và learning evaluation phải độc lập.

### Policy minimum

```text
UNSAFE                         → BLOCK_SAFETY
INDETERMINATE safety           → BLOCK_SAFETY
endpoint cannot route          → BLOCK_UNEXECUTABLE
wrong IC + safe                → RUN_NORMAL/RUN_GUARDED
unknown IC + safe              → RUN_GUARDED
topology mismatch + safe       → RUN
```

## 9.6 API

Thiết kế endpoint tối thiểu, không overbuild.

Có thể gồm:

```text
Assignments
Experiments
Station capabilities
Queue/execution status
Results
```

Không cần hoàn thiện full OAuth/OIDC ở R4.

WebSocket event model phải hỗ trợ lifecycle/update nhưng giữ backwards compatibility hợp lý hoặc update frontend ở R6.

## 9.7 Production config

Khi:

```text
NETCIRCUIT_ENV=production
```

config phải yêu cầu/validate production DB thích hợp.

Unit tests không được cần PostgreSQL server thật.

## R4 tests

Test ít nhất:
- assignment create/read contract;
- queue FIFO;
- slot=1 serialize physical runs;
- lease cleanup;
- unsafe blocks;
- topology mismatch safe does not block;
- unknown safe → guarded;
- unexecutable route blocks;
- state event emitted;
- production DB validation;
- current health/circuit structural validation still work.

## R4 acceptance gate

```bash
pytest -q services/api/tests
pytest -q tests/integration tests/contracts
pytest -q
cd apps/web && npm test && npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r4): add Lab-First backend lifecycle"
```

---

# 10. R5 — Real Virtual Digital Execution

## Goal

Thay simulator primitive-only bằng discrete-event digital engine tối thiểu nhưng thật sự có lifecycle/capture.

Không viết SPICE solver từ đầu.

## 10.1 Preserve useful primitives

Hiện có:

```text
and2()
evaluate_74hc08_gate()
DigitalSample
build_waveform()
```

Có thể giữ/đưa vào device model layer nếu phù hợp.

## 10.2 Implement digital event engine

Tối thiểu:

```text
Event
EventQueue / Scheduler
SimulationTime
DigitalNet
DigitalDevice
DeviceRegistry
ClockSource
Waveform/Capture
CircuitGraph → VirtualExecutionPlan compiler
```

Không dùng busy fixed-timestep loop cho toàn circuit.

## 10.3 Initial functional device set

Đủ cho end-to-end test:

```text
AND / 74HC08
NOT
OR hoặc XOR
switch/input
LED/probe output
clock
```

Không cần hoàn thành mọi IC library trong R5.

## 10.4 VirtualHardwareStation integration

Sau R5:

```text
VirtualHardwareStation
```

phải sử dụng simulator engine.

Không còn được:
- chỉ lưu graph;
- đổi string state thành `"running"`;
- trả capture rỗng như implementation chính.

Test:
- minimal AND experiment;
- event propagation;
- deterministic order for same timestamp;
- clock transitions;
- waveform capture;
- stop/reset;
- invalid graph does not crash;
- simulator result maps to Unified Result Model.

## 10.5 Analog boundary

Kiến trúc Mini PC phải giữ:

```text
AnalogSimulationEngine
SPICEAdapter
MixedSignalCoordinator boundary
```

Nhưng nếu chưa có SPICE dependency thật:
- implement interface/boundary + explicit unavailable capability;
- không fake analog simulation;
- không kéo một SPICE package lớn chỉ để đánh dấu checkbox.

## R5 acceptance gate

```bash
pytest -q simulator/circuit-simulator/tests
pytest -q services/hardware-service/tests
pytest -q services/api/tests
pytest -q
cd apps/web && npm test && npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r5): implement virtual discrete-event execution"
```

---

# 11. R6 — Frontend Lab-First Integration

## Goal

Nối lifecycle/result thật vào Web Workbench **mà không rewrite 3D editor**.

## 11.1 Không redesign UI

Giữ:
- layout;
- Three.js scene;
- current workbench;
- ribbon;
- gizmo;
- instrument window visual;
- existing editor controls.

Chỉ thêm execution/data behavior.

## 11.2 Frontend domain/types

Mở rộng/tạo types:

```text
Assignment
StationCapabilities
ExperimentLifecycle
ExecutionDecision
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
Capture metadata/result
Queue state
```

Không duplicate schema semantics tùy tiện; parser phải validate API response.

## 11.3 Stores/services

Refactor:

```text
apps/web/src/stores/experiment.ts
apps/web/src/stores/station.ts
apps/web/src/stores/instrument.ts
apps/web/src/services/api/experiments.ts
apps/web/src/services/api/stations.ts
apps/web/src/services/websocket/events.ts
```

Thêm service assignment/results khi cần.

## 11.4 Run UX

Hiện `SimulationStatusBar.vue` có Run/Stop/Step disabled.

Sau R6:
- Run dùng backend lifecycle.
- Stop dùng lifecycle.
- Step chỉ enable nếu virtual contract thật sự hỗ trợ; nếu không, giữ disabled và nói rõ.
- queue/busy hiển thị truthful.
- không fake waveform.

## 11.5 Ba lớp trạng thái độc lập

UI phải thể hiện độc lập:

```text
SAFETY
TOPOLOGY
FUNCTION
```

Ví dụ hợp lệ:

```text
Safety:   SAFE
Topology: MISMATCH
Function: FAIL
```

Không đổi thành generic “Circuit invalid”.

Unknown IC safe:

```text
Safety: SAFE
Topology: UNKNOWN
Execution: RUN_GUARDED
Function: NO_RESPONSE / FAIL / PARTIAL / PASS
```

## 11.6 Instrument integration

Oscilloscope và Generator hiện là presentation/config preview.

Sau R6:
- UI có thể gửi config đúng contract.
- waveform/capture hiển thị dữ liệu thật từ backend/Virtual station khi có.
- không tạo fake physical acquisition.
- Scope target 2CH.
- Generator target 2CH.

## 11.7 Bundle warning

Không dành R6 để tối ưu bundle 906 kB trừ khi code R6 làm regression rõ rệt.

Nếu cần code splitting chỉ thực hiện khi:
- có test/build evidence;
- không làm thay đổi UX;
- không kéo scope khỏi Lab-First refactor.

## R6 acceptance gate

```bash
cd apps/web
npm test
npm run build
cd ../..

pytest -q tests/frontend
pytest -q tests/integration
pytest -q
```

Nếu có browser automation sẵn, verify:
- existing 3D editor behavior;
- Run lifecycle;
- Safety/Topology/Function status;
- instrument windows.

Commit:

```bash
git add -A
git commit -m "refactor(r6): integrate Lab-First frontend execution"
```

---

# 12. R7 — Align FPGA / Physical Hardware Scaffold

## Goal

R7 trong branch refactor là **architecture-aligned, compile-safe physical/FPGA scaffold**.

Không được tuyên bố phần cứng thật đã hoàn thiện nếu không có:
- exact board pinout;
- switching matrix schematic;
- protection circuit;
- ADC/DAC part number;
- SDRAM part/timing;
- hardware transport IC;
- measurement results.

## 12.1 FPGA host boundary

Update:

```text
fpga/README.md
fpga/experiment-controller/README.md
contracts/fpga-protocol/*
```

Bỏ Raspberry Pi-specific assumptions.

Host:

```text
Mini PC
  ↓
FpgaTransport abstraction
  ├── Serial
  ├── USB-SPI
  ├── future USB3
  └── future Ethernet
```

FPGA protocol không phụ thuộc USB/SPI cụ thể.

## 12.2 V1 EP4CE6 refactor target

Compile-safe architecture scaffold tối thiểu:

```text
reset / safe-state
protocol/control boundary
topology scan control boundary
protected-drive enable boundary
routing control boundary
experiment clock boundary
fault input / safety interlock boundary
```

Nếu chưa có hardware schematic:
- ports/parameters abstract hoặc clearly TBD;
- không invent pin assignment;
- không invent safe voltage/current;
- không claim topology scanner electrically works.

## 12.3 EP4CE10 future target

Docs/structure phải sẵn sàng cho:

```text
EP4CE10 + external SDRAM

Logic Analyzer
Scope 2CH
Generator 2CH
SDRAM Arbiter
Trigger
Timestamp
CDC boundaries
```

Nhưng không implement fake SDRAM/ADC/DAC timing.

Nếu exact SDRAM/ADC/DAC chưa chốt:
- scaffold interface;
- document TODO with required datasheet inputs;
- keep capability false/unavailable until implemented.

## 12.4 Protocol/safety RTL tests

Nếu Icarus Verilog có thể test:
- reset enters safe state;
- drive enable stays off until explicit safe condition;
- fault forces safe state;
- routing enable defaults off;
- invalid sequence cannot enable drive.

Không cần Quartus synthesis nếu tool không có trong environment, nhưng syntax/test phải PASS.

## R7 acceptance gate

```bash
pytest -q tests/fpga
iverilog -tnull <all compile-safe RTL top-level files as applicable>

python scripts/check_context.py
pytest -q

cd apps/web
npm test
npm run build
```

Commit:

```bash
git add -A
git commit -m "refactor(r7): align FPGA and physical hardware scaffold"
```

---

# 13. Global architecture rules xuyên suốt R0→R7

## 13.1 Lab-First

Luôn giữ:

```text
Safety Gate:
"Can this be energized/executed safely?"

Learning Evaluation:
"Did the student's circuit behave as expected?"
```

Không trộn hai câu hỏi.

## 13.2 Unknown component

```text
UNKNOWN != UNSAFE
```

Nếu safety envelope được đảm bảo và endpoint cần thiết route được:

```text
UNKNOWN → RUN_GUARDED
```

Không được auto-block chỉ vì ngoài library.

## 13.3 Topology mismatch

```text
TOPOLOGY MISMATCH != RUN BLOCK
```

Topology là diagnostic/grading.

## 13.4 Physical wiring

Trong manual breadboard V1:

```text
student wiring is physical truth
```

FPGA không reconstruct expected internal wiring.

## 13.5 Hardware safety

Software verification không thay thế electrical protection.

Không claim safety nếu chỉ có software.

## 13.6 Browser boundary

Browser không bao giờ chứa:
- raw FPGA register;
- raw MUX address;
- `/dev/spidev*`;
- USB endpoint details;
- physical route internals.

## 13.7 Virtual/Physical abstraction

Application phụ thuộc abstraction, không implementation:

```text
HardwareStation
├── VirtualHardwareStation
└── PhysicalHardwareStation
```

## 13.8 No overengineering

Không thêm nếu chưa cần:

```text
Kubernetes
Kafka
RabbitMQ
Redis Cluster
full microservices
GraphQL
Electron rewrite
Rust rewrite
PCIe
cloud-only dependencies
```

## 13.9 No fake implementation

Các trạng thái chưa triển khai phải truthful:

```text
UNAVAILABLE
NOT_IMPLEMENTED
CAPABILITY=false
```

Không return success giả.

---

# 14. Test discipline

Trong mỗi phase:

1. Viết/update test thể hiện architecture requirement.
2. Chạy test và quan sát fail đúng lý do.
3. Implement tối thiểu.
4. Chạy targeted test.
5. Chạy subsystem test.
6. Chạy full repository test.
7. Chạy frontend `npm test` + `npm run build` nếu phase ảnh hưởng contract/frontend hoặc trước commit.
8. Chỉ commit khi green.

Không xóa test chỉ để green.

Nếu test cũ enforce architecture cũ:
- R0 được phép rewrite test theo canonical architecture;
- từ R1 trở đi không được “relax” guardrail để tránh sửa code.

---

# 15. Migration log

Trong:

```text
docs/MIGRATION_LAB_FIRST.md
```

duy trì bảng:

```markdown
| Phase | Status | Commit | Tests | Notes |
|---|---|---|---|---|
| R0 | DONE | <sha> | ... | ... |
| R1 | ... | ... | ... | ... |
```

Mỗi ruling quan trọng ghi:

```text
Ruling:
Finding:
Decision:
Reason:
Cost if wrong:
```

Không ghi chain-of-thought; chỉ ghi quyết định kỹ thuật và evidence.

---

# 16. Không được làm

Trong toàn R0→R7:

- Không merge branch `refactor`.
- Không push force.
- Không sửa branch main/master.
- Không reset/xóa thay đổi user.
- Không rewrite toàn frontend.
- Không đổi Circuit Graph chỉ vì muốn physical scan.
- Không route expected internal circuit để sửa hộ sinh viên.
- Không bắt topology match mới cho Run.
- Không block IC ngoài library chỉ vì unsupported.
- Không claim analog physical support V1.
- Không claim Scope/Generator physical active nếu ADC/DAC/AFE chưa có.
- Không invent electrical limits.
- Không thêm hardware part number chưa được xác nhận.
- Không tối ưu performance ngoài scope nếu không có regression.
- Không tạo một giant commit R0→R7.
- Không tiếp tục phase sau nếu gate phase hiện tại đỏ.

---

# 17. Final verification sau R7

Sau commit R7, chạy full matrix:

```bash
python scripts/check_context.py

pytest -q

pytest -q tests/contracts
pytest -q tests/integration
pytest -q tests/frontend
pytest -q tests/deployment
pytest -q tests/fpga
pytest -q services/api/tests
pytest -q services/hardware-service/tests
pytest -q simulator/circuit-simulator/tests

cd apps/web
npm test
npm run build
```

Nếu `iverilog` có:

```bash
iverilog -tnull <relevant RTL>
```

Kiểm tra git:

```bash
git status
git log --oneline --decorate -12
```

Yêu cầu:
- working tree clean;
- có đủ commit R0→R7;
- không có phase gộp sai scope.

Search architecture drift:

```bash
grep -RIn "Raspberry Pi 5" README.md docs deployment fpga contracts services simulator tests scripts
grep -RIn "SQLite.*baseline\|Database baseline.*SQLite" README.md docs deployment fpga contracts services simulator tests scripts
```

Kết quả trong active docs phải sạch; occurrence trong archive/history/audit mô tả lịch sử là chấp nhận được.

---

# 18. Báo cáo cuối cùng Codex phải trả cho người dùng

Không chỉ nói “Done”.

Báo cáo:

```text
1. Branch + HEAD SHA
2. R0 commit + summary + tests
3. R1 commit + summary + tests
4. R2 commit + summary + tests
5. R3 commit + summary + tests
6. R4 commit + summary + tests
7. R5 commit + summary + tests
8. R6 commit + summary + tests
9. R7 commit + summary + tests

10. Files archived/deleted/renamed
11. New canonical architecture docs
12. Contract versions
13. Known limitations / hardware TBDs
14. Full test matrix
15. Frontend build result
16. Remaining warnings
17. Suggested review checklist before merge
```

Nếu còn warning Vite chunk >500 kB nhưng build pass:
- ghi là non-blocking known warning;
- không gọi nó là refactor failure.

Nếu hardware chưa chứng minh:
- ghi rõ “scaffold/interface only”.

Cuối cùng:

```text
DO NOT MERGE.
DO NOT PUSH TO MAIN.
Stop and ask the user to review branch refactor.
```

---

# 19. Success criteria của toàn refactor

Refactor R0→R7 chỉ được coi là hoàn tất khi:

### Architecture

- `docs/ARCHITECTURE.md` là canonical Lab-First v3.1.
- Không còn active architecture authority mâu thuẫn.
- Mini PC thay Raspberry Pi.
- PostgreSQL là production target.
- CircuitGraph vẫn tách khỏi physical topology.
- Lab-First safety/correctness separation rõ.

### Contracts

Có contract/test cho:

```text
AssignmentDefinition
LabEndpoint
DetectedTopologyGraph
OpaquePhysicalComponent
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
ExecutionDecision
StationCapabilities
InstrumentationExecutionPlan
```

### Hardware Service

- Không thể start physical execution bỏ qua safety lifecycle.
- Capability truthful.
- No fake hardware success.

### Backend

- Có assignment/experiment/station/verification/execution policy boundaries.
- Có queue/lease/slot semantics.
- 30–50 connected users không bị hiểu sai thành 30–50 simultaneous physical runs.

### Simulator

- Có real discrete-event digital execution path.
- VirtualHardwareStation sử dụng simulator.
- Không còn chỉ trả `"running"` mà không simulate.

### Frontend

- 3D editor không bị rewrite/regression.
- Run lifecycle nối backend.
- UI tách SAFETY / TOPOLOGY / FUNCTION.
- Scope/Generator không hiển thị fake physical data.

### FPGA/Physical scaffold

- Host boundary transport-abstract.
- Safe-state/fault/protected-drive/routing/topology-scan boundaries đúng.
- EP4CE10 instrument architecture documented/scaffolded truthfully.
- Không bịa pin/timing/electrical limits.

### Verification

```text
python scripts/check_context.py → PASS
pytest -q                     → PASS
npm test                      → PASS
npm run build                 → PASS
```

Và Git working tree clean.

---

# 20. Bắt đầu

Bây giờ:

1. Xác nhận đang ở branch `refactor`.
2. Đọc hai authority files.
3. Audit source hiện tại ngắn gọn để xác nhận các path/assumption trong prompt còn đúng.
4. Chạy baseline tests.
5. Bắt đầu **R0 בלבד**.
6. Chỉ sau khi R0 acceptance gate PASS và commit xong mới chuyển R1.
7. Tiếp tục tuần tự đến R7.
8. Không merge/push khi kết thúc.
