# net*CIRCUIT Remote

[English](#english) | [Tiếng Việt](#tiếng-việt)

## English

A Web-first, Safety-gated, Lab-First remote electronics laboratory. Canonical authority: [Lab-First v3.1](docs/ARCHITECTURE.md). Safety allows execution; real student wiring produces behavior; software observes and evaluates. SAFETY != CORRECTNESS.

Browser Vue 3 / TypeScript / Pinia / Three.js → FastAPI modular monolith → isolated Hardware Service → HardwareStation (Virtual or Physical). CircuitGraph schemas 1.0/1.1 and additive 1.2 are design truth; physical observations use DetectedTopologyGraph. Versioned `/api/v2` operations carry 1.2 documents and assignment references without changing legacy wires. The Lab Execution Compiler routes instrumentation/power/endpoints only, never repairs student internal wiring.

Target deployment: Linux Mini PC Intel Xeon W-1370, 16 GB RAM, 256 GB SSD; Nginx, systemd, FastAPI, Hardware Service and PostgreSQL production. EP4CE6 prototype → future EP4CE10 + external SDRAM. Scope/Generator target 2CH each; physical analog routing V1=false. Physical execution/protection/ADC/DAC remain unavailable until proven hardware exists.

Existing Single Workspace editing, placement/gizmo/history and instrument presentation are preserved. Implementation status, baseline, phase commits and limitations: [migration ledger](docs/MIGRATION_LAB_FIRST.md). [Safety contract](docs/PHYSICAL_LAB_SAFETY.md), [roadmap](docs/ROADMAP.md), [API setup](services/api/README.md), [web usage](apps/web/README.md), [Mini PC deployment](deployment/mini-pc/README.md).

Verification entrypoint: `python scripts/check_release.py --show-plan` and named `--group` gates. See [Contracts setup](contracts/README.md) for generation/check commands, PostgreSQL/Chromium prerequisites and installed-wheel verification. Run Vite, FastAPI and the local Hardware Service as separate processes (see setup links). The browser never communicates with raw FPGA transport.

Documentation navigation and status conventions: [documentation index](docs/README.md). Codex verification follows [AGENTS.md](AGENTS.md) and the [shared verification guide](docs/VERIFICATION.md): generated screenshots, traces and diagnostic output go directly to an external session directory; retained repository evidence is Markdown. Model textures, icons and approved fixtures remain product/test assets.

For the full Python/RPC test environment, install `pip install -r requirements-verification.txt -e . -e './services/api[test]' -e './services/hardware-service[dev]' -e './simulator/circuit-simulator[test]'`; run `npm ci --no-audit --no-fund` in `apps/web`. The release runner bootstraps ignored RPC bindings, checks deterministic committed boundaries and fails required PostgreSQL/browser/package gates explicitly when prerequisites are absent.

The implemented Web/Contracts boundaries include durable auth/RBAC, owned saved documents/CAS/local recovery, stable assignment publication, authorized history/reconnect, requested versus acknowledged instruments, explicit domains and retained indexed captures. [W0–W8 historical evidence](docs/verification/2026-10-16-web-contracts.md), [acceptance matrix](docs/verification/2026-10-16-acceptance-matrix.md) and [production templates](deployment/README.md) distinguish observed software results from unavailable hardware and target deployment. A dated pass is evidence for that recorded revision, not a fresh execution of the current release gates.

Post-R7 H0–H6: observed pin/net evidence resolves arbitrary student placement before infrastructure compilation; reference physical node != student physical node. SQL/WebSocket carry capture metadata, with owner-scoped binary payloads in `NETCIRCUIT_CAPTURE_DIR`. Hardware admission uses capability slots; `NETCIRCUIT_SIMULATION_WORKERS` (positive integer, default 4) controls spawn workers in both services. One structured instrument capability source keeps Scope/Generator unavailable; live generator control needs explicit profile support. Inspector shows independent SAFETY/TOPOLOGY/FUNCTION, resolution confidence and observed learning feedback. See the migration ledger for tests, historical provenance and physical limitations.

Repository: apps/web, services/api, services/hardware-service, simulator/circuit-simulator, contracts, device-library, fpga, deployment, docs, tests, scripts. Source analyses, DEV_LOG/CHANGELOG and docs/verification preserve implementation history. Superseded architecture/prompts are in docs/archive/legacy-v1.

## Tiếng Việt

Nền tảng phòng thí nghiệm điện tử từ xa Web-first, Safety-gated, Lab-First. [Kiến trúc Lab-First v3.1](docs/ARCHITECTURE.md) là authority duy nhất. Kiểm tra an toàn cho phép chạy; IC/jumper sinh viên quyết định kết quả vật lý; phần mềm quan sát và chấm. SAFETY != CORRECTNESS. Sai topology/IC nhưng an toàn không tự động chặn Run.

Giữ nguyên workbench Vue/TypeScript/Pinia/Three.js và editor 3D. CircuitGraph 1.0/1.1 và 1.2 bổ sung là nguồn thiết kế; `/api/v2` hỗ trợ tài liệu/tham chiếu bài thực hành 1.2, giữ nguyên wire cũ. DetectedTopologyGraph mô tả mạch vật lý quan sát được. Compiler chỉ định tuyến hạ tầng nguồn/input/clock/instrument/sense, không nối lại dây nội bộ để sửa bài.

Triển khai mục tiêu: Linux Mini PC Intel Xeon W-1370, RAM 16 GB, SSD 256 GB; Nginx, systemd, FastAPI, Hardware Service riêng và PostgreSQL production. EP4CE6 nguyên mẫu → EP4CE10 + SDRAM ngoài trong tương lai; Scope/Generator mục tiêu 2 kênh mỗi loại. Analog vật lý V1 chưa hỗ trợ. Driver, bảo vệ điện, ADC/DAC/AFE và đo đạc phải có bằng chứng thật trước khi báo hoạt động.

[Xem ledger R0–R7](docs/MIGRATION_LAB_FIRST.md), [an toàn vật lý](docs/PHYSICAL_LAB_SAFETY.md), [lộ trình](docs/ROADMAP.md), [chạy API](services/api/README.md), [Web](apps/web/README.md), [Mini PC](deployment/mini-pc/README.md). Kiểm thử root: `python scripts/check_context.py` và `pytest -q`; frontend: `npm test` / `npm run build` tại apps/web. Vite, FastAPI và Hardware Service chạy ở ba process riêng. [Mục lục tài liệu](docs/README.md), [AGENTS.md](AGENTS.md) và [quy trình verification](docs/VERIFICATION.md) quy định screenshot/trace/artifact chẩn đoán chỉ tạo ngoài repository, bằng chứng giữ lại trong repository ở dạng Markdown. Tài liệu/verification lịch sử được giữ; prompt/kiến trúc cũ lưu trong docs/archive/legacy-v1.

Đợt H0–H6 bổ sung ánh xạ chân/net và vị trí sinh viên trước khi compiler định tuyến hạ tầng; node tham chiếu không phải node thực tế. Capture lớn lưu riêng, SQL/WebSocket chỉ giữ metadata; scheduler dùng số slot thật và worker simulation cấu hình được với spawn. Inspector hiển thị SAFETY/TOPOLOGY/FUNCTION độc lập, confidence và tín hiệu kỳ vọng/quan sát; chấm bài không quyết định quyền cấp điện. Xem ledger để đối chiếu từng commit và giới hạn phần cứng.

Đợt Web/Contracts W0–W8 bổ sung đăng nhập/RBAC, lưu Project/Circuit có revision/CAS, khôi phục bản nháp theo principal, bài thực hành có publication ổn định, reconnect/history không replay Run, cấu hình instrument có ACK và quản lý capture. Xem [ledger](docs/verification/2026-10-16-web-contracts.md), [ma trận nghiệm thu](docs/verification/2026-10-16-acceptance-matrix.md) và lệnh `python scripts/check_release.py --show-plan`. Vite, API và Hardware Service là ba process riêng. Branch refactor được giữ để review; không tự push, merge hoặc deploy. Kết quả commit bị chặn bởi quyền Git được ghi riêng trong ledger.
