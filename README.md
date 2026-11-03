# CIRNET Remote

[English](#english) | [Tiếng Việt](#tiếng-việt)

## English

Current repository: [CIRNETLAB/CIRNET-Remote](https://github.com/CIRNETLAB/CIRNET-Remote).
All six repositories now use `CIRNETLAB/CIRNET-*`; local `net-Circuit-*`
directory names, Python/npm identities and `NETCIRCUIT_*` settings stay compatible.
Historical `TINIHI-Labs/net-Circuit-*` and the original Remote URL identify the
same preserved repositories. Current consumers use the canonical URLs in the
system manifest; the published 0.1.1 artifacts retain their original revisions and digests.
The [M6 ledger](docs/verification/2026-10-27-multi-repo-migration-m6.md) separates
published artifact sources, current source commits, candidate builds and
published 0.1.2 acceptance.

A Web-first, Safety-gated, Lab-First remote electronics laboratory. Canonical authority: [Lab-First v3.1](docs/ARCHITECTURE.md). Safety allows execution; real student wiring produces behavior; software observes and evaluates. SAFETY != CORRECTNESS.

Browser Vue 3 / TypeScript / Pinia / Three.js → FastAPI modular monolith → isolated Hardware Service → HardwareStation (Virtual or Physical). CircuitGraph schemas 1.0/1.1 and additive 1.2 are design truth; physical observations use DetectedTopologyGraph. Versioned `/api/v2` operations carry 1.2 documents and assignment references without changing legacy wires. The Lab Execution Compiler routes instrumentation/power/endpoints only, never repairs student internal wiring.

Target deployment: Linux Mini PC Intel Xeon W-1370, 16 GB RAM, 256 GB SSD; Nginx, systemd, FastAPI, Hardware Service and PostgreSQL production. EP4CE6 prototype → future EP4CE10 + external SDRAM. Scope/Generator target 2CH each; physical analog routing V1=false. Physical execution/protection/ADC/DAC remain unavailable until proven hardware exists.

Existing Single Workspace editing, placement/gizmo/history and instrument presentation are preserved. Implementation status, baseline, phase commits and limitations: [migration ledger](docs/MIGRATION_LAB_FIRST.md). [Safety contract](docs/PHYSICAL_LAB_SAFETY.md), [roadmap](docs/ROADMAP.md), [API setup](services/api/README.md), [Interface setup](https://github.com/CIRNETLAB/CIRNET-Interface/blob/a14d0950e71a997e2219a32f7268fd0e9d6502b3/README.md), [Mini PC deployment](deployment/mini-pc/README.md).

Verification entrypoint: `python scripts/check_release.py --show-plan` and named `--group` gates. See [Contracts setup](contracts/README.md) for generation/check commands, PostgreSQL/Chromium prerequisites and installed-wheel verification. Run Vite, FastAPI and the local Hardware Service as separate processes (see setup links). The browser never communicates with raw FPGA transport.

Documentation navigation and status conventions: [documentation index](docs/README.md). Codex verification follows [AGENTS.md](AGENTS.md) and the [shared verification guide](docs/VERIFICATION.md): generated screenshots, traces and diagnostic output go directly to an external session directory; retained repository evidence is Markdown. Model textures, icons and approved fixtures remain product/test assets.

The published system selection is **0.1.2** with Interface **0.1.2** and the other selected component artifacts at **0.1.1**. Remote owns API, persistence, scheduler, deployment and integrated acceptance. Contracts owns schemas/catalogs/protocols and public SDK; Interface owns Web/editor/assets/browser assertions; Simulator owns execution/backends; Hardware owns local RPC/stations/transports; FPGA owns scaffold/RTL/toolchain. The build, runtime and release gates use the selected artifacts.

Activate an external virtual environment. Set `NETCIRCUIT_ARTIFACTS_TOKEN` privately if authenticated access is needed. Run `python scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json` from the Remote root. Apply the external JSON environment before `python scripts/check_release.py --show-plan` and the named groups. The installer verifies exact artifacts; it never deploys or starts services. See the [M6 plan](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/plans/2026-10-27-multi-repo-migration-m6.md), [fresh verification](docs/verification/2026-10-27-multi-repo-migration-m6.md) and [release/rollback runbook](deployment/multi-repo-release.md).

The implemented Web/Contracts boundaries include durable auth/RBAC, owned saved documents/CAS/local recovery, stable assignment publication, authorized history/reconnect, requested versus acknowledged instruments, explicit domains and retained indexed captures. [W0–W8 historical evidence](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-web-contracts.md), [acceptance matrix](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-acceptance-matrix.md) and [production templates](deployment/README.md) distinguish observed software results from unavailable hardware and target deployment. A dated pass is evidence for that recorded revision, not a fresh execution of the current release gates.

Current WC20 hardening (2026-10-20) adds bounded auth/control/runtime/realtime paths, complete operation validation and diagnostics, generated validator delivery, authored document persistence and read-only unknown-operation recovery. The [WC20 closure](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-web-contracts-closure.md) records the exact source identity, executed gates, native browser status and remaining limits. Local software results do not establish hosted CI, target Mini PC capacity or physical hardware capability.

Post-R7 H0–H6: observed pin/net evidence resolves arbitrary student placement before infrastructure compilation; reference physical node != student physical node. SQL/WebSocket carry capture metadata, with owner-scoped binary payloads in `NETCIRCUIT_CAPTURE_DIR`. Hardware admission uses capability slots; `NETCIRCUIT_SIMULATION_WORKERS` (positive integer, default 4) controls spawn workers in both services. One structured instrument capability source keeps Scope/Generator unavailable; live generator control needs explicit profile support. Inspector shows independent SAFETY/TOPOLOGY/FUNCTION, resolution confidence and observed learning feedback. See the migration ledger for tests, historical provenance and physical limitations.

Remote owns services/api, deployment, docs, tests and integration scripts. The other implementations are developed in their producer repositories. The [documentation index](docs/README.md#reading-status) links to historical source, analyses, plans and verification reports by Git revision.

Historical M5 verification used the independent `netcircuit-fpga-scaffold` source artifact `0.1.0`, selected by manifest/SHA256; it is not an API runtime dependency or board image. The original FPGA RTL and test copies are available in the pre-cleanup Git revision. Current M6 selects scaffold 0.1.1. Pure RTL acceptance belongs to CIRNET-FPGA and requires pinned parser/compiler/runtime without skips. Remote release checks require the selected FPGA artifact root; see the [M5 plan](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/plans/2026-10-27-multi-repo-migration-m5.md) and [consumer setup](contracts/README.md). Logical 1.0-scaffold remains independent of source version and unavailable physical firmware.

## Tiếng Việt

Trên Windows, mở [run-cirnet.bat](run-cirnet.bat) để chạy chế độ mô phỏng.
Cài Git, Python 3.12+ và Node.js 22 trước. Lần đầu, launcher tải các gói
được pin trong manifest, sau đó tự mở trình duyệt tại `http://127.0.0.1:5173`.
Giữ cửa sổ launcher mở. Để dừng, chuyển về cửa sổ đó và nhấn **Enter** hoặc
**Ctrl+C**. Nếu terminal giữ phím tắt hoặc bạn đã chuyển sang cửa sổ khác,
mở PowerShell mới tại thư mục repo và chạy `.\run-cirnet.bat stop`.
Launcher dừng Web, API và Hardware Service. Dữ liệu SQLite phát triển và
capture nằm trong `%USERPROFILE%\CIRNET-Dev`.

Nền tảng phòng thí nghiệm điện tử từ xa Web-first, Safety-gated, Lab-First. [Kiến trúc Lab-First v3.1](docs/ARCHITECTURE.md) là authority duy nhất. Kiểm tra an toàn cho phép chạy; IC/jumper sinh viên quyết định kết quả vật lý; phần mềm quan sát và chấm. SAFETY != CORRECTNESS. Sai topology/IC nhưng an toàn không tự động chặn Run.

Giữ nguyên workbench Vue/TypeScript/Pinia/Three.js và editor 3D. CircuitGraph 1.0/1.1 và 1.2 bổ sung là nguồn thiết kế; `/api/v2` hỗ trợ tài liệu/tham chiếu bài thực hành 1.2, giữ nguyên wire cũ. DetectedTopologyGraph mô tả mạch vật lý quan sát được. Compiler chỉ định tuyến hạ tầng nguồn/input/clock/instrument/sense, không nối lại dây nội bộ để sửa bài.

Triển khai mục tiêu: Linux Mini PC Intel Xeon W-1370, RAM 16 GB, SSD 256 GB; Nginx, systemd, FastAPI, Hardware Service riêng và PostgreSQL production. EP4CE6 nguyên mẫu → EP4CE10 + SDRAM ngoài trong tương lai; Scope/Generator mục tiêu 2 kênh mỗi loại. Analog vật lý V1 chưa hỗ trợ. Driver, bảo vệ điện, ADC/DAC/AFE và đo đạc phải có bằng chứng thật trước khi báo hoạt động.

[Xem ledger R0–R7](docs/MIGRATION_LAB_FIRST.md), [an toàn vật lý](docs/PHYSICAL_LAB_SAFETY.md), [lộ trình](docs/ROADMAP.md), [chạy API](services/api/README.md), [chạy Interface](https://github.com/CIRNETLAB/CIRNET-Interface/blob/a14d0950e71a997e2219a32f7268fd0e9d6502b3/README.md), [Mini PC](deployment/mini-pc/README.md). Kiểm thử root: `python scripts/check_context.py` và `python scripts/check_release.py --group python`; frontend: bootstrap Contracts rồi `npm ci`, `npm test` / `npm run build` tại CIRNET-Interface (giữ nguyên tên thư mục local nếu đang dùng `net-Circuit-Interface`); đặt `NETCIRCUIT_INTERFACE_ROOT` cho release gates của Remote. Mã Web và tài sản được dùng hiện nay nằm trong CIRNET-Interface. Bản lưu trong Remote có thể tra trong lịch sử Git. Vite, FastAPI và Hardware Service chạy ở ba process riêng. [Mục lục tài liệu](docs/README.md), [AGENTS.md](AGENTS.md) và [quy trình verification](docs/VERIFICATION.md) quy định screenshot/trace/artifact chẩn đoán chỉ tạo ngoài repository, bằng chứng giữ lại trong repository ở dạng Markdown. Các tài liệu và báo cáo cũ có liên kết đến đúng phiên bản Git trong [mục lịch sử](docs/README.md#reading-status).

Đợt H0–H6 bổ sung ánh xạ chân/net và vị trí sinh viên trước khi compiler định tuyến hạ tầng; node tham chiếu không phải node thực tế. Capture lớn lưu riêng, SQL/WebSocket chỉ giữ metadata; scheduler dùng số slot thật và worker simulation cấu hình được với spawn. Inspector hiển thị SAFETY/TOPOLOGY/FUNCTION độc lập, confidence và tín hiệu kỳ vọng/quan sát; chấm bài không quyết định quyền cấp điện. Xem ledger để đối chiếu từng commit và giới hạn phần cứng.

Đợt Web/Contracts W0–W8 bổ sung đăng nhập/RBAC, lưu Project/Circuit có revision/CAS, khôi phục bản nháp theo principal, bài thực hành có publication ổn định, reconnect/history không replay Run, cấu hình instrument có ACK và quản lý capture. Xem [ledger](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-web-contracts.md), [ma trận nghiệm thu](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-acceptance-matrix.md) và lệnh `python scripts/check_release.py --show-plan`. Vite, API và Hardware Service là ba process riêng.

Đợt WC20 (20-10-2026) củng cố vòng đời xác thực, giới hạn tài nguyên và tách biệt điều khiển, validation/diagnostics, tải validator, lưu dữ liệu do người dùng soạn và khôi phục quan sát yêu cầu chưa rõ kết quả. [Hồ sơ WC20 hiện hành](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-web-contracts-closure.md) ghi đúng source, kết quả các gate, trạng thái trình duyệt và giới hạn còn lại. Kết quả phần mềm cục bộ không chứng minh hosted CI, năng lực Mini PC đích hay khả năng phần cứng vật lý.
