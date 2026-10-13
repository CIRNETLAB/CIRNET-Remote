# net*CIRCUIT Remote

[English](#english) | [Tiếng Việt](#tiếng-việt)

## English

A Web-first, Safety-gated, Lab-First remote electronics laboratory. Canonical authority: [Lab-First v3.1](docs/ARCHITECTURE.md). Safety allows execution; real student wiring produces behavior; software observes and evaluates. SAFETY != CORRECTNESS.

Browser Vue 3 / TypeScript / Pinia / Three.js → FastAPI modular monolith → isolated Hardware Service → HardwareStation (Virtual or Physical). CircuitGraph schema 1.0 is logical design truth; physical observations use DetectedTopologyGraph. The Lab Execution Compiler routes instrumentation/power/endpoints only, never repairs student internal wiring.

Target deployment: Linux Mini PC Intel Xeon W-1370, 16 GB RAM, 256 GB SSD; Nginx, systemd, FastAPI, Hardware Service and PostgreSQL production. EP4CE6 prototype → future EP4CE10 + external SDRAM. Scope/Generator target 2CH each; physical analog routing V1=false. Physical execution/protection/ADC/DAC remain unavailable until proven hardware exists.

Existing Single Workspace editing, placement/gizmo/history and instrument presentation are preserved. Implementation status, baseline, phase commits and limitations: [migration ledger](docs/MIGRATION_LAB_FIRST.md). [Safety contract](docs/PHYSICAL_LAB_SAFETY.md), [roadmap](docs/ROADMAP.md), [API setup](services/api/README.md), [web usage](apps/web/README.md), [Mini PC deployment](deployment/mini-pc/README.md).

Verification from root: python scripts/check_context.py; pytest -q. Frontend: cd apps/web, npm ci --no-audit --no-fund, npm test, npm run build. Run Vite and FastAPI in separate terminals (see setup links). The browser never communicates with raw FPGA transport.

For the full Python/RPC test environment, install `pip install -e . -e './services/api[test]' -e './services/hardware-service[dev]' -e './simulator/circuit-simulator[test]'`; Hardware Service dev extras provide `grpcio-tools`. Missing that dependency is an environment failure, not a source verdict.

Post-R7 H0–H6: observed pin/net evidence resolves arbitrary student placement before infrastructure compilation; reference physical node != student physical node. SQL/WebSocket carry capture metadata, with owner-scoped binary payloads in `NETCIRCUIT_CAPTURE_DIR`. Hardware admission uses capability slots; `NETCIRCUIT_SIMULATION_WORKERS` (positive integer, default 4) controls spawn workers in both services. One structured instrument capability source keeps Scope/Generator unavailable; live generator control needs explicit profile support. Inspector shows independent SAFETY/TOPOLOGY/FUNCTION, resolution confidence and observed learning feedback. See the migration ledger for tests, historical provenance and physical limitations.

Repository: apps/web, services/api, services/hardware-service, simulator/circuit-simulator, contracts, device-library, fpga, deployment, docs, tests, scripts. Source analyses, DEV_LOG/CHANGELOG and docs/verification preserve implementation history. Superseded architecture/prompts are in docs/archive/legacy-v1.

## Tiếng Việt

Nền tảng phòng thí nghiệm điện tử từ xa Web-first, Safety-gated, Lab-First. [Kiến trúc Lab-First v3.1](docs/ARCHITECTURE.md) là authority duy nhất. Kiểm tra an toàn cho phép chạy; IC/jumper sinh viên quyết định kết quả vật lý; phần mềm quan sát và chấm. SAFETY != CORRECTNESS. Sai topology/IC nhưng an toàn không tự động chặn Run.

Giữ nguyên workbench Vue/TypeScript/Pinia/Three.js và editor 3D. CircuitGraph 1.0 mô tả thiết kế logic; DetectedTopologyGraph mô tả mạch vật lý quan sát được. Compiler chỉ định tuyến hạ tầng nguồn/input/clock/instrument/sense, không nối lại dây nội bộ để sửa bài.

Triển khai mục tiêu: Linux Mini PC Intel Xeon W-1370, RAM 16 GB, SSD 256 GB; Nginx, systemd, FastAPI, Hardware Service riêng và PostgreSQL production. EP4CE6 nguyên mẫu → EP4CE10 + SDRAM ngoài trong tương lai; Scope/Generator mục tiêu 2 kênh mỗi loại. Analog vật lý V1 chưa hỗ trợ. Driver, bảo vệ điện, ADC/DAC/AFE và đo đạc phải có bằng chứng thật trước khi báo hoạt động.

[Xem ledger R0–R7](docs/MIGRATION_LAB_FIRST.md), [an toàn vật lý](docs/PHYSICAL_LAB_SAFETY.md), [lộ trình](docs/ROADMAP.md), [chạy API](services/api/README.md), [Web](apps/web/README.md), [Mini PC](deployment/mini-pc/README.md). Kiểm thử root: python scripts/check_context.py và pytest -q; frontend: npm test / npm run build tại apps/web. Vite và FastAPI chạy ở hai terminal riêng. Tài liệu/verification lịch sử được giữ; prompt/kiến trúc cũ lưu trong docs/archive/legacy-v1.

Đợt H0–H6 bổ sung ánh xạ chân/net và vị trí sinh viên trước khi compiler định tuyến hạ tầng; node tham chiếu không phải node thực tế. Capture lớn lưu riêng, SQL/WebSocket chỉ giữ metadata; scheduler dùng số slot thật và worker simulation cấu hình được với spawn. Inspector hiển thị SAFETY/TOPOLOGY/FUNCTION độc lập, confidence và tín hiệu kỳ vọng/quan sát; chấm bài không quyết định quyền cấp điện. Xem ledger để đối chiếu từng commit và giới hạn phần cứng.

Branch refactor dừng sau H0–H6 để người dùng review; không tự merge/push vào main.
