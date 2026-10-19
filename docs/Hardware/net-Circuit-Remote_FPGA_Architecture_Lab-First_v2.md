# net*CIRCUIT Remote — Kiến trúc Hardware FPGA Lab-First

> Trạng thái audit 2026-10-19: giữ tài liệu này như **PROPOSED / NEEDS_REVIEW**, không phải chứng nhận implementation. Những câu “không được cung cấp” mô tả bộ tài liệu đầu vào của lần soạn gốc; repository hiện có [authority v3.1](../ARCHITECTURE.md), [FPGA scaffold contract](../../contracts/fpga-protocol/versions.md) và RTL/testbench dưới `fpga/`. Chưa có đối chiếu đầy đủ revision 2.1 với schema/ABI, synthesis, timing và phần cứng thật trong lần audit này. Không nâng mục tiêu ADC/DAC/SDRAM thành capability đã có; xem [quy trình kiểm chứng](../VERIFICATION.md).

## Revision 2.1 — Bản soạn lại đầy đủ của FPGA Architecture v2

| Thuộc tính | Giá trị |
|---|---|
| Ngày rà soát | 15-10-2026 |
| Phạm vi | FPGA fabric và phần cứng trực tiếp phục vụ bảo vệ, scan, routing, I/O, đo/phát tín hiệu, memory và transport endpoint |
| Trạng thái | **ARCHITECTURAL PROPOSAL — chưa freeze implementation contract/ABI, chưa chứng nhận hardware closure** |
| Prototype | EP4CE6E22C8N; không yêu cầu SDRAM ngoài |
| Digital Lab V1 mục tiêu | EP4CE10; EP4CE10E22C8N/E144 vẫn là package candidate |
| Bộ nhớ mục tiêu | SDR SDRAM ngoài; chuẩn hóa đề xuất thành **64 MiB = 67.108.864 byte = 512 Mibit** |
| Instruments mục tiêu | Logic Analyzer, Oscilloscope 2CH, Function Generator 2CH |
| Physical execution | Một execution context cho một shared electrical fabric |
| Physical analog routing | Không thuộc V1; ADC/DAC/AFE của instruments không làm thay đổi giới hạn này |
| Tên file | Giữ tên `net-Circuit-Remote_FPGA_Architecture_Lab-First_v2.md`; revision nội dung là 2.1 |

> **Nguyên tắc:** FPGA thực thi hạ tầng và thu tín hiệu thật dưới các giới hạn điện đã được phê duyệt. FPGA không phán xét đáp án, không thay IC sai bằng logic bên trong fabric, không âm thầm sửa wiring.

---

# 0. Cơ sở tham chiếu, giới hạn kết luận và cách đọc

## 0.1 Những tài liệu thực sự đã có

- **[S1]** `net-Circuit-Remote_Architecture_v3_Lab-First(2).md`, bản v3 được đính kèm trong yêu cầu. Ba dòng đầu ghi `SUPERSEDED`, không dùng làm current implementation authority, và chỉ tới `docs/ARCHITECTURE.md (Lab-First v3.1)`.
- **[S1a]** `net-Circuit-Remote_Architecture_v3_Lab-First.md`, bản Project không có ba dòng cảnh báo trên; phần nội dung kiến trúc được dùng để đối chiếu cùng [S1].
- **[S2]** `net-Circuit-Remote_FPGA_Architecture_Lab-First_v2(1).md`, nội dung giống bản FPGA v2 trong Project.

Trong tập tài liệu hiện có không có nội dung `docs/ARCHITECTURE.md` v3.1, schema Contracts, binary ICD, RTL, schematic, QSF/SDC hoặc báo cáo đo phần cứng. Vì vậy:

**Bản này đối chiếu semantics với các tài liệu được cung cấp và đề xuất làm rõ kiến trúc hardware; không tuyên bố đã khớp schema/ABI của repository hiện hành.** Không tự khôi phục v3 đã superseded thành current authority.

`PhysicalExecutionPlan` là tên trong [S1, §8, §25]. `InstrumentationExecutionPlan`, `Lab Execution Compiler` và `1.0-scaffold` xuất hiện trong [S2], nhưng chưa có định nghĩa nguồn để chứng minh quan hệ tương đương. Bản này không tự ý đổi tên contract phía ngoài. Trong nội bộ FPGA, dùng tên mô tả **`FpgaExecutionImage`** cho ảnh cấu hình đã biên dịch, không tạo thêm một application contract thay thế.

## 0.2 Phân loại nội dung

| Nhãn | Ý nghĩa |
|---|---|
| **Kế thừa** | Yêu cầu được hỗ trợ bởi [S1]/[S2] và tiếp tục được giữ |
| **Làm rõ / đề xuất** | Quyết định hardware của revision này, không giả định đã có trong repository |
| **OPEN-GATE** | Thiếu part, schema hoặc phép đo; phải đóng trước khi công bố capability hay freeze PCB/ABI |

Ngoại trừ các phần được ghi rõ là kế thừa hoặc thông số nguồn [H1]–[H5], các chi tiết bổ sung dưới đây là **đề xuất kiến trúc**. Những giới hạn chưa đo không được quảng bá như thông số sản phẩm.

Các từ **MUST / phải**, **MUST NOT / không được**, **SHOULD / nên** chỉ mức bắt buộc trong kiến trúc đề xuất này. Chúng không khẳng định phần cứng hiện tại đã đáp ứng.

## 0.3 Phạm vi dừng ở đâu

Tài liệu chỉ mô tả FPGA và ngoại vi phần cứng gắn trực tiếp với FPGA. Host chỉ xuất hiện tại ranh giới command/configuration/evidence. Không thiết kế lại application, thuật toán chấm bài, hệ quản trị dữ liệu hoặc hạ tầng Web.

---

# 1. Các bất biến hardware phải bảo toàn

**Kế thừa:** [S1, §6.2, §24, §27–28, §31, §36.1, §41]; [S2, §2, §5, §34, §48].

1. `SAFETY != CORRECTNESS`: topology mismatch không phải input của energy-permit logic.
2. `UNKNOWN_COMPONENT` không tự động là `UNSAFE`; nhưng cũng không tự động là `SAFE`.
3. `SafetyVerificationResult.status = UNSAFE` hoặc `INDETERMINATE` không được tạo quyền energize.
4. `BLOCK_SAFETY`, `BLOCK_UNEXECUTABLE`, `RUN_NORMAL`, `RUN_GUARDED` giữ nguyên ý nghĩa. FPGA có quyền veto một thao tác nguy hiểm/không khả thi; không tự nâng `RUN_GUARDED` thành `RUN_NORMAL`.
5. Mọi mạch được chạy, kể cả `RUN_NORMAL`, đều phải qua guarded power-up và runtime protection.
6. Scan trả raw observations; không trả kết luận loại IC chắc chắn chỉ từ một mẫu điện.
7. Một shared breadboard/fabric chỉ có một active execution context; các instruments trong context đó có thể hoạt động đồng thời nếu admission cho phép.
8. Capture không được âm thầm mất sample, đổi sample rate, thay encoding hoặc cắt ngắn dữ liệu rồi báo hoàn chỉnh.
9. Clock loss, reset, mất cấu hình hoặc host loss không được giữ nguồn/drive vô thời hạn.
10. Safe shutdown không được chờ SDRAM, DMA/readback, command completion hoặc một ACK từ host.
11. Không có master nào ngoài memory subsystem phát arbitrary physical SDRAM address trong normal operation.
12. Capability phải phản ánh build, board profile và validation thực tế; số channel mục tiêu không phải bằng chứng chúng đã tồn tại.

---

# 2. Tổng quan sáu plane và ranh giới ngoài FPGA

Giữ cách tổ chức sáu plane của [S2, §3], nhưng chúng là **ranh giới trách nhiệm**, không phải sáu tầng nối tuần tự.

```text
                      Host hardware interface
                  commands / status / observations
                                 |
              +------------------v--------------------+
              | Transport adapter + protocol endpoint |
              | bounded control path | chunked bulk   |
              +------------+--------------------------+
                           |
      +--------------------v-------------------------------------+
      |                    FPGA FABRIC                           |
      |                                                          |
      | CONTROL: execution FSM, image banks, resource admission   |
      |       |                                                  |
      | SAFETY: permits, fault latch, watchdog, bounded shutdown  |
      |       |          dedicated inhibit/status wires          |
      | LAB I/O: scan sequencer, route sequencer, drive, sense     |
      |       |                                                  |
      | INSTRUMENT: LA | Scope 2CH | DDS 2CH | time/trigger        |
      |       |           |             +-> DAC [local LUT]      |
      |       +-----------+                                      |
      |             capture FIFOs                                |
      |                    |                                     |
      | MEMORY: region manager -> bounded arbiter -> SDR ctrl     |
      |                    |                                     |
      | DATA: sealed descriptors, readback, raw scan, telemetry    |
      +--------------------+-------------------------------------+
                           |
                       SDR SDRAM

External safety island:
  current limiter / voltage guard / supervisor / fault latch
       | hard inhibit (không cần FPGA clock hoặc USB)
       +--> digital OE, scan source, generator disconnect, rail cutoff

Electrical interfaces:
  FPGA <-> protected level interface <-> endpoint routing <-> DUT
  DUT  -> protected scope AFE -> ADC -> FPGA
  FPGA -> DAC -> reconstruction/output AFE -> protected disconnect -> DUT
```

**Quyết định tối ưu:** DDS cơ bản không nối vào SDRAM. Chỉ một mở rộng AWG được kiểm chứng mới thêm memory-read client. Safety không đi qua shared register bus để cắt nguồn.

## 2.1 Module ownership

| Module | Sở hữu | Không được sở hữu |
|---|---|---|
| Protocol Endpoint | Framing, sequence, command admission ở mức gói | Energy permit hoặc physical pin bypass |
| Execution Controller | Active image, lifecycle, execution token | Full topology matching |
| Safety Core | Permit gating, fault evidence, stop deadlines | Điểm số, expected truth table |
| Route Controller | Shadow/active route và switch sequencing | Tự sửa circuit của sinh viên |
| Scan Engine | Test-source sequencing và observations | IC identity/classification |
| Drive/Sense | Bounded I/O và measurement front-end | Raw uncontrolled FPGA-pin exposure |
| Time/Trigger | Timebase, sample anchors, event distribution | Giả định mọi clock cùng pha |
| Instruments | Sample production hoặc DAC codes | Physical SDRAM addresses |
| Memory Subsystem | Region bounds, arbiter, SDR timing | Quyết định cho phép cấp nguồn |
| Data Plane | Descriptor readback, packetization | Làm chậm hard inhibit |

---

# 3. Contract conformance: cái gì giữ nguyên, cái gì chưa thể xác nhận

## 3.1 Ma trận traceability tại ranh giới FPGA

| ID | Contract / ràng buộc nguồn | Nghĩa vụ hardware của bản này | Mức đối chiếu |
|---|---|---|---|
| CT-01 | `PhysicalExecutionPlan` [S1, §8] | Nhận primitives từ plan đã compile; dùng ảnh nội bộ, không raw graph | Khớp semantics; schema chưa xác nhận |
| CT-02 | `InstrumentationExecutionPlan` [S2, §6] | Không tự coi là alias của CT-01; cần mapping đã version hóa | OPEN-GATE |
| CT-03 | `LabEndpoint` [S1, §6.2] | Resource IDs, drive/sense direction, approved node binding | Giữ nguyên semantics |
| CT-04 | `SafetyVerificationResult` [S1, §27.1] | Host approval không vượt hard limits/interlocks | Giữ nguyên semantics |
| CT-05 | `TopologyVerificationResult` [S1, §27.2] | Không tạo topology-correctness gate trong RTL | Giữ nguyên semantics |
| CT-06 | `FunctionalVerificationResult` [S1, §27.3] | Cung cấp measurements và quality; không tự grading | Giữ nguyên semantics |
| CT-07 | `ExecutionDecision` [S1, §27.4] | Giữ bốn quyết định, guarded restrictions chỉ chặt hơn | Giữ nguyên semantics |
| CT-08 | Active Electrical Topology Discovery [S1, §9.4] | Tách observation, bounded continuity, signature; trả evidence | Làm rõ hardware modes |
| CT-09 | `BreadboardNodeID` [S1, §9.4] | Dùng NodeMap revision cố định theo PCB | Giữ nguyên semantics |
| CT-10 | `HardwareStation` [S1, §20] | Các thao tác cấu hình/arm/run/stop/readback có hiệu lực xác định | Mapping semantics ở §5 |
| CT-11 | `GET_CAPABILITY` [S1, §30] | Feature/limit/health snapshot, không chỉ compile flags | Làm rõ payload; ABI chưa chốt |
| CT-12 | `SET_ROUTE` [S1, §30] | Validate -> shadow -> commit dưới energy inhibit | Làm rõ transaction |
| CT-13 | `ARM_CAPTURE` / `START_CAPTURE` [S1, §30] | Arm/acquisition/start/trigger tách rõ; không tự cấp nguồn | Phải đóng ICD |
| CT-14 | `STOP`, `RESET`, `SAFE_STATE` [S1, §30] | Điện an toàn, invalidate quyền cũ, giữ evidence đúng policy | Làm rõ reset classes |
| CT-15 | Frame sequence/length/CRC [S1, §30] | No side effect trước complete validation | Giữ nguyên envelope semantics |
| CT-16 | `StationCapabilities` [S1, §33] | Cung cấp số resource thật và configuration constraints | Không tự đổi tên field ngoài |
| CT-17 | Scope 2CH [S1, §35] | Hai channel acquisition và alignment được đo | Giữ mục tiêu; chưa đo |
| CT-18 | Generator 2CH [S1, §36] | Hai DDS/control channel độc lập; external DAC/AFE | Giữ mục tiêu; chưa đo |
| CT-19 | Shared SDRAM arbiter [S1, §36.1] | Một memory controller, bounded client service | Giữ và cụ thể hóa |
| CT-20 | Physical slots = 1 [S1, §41] | Một hardware owner; không nhân bản 30–50 contexts | Giữ nguyên |
| CT-21 | Capture result [S1, §37, §45] | Sample rate/count/timestamp/encoding và quality có thể ánh xạ | Schema chưa xác nhận |
| CT-22 | EP4CE6 -> EP4CE10 [S1, §49] | Portable core, target wrappers, protocol semantics ổn định | Giữ nguyên |

## 3.2 Không được đồng nhất ba mức “khớp”

- **Architectural semantics:** có thể đánh giá từ hai Markdown đã cung cấp.
- **Schema / wire ABI compatibility:** cần source Contracts/ICD thực; chưa thể xác nhận.
- **Hardware implementation conformance:** cần RTL simulation, fitter/timing và bench evidence; chưa thể xác nhận.

Không dùng một checklist tài liệu thay cho hai mức sau. Bản sửa không được gắn nhãn “fully compliant v3.1” khi authority v3.1 chưa được đối chiếu.

---

# 4. Execution image: cấu hình nguyên khối, bất biến sau phê duyệt

## 4.1 Nội dung cần có ở ranh giới hardware

`FpgaExecutionImage` là cấu trúc nội bộ đề xuất. Không yêu cầu FPGA parse JSON/Protobuf hoặc chứa toàn bộ application plan.

| Nhóm | Nội dung logic tối thiểu |
|---|---|
| Identity | image revision, plan reference, link/boot session, execution epoch |
| Binding | hardware-profile revision, NodeMap revision, scan-evidence generation |
| Policy | `RUN_NORMAL` / `RUN_GUARDED`, bounded duration, approved safety envelope |
| Routing | resource IDs, endpoint-to-node bindings, exclusive resource masks |
| Digital drive | allowed channels, direction/mode, initial values, update limits |
| Power/scan | allowed rails/test sources, validated profile IDs, staged timeouts |
| Clock/generator | frequencies/tuning words, phases, waveform IDs, output limits |
| Trigger/capture | arm dependencies, source/consumer masks, pre/post depth, formats |
| Memory | descriptor requests, capacities, workload profile ID, permitted concurrency |
| Integrity | complete-image length, configuration checksum, sealed flag |

Không đặt IC identity, expected truth table hoặc topology-match status vào phép tính `energy_permit`.

## 4.2 Ba mức giới hạn

```text
Effective hardware limits
  = intersection(
      physical protection limits,
      validated board/build envelope,
      approved execution restrictions
    )
```

Runtime request có thể giảm quyền, không được mở rộng giới hạn đã có trong board/build. Hardware-profile ID chỉ chọn một cấu hình đã được validation; nó không phải cơ chế để host tự ghi lại absolute electrical limits tùy ý.

## 4.3 LOAD -> SEAL -> APPLY -> ARM

1. Load vào `SHADOW_IMAGE`; active outputs không đổi.
2. Kiểm tra toàn bộ length, range, resource masks, profile identity, descriptor requests và cross-field constraints.
3. Seal một image revision cụ thể. Sau seal, mọi sửa route/power/direction/capture layout hoặc tham số ngoài tập runtime updates đã phê duyệt làm mất hiệu lực seal và approval tương ứng. Cập nhật nằm trong envelope và atomic-update mode đã được image cho phép tuân theo §4.4, không tự mở rộng quyền.
4. Plan-level approval phải ràng buộc đúng sealed image. Safety kiểm tra trước compile không đủ để phê duyệt route/drive phát sinh sau compile.
5. Apply infrastructure trong trạng thái không cấp năng lượng DUT; route commit thành công không tự enable outputs.
6. Kiểm tra lại live health, evidence validity, resource reservation trước power-up; kiểm tra memory admission trước khi capture thực sự bắt đầu.

Configuration checksum giúp phát hiện nhầm ảnh/ảnh bị sửa; **không phải chữ ký xác thực và không thay thế protection**.

## 4.4 Cho phép cập nhật lúc chạy ở phạm vi hẹp

`WRITE_OUTPUT` chỉ đổi value trên mask đã cấp quyền. Không đổi direction, route ownership, electrical domain hoặc output envelope. Cập nhật nhiều bit cần atomic latch/timestamp boundary nếu image yêu cầu đồng bộ.

Đổi route, power domain, AFE range hoặc memory layout trong lúc chạy bị từ chối ở V1. Đổi các tham số generator chỉ được hỗ trợ nếu có atomic update mode đã công bố; nếu chưa có thì phải stop và prepare lại.

---

# 5. Semantic command contract — không tự đặt một ABI ngoài mới

**Kế thừa:** các tên operation trong [S1, §20, §30]. **Làm rõ:** completion, side effects và internal decomposition.

| Operation nguồn | Nghĩa vụ hardware | Quy tắc completion |
|---|---|---|
| `GET_CAPABILITY` | Snapshot build/profile/resources/health/version | Không đổi execution state |
| `SET_CLOCK` | Stage cấu hình clock trong allowed envelope | Không tự phát clock |
| `SET_ROUTE` | Stage + validate + apply transaction trong trạng thái được phép | Applied chỉ sau toàn bộ sequencer và required verification thành công |
| `WRITE_OUTPUT` | Latch value/mask hợp lệ vào drive engine | Không vượt channel ownership hoặc permit |
| `CONFIGURE_TRIGGER` | Stage trigger config; latch atomically trước arm | Không tự trigger/run |
| `ARM_CAPTURE` | Reserve buffer, arm local engines, xác nhận acquisition readiness | Không tự bật DUT power hoặc experiment source |
| `START_CAPTURE` | Cho phép acquisition/force-start theo mode đã cấu hình | Phải ghi rõ ICD: không đồng nhất ngầm với `run()` |
| `READ_CAPTURE` | Đọc descriptor hoặc bounded range của dữ liệu đã sealed | Không cấp quyền ghi arbitrary SDRAM |
| `STOP` | Dừng experiment và đưa phần điện về safe theo bounded shutdown | Không đợi host tải hết capture |
| `SAFE_STATE` | Loại bỏ mọi energy permit; scan stimulus cũng OFF | ACK nhận lệnh khác với hoàn tất trạng thái điện |
| `RESET` | Reset class được công bố; mọi quyền chạy cũ bị invalidated | Không auto-resume, không tự clear fault đang tồn tại |
| `configure_generator()` | Cấu hình 2CH từ station abstraction | Binary primitive tương ứng chưa có định nghĩa trong [S1, §30] |
| `run()` | Start deterministic execution sau all-required-ready barrier | Không tự bỏ qua scan/safety/power/admission |

Các tên như `LOAD_ROUTE_SHADOW`, `COMMIT_ROUTE`, `CONFIG_GENERATOR`, `READ_STATUS`, `PREPARE`, `ARM`, `START` trong bản v2 có thể dùng làm **micro-operations nội bộ**. Chỉ expose thành wire commands khi ICD xác lập opcode, payload, version và compatibility.

### Các trường semantics cần đóng trong ICD

Mỗi command cần command identity, sequence, context token nếu có, bounded payload, acceptance states, side effects, timeout, completion status và error class. Một operation bất đồng bộ có thể trả `ACCEPTED` rồi `APPLIED`/`FAILED`; không được trả success cuối cùng ngay khi chỉ mới enqueue.

`SAFE_STATE`/emergency inhibit là idempotent. Các command làm phát xung, single-step hoặc start phải có duplicate suppression; retry cùng sequence không được phát thêm một lần.

---

# 6. Execution lifecycle và instrument lifecycle tách nhau

## 6.1 Execution FSM

```text
RESET_HOLD
    |
    v
SAFE_IDLE <----------------------------------------------+
    |                                                     |
    +-> SCAN_ACTIVE -> SAFE_IDLE [evidence generation]     |
    |                                                     |
    +-> PREPARING -> PREPARED -> ROUTE_APPLY               |
                              |                           |
                              v                           |
                       GUARDED_POWER_UP                   |
                              |                           |
                              v                           |
                            READY                         |
                              | all-required-ready        |
                              v                           |
                            ARMED                         |
                              | deterministic START       |
                              v                           |
                           RUNNING                        |
                              |                           |
                              v                           |
                           STOPPING ----------------------+

Critical fault from any state -> ENERGY_INHIBIT -> FAULT_LATCHED
```

`SCAN_ACTIVE` không phải `SAFE_IDLE`: continuity scan có giới hạn vẫn đưa năng lượng vào DUT. `SCAN_READY` nếu cần status chỉ nghĩa là observations đã sẵn sàng, không nghĩa là topology đúng hay safety đã PASS.

Không bắt một execution phải đi qua `CAPTURING` như trạng thái độc quyền sau `RUNNING`. Capture có thể hoạt động trước, trong và sau start để thu pre-trigger hoặc transient power-up.

## 6.2 Capture FSM, riêng cho từng instrument

```text
DISABLED -> CONFIGURED -> ALLOCATED -> ARMED/PRETRIGGER
                                      |
                                    TRIGGERED
                                      |
                                  POSTTRIGGER
                                      |
                                    DRAINING
                                      |
                           SEALED_COMPLETE / SEALED_PARTIAL
                                      |
                                   RELEASED
```

`ARMED/PRETRIGGER` được phép ghi dữ liệu trước trigger nếu mode yêu cầu. Vì vậy bandwidth reservation phải có hiệu lực từ thời điểm bắt đầu pre-trigger acquisition, không đợi experiment `START`.

## 6.3 Barrier đồng bộ

Start chỉ hợp lệ khi route, power, required capture engines, generator configuration và trigger consumers đều xác nhận ready. Mọi ACK qua CDC phải mang đúng generation của lần arm đó. Timeout của một consumer làm abort lần arm, không khởi chạy “một phần” một cách im lặng.

Một `run()` không sử dụng capture vẫn có thể tồn tại nếu profile cho phép; internal execution arm không buộc host giả tạo một `ARM_CAPTURE`.

## 6.4 Mapping state ra ngoài

State FPGA là chi tiết implementation. Khi đưa status qua hardware boundary phải có mapping rõ tới lifecycle đã có trong Contracts; không thay enum phía ngoài bằng enum RTL một cách ngầm định.

---

# 7. Safety island và cây energy permits

## 7.1 Hai lớp phản ứng độc lập

```text
Fault/current/voltage/comparator/supervisor
         |
         +--> EXTERNAL LATCHED INHIBIT --> physical enables OFF
         |
         +--> FPGA synchronized status --> fault record / lifecycle cleanup
```

External safety island phải xử lý được FPGA clock stopped, FPGA unconfigured, brownout và stuck control. FPGA còn hoạt động thì ghi nhận và điều phối cleanup; không phải điều kiện để đường inhibit phần điện có hiệu lực.

Watchdog trong FPGA dùng cùng clock đã ngừng không thể tự đếm tới timeout. Vì vậy cần external watchdog/supervisor có timebase độc lập hoặc cơ chế phần cứng tương đương đã chứng minh cắt được khi FPGA clock mất. Đây là **yêu cầu bổ sung**, không phải khẳng định bo hiện có đã trang bị.

## 7.2 Tách từng loại permit, tránh phụ thuộc vòng

Không dùng một `global_drive_enable` duy nhất cho cả scan, rail power và experiment output.

```text
base_health_permit =
    external_interlock_ok AND configuration_ready
    AND supervisor_alive AND no_latched_fault

scan_source_permit =
    base_health_permit AND scan_context_valid
    AND scan_routes_ready AND bounded_scan_timer_alive
    AND scan_mode_allows_stimulus AND normal_sources_inhibited

rail_enable_permit =
    base_health_permit AND sealed_plan_approved
    AND run_watchdog_alive AND rail_route_safe
    AND state_allows_guarded_power

normal_source_permit =
    base_health_permit AND sealed_plan_approved
    AND execution_context_valid AND route_verified
    AND run_watchdog_alive AND power_stage_ready
    AND state_allows_requested_source
```

`rail_enable_permit` không phụ thuộc `power_stage_ready` của chính rail chưa bật. `scan_source_permit` không phụ thuộc approval của execution plan chỉ có thể tạo sau scan. Mọi permit thực tế còn phải qua external inhibit; công thức trên là semantics, không phải RTL combinational đa-clock để nối trực tiếp.

## 7.3 Channel-level enforcement

Mỗi source channel có requested enable, ownership, route-ready, allowed mode và envelope. Hiệu lực thực là giao của các điều kiện đó với permit của source class tương ứng. Một bit enable ghi ở register không thể vượt logic này.

Board profile phải có hard upper bounds cho current/voltage/duration/frequency phù hợp phần cứng. Không nhận giá trị tùy ý từ host rồi giả định nó đã an toàn.

## 7.4 An toàn của unknown component

Chỉ được chạy guarded khi **supply, các source/sense paths, endpoint binding và runtime protection đều đủ để chứng minh electrical envelope cần thiết**. Không cần biết tên IC để đánh giá mọi điều kiện đó; nhưng không được dùng “có eFuse” làm bằng chứng an toàn cho mọi loại IC.

Unknown VCC/GND/polarity, nguồn ngoài chưa cách ly, injection-current path chưa kiểm soát hoặc pin-domain không được chứng minh phải giữ safety indeterminate. Đây là hạn chế điện thực, không phải topology-correctness gate. [S1, §9.4, §27.1, ADR-LAB-003]

---

# 8. Safety staging và freshness của evidence

## 8.1 Trình tự hardware đúng

```text
SAFE electrical state
  -> infrastructure self-check + passive voltage observation
  -> bounded continuity scan theo scan permit riêng
  -> raw observations + validity/coverage/generation
  -> [boundary: candidate route/drive/power configuration]
  -> freeze candidate execution image
  -> plan-level safety approval gắn đúng image revision
  -> hardware limits/resource checks
  -> de-energized route apply + required route verification
  -> guarded power-up + runtime qualification
  -> readiness barrier -> execution
```

Mọi sửa đổi phát sinh sau approval phải được kiểm tra lại hoặc bị từ chối. Safety staging ở đây không thay `ExecutionDecision` contract; nó xác định các điều kiện phần cứng không thể bỏ qua trước energize.

## 8.2 Passive pre-check không chứng minh mọi short

Quan sát 0 V ở hai node khi không có stimulus không đủ kết luận chúng nối tắt hay đang tách rời. Pre-check chỉ báo những điều thực sự đo được: external voltage, interlock status, rail feedback, source disabled, front-end readiness.

Kiểm tra continuity/impedance cần test excitation đã giới hạn, dù điện áp hoặc dòng rất nhỏ. Không gọi tất cả các phép đo đó là “không đưa năng lượng”.

## 8.3 Evidence binding

Một scan result phải gắn ít nhất với NodeMap/profile revision, scan generation, power condition, coverage mask, completion/abort status và timestamp validity. Image dùng evidence của revision khác bị từ chối.

Wiring có thể thay đổi sau scan. Không được hứa rằng token phần mềm phát hiện được mọi thao tác cắm/rút dây. V1 cần một trong các điều kiện vận hành phần cứng được validation: interlocked access, board-change detection phù hợp, hoặc procedure buộc re-scan trước mỗi lần energize cùng runtime protection cho thay đổi ngoài khả năng phát hiện.

Time-to-live của evidence chỉ là giới hạn độ cũ, **không phải cảm biến thay đổi topology**. Khi có sự kiện thay đổi board/interlock hoặc nghi ngờ evidence stale, inhibit và scan lại.

---

# 9. Fault, STOP, SAFE_STATE và recovery

## 9.1 Two-stage shutdown, không phụ thuộc dữ liệu

**Stage 1 — energy inhibit:** disable digital/clock drive, scan stimulus, generator output stage; yêu cầu rail cutoff bằng đường phần cứng. Latch nguyên nhân fault. Không đợi request bus hoặc FIFO drain.

**Stage 2 — isolation và cleanup:** sau khi nguồn đã ở mức cho phép switching, route controller đưa hạ tầng về default-open; capture ngừng nhận mẫu, seal partial khi có thể; giữ fault/status evidence.

Memory hỏng hoặc clock acquisition mất không được cản Stage 1 hay route isolation. Không xếp “đóng descriptor xong” làm tiền đề mở route.

## 9.2 Điện áp dư và nguồn ngoài

`power_enable = 0` không chứng minh DUT rail đã về 0 V. Cần discharge policy, feedback hoặc một upper-bound discharge interval có validation. Khi còn nguồn ngoài không kiểm soát được, trạng thái là inhibited/fault, không báo `SAFE_COMPLETE` giả.

Đường emergency isolation phải phù hợp việc ngắt trong điều kiện fault thực tế. Khi năng lượng không giảm trong deadline, giữ fault latched và hard inhibit; không tiếp tục make route mới. Protective earth/reference ground không bị tùy tiện đưa qua sequence “mở tất cả switch”.

## 9.3 STOP bình thường

STOP bắt đầu bounded quiescence: ngừng clock/generator ở boundary hợp lệ nếu đạt deadline, disable normal drive, remove rail permit, chờ electrical-safe criterion rồi isolate routing. Capture drain chạy độc lập trong thời hạn được cấp.

Nếu hết quiescence deadline hoặc protection fault xuất hiện, chuyển ngay sang hard inhibit. Fault có thể cắt ngắn một pulse; đó là hành vi an toàn cần ghi nhận, không cố giữ waveform đẹp trong khi có nguy hiểm.

## 9.4 Reset classes

| Loại | Hiệu lực điện | Hiệu lực dữ liệu/context |
|---|---|---|
| Execution abort / `SAFE_STATE` | Mọi experiment/scan source OFF; route cleanup | Invalidate run token; giữ sealed captures nếu memory khỏe |
| Controller soft reset | Inhibit trước, reset FSM/command state | Không tái dùng execution epoch; policy descriptor được công bố |
| Full FPGA configuration/reset | External hardware giữ enables OFF | Close link, invalidate descriptors không được bảo đảm giữ, reinitialize memory |
| Board power loss | Fail-safe bằng phần cứng ngoài FPGA | Không giả định SDRAM retention hay timestamp continuity |

`RESET` không tự clear physical fault latch đang active. Recovery yêu cầu fault input hết, live health ổn định, evidence/plan mới khi cần và explicit recovery. Không auto-restart sau power recovery, PLL relock hoặc reconnect.

## 9.5 Fault evidence

Giữ first-fault code, subsequent-fault mask, execution identity, route/image revision, requested/effective enables và timestamp-quality flag trong register/on-chip memory nhỏ. Nếu timebase không còn hợp lệ, báo `timestamp_valid = false`; không bịa một thời điểm chính xác.

---

# 10. Watchdog và execution identity

## 10.1 Watchdog nhiều mục đích

- **Host-liveness watchdog:** chỉ refresh bởi heartbeat hợp lệ của active link/context; không bởi bất kỳ packet nào.
- **Execution duration limiter:** thời gian energize tối đa không thể gia hạn vô hạn chỉ nhờ heartbeat.
- **Scan dwell limiter:** giới hạn thời gian từng stimulus và toàn scan, độc lập việc host đọc observations.
- **External FPGA-liveness watchdog:** phát hiện clock/control ngừng theo fault model đã validation; trực tiếp inhibit phần điện. Tín hiệu service phải phản ánh điều kiện/progress cần giám sát, không là bộ chia tự chạy vẫn refresh trong khi control đã treo. Watchdog không chứng minh phát hiện mọi lỗi logic tùy ý.

Replay heartbeat/sequence cũ không được làm mới timeout. Mất host khi đang scan cũng phải tắt stimulus; scan không phải ngoại lệ của watchdog.

## 10.2 Identity nhiều tầng

Mọi side-effect command cần kiểm tra tuple tương đương:

```text
(link_boot_session, execution_epoch, image_revision, command_sequence)
```

`execution_epoch` tăng/đổi khi prepare execution mới, STOP kết thúc execution, explicit abort, fault hoặc plan invalidation. Counter không wrap rồi tái dùng trong một phiên; gần wrap thì inhibit và tạo phiên mới.

Counter trong FPGA bị reset về cùng giá trị sau hard reset **không đủ** chống stale command. Full reset phải đóng transport session, loại dữ liệu cũ trong bridge/FIFOs/parser và chỉ nhận side-effect commands sau fresh-session binding.

## 10.3 Boot freshness là closure gate bắt buộc

Board integration phải chọn và chứng minh một cơ chế:

- Boot generation từ supervisor/nguồn lưu giữ độc lập, không lặp lại trong phạm vi replay cần chặn; hoặc
- Verified reset-and-drain của toàn transport boundary, kết hợp session identity mới và handshake không chấp nhận byte/transaction cũ trước binding.

Không giả định EP4CE6/EP4CE10 tự có persistent monotonic counter hoặc entropy source sẵn. Nếu bridge không hỗ trợ purge/binding đủ mạnh, không công bố reset-replay closure; giữ outputs inhibited cho đến khi link được thiết lập sạch.

Đây là chống thao tác trễ/lặp ngoài ý muốn, không phải thiết kế một trust/authentication system trong FPGA.

## 10.4 At-most-once side effects

Baseline chỉ cho một outstanding mutating transaction, cộng một đường inhibit ưu tiên. Cache response gần nhất hoặc replay window hữu hạn theo ICD. Duplicate đã thực hiện trả lại status, không chạy lại pulse/START/COMMIT.

`STOP` theo execution phải scoped để packet dừng cũ không dừng execution mới. Global `SAFE_STATE` hợp lệ vẫn là lệnh giảm năng lượng idempotent, nhưng không được bỏ qua framing/integrity validation để tìm một chuỗi byte giống opcode trong bulk payload.

---

# 11. Routing fabric: chỉ kết nối hạ tầng tới mạch thật

## 11.1 Phân loại physical paths

```text
R_SCAN   : bounded stimulus / high-impedance scan sense
R_DIGITAL: protected source, clock, LA/digital sense endpoints
R_SCOPE  : approved measurement path tới scope AFE
R_GEN    : approved generator output path
R_POWER  : current-limited supply distribution, nếu board hỗ trợ
```

Các path có thể dùng một phần cùng switch hardware, nhưng phải có resource exclusivity rõ. Power không tự đi qua digital signal MUX. Scope/generator analog path không tự đi qua switch số chưa được characterization.

Không bắt buộc lắp full N×N crosspoint giữa mọi breadboard node. **V1 ưu tiên endpoint-to-node routing** và banked scan selection, giữ wiring nội bộ của sinh viên là wiring thật. Đây là lựa chọn hardware đề xuất để giảm switch count/pins và tránh sửa bài làm.

Nếu authority hiện hành có một chế độ circuit-assembly khác cho phép fabric tổng hợp net, chế độ đó phải được xác lập riêng; không tự suy diễn hoặc bật trong Lab-First student-wiring mode này.

## 11.2 Resource table

Mỗi route resource có ID, electrical class, allowed directions, exclusive group, supported endpoints/nodes, on/off bounds, voltage/current envelope, power-off behavior và verification method. FPGA cần lookup/mask checks nhỏ; không chạy routing solver tổng quát.

Một sense bus thụ động không được đóng nhiều switch vào các net khác nhau rồi vô tình nối tắt chúng. “Sense fan-out” chỉ hợp lệ khi có electrically isolated buffered inputs hoặc cùng net đã được xác nhận. Một source fan-out cũng chỉ hợp lệ nếu image phê duyệt các kết nối điện mà nó tạo ra.

## 11.3 Node mapping

`BreadboardNodeID` định danh electrical group trên PCB, không định danh từng lỗ nhựa độc lập. NodeMap phải mô tả rails có bị chia đoạn, các đường cố định và endpoint reserved. Không hard-code giả định mọi breadboard “830 lỗ” có topology giống nhau. [S1, §9.4]

---

# 12. Route transaction: atomic về quyền nhìn thấy, không giả định vật lý tức thời

## 12.1 Một trình tự duy nhất cho V1

```text
Validate complete shadow route + ownership
  -> assert ALL affected-source inhibits
  -> remove DUT rail permit theo policy V1
  -> confirm electrical condition permits switching
  -> OPEN old switch paths
  -> wait validated break interval
  -> program new switch configuration
  -> wait settle interval
  -> readback/electrical verification nếu yêu cầu
  -> publish active route revision
  -> keep normal outputs OFF
```

V1 không live-reroute. Tắt FPGA output chưa đủ khi IC thật đang được cấp nguồn và tự drive output. Vì vậy route-changing transaction phải tính cả DUT rails, generator và mọi nguồn ngoài.

## 12.2 Ý nghĩa “atomic commit”

Shadow table được xuất bản thành một active revision duy nhất sau completion. Switch ngoài FPGA có thể cập nhật tuần tự; tính an toàn đạt bằng isolation và sequencing, không phải lời hứa tất cả tiếp điểm đổi cùng một clock.

Checksum/configuration readback chỉ chứng minh register của switch đã nhận dữ liệu; nó không tự chứng minh tiếp điểm điện không stuck-on. Required verification phụ thuộc fault model của route class. Không có readback thì capability phải nói rõ và dùng kiểm chứng khác khi safety cần.

## 12.3 Failure handling

Timeout, incomplete table, illegal simultaneous closures hoặc verification failure không tạo active route mới. Inhibit được giữ và route revision đánh dấu invalid. Không tự khôi phục drive cũ sau commit thất bại.

Simple invalid/stale request đã bị reject trước side effect không cần phá active route hợp lệ. Đây là thay đổi có chủ đích so với [S2, §11.2]; xem fault taxonomy ở §27. Lỗi làm trạng thái vật lý không còn đáng tin thì vẫn hard inhibit.

---

# 13. Scan architecture: ba chế độ điện rõ ràng

## 13.1 Mode contract

| Mode nội bộ đề xuất | Có test energy? | Điều kiện | Kết quả |
|---|---|---|---|
| `PASSIVE_OBSERVE` | Không chủ động inject | Các input paths có rating/protection phù hợp | Điện áp/logic hiện có, external-source evidence |
| `LIMITED_ENERGY_CONTINUITY` | Có, giới hạn V/I/dwell/charge | Scan envelope đã validation, normal sources OFF | Continuity/impedance observations, không auto-identity |
| `ACTIVE_SIGNATURE_SCAN` | Có power/vector có kiểm soát | Pin/power mapping đủ căn cứ + scan-specific approval | Raw response của supported test profile |

Tên “Active Electrical Topology Discovery” của [S1] vẫn là tên phương pháp tổng thể. `PASSIVE_SCAN` của v2 mô tả cả stimulus; do đó không dùng tên này để suy ra không có năng lượng. Legacy mapping sang mode mới chỉ thực hiện khi ICD xác nhận semantics.

`ACTIVE_SIGNATURE_SCAN` không bắt buộc thành công trước mọi Run. Unknown component có thể không đủ điều kiện signature scan nhưng vẫn chạy guarded khi các điều kiện điện và endpoint route được chứng minh độc lập.

## 13.2 Scan transaction

```text
Acquire scan resource lock
  -> inhibit normal sources / verify power condition
  -> select one stimulus path and valid sense bank
  -> establish bounded test setting
  -> settle
  -> sample / accumulate
  -> disable stimulus
  -> discharge/settle as required
  -> emit observation record
  -> next test or terminate
```

Không giữ stimulus active khi Observation FIFO đầy hoặc host ngừng đọc. Sequencer phải có hành vi pause an toàn: stimulus OFF trước khi chờ; nếu không thể pause tại boundary hợp lệ thì abort và đánh dấu incomplete.

## 13.3 Observation record

Các trường logic cần có: scan ID/generation, step index, stimulus node/mode/profile, sense-node range/bitmap, raw ADC/logic result, measurement range, power condition, sample timing, saturation/fault/quality flags và completion coverage.

Không gửi một ma trận Boolean “connected/not-connected” như bằng chứng tuyệt đối nếu front-end chỉ đo điện áp qua linh kiện bán dẫn. IC protection structures, leakage và đường song song có thể làm observation không tương đương một jumper kim loại; kết luận phải dựa vào resolution phía ngoài và điều kiện test được ghi rõ. Quy định power-off/injection của switch phải được kiểm tra theo từng part. [H2]

## 13.4 Tối ưu scan theo số node, không theo số lỗ

Gọi `N` là số electrical nodes và `P` là số sense nodes có thể đo thực sự song song. Full stimulus-by-node scan có khoảng `N × ceil(N/P)` lượt sense-bank, trước các tối ưu hợp lệ. Đây là mô hình chi phí, không phải cam kết scan mọi IC.

```text
T_scan ≈ sum_over_steps(
    t_select + t_stimulus_settle + t_measure + t_release
)
```

Dùng banked front-end, scan masks, calibration baseline và FIFO streaming để giảm pin/memory. Không cần giữ full N×N matrix trong M9K. Bỏ qua các step chỉ khi test profile cho phép, và luôn báo coverage thực.

---

# 14. Voltage-domain boundary, nguồn và bảo vệ

## 14.1 Mọi đường tới DUT đều phải được xét

Không chỉ digital output. Scan source, high-impedance sense, LA input, scope input, generator output, trigger input và supply paths đều là ranh giới điện.

FPGA GPIO không đồng nghĩa input chịu 5 V hay arbitrary DUT voltage. Các bảng thiết bị Cyclone IV và operating limits của part thực phải là cơ sở; dùng external protection/translation phù hợp, không dựa vào một điện trở nối tiếp đơn lẻ như giải pháp phổ quát. [H1, H5]

## 14.2 Disabled không nhất thiết isolated

Switch/buffer unpowered có thể bị back-power qua đường tín hiệu; powered-off protection là đặc tính cần kiểm tra, không được suy từ chân OE đã OFF. Các đặc tính fail-safe logic và signal-path power-off isolation cũng khác nhau. TI mô tả trực tiếp nguy cơ back-power qua ESD diode nếu thiếu bảo vệ. [H2]

Phải review cả chiều DUT -> FPGA và FPGA/instrument -> DUT khi một rail mất nguồn. Thử nghiệm cả nguồn ngoài tại endpoint, power sequencing và brownout.

## 14.3 Electrical envelope cần mô tả

| Nhóm | Tham số phải xác lập từ part/bench |
|---|---|
| Power | Voltage range, current-limit tolerance, cutoff response, capacitance/energy, discharge, reverse-current behavior |
| Digital source | VOH/VOL under load, source/sink limits, short/contention duration, OE off behavior |
| Digital sense | Thresholds, hysteresis nếu có, input range, leakage, off-state behavior |
| Routing | Ron, capacitance, off leakage/isolation, charge injection, switch transient, power-off limits |
| Scan | Max voltage/current, dwell, injected charge/energy, measurement uncertainty |
| Scope | Input rating, loading, coupling/range, overrange behavior, common reference |
| Generator | Amplitude/offset/load envelope, source impedance, current limit, DC output at fault |

Mức bảo vệ không được mô tả chỉ bằng giá trị nominal. Phải dùng corner/tolerance và fault response phù hợp đường yếu nhất. Current-limited rail không thay thế giới hạn injection từng pin hoặc kiểm tra polarity.

---

# 15. Protected digital drive và digital sense

## 15.1 Drive engine

Mỗi channel gồm value register, allowed-direction/mode bits, enable-request, ownership và effective-enable gate. Value nên được nạp khi OE đang OFF để tránh transient do enable trước data.

Push-pull là mode rõ ràng. Open-drain chỉ được công bố nếu output stage thực hỗ trợ; khi đó logic “1” nghĩa release và pull-up phải nằm trong electrical envelope. Không giả lập open-drain bằng cơ chế làm pin FPGA tiếp xúc điện áp ngoài rating.

Scan, clock, generator và digital stimulus không cùng sở hữu một source endpoint. Nếu cần chuyển source class thì stop/inhibit và apply image mới.

## 15.2 Hai đường sense khác nhau

```text
Protected digital inputs
     +-> control/status synchronizer -> snapshot / status FSM
     +-> measurement capture frontend -> LA / trigger / event path
```

Không đặt debounce/glitch filtering của status vào raw measurement path một cách mặc định. Mọi filter phục vụ measurement phải cấu hình được và ghi trong descriptor.

Synchronizer của một bit status không phải giải pháp đảm bảo tính nguyên tử cho bus nhiều bit. Một snapshot của asynchronous DUT bus có thể phản ánh skew/transition thực; không quảng bá như coherent bus transaction trừ khi có handshake/clock synchronous mode thích hợp.

## 15.3 Điều kiện capture hợp lệ

Capability phải công bố capture clock/source, input setup/hold hoặc sampling uncertainty thích hợp, detectable pulse-width envelope và channel skew đã đo. Không dùng tần số fabric danh nghĩa làm “logic bandwidth” của toàn đường đo.

---

# 16. Experiment clock và deterministic digital timing

Nguồn experiment clock dùng output register được clock bởi timebase có constraint; divider/phase accumulator/pulse scheduler tạo enables hoặc output transitions. Không tạo nhiều unconstrained fabric clocks để clock các FSM bên trong. [S2, §15]

Cần hỗ trợ tập feature thực được validation: programmable period, duty quantization, finite cycle count, single-step, initial level, deterministic start và stop policy.

`SET_CLOCK` chỉ cấu hình. Clock chỉ phát khi image cho phép, source ownership đúng và execution đã qua barrier.

Normal stop có thể hoàn tất pulse ở boundary phù hợp trong deadline. Emergency inhibit ưu tiên cắt năng lượng ngay, chấp nhận truncated pulse và đặt quality/event flag. Không bắt external safety path chờ một cạnh clock có thể không bao giờ đến.

Tần số, duty accuracy và jitter từ divider/NCO phải được khai báo theo timebase/profile. Từ “deterministic” nghĩa hành vi theo luật và clock xác định; không nghĩa zero jitter hoặc bất kỳ tần số thực nào cũng tạo chính xác tuyệt đối.

---

# 17. Clock, reset và CDC architecture

## 17.1 Clock plan theo resource thật

Các domain khái niệm:

| Domain | Công việc | Chiến lược |
|---|---|---|
| `control_clk` | Protocol/control/safety housekeeping/scan control | Clock ổn định; clock enable cho xử lý chậm |
| `capture_clk` | LA và/hoặc scope ingress | Theo clocking ADC/measurement đã chọn |
| `dac_clk` | DDS/output sample update | Có thể dùng chung nguồn với capture khi hợp lệ |
| `sdram_clk` | SDRAM controller/arbiter | Theo timing memory và PCB |
| `transport_clk` | FIFO bridge | Theo clock external bridge |
| External supervisor clock | FPGA-liveness/cutoff | Không phụ thuộc FPGA PLL |

Không mặc định mỗi domain tiêu thụ một PLL riêng. EP4CE6/EP4CE10 có hai general-purpose PLL theo [H1]. Dùng chung source/PLL outputs khi timing cho phép; chỉ tách domain khi ngoại vi thực sự yêu cầu.

## 17.2 CDC primitives

- Single-bit level ổn định: synchronizer đã timing review.
- Pulse/event: toggle/request-ack hoặc event FIFO, có điều kiện không mất event.
- Multi-bit configuration: stable mailbox + handshake, latch atomic ở domain nhận.
- Sample stream: asynchronous FIFO với local full/empty.
- Counter/timestamp: snapshot handshake hoặc Gray/event mapping đã constraint, không synchronize từng bit binary độc lập.

Gray coding không loại bỏ nhu cầu timing/skew constraints. Vendor documentation nêu các multi-bit Gray CDC paths phải giữ thuộc tính chuyển một bit tại sampling boundary. [H3]

## 17.3 Reset domain crossing

Asynchronous assertion khi protection cần; synchronous deassertion theo từng clock domain. Domain chỉ ready khi clock hợp lệ, reset đã release an toàn và local state/FIFO initialized.

Một phía async FIFO reset riêng có thể làm pointer/occupancy không nhất quán. Cần coordinated reset protocol hoặc flush/generation invalidation ở cả hai phía trước khi dùng lại. Không phát `ready` chỉ dựa vào PLL `locked` chưa được qualification.

## 17.4 Clock loss

Loss of required clock trong khi energized -> external/FPGA inhibit theo detection path đã validation; capture partial/invalid tùy phần dữ liệu còn tin cậy. SDRAM clock loss làm data retention không được đảm bảo nếu refresh dừng; không báo capture cũ valid chỉ vì các counter control vẫn còn.

---

# 18. Timebase, trigger và tính trung thực của thời gian đo

## 18.1 Global epoch không phải một bus counter nối khắp chip

Giữ một global timebase 64-bit cho event correlation. Raw captures dùng local sample counter và các anchor mapping sang timebase; không đính 64-bit timestamp cho từng ADC sample thông thường.

```text
SampleDomainAnchor:
  timebase_generation
  source_clock_id
  source_sample_counter
  reference_timestamp
  sample_rate_numerator / denominator
  alignment_uncertainty
```

Config/timestamp snapshot qua CDC phải atomic. Với clock không phase-related, global event tới các consumers có latency và uncertainty khác nhau. Descriptor ghi điều này; không suy “shared trigger” thành “mọi channel lấy mẫu cùng một thời điểm tuyệt đối”.

## 18.2 Trigger fabric

V1 ưu tiên một trigger context cho mỗi execution, source mask nhỏ và broadcast tới các consumers được chọn. Không triển khai general-purpose trigger network phức tạp nếu chưa có nhu cầu.

Sources có thể là digital edge/pattern, ADC threshold, external trigger, software force, experiment start hoặc generator sync. Chỉ công bố sources thực đã tích hợp.

Trigger được phát hiện ở source domain, giữ sample index/timestamp anchor và phân phối bằng handshake/FIFO hoặc qualified pulse. Các consumer xác nhận arm generation trước start. Nếu cần alignment chặt hơn độ trễ CDC, phải dùng common-clock synchronous path hoặc calibration/protocol chuyên biệt đã kiểm chứng.

## 18.3 Pre-trigger và no-trigger

Depth trước/sau trigger là tham số explicit. Hết thời gian chờ trigger trả `NO_TRIGGER`/timeout ở capture status đề xuất, không tự đánh đồng với DUT sai chức năng. Các mã này phải map qua schema kết quả hiện hành, không tự thêm enum application.

---

# 19. Logic Analyzer

## 19.1 Datapath V1

```text
Protected digital capture inputs
 -> capture registers / sample counter
 -> trigger qualifier
 -> raw sample packer
 -> ingress FIFO
 -> descriptor-bounded ring/linear writer
 -> shared SDRAM
```

Raw sampling là baseline dễ chứng minh. `EDGE_EVENT` và `RLE_COMPRESSED` là optional build modes; không bắt buộc cả ba trong phiên bản đầu.

## 19.2 Packing

Với `N` channels, packed width thực phải ghi trong descriptor. Nếu dùng 16-bit hoặc 32-bit aligned sample words, bandwidth tính theo số byte lưu thực, không theo số bit có tín hiệu.

Thứ tự channel/bit, byte order, sample period và mapping từ endpoint tới channel là metadata bất biến trong một capture.

## 19.3 RLE phải có worst-case bound

RLE có thể giảm dữ liệu khi giá trị lặp; nhưng tín hiệu thay đổi mỗi sample có thể làm encoding bằng hoặc lớn hơn raw, tùy record format. Admission phải dùng worst-case record rate đã định nghĩa.

V1 khuyến nghị lưu raw và nén khi readback nếu cần, hoặc dùng format block có explicit raw fallback. Không đổi encoding giữa capture mà không có block tag. Pre/post-trigger counts tính trên logical samples, không tính số RLE records.

## 19.4 Overflow

FIFO full khi source vẫn sample được -> latch overflow, ghi sample index/valid-prefix information, ngừng hoặc seal partial theo policy. Không backpressure một DUT/ADC vốn không thể bị dừng rồi vẫn tuyên bố đúng sample rate.

Nếu capture là required của execution, V1 dừng execution an toàn khi mất capture. Overflow là lỗi chất lượng/thực thi, không mặc định là electrical `UNSAFE`; classification ở §27.

---

# 20. Oscilloscope 2CH

## 20.1 Ranh giới phần cứng

```text
CH1 input -> protection/attenuation/coupling/AFE1 -> ADC CH1 --+
                                                            +-> FPGA
CH2 input -> protection/attenuation/coupling/AFE2 -> ADC CH2 --+
```

Dùng ADC 2CH hoặc hai ADC với clocking/alignment phù hợp. Multiplexer luân phiên một ADC không được quảng bá là hai channel simultaneous nếu không có sample-and-hold và timing chứng minh tương đương.

ADC interface, resolution, sample rate và analog bandwidth **chưa được hai tài liệu nguồn xác định**. Không gắn con số đo/sampling rate cố định vào architectural capability trước khi chọn AFE/ADC và closure.

## 20.2 Acquisition core

Ingress validation/alignment -> sample counter -> trigger condition -> sample packer -> FIFO -> memory writer. ADC status/overrange bits nếu có được giữ hoặc tổng hợp vào metadata.

Hai channel có calibration/range metadata riêng nhưng cùng capture timing model rõ ràng. Range/coupling thay đổi làm dừng acquisition hoặc bắt đầu capture revision mới; không trộn dữ liệu trước/sau thay range trong một waveform không có marker.

## 20.3 Decimation đúng semantics

Lấy mỗi mẫu thứ `D` mà không anti-alias filtering không được trình bày như waveform bandwidth-limited đã decimate đúng. V1 có thể giữ raw, xuất một window; hoặc dùng min/max envelope cho display với encoding riêng. Averaging/filtered decimation chỉ công bố sau khi filter và metadata được xác lập.

Không đưa phép xử lý nặng vào FPGA chỉ để giảm dung lượng nếu nó phá resource/timing budget. Raw capture/window readback là baseline.

## 20.4 Measurement validity

Descriptor cần actual sample rate, trigger index, channel alignment, ADC code format, range/gain/offset profile IDs, clipping/overrange, valid sample count và timestamp quality. ADC numerical resolution không đồng nghĩa effective resolution hoặc accuracy của instrument; những thông số sau cần đo.

---

# 21. Function Generator 2CH

## 21.1 Kiến trúc ưu tiên

Hai phase accumulators độc lập, với waveform lookup/arithmetic nhỏ, DAC code formatting và output-enable riêng. Có sync operation chung để reset phase/latch update theo clock đã xác định.

```text
DDS1 accumulator -> waveform core -> DAC1 codes -> external AFE1 -> isolate -> OUT1
DDS2 accumulator -> waveform core -> DAC2 codes -> external AFE2 -> isolate -> OUT2
```

Sine LUT có thể chia sẻ dual-port ROM hoặc time-multiplex nếu chứng minh đủ throughput cho cả hai channels. Không hy sinh independent-channel semantics để tiết kiệm M9K.

## 21.2 Bounded parameter update

Frequency, phase, waveform, amplitude/offset settings phải stage và commit tại boundary xác định. Amplitude/offset được thực hiện bằng DAC code scaling, external analog stage hoặc tổ hợp tùy hardware; không mặc định FPGA đã có analog gain stage.

Cần enforce đồng thời output swing, DC offset, load/current, waveform frequency và route envelope. Đường fault phải disconnect/mute external output stage; chỉ đặt DAC code về zero không luôn có nghĩa output 0 V hoặc Hi-Z.

## 21.3 DDS và memory

Baseline DDS dùng local LUT/registers, **không chiếm bandwidth SDRAM**. AWG arbitrary samples từ SDRAM là feature riêng, mặc định OFF. Chỉ thêm khi có read FIFO, rate admission, preload, underrun policy và output protection đã validation.

Nếu AWG underrun, output đi về trạng thái được electrical profile xác nhận; không mặc định giữ last sample, vì last sample có thể là mức DC không an toàn.

---

# 22. Capture descriptors và ownership xuyên lifecycle

## 22.1 Descriptor ngoài và trong

| Public/boundary descriptor | Internal-only fields |
|---|---|
| descriptor ID + generation; capture reference | Physical base address |
| instrument/channel map; encoding | Allocator cursor/region ownership |
| allocated capacity; valid bytes/sample count | SDRAM bank/row/column |
| pre/post-trigger, trigger position | Outstanding write counters |
| sample rate/clock/timebase anchors | DMA/write-ring pointers |
| termination reason; quality flags | Memory-controller scheduling state |
| sealed/completion state | Hardware-specific stride/alignment details không cần expose |

Host không yêu cầu base address. Capacity và read offset là logical quantities được bounds-check; không tạo cổng raw-memory access trong normal operation.

## 22.2 Allocation tối ưu cho một execution slot

Dùng một capture arena với số descriptor hữu hạn, page/burst-aligned, **allocation khi chưa acquisition**. Baseline là contiguous/bump allocation theo execution, không compact hoặc general-purpose heap khi chạy.

Scope/LA có vùng riêng trong arena theo nhu cầu mỗi image; không hard-partition toàn bộ 64 MiB mãi mãi. Không cần một memory manager đa-user/general virtual memory.

Nếu captures cũ chưa release chiếm vùng cần cho execution mới, trả resource unavailable hoặc chờ release; không ghi đè ngầm. V1 có thể yêu cầu drain/release trước reuse, thay vì xây concurrent multi-experiment capture store trong FPGA.

## 22.3 Completion và readback

`SEALED_COMPLETE` chỉ xuất hiện sau khi sample producer kết thúc, tất cả FIFO/outstanding writes đã commit và metadata cuối cùng được publish atomic. `valid_bytes` không vượt `allocated_bytes`.

Baseline host chỉ đọc sealed data. Readback của vùng đang ghi chỉ là optional snapshot/segmented feature có protocol riêng. `STOP`/`SAFE_STATE` không tự xóa sealed capture; nếu không, workflow run -> stop -> read_capture sẽ mất dữ liệu.

## 22.4 Generation chống reuse

Descriptor handle gồm ID và allocation generation. Khi vùng tái sử dụng, generation đổi; queued readback của handle cũ bị reject. Run token hết hiệu lực không có nghĩa read-only descriptor handle còn được giữ cũng hết hiệu lực; hai vòng đời được tách rõ.

Full FPGA/memory reset invalidates data khi không có retention guarantee. Không cam kết capture persistent qua mất nguồn.

## 22.5 Ring pre-trigger

Ghi oldest-valid offset, write position tại trigger, số pre-trigger hợp lệ và số post-trigger thực. Readback phải tuyến tính hóa theo thời gian từ oldest-valid, không xuất raw physical memory order rồi yêu cầu bên nhận đoán wrap.

---

# 23. SDR SDRAM subsystem

## 23.1 Capacity và organization

[S2] ghi “64 MB” nhưng chưa chọn part. Revision này đề xuất dùng đơn vị chính xác **64 MiB** cho memory-address contract, phù hợp tổng dung lượng 512 Mibit. Nếu part/BOM cuối khác, công bố `capacity_bytes` thực; không quảng bá target như dung lượng sẵn có.

Data bus x16 là candidate, không bất biến. Row/column/bank geometry, chip count, CAS, refresh và frequency phải lấy từ part/revision thực. Không suy chúng chỉ từ dung lượng.

## 23.2 Controller responsibilities

Power-up timing, initialization, precharge, mode set, active/read/write, burst termination, bank/row tracking, refresh deadline và bus turnaround. Mọi timing counter được derive từ datasheet và clock bằng phép làm tròn bảo thủ.

SDR interface cần constraints cả output lẫn input, clock phase/board delay, IO standards và voltage banks. Mô phỏng logic controller không thay timing closure của bus ngoài.

## 23.3 Một địa chỉ hợp lệ đi qua ba kiểm tra

```text
instrument logical offset
  -> region bounds / owner / generation check
  -> physical address translation
  -> SDR geometry + timing controller
```

Memory controller không được nhận request vượt region dù instrument có lỗi. Counter phép cộng offset/length dùng đủ bit để không wrap-around trước khi kiểm tra bounds.

## 23.4 Health và corruption

Memory BIST trước enable deep-capture capability; stress refresh/arbitration theo profile. BIST không tự cung cấp ECC cho mọi runtime sample. Nếu không có ECC, capability phải nói rõ; packet CRC bảo vệ transfer không chứng minh SDRAM contents luôn không lỗi.

Fault/control essentials nằm trong registers/M9K, không chỉ trong SDRAM. Khi SDRAM fail, deep capture unavailable; các chức năng không phụ thuộc SDRAM chỉ tiếp tục nếu safety và build profile cho phép độc lập.

---

# 24. Memory bandwidth, latency và admission

## 24.1 Không đánh đồng capacity với throughput

```text
B_peak = data_bus_bits / 8 × f_memory

R_scope = active_scope_channels × stored_bytes_per_sample × f_scope
R_la    = stored_bytes_per_la_sample × f_la
R_awg   = stored_bytes_per_awg_sample × f_dac_stream  [chỉ khi AWG tồn tại]
```

Dùng packed bytes thực. Scope resolution 12-bit được lưu 16-bit thì tính 2 byte/channel/sample. Có RLE thì tính worst-case encoding, không average compression ratio.

## 24.2 Chọn đúng một cách tính overhead

**Mô hình A:** `B_usable = B_peak × eta`, với `eta` đã bao gồm refresh, precharge/activate, turnaround và các overhead được model.

**Mô hình B:** `B_usable` là sustained payload bandwidth đã đo ở workload/corners đại diện, trong khi refresh và controller overhead thực đang hoạt động.

Không vừa trừ refresh khỏi measured payload bandwidth vừa cộng lại refresh như một payload client lần nữa. Metadata/control overhead chưa có trong phép đo phải được tính riêng và ghi rõ.

```text
sum(R_realtime_payload) + R_extra_payload
    <= beta × B_usable
```

`beta < 1` là margin dự án, không phải thông số datasheet. Admission chỉ PASS khi đồng thời đạt **bandwidth, maximum service latency, buffer capacity, routing/clock/trigger exclusivity và electrical limits**.

## 24.3 Ví dụ tính toán — hoàn toàn giả định, không phải capability

Giả sử x16 SDR ở 100 MHz: peak là 200 MB/s. Giả sử `eta = 0,65` và `beta = 0,80`, payload được admission là 104 MB/s.

- Scope 2CH, mỗi channel 25 MS/s, lưu 2 byte/sample: 100 MB/s.
- LA 16CH, 20 MS/s, lưu 2 byte/sample: 40 MB/s.
- Tổng 140 MB/s: **không admission** theo ví dụ này, dù RAM có 64 MiB.

Giảm tới Scope 2CH × 20 MS/s và LA16 × 10 MS/s cho 100 MB/s chỉ vượt qua phép cộng bandwidth; còn phải chứng minh FIFO/service latency/timing/AFE. Không có giá trị nào trong ví dụ được công bố thành thông số bo.

## 24.4 FIFO sizing theo worst service gap

Với client `i`:

```text
D_i_bytes >= R_i_max × L_i_max + burst_i_bytes + margin_i_bytes
```

`L_i_max` gồm refresh, maximum non-preemptible burst, turnaround, arbitration và CDC visibility delay. Chỉ so tổng MB/s là chưa đủ để bảo đảm không overflow.

ADC/LA input liên tục không thể được cứu bằng host backpressure. Nếu service gap không có upper bound thì FIFO hữu hạn không thể tạo lossless guarantee.

## 24.5 Bounded arbiter ưu tiên cho V1

Một SDR controller với burst-limited, weighted round-robin/time-slot scheduling theo **workload profiles hữu hạn**. Refresh có deadline; realtime clients có reserved service, high-water intervention có giới hạn để không starve client khác.

Host readback là best-effort, baseline có thể tạm ngừng khi acquisition active. Sau capture, readback lấy bandwidth còn lại. Không cần một general deadline scheduler phức tạp hoặc online optimization trong FPGA.

Record maximum observed service gap/FIFO high-water/overflow để validation. Finite bench test là evidence; analytical bounds/RTL invariants vẫn cần cho upper-bound claims.

## 24.6 Capacity admission

```text
sum(allocated_capture_bytes)
  + optional_AWG_reserved_bytes
  + reserved_memory_bytes
  <= usable_capacity_bytes
```

Depth, pre/post window và format phải fit trước acquisition. Đọc memory chậm không làm thay sample rate; nó ảnh hưởng thời gian giải phóng buffer/availability của execution kế tiếp.

---

# 25. Transport endpoint và control latency

## 25.1 Kiến trúc không phụ thuộc bridge

Giữ lựa chọn USB-UART/USB-SPI cho prototype và USB3 FIFO cho high-throughput target. FPGA triển khai adapter phía FIFO/UART/SPI; USB PHY/controller của bridge nằm ngoài FPGA. [S1, §29]

Control queue nhỏ và bulk queue riêng. Bulk chunks bounded; serializer/arbitration chèn control giữa chunks. Backpressure readback không khóa RX command parser hoặc kill path.

## 25.2 Giới hạn thời gian phải có phạm vi

```text
T_local_control <=
    maximum_nonpreemptible_chunk_time
  + bounded_queue_delay
  + parse_validate_time
  + dispatch_time
```

Bound này chỉ có ý nghĩa với giả định link/bridge vẫn phục vụ và control packet đã đến boundary được định nghĩa. Không hứa hard upper bound từ host application qua USB/OS khi host có thể ngừng scheduling hoặc link ngắt.

Bảo đảm an toàn khi host/link không tiến triển dựa vào **local watchdog và external inhibit**, không dựa vào `STOP` chắc chắn đến kịp. Performance measurement của transport không thay thế safety cutoff budget.

## 25.3 Bridge width và pin budget

FTDI mô tả FT600/FT601 có FIFO bus 16/32 bit; đó là ví dụ cho trade-off bus width, không phải BOM đã chốt. Bridge wider không tự nâng sustained SDRAM bandwidth và có thể làm E144 không đủ pins. [H4]

Chọn bridge cùng ADC/DAC/SDRAM trước freeze package. Không bổ sung USB3 vào cuối schematic mà không tính sẵn pins, clock và power domains.

---

# 26. Protocol integrity và error-free side effects

## 26.1 Envelope

Giữ các ý nghĩa SOF/version/command/sequence/length/payload/CRC/EOF trong [S1, §30]. Cách encode bytes, escaping, opcode, CRC polynomial và endianness là phần ICD cần freeze/version; revision này không tự đặt các giá trị đó.

Một gói chỉ có thể tạo side effect sau khi length/version/integrity/sequence/context/state/permissions đều hợp lệ. Không vừa nhận payload route vừa thay switch ngoài FPGA.

## 26.2 Version compatibility

Phân biệt protocol version, feature set, image schema revision, HardwareProfile revision và firmware/build revision. Major semantics không tương thích -> reject safe; optional feature thiếu -> unsupported.

Nếu bổ sung token hoặc ảnh cấu hình làm thay wire layout, phải dùng negotiated extension hoặc protocol version mới đã xác lập. Không tuyên bố binary backward compatibility chỉ vì giữ cùng tên command.

## 26.3 Parser bảo thủ

Bounded frame size, bounded staging buffer, partial-frame timeout và resynchronization rule. Invalid payload không được làm overflow RAM ghi cấu hình. CRC sai không refresh watchdog.

Không scan byte pattern `SAFE_STATE` trong raw capture stream để làm emergency shortcut; dữ liệu measurement có thể chứa bất kỳ byte nào. Emergency electrical cutoff độc lập protocol.

## 26.4 Bus nội bộ

Một register/command fabric đơn giản với request-valid/ready, response-valid/status, fixed arbitration và bounded slave response. Slave timeout không làm treo execution shutdown. Không cần soft CPU, full AXI infrastructure hoặc DMA subsystem đa-master tổng quát cho control nếu small register bus đã đủ.

---

# 27. Fault taxonomy: phân biệt từ chối command với mất an toàn điện

Đây là phần thay đổi chủ đích so với quy tắc v2 “invalid command/protocol error/stale plan đều đưa route về open”. Một command bị từ chối trước side effect không được làm mất hiệu lực cấu hình đang chạy đã phê duyệt, trừ khi chính lỗi đó làm safety state không còn đáng tin.

| Lớp | Ví dụ | Hành vi hardware đề xuất |
|---|---|---|
| Benign request rejection | Read offset sai, unsupported optional feature, stale command không có side effect | NACK, không đổi active outputs/routes, không refresh watchdog |
| Transport corruption | CRC/length lỗi trước commit | Drop/NACK/resync; giữ safety watchdog; persistent loss -> timeout shutdown |
| Configuration/admission rejection | Resource conflict, image mismatch, rate vượt validated profile | Không apply/arm; rollback reservations; không energize plan mới |
| Electrical critical fault | Overcurrent, overvoltage, unsafe source contention, interlock fault | Immediate external inhibit + latched fault + isolation |
| Trusted-state loss | Control-state corruption, inconsistent active image, required clock mất | Inhibit, invalidate context, explicit recovery |
| Measurement failure | Capture overflow, missing samples, ADC alignment lost | Invalid/partial capture; stop execution nếu capture required; không gắn electrical UNSAFE giả |
| Required subsystem unavailable | SDRAM chưa ready khi image cần capture | Block thực thi configuration; không giả capability |

Status hardware chỉ cung cấp nguyên nhân chi tiết và mức severity. Việc ánh xạ ra `BLOCK_SAFETY`/`BLOCK_UNEXECUTABLE` và enum error phía ngoài phải theo Contracts thực, không tự thay enum đó bằng tên nội bộ.

**Bất biến thay thế:** invalid command không thể tạo enable mới, mở rộng quyền hoặc làm thay đổi configuration đang được bảo vệ. Quy tắc này khác với “mọi lỗi gói đều phải cắt một thí nghiệm đang an toàn”.

---

# 28. Capability: hardware truth, health và availability

## 28.1 Không đổi schema ngoài một cách ngầm định

[S1, §33] dùng các field như `logicAnalyzerChannels`, `oscilloscopeChannels`, `generatorChannels`, `physicalExecutionSlots`. Bản v2 minh họa nested/snake-case fields. Revision này coi đó là representation nội bộ; mapping ra field ngoài phải explicit và được schema test.

FPGA không tự quảng bá component-resolution algorithms ngoài RTL. Nó báo scan primitives/test-profile support; `AUTO_DISCOVERY`, `INSTRUCTOR_PROFILE`, `HYBRID` vẫn là contract ngoài mà FPGA cung cấp evidence để phục vụ.

## 28.2 Ba lớp trạng thái

```text
IMPLEMENTED: có module/peripheral integration trong build
VALIDATED  : profile cụ thể đã qua tests/timing/electrical validation
AVAILABLE  : tại thời điểm hiện tại health/resources cho phép dùng
```

Một instrument đã validated 2CH nhưng đang bị lỗi không cần xóa vĩnh viễn channel count để giả thiết bị khác; nên trả capability ổn định và health/availability riêng khi schema cho phép. Nếu schema chỉ có một capability snapshot, phải định nghĩa rõ nó là usable-now hay installed-capacity.

## 28.3 Hardware manifest logic tối thiểu

Build ID, device/package, protocol/features; board/profile/NodeMap revision; digital source/sense counts; instrument channel counts; supported sample/clock modes; SDRAM actual capacity và validated workload profiles; routing/trigger/memory exclusions; electrical envelope IDs; timestamp metadata; watchdog/cutoff bounds đã validation.

`maxSampleRate` đơn lẻ không mô tả đúng mọi tổ hợp Scope/LA/Generator. Expose validated configuration profiles hoặc per-instrument limits + concurrency constraints qua contract được version hóa.

## 28.4 Calibration và identity

Hardware profile/AFE calibration data cần có revision/integrity và trạng thái valid. Thiếu calibration có thể cho raw-code measurement nếu mode đó được hỗ trợ và ghi rõ; không hiển thị calibrated-voltage accuracy giả. Calibration không phải permission để vượt absolute hardware limits.

---

# 29. Resource và package strategy EP4CE6 -> EP4CE10

## 29.1 Giới hạn silicon tham chiếu

Theo Cyclone IV Device Handbook, các bảng 1-1, 1-3 [H1]:

| Resource | EP4CE6 | EP4CE10 |
|---|---:|---:|
| Logic elements | 6.272 | 10.320 |
| Embedded memory | 270 Kbit | 414 Kbit |
| Embedded 18×18 multipliers | 15 | 23 |
| General-purpose PLLs | 2 | 2 |
| User I/O ở package E144 | 91 | 91 |
| User I/O ở U256/F256 theo bảng package | 179 | 179 |

Đây là device resources, không phải số pins/RAM/LE còn trống trên một board. Không dùng “144 pins” làm “144 user I/O”; dedicated/multipurpose/configuration usage và bank constraints còn phải xét.

## 29.2 Pin pressure có thể là giới hạn trước LE

**Ví dụ giả định để chứng minh trade-off, không phải schematic:**

- SDRAM x16 với 13 address, 2 bank, 2 DQM, 4 command/control, CKE và CLK: 39 tín hiệu.
- Hai ADC parallel 12-bit: ít nhất 24 data pins.
- Hai DAC parallel 12-bit: ít nhất 24 data pins.
- USB3 FIFO x16: ít nhất 16 data pins.

Chỉ tổng trên đã là **103 tín hiệu**, chưa tính clock/control ngoại vi, scan, LA, safety và digital source. Không fit vào 91 user I/O E144 của ví dụ. Đây không phải bằng chứng mọi cấu hình EP4CE10 E144 đều bất khả thi; serial/shared interfaces có thể giảm pin nhưng đổi throughput/complexity.

## 29.3 Thứ tự quyết định phần cứng

1. Chốt required simultaneous instrument configurations và electrical envelope.
2. Chọn candidate ADC/DAC/SDRAM/bridge interfaces tương thích.
3. Lập pin/bank/clock và memory-service budget của **cấu hình cuối**, kể cả khi RTL instruments triển khai sau.
4. Thử E144; chỉ dùng serialized/banked control cho tín hiệu tốc độ thấp phù hợp.
5. Nếu E144 không fit, ưu tiên package EP4CE10 U256/F256 nếu đáp ứng ràng buộc còn lại; nếu compute/memory timing cũng không đủ thì đánh giá device khác.

Không giảm số channel đã cam kết hoặc bỏ safety pins một cách im lặng chỉ để giữ package. Mọi thay đổi target cần biểu hiện đúng ở capability và decision record.

## 29.4 Ngân sách thiết kế, không phải synthesis result

Mục tiêu dự án có thể giữ LE khoảng 70–75% như v2, nhưng đạt tỷ lệ này không đảm bảo timing. M9K phải budget theo **số block bị chiếm sau width/depth packing**, không chỉ chia tổng số byte FIFO cho tổng RAM.

Ưu tiên tài nguyên theo thứ tự: safety/control -> I/O/scan/routing -> ingress FIFO/trigger -> memory controller -> required instruments -> optional compression/AWG/debug. Khi thiếu tài nguyên, giảm tính năng optional trước, không giảm độ đầy đủ của safety gating.

Không có bảng utilization measured cho thiết kế hiện tại; mọi con số fit phải đến từ Fitter của đúng target và revision.

---

# 30. Những tối ưu kiến trúc được chọn và các phương án không chọn

| Quyết định chọn cho V1 | Lý do | Đánh đổi được chấp nhận |
|---|---|---|
| Một active image/context | Một shared electrical fabric | Không multi-execution trong cùng fabric |
| Sáu plane, small command bus | Rõ isolation và ownership | Không general-purpose SoC trong FPGA |
| External hard inhibit | Không phụ thuộc clock/USB | Cần safety hardware ngoài fabric |
| No live-reroute | Tránh powered DUT/source contention khi đổi route | Đổi topology cần stop/prepare lại |
| Scan sequencer + raw evidence | Giữ RTL nhỏ, tránh suy đoán identity | Resolution ở ngoài FPGA |
| Banked endpoint routing | Giảm pin/switch count, không sửa wiring | Không full N×N arbitrary net assembly |
| Scope pair stream + LA stream | Hạn chế số realtime memory clients | Channels trong scope pair chung capture timing model |
| DDS local LUT, AWG OFF | Không tăng SDRAM read pressure không cần thiết | Arbitrary waveform là mở rộng riêng |
| Capture arena allocation lúc idle | Bounds-check đơn giản, không fragmentation khi chạy | Reuse sau release, không general heap |
| Raw capture baseline | Dễ chứng minh capacity/quality | Compression không được dùng để hứa rate cao |
| Workload profiles + bounded arbiter | Admission/latency có thể kiểm chứng trên FPGA nhỏ | Không tùy ý mọi tổ hợp rate |
| Burst readback sau sealed | Dữ liệu immutable, tránh coherency phức tạp | Không promise raw continuous streaming |
| Common portable RTL + wrappers | Giảm rủi ro migration | Pin/timing vẫn review riêng từng board |

Phương án chỉ “thêm nhiều module vào v2” không giải quyết ambiguity về permit, epoch, partial commit và readback lifecycle. Phương án đổi FPGA ngay cũng không giải quyết các ambiguity đó. Vì vậy ưu tiên làm rõ transaction/safety/data semantics trước khi tăng chip size.

---

# 31. Portable RTL organization

Đây là cấu trúc **đề xuất**, không mô tả một repository đã được kiểm tra.

```text
fpga/
  rtl/
    common/          # small bus, FIFO wrappers, CDC, counters
    control/         # execution FSM, image banks, admission
    safety/          # permits, fault record, watchdog interfaces
    lab_io/          # routing, scan, digital drive/sense, clock
    timing/          # timebase, anchors, trigger distribution
    instruments/
      logic_analyzer/
      scope_2ch/
      generator_2ch/
    memory/          # regions, ring writers, arbiter, SDR controller
    transport/       # protocol endpoint, control/bulk arbitration
  family/
    cyclone_iv/      # PLL, M9K, I/O primitive wrappers
  targets/
    ep4ce6_dev/      # board top, pin map, QSF/SDC, build manifest
    ep4ce10_lab/     # candidate/final target separated by revision
  verification/
    unit/
    integration/
    assertions/
    timing_cdc/
    bench_specs/
  contracts/
    hardware_icd/   # approved mapping/ABI references, not a new app schema
```

Vendor FIFO/PLL primitives được bọc lại thay vì rải IP instance board-specific khắp portable core. Các tên/công cụ simulation cụ thể chưa được xem là “repository đang sử dụng” khi chưa có source để đối chiếu.

---

# 32. Verification: acceptance properties của kiến trúc

## 32.1 Safety invariants

| ID | Thuộc tính phải kiểm chứng |
|---|---|
| V-01 | Unconfigured/reset/brownout/clock stopped -> hazardous enables OFF bằng external hardware |
| V-02 | Fault asserted -> physical inhibit trong bound đã đo, không phụ thuộc protocol/memory |
| V-03 | Không có scan stimulus trong `SAFE_IDLE` |
| V-04 | Scan dwell timeout hoạt động cả khi host hoặc scan-data FIFO bị tắc |
| V-05 | Approval của image A không energize image B; sửa cấu trúc/envelope sau seal làm mất approval |
| V-06 | Không route commit khi affected source/DUT energy chưa ở điều kiện switching hợp lệ |
| V-07 | Route commit thất bại không restore outputs tự động |
| V-08 | Unknown/mismatch alone không xuất hiện trên fault/permit cone of logic |
| V-09 | Guarded startup áp dụng cho cả RUN modes |
| V-10 | Fault recovery/PLL relock/reconnect không auto-resume |
| V-11 | Stale execution/descriptor generation không tác động execution hoặc vùng memory mới |
| V-12 | Packet CRC/length/version lỗi không tạo side effect hoặc refresh heartbeat |

## 32.2 Capture/memory properties

| ID | Thuộc tính phải kiểm chứng |
|---|---|
| V-13 | Mỗi sample nhận hợp lệ có đúng thứ tự/encoding, hoặc có explicit loss flag |
| V-14 | Pre-trigger ring wrap được tuyến tính hóa đúng và trigger index hợp lệ |
| V-15 | Completion chỉ sau last write drain; valid bytes không vượt allocation |
| V-16 | STOP -> SAFE vẫn cho đọc sealed capture còn được giữ |
| V-17 | Descriptor release/reuse không cho queued stale read truy cập dữ liệu mới |
| V-18 | Worst-case RLE hoặc raw fallback không vượt reserved service/capacity |
| V-19 | Arbiter đạt max service gap cho mọi realtime client được admission |
| V-20 | Refresh/turnaround không bị các burst khác starve |
| V-21 | Async FIFO reset ở mọi phase không để stale sample/new generation trộn nhau |
| V-22 | Scope/DDS/LA chạy đồng thời theo từng supported workload profile, không theo maximum độc lập |

## 32.3 Tests cần có

Module simulation cho FSM, image sealing, route sequencer, scan dwell, source gates, triggers, packers, ring descriptors, allocator và arbiter. Integration fault injection ở mọi transition, đặc biệt giữa seal/apply/power-up/start và khi memory FIFO đầy.

Randomized clocks/reset ratios cho CDC; duplicate/reordered/truncated command tests; bit-flip/length-bound tests; SDR memory-model timing checks; fitter và full timing analysis trên từng target.

Bench tests: short/overvoltage trong envelope test được kiểm soát, power-off backfeed, stuck switch/enable fault model, clock removal, bridge reset, cable disconnect, capture overrun, no-trigger, and reset-replay. Test electrical faults phải dùng fixture giới hạn năng lượng thích hợp; không lấy sinh viên/IC tùy ý làm tải thử bảo vệ.

---

# 33. Closure gates và thông số phải được chứng minh

| Gate | Nội dung bắt buộc | Trạng thái từ tài liệu hiện có |
|---|---|---|
| G-01 Authority/ICD | v3.1/Contracts, plan-name mapping, commands/enums, ABI version | OPEN |
| G-02 Electrical envelope | Rail/I/O/scan/scope/gen limits, injection/backfeed, cutoff/discharge | OPEN |
| G-03 Pin/package | Final peripherals + pins/banks/safety/debug, Fitter feasibility | OPEN |
| G-04 Clock/CDC/RDC | Clock sources, PLL budget, constraints, reset/coherence/uncertainty | OPEN |
| G-05 RTL/resource | Utilization, FSM/transaction/data invariants | OPEN |
| G-06 SDR timing/service | Exact memory part, timing, refresh, service-gap and payload budget | OPEN |
| G-07 Measurement | LA capture envelope, Scope alignment/calibration, generator output quality | OPEN |
| G-08 Transport/replay | Local control bound, watchdog, bridge purge/session freshness | OPEN |
| G-09 Integrated bench | Simultaneous workloads và fault injection toàn hệ | OPEN |

**OPEN không đồng nghĩa thiết kế không thể thực hiện.** Nó nghĩa tài liệu nguồn chưa cung cấp bằng chứng closure; không được nâng trạng thái chỉ vì architecture đã được viết lại.

## 33.1 Timing budgets cần điền bằng số đo/model

`T_fault_detect`, `T_external_cutoff`, `T_FPGA_inhibit`, `T_rail_discharge_max`, `T_route_break_min`, `T_route_commit_max`, `T_scan_dwell_max`, `T_stop_quiesce_max`, `T_host_watchdog`, `T_external_watchdog`, `L_memory_client_max`, `T_local_control_max`.

Không có numeric default an toàn cho mọi linh kiện. Mỗi bound phải kèm điều kiện tải, voltage/temp corners, clock/profile và phương pháp xác nhận. Không dùng một timeout chung cho mọi state.

## 33.2 Debug/configuration cũng phải bị interlock

JTAG/configuration/bench override không được trở thành cổng bypass protection vô tình. Chế độ test có thể điều khiển pins ngoài expected RTL behavior; fixture/board phải giữ external inhibit khi configuration hoặc debug thao tác chưa được validation. Debug không thay đổi student execution envelope.

---

# 34. Roadmap hardware và build profiles

## 34.1 Thứ tự phát triển

**HW-0 — đóng semantics và feasibility:** xác nhận current contract mapping; chọn candidate peripherals; pin/clock/bandwidth analysis cho final configuration trước PCB freeze.

**HW-1 — EP4CE6 safety/control:** external inhibits, watchdogs, execution image/identity, small protocol, protected digital source/sense, safe start/stop; chưa cần SDRAM.

**HW-2 — scan + routing:** NodeMap, bounded scan, route shadow transaction, fault/power-loss tests; chỉ công bố scan coverage đã đo.

**HW-3 — EP4CE10 + memory:** migrate core, SDR controller/arbiter/descriptor ring, BIST/timing/bandwidth/fault tests. Target package được freeze chỉ khi G-03/G-04 đạt.

**HW-4 — Logic Analyzer:** raw sampling, trigger, ring capture, descriptor/readback correctness; RLE optional sau baseline.

**HW-5 — DDS 2CH:** external DAC/AFE/protection, independent configuration và synchronization, không AWG SDRAM trong baseline.

**HW-6 — Scope 2CH:** ADC/AFE, channel alignment, sample capture/trigger/calibration, concurrency profiles cùng LA/DDS.

**HW-7 — high-throughput endpoint/integration:** USB3 adapter theo interface đã dự trù từ HW-0, sustained transfer và control-priority validation; không đổi execution semantics để nâng transport.

## 34.2 Build profiles

| Capability | EP4CE6_DEV | EP4CE10_LAB_V1 target |
|---|---|---|
| Safety/interlock/watchdog | Bắt buộc | Bắt buộc |
| One active execution context | Có | Có |
| Protected drive/sense + route/scan | Chỉ enable khi ngoại vi có và đã test | Theo validated board |
| External SDRAM | Không bắt buộc | 64 MiB target, actual bytes từ part/BIST |
| Logic Analyzer | Small debug capture optional | Required target, channel count sau closure |
| Scope | Không quảng bá | 2CH target sau G-07 |
| Generator | Không quảng bá | 2CH target sau G-07 |
| RLE/edge-event | Optional | Optional, không dùng để vượt worst-case budget |
| AWG memory streaming | OFF | OFF trong baseline |
| Physical analog routing | false | false |
| Transport | USB-UART/USB-SPI | Prototype link hoặc USB3 đã validation |

Build flags thể hiện thứ gì được synthesize; capability thể hiện thứ gì được triển khai/validation/available. Không viết `HAS_SCOPE=1 sau validation` như thể validation thay đổi hardware netlist lúc runtime.

---

# 35. Architectural decision records rút gọn

| ADR | Quyết định |
|---|---|
| FPGA-ADR-001 | Safety-gated, không correctness-gated; bảo toàn cả bốn ExecutionDecision |
| FPGA-ADR-002 | Bản v3 supplied là review baseline, không tự nhận current authority v3.1 |
| FPGA-ADR-003 | Plan phía ngoài giữ tên theo authority; `FpgaExecutionImage` chỉ là cấu trúc hardware nội bộ |
| FPGA-ADR-004 | Approval ràng buộc sealed image; thay đổi cấu hình có ảnh hưởng safety phải reapprove |
| FPGA-ADR-005 | External hard inhibit và watchdog độc lập clock là yêu cầu kiến trúc |
| FPGA-ADR-006 | Scan, power rail và normal drive có permit riêng, không phụ thuộc vòng |
| FPGA-ADR-007 | Three electrical scan modes; limited stimulus không gọi là zero-energy |
| FPGA-ADR-008 | Không live-reroute trong V1; transaction commit không tự bật outputs |
| FPGA-ADR-009 | Một shared fabric, một execution context; capture FSM hoạt động trực giao |
| FPGA-ADR-010 | Execution freshness và descriptor lifetime/generation tách nhau |
| FPGA-ADR-011 | Rejected benign packet không phá active circuit; lost safety state phải inhibit |
| FPGA-ADR-012 | DDS local LUT; AWG SDRAM riêng và mặc định OFF |
| FPGA-ADR-013 | Raw capture baseline; compression không là giả định admission |
| FPGA-ADR-014 | Bounded arena allocation + service-profile arbiter, không general heap/scheduler |
| FPGA-ADR-015 | Control latency có phạm vi; hard safety không phụ thuộc USB delivery |
| FPGA-ADR-016 | E144 chỉ freeze sau final pin/clock/bandwidth closure; không đánh đổi safety để giữ package |
| FPGA-ADR-017 | Measurement metadata nói rõ rate, skew/uncertainty, clipping/partial/loss |
| FPGA-ADR-018 | Chỉ công bố capability theo bằng chứng, không theo roadmap |

---

# 36. Kết luận và điều kiện sử dụng bản sửa

Bản v2 có nền tảng đúng: Lab-First, protected I/O, external AFE/ADC/DAC, shadow routing, memory arbitration, execution epoch và closure gates. Revision 2.1 giữ các nền tảng đó nhưng làm rõ các chỗ có thể dẫn tới implementation khác nhau: authority và plan naming, approval sau compile/freeze, scan-permit bootstrap, power/drive ownership, atomic route semantics, clock-independent shutdown, reset replay, capture retention, CDC time correlation và bandwidth worst case.

**Kiến trúc được chọn:** một control/safety core portable, một active execution image, endpoint-based electrical infrastructure, ba instrument engines độc lập, capture arena có bounds/generation, SDR controller và arbiter hữu hạn, data transport tách khỏi đường bảo vệ.

Bản này có thể dùng làm **bản đề xuất thay thế tài liệu FPGA v2 để review thiết kế hardware**. Trước khi dùng làm implementation authority phải đối chiếu G-01; trước freeze PCB/feature phải đóng các hardware gates tương ứng. Không tuyên bố đã chạy synthesis, timing closure, simulation RTL hoặc đo electrical safety trong lần rà soát Markdown này.

---

# Phụ lục A. Nguồn tham chiếu và provenance

## A.1 Nguồn dự án

**[S1]** `net-Circuit-Remote_Architecture_v3_Lab-First(2).md` — các mục §6.2, §8–9, §20, §24–31, §33–37, §41, §45, §49 và §52. Có cảnh báo SUPERSEDED ở đầu. SHA-256 của bytes file đính kèm:

```text
e4bac41b0200dab55058486ca9c46b81d3dabef1fc722605f9c3b5eb68959237
```

**[S1a]** `net-Circuit-Remote_Architecture_v3_Lab-First.md` — bản Project. SHA-256:

```text
4a5cf7066cab817f610e2dd84fdc19928a138aa990b8a7ced3377c5fe3341f65
```

**[S2]** `net-Circuit-Remote_FPGA_Architecture_Lab-First_v2(1).md` — toàn bộ 52 mục được rà soát. Bản có và không có hậu tố `(1)` có cùng SHA-256:

```text
cf1714b2ed4a7d59fecd27e2925c4fdbad897206bf6437d427bb2e0fee7c3937
```

Các con số dòng trong bản đánh giá đi kèm dựa trên file đính kèm [S1]/[S2]; không dựa trên bản soạn lại này.

## A.2 Nguồn kỹ thuật sơ cấp đối chiếu thêm

Các nguồn dưới chỉ kiểm chứng đặc tính thiết bị/nguyên lý được dẫn; **không chứng minh thiết kế net*CIRCUIT đã đạt các đặc tính đó**. Không chọn BOM chỉ dựa trên ví dụ của tài liệu.

**[H1] Altera — Cyclone IV Device Handbook, Volume 1, CYIV-5V1-2.2, March 2016.** Dùng bảng 1-1 và 1-3 để kiểm tra device resources và E144/U256/F256 I/O; xem phần clock/memory/I/O của handbook khi closure. Trang in 1-3 và 1-5 tương ứng PDF trang 17 và 19.

```text
https://cdrdv2-public.intel.com/655151/cyiv-5v1.pdf
```

**[H2] Texas Instruments — TMUX1575 product documentation.** Đối chiếu riêng powered-off signal-path protection, fail-safe control logic và nguy cơ back-power qua ESD diode. Đây không phải lựa chọn switch đã được chốt cho DUT.

```text
https://www.ti.com/product/TMUX1575
```

**[H3] Intel — User Configurable Timing Constraint, DCFIFO Gray CDC discussion.** Dùng nguyên tắc timing/skew cho Gray crossing; tài liệu thuộc một device guide khác, không xem IP cụ thể của guide đó là IP đã tương thích Cyclone IV. Constraint/IP thực phải dùng phiên bản hỗ trợ target.

```text
https://www.intel.com/content/www/us/en/docs/programmable/683241/24-3/user-configurable-timing-constraint.html
```

**[H4] FTDI — FT601Q-B / FT60x series documentation.** Đối chiếu 16/32-bit FIFO interface options; không dùng peak link figure làm sustained measurement guarantee hoặc quyết định BOM.

```text
https://ftdichip.com/products/ft601q-b/
```

**[H5] Intel — Extended Temperature Device Support, Cyclone IV FPGA table.** Đối chiếu cảnh báo không coi Cyclone IV GPIO là 5-V-compatible interface. Exact operating/absolute limits của commercial part và toàn đường board vẫn phải lấy từ device datasheet tương ứng.

```text
https://www.intel.com/content/www/us/en/products/docs/programmable/temperature.html
```

**Ghi chú kiểm chứng:** dữ liệu bảng [H1] được đọc từ phần text của PDF do công cụ web trích xuất. Việc lấy screenshot PDF gặp lỗi tải; không có xác nhận trực quan từ ảnh bảng trong lần rà soát này. Các phép cộng pin/bandwidth trong §24 và §29 là tính toán minh họa do bản sửa xây dựng, không phải số đo được trích từ handbook.
