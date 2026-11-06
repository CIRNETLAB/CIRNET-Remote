# Kế hoạch chuyển đổi CIRNET sang C++ và Rust

[English](../../en/architecture/native-migration.md) · [Kế hoạch gốc ngày 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Biên bản giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

**Gate 0 PASS trên bộ tham chiếu 0.1.4 đã chọn. Gate 1 PASS trên Windows x64 với r7. Gate 2 PASS với ma trận Contracts r2. Gate 3 PASS về chức năng, tương thích và an toàn trên Windows với r8-R2. Gate 4 PASS về chức năng, tương thích và an toàn trên Windows với Remote 717402ba.** Hiệu năng production Gate 3, hiệu năng và Stop dưới tải đầy đủ Gate 4 trên Linux/Xeon, HIL, nghiệm thu production/phát hành và Gate 5 đều `NOT RUN`. [Chính sách Gate 3 hiện hành](#chính-sách-nghiệm-thu-gate-3-theo-môi-trường) · [Chính sách Gate 4 hiện hành](#chính-sách-nghiệm-thu-gate-4-theo-môi-trường). Profile 0.1.4 đã phát hành là bản tham chiếu để rollback.

> **Dành cho agent triển khai.** Dùng superpowers:subagent-driven-development hoặc superpowers:executing-plans. Hoàn thành và ghi bằng chứng từng gate trước khi bắt đầu giai đoạn kế tiếp.

**Mục tiêu.** Giữ tương thích với hệ thống đang phát hành, rồi chuyển sang Interface Vue/TypeScript → Remote Rust → Hardware Rust → Simulator C++.

**Kiến trúc.** Interface giữ REST và WebSocket cùng origin. Remote giữ quyền điều phối, dữ liệu và lease. Hardware giữ RPC cục bộ, quyền điều khiển trạm và tiến trình Simulator. Contracts cung cấp schema, SDK và dữ liệu chuẩn cho các thành phần. Trong giai đoạn 1–2, preview tiếp tục đi qua adapter của Remote. Từ giai đoạn 3, preview có thể đi qua Hardware khi tổ hợp giai đoạn đó đã vượt qua gate.

**Công cụ.** C++20 và CMake cho worker, Rust và Cargo lock cho các binary và công cụ sinh mã, Node cho SDK TypeScript, pytest và Playwright Python để nghiệm thu. Chốt phiên bản compiler, linker, target và phụ thuộc trong manifest ứng viên trước khi đo. Các phiên bản công cụ C++/Rust dùng cho phát hành sẽ được chọn ở giai đoạn tương ứng.

## Quy tắc áp dụng cho mọi giai đoạn

- Theo đúng thứ tự **0 → 1 → 2 → 3 → 4 → 5**. Mỗi gate bắt buộc cần có lệnh chạy, tổ hợp artifact, kết quả và bằng chứng riêng. FAIL hoặc NOT RUN ở gate bắt buộc chặn tiến độ của phạm vi nghiệm thu tương ứng. Nghiệm thu chức năng và an toàn Gate 3 trên Windows quyết định thời điểm bắt đầu giai đoạn triển khai kế tiếp. Chọn mặc định production và phát hành cần đạt gate hiệu năng riêng trên Linux Xeon cùng các bằng chứng phát hành bắt buộc khác.
- Mỗi tổ hợp dùng gói phát hành hoặc ứng viên đóng gói theo commit, version, SHA-256, target và cờ build. Mã nguồn của repo bên cạnh chỉ dùng để phát triển hoặc xuất artifact riêng. Phân biệt HEAD khảo sát, revision dùng build và revision của harness. Dữ liệu/trace thô nằm trong session ngoài Git do DEV allocator đã ghim cấp phát. Chỉ lưu báo cáo Markdown trong repo.
- Python được giữ trong test và benchmark của sản phẩm cuối. Trong giai đoạn chuyển tiếp, giữ artifact Python tương thích và toàn bộ test tham chiếu. PR chạy test gần thay đổi cùng kiểm tra auth/safety liên quan. Gate tích hợp chạy tiến trình và artifact thật. Gate phát hành chạy chính xác bộ artifact dự định giao.
- Dùng cùng fixture hợp lệ và không hợp lệ để kiểm wire. Khóa cả đường dẫn RPC chuẩn và alias cũ, protobuf presence, tên/kiểu/status/error REST, sequence và resync WebSocket, byte NCAP, quyền sở hữu và dữ liệu bền vững. Mọi thay đổi phá tương thích cần phiên bản wire và kế hoạch chuyển consumer riêng.
- Trước khi đổi mặc định, ghi cách quay lại tổ hợp gần nhất đã qua gate. Ngừng nhận Run, đợi dọn dẹp an toàn hoặc lưu cách ly, giữ cặp backup database và capture cùng manifest. Khi khởi động, scheduler Python có thể tự dispatch bản ghi `QUEUED`. Trước khi cấp quyền gọi Hardware cho scheduler sau cutover hoặc restore, kiểm tra hàng đợi trong dữ liệu phục hồi và xử lý hoặc giữ riêng mọi lệnh đang chờ. Xác nhận quyền sở hữu, digest capture, lease, cách ly và chỉ một scheduler được cấp quyền điều khiển. Kiểm tra không có Start phát lại sau crash hoặc ACK không rõ kết quả.

## Mốc tham chiếu và khảo sát mã

Hệ thống chọn [release-set.json](../../../integration/release-set.json) **0.1.4**, gồm 15 artifact. RPC Hardware **2.0**, FPGA logical **1.0-scaffold**, register map **1.0-reserved**, cùng origin, một scheduler và Hardware RPC chỉ cục bộ. Revision HEAD ghi để tái hiện việc khảo sát. Cột revision artifact ghi revision tạo các byte đang được chọn.

| Repo | Version artifact | HEAD khảo sát | Revision artifact |
| --- | --- | --- | --- |
| Remote | hệ thống 0.1.4, API/deployment 0.1.2 | `37cb350b8492799fa1f8ad2ec85b11fbdd2d5bda` | `ce84ec4cf3602ef6fd001f91877e864c8955f9c7` |
| Simulator | 0.1.2 | `47026eb4031ed1ec453e5b08eb5af2e4e0a7044e` | `9ec36fa2772ba8227e15ae33fec9710943a9a775` |
| Contracts | 0.1.2, DEV Python 1.0.0a1, DEV npm 1.0.0-m1.0 | `98897f4291ed381da2245b5daced92c9bc9c3aa5` | `524cc7a5e2e65f39077feefe70c7fb2ae3a773d6` |
| Hardware | 0.1.2 | `65dbf0a55d29026817ddf11458259ce312e94bc6` | `9a8935b6a596abe2d21ce90416ba3b914e9f36be` |
| Interface | 0.1.4 | `879c6fdbff34462df6e112c8dd7afc3a96ff9933` | `f1fe0c4738e105727aff1a331327caf7172cdf5f` |
| FPGA | 0.1.2 scaffold | `c4bf5f04df063aa417ab1e22c65bca680305e4dd` | `d27c818aca0eb95e9ee8d9b5ba6bda3182909914` |

SHA-256 của file lock trong checkout là `90a8ef4d30ddc19d3024dcb3790fef5d5e041f45fa47922bfd5e34c2fd19c419`. Lock nguồn Interface dùng trong CI có revision riêng ở `integration/browser-interface-source.json`. Lấy số đo tham chiếu từ bộ phát hành được chọn, chỉ ghi khác biệt HEAD và overlay test vào provenance.

| Luồng | Điểm vào và ranh giới hiện tại |
| --- | --- |
| Run và Stop | Interface adapter → `services/api/app/api/experiments.py` → `services/experiments.py` → `hardware_client.py` → Hardware `server.py`, `rpc.py`, `station/virtual.py` → Simulator `cirnet_sim/backends.py`. Ghi riêng Run được nhận, công việc xong, Stop được nhận, ACK an toàn, lease được thả hoặc trạm bị cách ly. |
| Preview | Remote `api/circuits.py` và `api/placement.py` hiện gọi Simulator đồng bộ. Giai đoạn 1 bổ sung ngân sách preview riêng. |
| Capture | Hardware trả `OperationReply.capture_payload` và descriptor → Remote gateway xác thực → `capture_store.py` lưu payload và `capture_repository.py` lưu metadata → Interface đọc qua REST. WebSocket gửi metadata. |
| Auth và WebSocket | Remote `services/auth.py`, `services/operations.py`, `websocket/events.py` giữ cookie/CSRF, principal, control client, owner, sequence và resync. Interface xác thực DTO bằng SDK đã đóng gói. |
| Dữ liệu và release | Remote Alembic và `app/db/schema.py` quản lý SQLite/PostgreSQL. Installer, CI, launcher và deployment dùng version lock. `cirnet-cli` hiện chỉ có README và LICENSE. |

## 0. Đo và khóa hành vi Python đang phát hành

[Biên bản giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

- [x] **Cài và nhận dạng bộ tham chiếu.** Chạy `python -B -m scripts.install_release --manifest integration/release-set.json --environment-file release-env.json` trong venv thuộc session riêng và áp dụng hai block biến môi trường của installer. Kiểm SHA-256 toàn bộ 15 artifact, provenance wheel đã cài, `pip check`, thông số máy/OS/CPU/RAM, phiên bản toolchain, DB, số worker, hạn mức và cấu hình cùng origin. Không dùng venv cũ hoặc artifact build lại khác digest làm chuẩn. Rollback giai đoạn 0 là tắt tiến trình thử và dọn đúng session, giữ nguyên lock hiện hành.
- [x] **Khóa corpus đối chứng.** Tái dùng fixture hiện có trong Contracts `contracts/compatibility`, `tests/contracts`, Remote `tests/contracts`, `tests/integration` và `services/api/tests`. Chạy `scripts/export_openapi.py --check` và `scripts/check_public_compatibility.py`. Lưu input và kết quả đã khử thông tin nhạy cảm cho REST/OpenAPI, gRPC (bao gồm alias, presence và lỗi), NCAP (mẫu nhỏ và ca 100.000 mẫu), WebSocket và phiên bản schema DB. Tạo snapshot SQLite/PostgreSQL bằng dữ liệu thử tổng hợp với principal, dự án/revision, lệnh idempotent, lịch sử, lease/quarantine và capture. Lưu kèm digest capture. Chạy kiểm owner, CSRF/origin, revocation, replay, guarded power và capture không hợp lệ. Khóa digest fixture sau khi xác minh bản tham chiếu.
- [x] **Đo đường ngoài.** Chạy `python -B -m scripts.benchmark_web_sessions --sessions 50 --concurrency 10 --runs 8 --read-rounds 3` làm mốc smoke. Giữ workload AND đã có (X tại 0 ns, 0 tại 8 ns, 1 tại 28 ns), thêm graph số nhiều sự kiện và gói NCAP lớn từ fixture hiện có. Khóa SHA-256 của input, harness và inventory dependency, cấu hình 50 principal, 10 HTTP đồng thời, 4 worker, chính sách auth hiện tại, seed, warmup và cửa sổ đo theo hai profile SQLite/PostgreSQL. Tính throughput bằng số request hoàn tất trong cửa sổ tải chia số giây cửa sổ đó, tính riêng job/s và byte capture/s. Thu CPU giây trên mỗi job, peak tổng RSS của cây tiến trình và số lần lấy mẫu. RSS có thể đếm trang chia sẻ nhiều lần. Tách bootstrap/login pacing ra khỏi cửa sổ tải. Lấy ít nhất 100 quan sát hợp lệ cho mỗi phân phối p99 ở từng lần đo, đo ít nhất ba lần độc lập sau warmup, báo cả số mẫu và cách tính nearest rank. Benchmark sẵn có dùng chung tiến trình API/Hardware và gọi Stop sau COMPLETE. Dùng harness pytest có tiến trình riêng để đo theo dịch vụ và profile PostgreSQL.
- [x] **Đo Stop trong lúc chạy và phân pha.** Mở rộng harness pytest trong `tests/integration/` và tái dùng `scripts/benchmark_web_sessions.py` cho HTTP/resource metrics. Ghim graph và xác nhận tất cả slot bận, tiến trình worker đã bắt đầu job đích và job còn chạy tại thời điểm Stop. Loại mẫu nếu job kịp kết thúc. Lấy số đo riêng cho Stop → phản hồi HTTP, gRPC ACK và safe release hoặc quarantine bền vững. Dùng graph tải tự nhiên để đo, chạy các ca tiêm treo/crash/ACK muộn riêng để kiểm bất biến. Dùng đồng hồ đơn điệu trong từng tiến trình và request/experiment ID để phân pha Remote plan/queue và API, Hardware compile graph, thời gian chờ worker, Simulator run, NCAP encode/read/transfer/decode, lưu/đọc payload và DB wait/transaction. Tách dữ liệu có instrumentation với phép đo ngoài trên artifact nguyên bản. Báo thời gian song song dưới dạng span để tránh cộng đúp vào tổng.
- [x] **Đối chiếu phép đo lõi.** Chạy riêng `python -B -m pytest -q tests/integration/native_baseline_cases.py --basetemp <owned>/pytest-native-baseline` từ môi trường đã xác thực. Tái dùng đồ thị AND của benchmark HTTP và kiểm chuỗi sự kiện/capture trước khi đo. So compile, run, NCAP encode và decode độc lập trong tiến trình pytest. Dữ liệu vi mô này dùng để đối chiếu span tích hợp.
- [x] **Chốt ngưỡng trước ứng viên.** Quy ước ban đầu do người triển khai chọn là không sai khác corpus hoặc bất biến safety. So trên từng profile cùng cấu hình bằng median của các lần đo, giới hạn p95/p99 và peak RSS ≤ 110% mốc, CPU/job ≤ 110%, throughput ≥ 95%. Với Stop dùng ngưỡng chặt hơn giữa giới hạn vận hành hiện có và 110% p95/p99 mốc. Không cấp lại lease khi thiếu ACK an toàn. Với Simulator C++ yêu cầu p95 thời gian chạy lõi hoặc CPU/job giảm ít nhất 10%, hiệu ứng lớn hơn biến động đo qua ba lần chạy ghép cặp, đồng thời đạt các ngưỡng còn lại. Nếu số mẫu, tải hoặc biến động chưa đủ để áp các ngưỡng, hoàn thiện phép đo và lưu số tuyệt đối trước khi đánh giá ứng viên.
- [x] **Gate 0.** Chỉ PASS khi có bộ artifact xác thực, corpus đối chứng, số đo phân pha, Stop dưới tải và ngưỡng đã khóa. Báo cáo theo mẫu cuối tài liệu.

### Chạy gate trên bộ tham chiếu đã cài

Áp dụng hai block biến môi trường từ lượt cài 0.1.4 riêng. Đặt
`CIRNET_NATIVE_RELEASE_STATE` thành đường dẫn tuyệt đối đến `release-env.json`.
Dùng cluster PostgreSQL thử riêng trên loopback qua `CIRNET_TEST_POSTGRES_URL`
và công cụ backup tương ứng qua `CIRNET_TEST_PG_BIN`. Chạy tuần tự các lệnh đo
với cỡ mẫu mặc định. Tùy chọn giảm mẫu dành cho kiểm tra harness.

```powershell
python -B -m pytest -q tests/integration/native_external_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-external"
$env:CIRNET_PHASE_DATABASE = 'sqlite'
python -B -m pytest -q tests/integration/native_phase_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-phases-sqlite"
$env:CIRNET_PHASE_DATABASE = 'postgresql'
python -B -m pytest -q tests/integration/native_phase_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-phases-postgresql"
1..3 | ForEach-Object {
    python -B -m pytest -q tests/integration/native_stop_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-stop-$_"
    if ($LASTEXITCODE -ne 0) { throw "Loaded Stop run $_ failed." }
}
python -B -m pytest -q tests/integration/native_state_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-state"
```

Profile bên ngoài chạy API và Hardware ở hai tiến trình con dùng wheel đã
cài. Job Simulator chạy trong các tiến trình worker. Mỗi database có ba lượt
độc lập, 50 principal Student tổng hợp, bốn slot Simulator, tối đa 10 luồng
client và bốn job clock để warmup. Mỗi lượt đo 100 job trên từng graph. Capture
AND có ba mẫu và capture clock 100 MHz có 4.001 mẫu. Ca NCAP 100.000 mẫu kiểm
riêng khả năng tương thích khi payload lớn hơn. Throughput thao tác cố định
gồm tạo thí nghiệm, Run, GET capture và các lượt đọc đã định trước. Throughput
HTTP tổng tính thêm polling. CPU/RSS của cây API và Hardware gồm worker
Simulator. Máy chủ PostgreSQL và trình tạo tải nằm ngoài phạm vi số đo này.

Profile Stop dùng bốn principal khách trên SQLite và fixture đã ghim gồm bốn
nhánh clock 1 MHz → 74HC08 → LED với thời lượng mô phỏng 6 ms. Tính thời gian
từ client HTTP. Mẫu hợp lệ cần đủ bốn worker đang tính toán khi Hardware nhận
RPC Stop đích. Ghi riêng phản hồi HTTP, ACK gRPC, worker kết thúc, ACK dọn dẹp
và giải phóng lease bền vững. Probe phân pha mô tả lượt đo có instrumentation
và các span có thể chồng nhau. Phần thời gian gRPC còn lại gồm truyền tải,
điều phối và codec.

### Kết quả profile bên ngoài ngày 2026-11-06

Các cửa sổ đo chính thức dùng bộ phát hành 0.1.4 và wheel dịch vụ 0.1.2
đã chọn trên Windows 11 build 26300, Core i5-12500H, 16 CPU logic và
34.049.417.216 byte RAM. Chế độ điện năng là Balanced. Runtime dùng
CPython 3.14.4, SQLite 3.50.4 và PostgreSQL 18.6. Cả sáu cửa sổ đều PASS
và đối chiếu được 1.200 capture. Bảng lấy trung vị của ba lượt độc lập cho
mỗi database.

| Database | HTTP cố định request/s | HTTP tổng request/s | Job/s | NCAP byte/s | CPU giây/job | Peak tổng RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SQLite | 8,55 | 22,57 | 1,71 | 37.823 | 0,513 | 607,5 |
| PostgreSQL | 9,26 | 25,68 | 1,85 | 40.970 | 0,500 | 613,2 |

| Database và thao tác | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| SQLite AND Run | 433,864 | 1.617,278 | 2.141,406 |
| SQLite AND GET capture | 45,849 | 81,019 | 608,845 |
| SQLite clock Run | 394,578 | 1.592,767 | 1.930,552 |
| SQLite clock GET capture | 49,802 | 107,525 | 215,112 |
| PostgreSQL AND Run | 360,839 | 1.213,428 | 2.492,763 |
| PostgreSQL AND GET capture | 49,835 | 84,143 | 139,424 |
| PostgreSQL clock Run | 321,098 | 1.045,678 | 1.218,074 |
| PostgreSQL clock GET capture | 53,217 | 103,482 | 143,936 |

Throughput thao tác cố định dao động từ 8,54 đến 17,00 request/s trên
SQLite và từ 9,15 đến 9,60 request/s trên PostgreSQL. Giữ cả ba lượt khi
áp ngưỡng. So bản ứng viên và bản tham chiếu theo cặp trong cùng môi trường
và tính đến độ dao động trước khi kết luận cải thiện hiệu năng.

### Kết quả phân pha tích hợp

Lượt gắn probe trên mỗi database đều PASS với 200 capture khớp byte và bốn
PID worker Simulator. Bảng ghi p95 của từng span. Bằng chứng giữ riêng
từng pha cùng cỡ mẫu tương ứng.

| Span | SQLite p95 ms | PostgreSQL p95 ms |
| --- | ---: | ---: |
| Compile plan ở API | 3,225 | 2,689 |
| Compile graph ở Hardware | 9,163 | 6,562 |
| Hàng đợi Simulator đến lúc worker bắt đầu | 1,164 | 1,019 |
| Simulator Run, cả hai graph | 46,106 | 34,962 |
| Khứ hồi RPC capture | 33,916 | 28,352 |
| Phần thời gian gRPC còn lại theo từng cặp | 12,321 | 7,687 |
| Giải mã NCAP ở API | 4,312 | 3,917 |
| Lưu capture | 45,788 | 41,081 |
| Đọc và xác thực capture | 35,848 | 28,612 |
| Nhận kết nối DB | 0,051 | 0,047 |
| Chạy lệnh qua cursor DB | 3,473 | 4,171 |
| Commit DB | 7,989 | 2,575 |

p95 Simulator Run của workload AND và clock lần lượt là 1,184 và
50,016 ms trên SQLite, 1,052 và 39,275 ms trên PostgreSQL.

### Kết quả Stop dưới tải

Ba lượt SQLite độc lập đều PASS, mỗi lượt có 100 quan sát hợp lệ và
không có mẫu bị loại. Mỗi quan sát đối chiếu HTTP Stop đích với thời điểm
gRPC thực sự đến Hardware khi cả bốn worker Simulator đang tính toán.
Mỗi quan sát hợp lệ đạt `COMPLETE` với `STOPPED`, chặn capture của job
đã hủy và ghi worker kết thúc trước ACK an toàn cuối và giải phóng lease
bền vững. Bảng lease SQLite trống sau khi tắt hệ thống thử.

| Mốc tính từ HTTP Stop | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Phản hồi HTTP | 153,345 | 179,595 | 528,324 |
| ACK gRPC ban đầu | 112,205 | 126,550 | 478,829 |
| Worker đích kết thúc | 1.765,172 | 1.825,176 | 1.841,799 |
| ACK gRPC dọn dẹp cuối | 1.841,353 | 1.985,796 | 2.207,238 |
| Giải phóng lease bền vững | 1.918,033 | 2.304,143 | 2.362,159 |

Bảng lấy trung vị của mỗi phân vị qua ba lượt. p95 giải phóng lease từng
lượt nằm trong khoảng 1.653,794–2.492,834 ms. Các số đo này áp dụng cho
fixture Stop dưới tải trên SQLite. Các kiểm tra PostgreSQL bao gồm tải,
span tích hợp và phục hồi lease cách ly.

### Gói đối chứng và ngưỡng nghiệm thu

`cirnet-stage-0-reference.zip` có SHA-256 `73185795872bc1ec7e40e30ecc9732a27ba3cbb5dcf657053db5264302117fbb`.
Commit `18c4f526030687601e292eef05c474ee1feb0741` lưu bộ kiểm tra và kết quả
giai đoạn 0. Đối chiếu SHA-256 của lock và ngưỡng đã chốt trước khi đo
ứng viên với bản tham chiếu.

| Tệp trong gói | SHA-256 |
| --- | --- |
| `release/release-set.json` | `90a8ef4d30ddc19d3024dcb3790fef5d5e041f45fa47922bfd5e34c2fd19c419` |
| `performance/thresholds.json` | `fd7412c675c0372521519626b77a0e74e83d8967037a597e283086378ba0685a` |

Gói đã kiểm tra chứa đúng 15 artifact phát hành, release lock, danh mục
test và dependency, mẫu thời gian thô, descriptor và phản hồi gRPC, OpenAPI,
fixture Contracts và NCAP số 100.000 mẫu. Hai cặp database/capture có digest
từng file và schema `0007_auth_maintenance`. Đã phục hồi riêng từng cặp.
Cả hai kiểm tra đều PASS cho revision đã lưu, lịch sử, idempotency, quyền
truy cập, phiên bị thu hồi, hàng đợi trống và cách ly bền vững. Giữ từng
backup cùng capture tương ứng và chỉ phục hồi vào môi trường riêng.

`performance/thresholds.json` trong gói ghi ngưỡng tuyệt đối p95/p99 của
từng thao tác, trần CPU/RSS, sàn throughput và mục tiêu cải thiện Simulator.
Bảng dưới làm tròn một số ngưỡng.

| Ngưỡng | SQLite | PostgreSQL |
| --- | ---: | ---: |
| HTTP cố định tối thiểu, request/s | 8,123 | 8,799 |
| CPU tối đa, giây/job | 0,565 | 0,550 |
| Peak tổng RSS tối đa, MiB | 668,254 | 674,506 |
| p95 AND Run tối đa, ms | 1.779,006 | 1.334,771 |
| p95 clock Run tối đa, ms | 1.752,044 | 1.150,246 |
| p95 worker AND để cải thiện 10%, ms | 1,066 | 0,947 |
| p95 worker clock để cải thiện 10%, ms | 45,014 | 35,347 |

Ngưỡng Stop dưới tải trên SQLite là 139,205/526,712 ms cho p95/p99 ACK
gRPC ban đầu và 2.534,557/2.598,375 ms cho p95/p99 giải phóng lease bền
vững. Corpus và bất biến an toàn yêu cầu tương đương hoàn toàn. Mức cải
thiện của ứng viên còn phải vượt dao động khi đo theo cặp trên cùng profile.
Gói đối chứng hỗ trợ cài lại đúng bộ 0.1.4 và phục hồi dữ liệu thử theo cặp.
Diễn tập rollback bản phát hành native có gate riêng.

## 1. Simulator C++ và adapter chuyển tiếp

- [x] **Lát cắt số.** Trong Simulator, thêm CMake và worker C++ độc lập, bắt đầu với AND 74HC08 từ corpus và kiểm chuỗi sự kiện qua adapter `cirnet_sim/backends.py`. Mở rộng theo hành vi của `engine.py`, `nets.py`, `logic.py`, `dispatch.py` và model đang được công bố. Giữ preview và các fixture DC tĩnh đã hỗ trợ (nguồn, điện trở, LED và 74HC08 có nguồn cấp). Giữ analog/SPICE/mixed ở trạng thái không khả dụng. So timestamp, thứ tự sự kiện đồng thời và giá trị 0/1/X, byte NCAP và lỗi. Chạy test Simulator và pytest gọi trực tiếp binary, ASan/UBSan trên target hỗ trợ.
- [x] **Đóng gói và giám sát.** Dùng IPC cục bộ có frame giới hạn, handshake version và ID yêu cầu/thế hệ. Artifact Simulator xuất binary và mô tả giao thức riêng. Adapter Hardware `station/virtual.py` cho Run và adapter preview ở Remote dùng cùng lõi, ngân sách và pool riêng. Có deadline từ host, giới hạn queue/CPU/RAM, hủy, reap tiến trình và fence kết quả trả muộn. Kiểm timeout, frame lỗi, worker treo/chết, Stop/reset và chạy lại. REST, RPC 2.0 và NCAP giữ nguyên.
- [x] **Ma trận và gate 1.** A = Interface hiện tại / Remote Python / Hardware Python / Simulator Python. B = cùng tổ hợp với worker C++ được bật ở cả Run và preview, Contracts Python 0.1.2 giữ nguyên. Chạy fixture, `tests/integration/test_virtual_lab_execution.py`, `test_capture_rpc_data_plane.py`, `test_simulation_backend_selection.py` và `services/api/tests/test_physical_preview.py` trên artifact. So số đo theo giai đoạn 0. Chỉ chọn B khi đạt tương đương và cải thiện đo được. Rollback về A sau hủy, reap và fence thế hệ. Không tự chạy lại job dở.

### Lát cắt C++ 74HC08 ngày 2026-11-06

Simulator thêm worker C++20, cấu hình CMake và adapter Python chuyển tiếp
tường minh. SHA-256 worker Release Windows x64 là
`02375db7996c46e97858a247937c49caf6a3c8f10480434ea28d89ae5bda323d`.
SHA-256 wheel chuyển tiếp cục bộ là
`c2265f648cf33425f246ed7b3c5265f81dfe9d6b5ccb73b3d2f65fb6b07ad8c2`.
Wheel thêm `cpp_backend.py` trên revision Simulator đã ghim. Ca tích hợp
xác thực provenance của wheel đã cài và kiểm các mô-đun runtime cũ cùng
shim legacy khớp từng byte.
Gói kiểm tra cục bộ `cirnet-stage-1-cpp-slice-windows-x64.zip` có SHA-256
`6845cf3e2d8e7230b6e9decadcc7dd13dbe214dec4266241de5eddc5ef8c9806`.

Worker dùng frame riêng `CNP1` qua standard input/output, có ID yêu cầu
và generation, giới hạn frame, event và bản ghi capture. Run và preview
dùng cùng vòng lặp sự kiện C++ với slot và deadline riêng. Provider này
xử lý đồ thị số lý tưởng. Bộ tham chiếu cung cấp các ranh giới REST, RPC 2.0
và NCAP hiện có.

| Cấu hình và kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| A với artifact 0.1.4 đã chọn | PASS | Bộ đối chứng và ngưỡng đã khóa ở gate 0. |
| Worker C++ cục bộ và adapter chuyển tiếp | PASS | 150 ca trên ứng viên đã cài, gồm 17 ca worker trực tiếp, cùng 13 ca adapter được chọn tường minh. Bao phủ thứ tự 0/1/X, timeout, hủy, tiến trình con chết, định danh phản hồi muộn và chuẩn hóa số nguyên JSON. |
| Remote Python → Hardware Python → worker C++ cho 74HC08 | PASS | REST và gRPC thật với dịch vụ riêng và wrapper Simulator sinh tiến trình. Registry dành cho test chọn C++. Hai route preview khớp A và Run trả cùng 124 byte NCAP. |
| Toàn bộ gate 1 | NOT RUN | Còn đối chiếu DC có cấp nguồn và các hành vi khác, Stop/reset từ Hardware và thu hồi tiến trình, giới hạn CPU/RAM cấp hệ điều hành, sanitizer và gate hiệu năng đầy đủ. |
| RTL và HIL | NOT RUN | Lát cắt này chạy mô phỏng số ảo. |

Để chạy lại lát cắt, cài bộ 0.1.4 vào venv thử riêng thuộc session và áp dụng
biến môi trường phát hành. Giữ `CIRNET_NATIVE_RELEASE_STATE` và cài lại wheel
ứng viên bằng `pip install --no-index --no-deps --force-reinstall`. Đặt
`CIRNET_CPP_STAGE1_WORKER` và `CIRNET_CPP_STAGE1_SIMULATOR_WHEEL` thành
đường dẫn tuyệt đối sau khi giải nén. Đặt các biến `_SHA256` tương ứng
theo manifest ứng viên.

```powershell
python -B -m pytest -q tests/integration/native_cpp_slice_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-slice"
```

Phép đo chẩn đoán tuần tự thu 100 quan sát cho từng workload và backend.
Span C++ gồm khởi chạy worker, kiểm digest, IPC và giải mã. Phép so tải
chính thức vẫn thuộc gate tích hợp.

| Workload | Python p50 / p95 / p99 ms | C++ p50 / p95 / p99 ms |
| --- | ---: | ---: |
| 74HC08 AND | 0,389 / 0,600 / 0,732 | 19,387 / 38,619 / 44,814 |
| Clock 100 MHz | 11,698 / 13,460 / 23,633 | 23,274 / 32,273 / 44,079 |

Đường chạy một tiến trình cho mỗi job chậm hơn bộ tham chiếu ở cả hai
phép đo. Giai đoạn 1 còn cần giảm chi phí khởi chạy worker và IPC trong khi
giữ giới hạn preview riêng, hủy và chặn kết quả generation cũ. Rollback
cấu hình cục bộ này bằng cách tắt dịch vụ thử thuộc session và chọn lại
artifact 0.1.4 đã lưu cùng `legacy`.

### Ứng viên CNP1/CNP2 dùng worker thường trú

Remote và Hardware chọn backend C++ qua cấu hình dịch vụ. Run và preview
dùng chung vòng lặp sự kiện với hai pool độc lập. Worker phục vụ nhiều
yêu cầu, kiểm tra giới hạn frame/sự kiện/mẫu và có giới hạn bộ nhớ cấp hệ
điều hành. Hardware chờ hủy và thu hồi worker trước khi xác nhận Stop
hoặc reset an toàn. Generation cũ không thể cập nhật capture của phiên
thay thế. CNP2 bổ sung cổng có cấp nguồn, mức chân cuối và mô hình LED DC
nối tiếp. Contracts Python 0.1.2 tiếp tục mã hóa NCAP trong cấu hình B.

| Kiểm tra | Kết quả | Phạm vi |
| --- | --- | --- |
| Worker Windows x64 Release, AddressSanitizer và UBSan | PASS | 41 ca mỗi build, gồm frame sai, nhiều frame, DC và tải sát giới hạn giao thức. |
| Adapter trên wheel đã cài và worker CNP2 cuối | PASS | 30 ca tập trung, gồm AND/OR/XOR/NOT, bốn cổng HC08 có nguồn, DC, giới hạn sự kiện và quay lại legacy. |
| Vòng đời Hardware qua gRPC với worker thật | PASS | 5 ca trên ứng viên cuối, gồm Stop khi đầy slot, reset, crash, timeout và phản hồi bị giữ. Kiểm tra thu hồi PID và byte NCAP của lượt chạy lại. |
| Remote → Hardware → C++ qua cấu hình dịch vụ | PASS | Hai ca trên worker cuối và wheel chuyển tiếp đã chọn. Cả hai đường preview và byte NCAP của AND, clock và mạch HC08 có nguồn khớp bản Python. |
| RTL và HIL | NOT RUN | Kiểm chứng ứng viên này dùng mô phỏng ảo. |

Worker Windows x64 CNP2 cuối có SHA-256
`c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf`.
Hai wheel chuyển tiếp Simulator và Hardware lần lượt có SHA-256
`f8cdada13405dc0f06d4034309df366ca42f8b55ba6fa895c17cd22b69451090` và
`03e08365f3888682e6eefc547b46c58c6f7700578de62c1d9afbb6d886696c63`.

Ở ba lượt chẩn đoán ghép cặp, mỗi lượt 100 mẫu cho mỗi tải và backend,
worker thường trú CNP1 giảm p95 của clock 100 MHz từ 16,545–18,022 ms xuống
3,833–4,487 ms. p95 của AND tăng từ 0,286–0,413 ms lên 0,353–0,476 ms.
Các số này đo qua facade Simulator. Đánh giá Gate 1 còn cần số đo qua
dịch vụ trên SQLite/PostgreSQL và Stop khi đủ tải theo profile đã chốt.

Ba cặp SQLite đã hoàn thành 200 job cho mỗi backend trong mỗi lượt.
Ứng viên đạt ngưỡng CPU, RAM đỉnh và thông lượng. Có bảy phép kiểm độ
trễ vượt giới hạn, nên gate tải SQLite là **FAIL**.

| Trung vị của ba lượt | Tham chiếu A | Ứng viên B | Ngưỡng giai đoạn 0 |
| --- | ---: | ---: | ---: |
| CPU giây/job | 0,232 | 0,213 | ≤ 0,565 |
| RAM đỉnh, MiB | 608,94 | 281,62 | ≤ 668,25 |
| Job/giây | 3,262 | 3,418 | ≥ 1,625 |
| p95 tạo thí nghiệm AND, ms | 145,423 | 405,322 | ≤ 332,187 |
| p99 tải bản ghi clock, ms | 72,951 | 497,010 | ≤ 236,623 |
| p95 đọc lịch sử, ms | 115,875 | 751,402 | ≤ 364,995 |

Bản tham chiếu chạy lại cũng vượt ngưỡng p99 tạo thí nghiệm clock. Nhật
ký API cho thấy một phần độ trễ nằm trong thời gian ứng dụng xử lý
yêu cầu. Cần phép đo theo pha để phân biệt chờ database với nguyên nhân
khác.

Trong cặp SQLite có gắn probe với 96 job mỗi backend, hai lượt tải
capture chậm nhất của B chờ khóa repository Remote 435,8 trong 455,5 ms
và 430,0 trong 440,9 ms. A cũng gặp cùng kiểu chờ, trong đó lượt chậm
nhất chờ 901,2 trong 908,6 ms. Bốn lượt đọc lịch sử chậm nhất của B
mất 1.025–1.034 ms, với 4–7 ms chờ khóa đã ghi. Phép đo khóa giải thích
các lượt tải capture chậm. Phần lớn độ trễ của lượt đọc lịch sử vẫn
chưa được quy về một pha. p95 qua facade Simulator trong cặp này là
0,569 → 0,728 ms cho AND và 15,353 → 16,421 ms cho clock. p95 của riêng
lượt trao đổi với worker C++ lần lượt là 0,239 ms và 1,219 ms.

Lượt thử Stop trên tải SQLite đã chốt có 0 trong 4 mẫu đạt điều kiện.
Khoảng từ gửi yêu cầu đến nhận phản hồi native là 8,240–37,735 ms.
Bốn đợt đo lần lượt có tối đa 1, 2, 2 và 2 worker hoạt động đồng thời.
Cả 11 Stop RPC ghép được với yêu cầu người dùng đều đến sau khi worker
đích trả kết quả. Có 20 lượt giải phóng lease bền vững, không có cách ly
hay lease tồn dư. Gate độ trễ Stop dưới tải còn mở. Các ca gRPC riêng đã
kiểm việc hủy khi worker thật còn đang xử lý.

Lượt thử bổ sung `saturated-v1` dùng chung mạch nặng hơn và đồng bộ
trước khi gửi việc mô phỏng. Khoảng đo hoạt động C++ bắt đầu khi yêu
cầu IPC đã được gửi và kết thúc khi đọc phản hồi hoặc hủy yêu cầu.
Khoảng này nằm sau điểm đồng bộ. Cả hai backend đều có bốn mẫu đủ điều kiện. Trung vị
đến giải phóng lease là 4.103 ms cho A và 82 ms cho B. Các worker C++
bị hủy đều thoát trước lúc giải phóng lease, còn các Run cùng đợt trả
đúng cùng byte NCAP với 7.001 mẫu. Lượt thử xác nhận tải đủ điều kiện
trên cả hai backend. Gate p95/p99 cần đủ bộ mẫu.

Cặp chẩn đoán PostgreSQL 18.6 cũng hoàn thành 96 job mỗi backend.
p95 qua facade Simulator là 0,513 → 0,971 ms cho AND và
14,120 → 6,348 ms cho clock. Thông lượng dịch vụ trong cặp này là
4,322 → 3,582 job/giây. Ứng viên này chưa có lượt nghiệm thu PostgreSQL
đủ ba cặp và vi phạm các ngưỡng SQLite. Kết quả của các ứng viên kế tiếp
được ghi bên dưới. Profile phát hành chọn `legacy`.

Để tái hiện cục bộ, giữ venv tham chiếu và môi trường phát hành của
nó. Cài hai wheel chuyển tiếp đã chọn vào một bản sao riêng. Đặt
`CIRNET_NATIVE_RELEASE_STATE` trỏ đến trạng thái phát hành gốc và
`CIRNET_NATIVE_STAGE1_CANDIDATE` trỏ đến manifest ứng viên. Dùng đường dẫn
artifact tuyệt đối trong manifest sau khi giải nén.

```powershell
python -B -m pytest -q tests/integration/native_cpp_pool_cases.py -k "configured_cpp or paired_worker" --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-pool"
python -B -m pytest -q tests/integration/native_cpp_pool_cases.py -k paired_service_profile --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-load"
```

Profile dịch vụ mặc định chạy ba cặp với 200 job mỗi backend. Ca
PostgreSQL cần cluster loopback riêng. Đặt `CIRNET_NATIVE_PROFILE_PHASES=1`
để thêm probe chẩn đoán và ghi báo cáo riêng. Với profile không gắn
probe, đặt `CIRNET_NATIVE_STAGE0_REFERENCE` trỏ đến ZIP giai đoạn 0 để
xác minh workload và báo lỗi nếu vượt ngưỡng dịch vụ đã chốt.

Để quay về A, ngừng tiếp nhận Run, chờ ACK an toàn và thu hồi worker,
rồi khởi động các dịch vụ với bộ artifact 0.1.4 đã ghim và backend
`legacy`. Bỏ `CIRNET_SQLITE_ROLLBACK_JOURNAL` khỏi môi trường tham chiếu.
Dữ liệu đồ thị và NCAP đã lưu dùng định dạng hiện hành. Tác vụ bị gián
đoạn cần yêu cầu Run mới.

### Ứng viên sau khi xử lý độ trễ

Phép đo phân pha SQLite so ba chế độ rollback journal trên ứng viên
đầu tiên, mỗi chế độ 96 job. p99 tải capture clock lần lượt là 765,587 ms
với DELETE, 419,439 ms với TRUNCATE và 145,015 ms với PERSIST. p99 commit
lần lượt là 11,763, 11,708 và 14,828 ms. Thông lượng là 3,279, 3,711 và
2,333 job/giây. Từ ba lượt chẩn đoán này, ứng viên kế tiếp tiếp tục dùng
rollback journal hiện hành.

Remote trả trang lịch sử và trang đang hoạt động rỗng ngay sau khi đọc
repository theo chủ sở hữu. Trang có dữ liệu lấy khóa scheduler để đọc
vị trí hàng đợi. Simulator dùng định dạng plan 3 để đóng gói trước dữ liệu
wire tĩnh và tái sử dụng kết quả xác thực cấu hình chính xác với cache có
giới hạn. Phần đóng gói clock và đọc một probe giữ thứ tự sự kiện và kiểm
tra dữ liệu. Hai wheel đã cài mỗi wheel đổi đúng một tệp runtime so với
wheel API và Simulator trước đó. SHA-256 của Remote là
`6131adcfd6821d12e304707403c8fa4cd9856e9015e137198d368956db667506`.
SHA-256 của Simulator là
`d77359ee16a74ceab2035fff7474663aed296b4cab2a6f96a737d01df6dc512d`.
Ứng viên dùng cùng digest của Hardware và worker CNP2 đã ghi ở trên.

Facade tối ưu cho kết quả capture khớp trong ba lượt luân phiên với
100 mẫu mỗi backend và workload. Trung vị p95 giảm từ 0,344 xuống
0,173 ms cho AND và từ 24,670 xuống 4,530 ms cho clock. Các số đo này
gồm adapter và IPC. Profile dịch vụ đo riêng độ trễ API và database.

Lượt SQLite đầy đủ chạy xong cặp 200 job đầu tiên. Ở warmup ứng viên
cặp thứ hai, một Run đến `CAPTURING` rồi báo `DRIVER_ERROR` trước khi
lưu capture. Hardware xác nhận dọn dẹp an toàn và lease được giải
phóng. Lượt đo chưa đủ ba cặp để chấm gate. Lượt riêng có probe xác minh
120 capture clock qua ba lần khởi động lại với bốn Run đồng thời.
Lượt chẩn đoán đúng cấu hình 50 chủ sở hữu xác minh bốn capture
warmup và 200 capture đo. Hai lượt này chưa tái hiện được lỗi nên
nguyên nhân vẫn còn mở.

Lượt chẩn đoán PERSIST thứ hai trên cùng wheel r2 xác minh 200 job
và bốn capture warmup. Lượt này đạt 4,774 job/giây và nằm trong tất cả
ngưỡng độ trễ thao tác đã khóa. Wheel Remote kế tiếp dùng một snapshot
lease mới cho danh sách trạm. Wheel cũng hỗ trợ chọn PERSIST với
`synchronous=FULL` trên SQLite lưu trên đĩa. Ứng viên r3 chọn tùy chọn
này cho SQLite, còn bản tham chiếu dùng cấu hình kết nối gốc. Workload
và ngưỡng đều lấy từ gói giai đoạn 0. SHA-256 của wheel Remote r3 là
`17257f6a99faef0a5dc82044f97eb2728869d61bea7830da02112e99ee0c5329`.
Bộ API trên wheel đã cài đạt 45 ca, gồm commit, rollback, backup và mở
lại với cấu hình kết nối SQLite mặc định.

Gate tải SQLite của r3 đạt cả 29 ngưỡng đã khóa. Ba cặp hoàn thành
200 job đo mỗi backend trong mỗi cặp, xác minh byte NCAP và không
gặp lỗi capture. Trung vị thông lượng HTTP cố định tăng từ 17,575
lên 23,047 yêu cầu/giây. Job/giây tăng từ 3,515 lên 4,609,
CPU giây/job giảm từ 0,217 xuống 0,192 và RAM đỉnh giảm từ 607,65
xuống 294,58 MiB. Trung vị p95 Run tải clock giảm từ 575,7 xuống
414,2 ms. Gate PostgreSQL và Stop đủ mẫu được đánh giá riêng.

Gate tải PostgreSQL 18.6 của r3 cũng đạt cả 29 ngưỡng đã khóa qua
ba cặp 200 job mỗi backend. Trung vị job/giây là 4,889 → 4,854,
CPU giây/job là 0,200 → 0,199 và RAM đỉnh giảm từ 616,15 xuống
287,19 MiB. Cluster thử riêng dùng binary PostgreSQL đã chọn ở giai đoạn 0.

### Cấu hình số worker Run

SHA-256 của wheel Simulator r4 là
`e0f8db8f2830e6ea321c2ec4ade46793946fe5675c1cb6222aa53dd50932fdaa`.
So với r3, wheel chỉ đổi tệp runtime `cirnet_sim/cpp_backend.py`.
Pool Run C++ lấy số worker từ `CIRNET_SIMULATION_WORKERS`.
Preview có hạn mức riêng. Hai profile dịch vụ đã chốt đều dùng bốn
worker Run, cũng là số worker của pool r3. Các số đo bên trên ghi theo
đúng bộ artifact r3 đã dùng.

Adapter r4 đã cài đạt 87 ca kiểm tra tập trung. Năm Run đồng thời chạy
trên năm tiến trình worker riêng, trả cùng byte NCAP với 7.001 mẫu và
thu hồi đủ năm tiến trình. Năm ca vòng đời Hardware qua loopback và
hai ca đối chiếu REST/gRPC cho mạch số và mạch DC có cấp nguồn cũng
đạt trên r4. Hai wheel Hardware, Remote và worker CNP2 của r4 giữ
nguyên byte so với r3.
Bốn bộ kiểm thử tích hợp theo kế hoạch đạt 27 ca trên wheel đã cài.
Các ca này bao phủ Run và preview C++, NCAP 100.000 mẫu qua gRPC và
tương thích với backend legacy hoặc backend không khả dụng.

Để tái hiện r4, áp dụng môi trường phát hành đã lưu vào bản sao venv
tham chiếu riêng. Cài ba wheel chuyển tiếp Simulator, Hardware và
Remote vào đó. Đặt đường dẫn tuyệt đối tới worker và các wheel đã
giải nén trong manifest ứng viên. Dành venv gốc cho A.

Chạy gate Stop bổ sung với `CIRNET_NATIVE_STOP_PROFILE=saturated-v1`,
`CIRNET_NATIVE_STOP_GATE=1` và `CIRNET_NATIVE_STOP_SAMPLES=100`.
Bài kiểm tra đối chiếu ngưỡng giai đoạn 0 qua
`CIRNET_NATIVE_STAGE0_REFERENCE`. Với mỗi cặp, chạy
`tests/integration/native_stop_baseline_cases.py::test_loaded_stop_baseline`
trước bằng trình Python tham chiếu gốc và backend `legacy`.
Sau đó chạy bằng trình Python của ứng viên và backend `cpp`, đặt
`CIRNET_NATIVE_STOP_REFERENCE_RECEIPT` trỏ đến kết quả tham chiếu
cùng cặp. Mẫu đạt điều kiện khi cùng bốn worker hoạt động ở cả lúc gửi
HTTP Stop và lúc Hardware nhận gRPC. Giữ kết quả riêng của cả ba cặp.

Lượt tham chiếu đầy đủ đầu tiên sau khi sửa harness thu được 100 mẫu
Stop đạt điều kiện và không loại mẫu nào. Trung vị và p95 đến khi lease
được giải phóng lần lượt là 4.282,508 và 4.616,636 ms trên tải bổ sung.
Lượt r4 cùng cặp dừng khi làm nóng, trước lúc client gửi Stop. Cả bốn
worker native đều trả kết quả. Một Run vào `CAPTURING` rồi báo
`DRIVER_ERROR` trước khi lưu NCAP. Hardware xác nhận dọn dẹp an toàn và
lease được giải phóng. Ba payload NCAP còn lại khớp từng byte. Lỗi xảy ra
ở cùng bước capture như lượt làm nóng r2. Kết quả ban đầu chưa ghi
ngoại lệ gốc. Lượt r4 đầy đủ thứ hai tái hiện lỗi làm nóng khi bật probe.
`FilesystemCaptureStore._path` từ chối tên capture hợp lệ trên Windows.
Một lượt ghi tạo thư mục giữa hai lần phân giải đường dẫn của lượt ghi
khác. Python gặp mã Win32 3 rồi mã 2 và trả cách viết đường dẫn mở rộng
của cùng thư mục cha. Đã tái hiện đúng lỗi trên wheel r4 đã cài. Bản sửa
phân giải đường dẫn trong khóa thư mục hiện có trước `mkdir` và tiếp tục
kiểm tra thư mục cha sau phân giải. Ca hồi quy lỗi trước khi sửa. Ba bộ
kiểm thử lưu capture, quota và cách ly điều khiển đạt 43 ca sau khi sửa.

Wheel Remote r5 có đúng thay đổi runtime này. SHA-256 là
`401bd7ff62c278b0491d09fc11aecf9a10c67df747008a380d7d910092a7ecd9`.
Wheel đã cài cũng đạt 43 ca trên. Export mất 0,29 giây, build wheel
Remote 5,45 giây, sao chép môi trường và cài wheel 100,90 giây. Các
artifact còn lại được xác minh rồi dùng lại. Hai lượt Stop tham chiếu
độc lập tương thích có thể dùng cho phía A của r5. Tổng thời gian pytest
của hai lượt là 1.628,96 giây. Mọi phép đo ứng viên dùng wheel Remote r5.

### Thời gian kiểm thử và tái sử dụng kết quả giai đoạn 1

Chạy kiểm thử tương thích trên artifact đã cài trong luồng phát triển.
Tách luồng này khỏi gate tải và Stop có đối chứng. Chạy các bộ test song
song khi có runner riêng và dành một runner rảnh cho mỗi phép đo A/B.
Giữ venv tham chiếu và ứng viên trong suốt lượt đối chiếu. Tái sử dụng
worker CNP2, wheel Hardware và wheel Remote giữ nguyên sau khi xác minh
hash và phụ thuộc đã ghim. Dùng bộ test riêng trên wheel đã cài làm kết
quả duy nhất cho wheel Remote giữ nguyên.

Smoke tương thích mặc định chạy fixture mạch số và DC có cấp nguồn trên
cùng wheel đã cài, mỗi backend chỉ khởi động API–Hardware một lần.
Mỗi Run và preview dùng phiên khách mới. Smoke vẫn kiểm năm capture mỗi
backend, hai tuyến preview cho mỗi fixture, worker Run và preview riêng,
và thu hồi tiến trình. Đặt `CIRNET_NATIVE_SMOKE_PROFILE=digital` hoặc
`physical` để chẩn đoán khởi động nguội riêng. Trên cùng bộ artifact r4,
thời gian pytest giảm từ 177,60 xuống 84,27 giây (53%), với cùng năm
capture mỗi backend. Lượt gộp ghi 11,40 giây để xác minh artifact và
chuẩn bị, 62,53 giây để khởi động dịch vụ, 8,06 giây cho thao tác và
kiểm tra smoke, và 1,62 giây để dọn dẹp. Lượt này dùng lại build đã có.
Độ dài các capture là 124, 44.109, 124, 142 và 142 byte. Mỗi payload
được đối chiếu với SHA-256 dự kiến.

Để chẩn đoán Stop ngắn, đặt `CIRNET_NATIVE_STOP_GATE=0` và
`CIRNET_NATIVE_STOP_SAMPLES=12`. Dùng `CIRNET_NATIVE_CAPTURE_FAULT_DIAGNOSTIC=1`
để ghi dấu vết ngoại lệ đã lọc. Năm lần khởi động r4 cho 60 mẫu chẩn đoán
hợp lệ. Giữ các kết quả này riêng khỏi gate.

Chỉ dùng lại kết quả khi khớp commit và danh sách tệp nguồn, hash
artifact và phụ thuộc, harness, workload, cấu hình, toolchain và môi
trường máy. Giữ số đo tải r3 cùng digest Simulator r3. Cấu hình bốn
slot cho thấy số đo liên quan thế nào đến r4. Gate dịch vụ cuối của r4
cần kết quả đo trên r4. Khi lượt ứng viên dừng giữa chừng, có thể dùng
lại lượt tham chiếu Stop đầy đủ cùng cấu hình. Đặt đường dẫn tuyệt đối
của kết quả đó trong `CIRNET_NATIVE_STOP_REFERENCE_RECEIPT`. Kiểm thử
ứng viên đối chiếu mã harness, launcher, client và probe chẩn đoán,
workload, đồng hồ và cấu hình trước khi chạy. Chỉ tính mỗi cặp A/B đầy
đủ một lần. Ghi riêng lượt lỗi và lượt chẩn đoán ngắn khỏi ba cặp đủ mẫu.

Trên runner Windows này, khôi phục bản tham chiếu mất khoảng 234 giây,
chuẩn bị công cụ thêm khoảng 46 giây. Mỗi wheel thay đổi ở r3 và r4 mất
khoảng 3 giây để build. Hai profile tải SQLite và PostgreSQL của r3 mất
khoảng 1.172 giây, trong đó 548 giây nằm trong cửa sổ đo. Chuẩn bị cơ
sở dữ liệu và khởi động hai dịch vụ mất khoảng 399 giây. Khoảng 225
giây còn lại gồm kiểm tra sẵn sàng, chuẩn bị client, làm nóng và dọn dẹp.
Các mốc trên được ước lượng từ dấu thời gian đã lưu. Kết quả mới tách
chuẩn bị cơ sở dữ liệu, khởi động, chuẩn bị client, làm nóng, workload
đo và dọn dẹp bằng đồng hồ đơn điệu. Artifact được build trước lượt chạy.

Cặp Stop r4 đầu tiên dùng cùng probe ở hai phía đã đạt cả sáu ngưỡng đã
khóa. Mỗi phía thu đủ 100 mẫu hợp lệ. A loại một đợt và B loại 14 đợt
khi kiểm tra điều kiện tải. p50/p95/p99 đến khi giải phóng lease là
4.312,387 / 5.209,127 / 5.824,744 ms ở A và 93,802 / 129,613 / 135,933 ms
ở B. Đây là kết quả của một cặp trong ba cặp gate Stop yêu cầu. Cặp này
mất khoảng 911 giây tính từ hai lần khởi động Hardware đến khi chốt kết
quả. Giữ cặp đã xác minh khi cần khởi động lại một cặp sau bị gián đoạn.

Gate Stop dưới tải của r5 **PASS** trên cả ba cặp độc lập, với 100 mẫu
mỗi backend trong mỗi cặp. Gate dùng lại hai kết quả A khớp cấu hình và
đo ba lượt B mới. Một đợt A và 21 đợt B bị loại theo điều kiện tải. Mọi
mẫu hợp lệ đều đạt các kiểm tra ACK an toàn, thu hồi worker, capture và
lease. Không còn lease sau dọn dẹp. Bảng ghi trung vị qua ba lượt cho
từng phân vị.

| Độ trễ Stop | A p50 / p95 / p99 ms | r5 p50 / p95 / p99 ms |
| --- | ---: | ---: |
| HTTP Stop | 54,715 / 128,714 / 336,275 | 65,137 / 86,017 / 137,575 |
| ACK gRPC | 38,254 / 117,519 / 313,666 | 45,041 / 66,614 / 83,415 |
| Giải phóng lease bền vững | 4.362,157 / 7.854,343 / 8.050,876 | 85,692 / 122,815 / 184,875 |

Bốn bộ kiểm thử tích hợp theo kế hoạch đạt 27 ca trên các wheel r5 đã
cài. Hai phép đo tải SQLite và PostgreSQL có kết quả riêng.
Lượt SQLite r5 đầu tiên có đủ 1.200 job đo với capture khớp, nhưng gate
**FAIL** với 27 trên 29 kiểm tra. p95/p99 của danh sách dự án là
223,000/264,910 ms so với ngưỡng 200,994/245,163 ms. Bản tham chiếu giữ
nguyên đạt 290,020/305,144 ms trong cùng lượt, so với 67,8/88,6 ms trong
phép đo r3 trước đó. Có tiến trình khác dùng CPU trong lượt đầu. Giữ kết
quả lỗi và đo lại với cùng workload và ngưỡng khi runner rảnh.

Lượt SQLite r5 đầu tiên mất 995,62 giây. Kết quả ghi 31,72 giây chuẩn bị
và xác minh, 225,75 giây khởi động dịch vụ, 197,57 giây chuẩn bị client,
18,43 giây làm nóng, 514,86 giây chạy workload đo và 6,99 giây dọn dẹp.
Thời gian build wheel được đo riêng.

Lượt SQLite r5 chạy lại **PASS** cả 29 ngưỡng và đủ 1.200 job đo với
NCAP khớp byte. p95/p99 của danh sách dự án là 71,435/117,923 ms. Trung
vị job/giây là 1,889 ở A và 4,309 ở r5. Trung vị RAM đỉnh lần lượt là
606,90 và 292,31 MiB. Lượt này mất 896,21 giây, gồm 211,26 giây khởi
động dịch vụ, 160,75 giây chuẩn bị client, 17,32 giây làm nóng, 476,27
giây chạy workload đo và 6,89 giây dọn dẹp. Kết quả và các ngưỡng vi
phạm của lượt đầu được giữ riêng.

Gate tải PostgreSQL 18.6 của r5 **FAIL** với 22 trên 29 ngưỡng sau khi
đủ ba cặp và 1.200 job có NCAP khớp byte. Trung vị thông lượng là
1,818 → 1,970 job/giây và RAM đỉnh là 612,07 → 289,61 MiB. Cùng bản
tham chiếu đạt 4,889 job/giây trong phép đo PostgreSQL r3. Trong lượt
này có ứng dụng khác dùng CPU. Dữ liệu hiện có chưa tách được nguyên
nhân của toàn bộ phần chậm đi.

| Kiểm tra PostgreSQL | A ms | r5 ms | Ngưỡng ms |
| --- | ---: | ---: | ---: |
| Capture AND p95 / p99 | 93,504 / 131,866 | 129,545 / 154,760 | 92,557 / 153,366 |
| Poll AND p95 / p99 | 195,070 / 341,884 | 263,268 / 538,285 | 194,792 / 386,104 |
| Run clock p99 | 1.515,386 | 1.379,434 | 1.339,881 |
| Danh sách dự án p95 / p99 | 289,003 / 304,442 | 303,022 / 332,575 | 302,778 / 330,987 |

Profile PostgreSQL mất 1.109,17 giây. Workload đo chiếm 614,72 giây.
Chuẩn bị cơ sở dữ liệu và cửa sổ, khởi động dịch vụ, chuẩn bị client,
làm nóng và dọn dẹp lần lượt mất 2,67, 222,99, 212,06, 21,55 và 8,95
giây. Phần còn lại dành cho xác minh và ghi kết quả. Cluster thử nghiệm
đã dừng. Kết quả này áp dụng cho đúng bộ artifact r5. Profile phát hành
chọn `legacy`.

Lượt PostgreSQL đầy đủ thứ hai trên đúng byte r5 xác minh 1.200 capture
và đạt 20 trên 29 kiểm tra. Trung vị thông lượng là 1,736 → 1,747
job/giây, dưới ngưỡng 1,760. Thông lượng HTTP cố định và capture cũng
chưa đạt. Capture AND p95, tạo AND p99, poll AND p95/p99, tạo clock p95
và Run clock p95 vượt ngưỡng. Bản tham chiếu gần dải đã khóa của giai
đoạn 0 là 1,830–1,920 job/giây. Kết quả r3 nhanh hơn nhiều được ghi
riêng. Mẫu CPU trước lượt đo lại cho thấy tải nền thấp hơn, nên yếu tố
đó chưa giải thích được toàn bộ kết quả gate PostgreSQL.

Một cặp chẩn đoán chạy 40 job mỗi backend. Trong 5% lượt poll r5 chậm
nhất, trung vị thời gian phía ứng dụng là 283,70 ms, gồm 253,74 ms chờ
khóa scheduler và 1,94 ms thực thi SQL. Lượt chẩn đoán cũng ghi nhận
các lượt đọc capture và dự án chậm dành nhiều thời gian chờ khóa
repository. Các khoảng đo probe có thể chồng lên nhau. Lượt ngắn này
được ghi riêng khỏi phép chấm ngưỡng đã khóa.

R6 dùng snapshot đã commit và đã kiểm tra chủ sở hữu cho hai GET của
thí nghiệm ngoài hàng đợi. Với thí nghiệm đang xếp hàng, GET đọc lại
quyền và trạng thái dưới khóa scheduler để trả vị trí hiện tại. Run,
Stop, phát sự kiện và khôi phục thao tác tiếp tục dùng đường đọc có khóa.
Ca mới kiểm tra đọc ngoài khóa, từ chối sai chủ sở hữu và trạng thái đổi
khi thí nghiệm được điều phối trước lần đọc lại. Các bộ kiểm thử tập
trung vào scheduler, API và quyền truy cập đạt 65 ca. SHA-256 của wheel
Remote mới là
`7a050978ca43083dfd3e119f475d0a8d939b9c22341e372b588f2408ad955a96`.
Các artifact sản phẩm còn lại khớp byte r5. Profile PostgreSQL đầy đủ
của r6 đạt 16 trên 29 ngưỡng. p95/p99 của AND poll giảm xuống
105,335/166,265 ms, nhưng hai cửa sổ ứng viên đầu xử lý 4.401 và 4.471
request HTTP cho 200 job. Poll trả nhanh hơn nên cùng nhịp phía client
gửi được nhiều request hơn khi Run đang hoạt động. Trung vị thông lượng
giảm còn 1,449 job/giây và CPU tăng lên 0,592 giây/job. Cả 1.200
capture đều khớp.

R7 giữ cách đọc poll và dùng một câu SQL để lấy dữ liệu phiên và người
dùng mỗi lần kiểm tra quyền. Hàng rào giao dịch và các lần kiểm tra hạn
phiên, thu hồi và revision sau hàng rào tiếp tục được áp dụng. Ca hồi
quy đếm truy vấn đạt trong bộ 121 ca API và quyền truy cập. Năm ca
PostgreSQL xác minh hàng rào phiên, xóa capture và nhận bài khi có hai
kết nối. SHA-256 của wheel Remote là
`d66ea041d27b3215be106c1bb18ca3efd90eb2e4d9904715fb1b0e264e1f30f0`.

Gate tải PostgreSQL 18.6 của r7 **PASS** cả 29 ngưỡng đã khóa qua ba cặp
200 job mỗi backend trên Windows x64. Cả 1.200 capture NCAP khớp từng byte.
Workload đo và nhịp gửi request của client giữ nguyên. Trung vị thông lượng
là 4,410 → 4,633 job/giây, CPU 0,235 → 0,216 giây/job và RSS đỉnh
615,75 → 300,98 MiB với A và r7.

| Chỉ số PostgreSQL từng vượt ngưỡng | r5 ms | r7 ms | Ngưỡng đã khóa ms |
| --- | ---: | ---: | ---: |
| Capture AND p95 / p99 | 129,545 / 154,760 | 62,202 / 78,271 | 92,557 / 153,366 |
| Poll AND p95 / p99 | 263,268 / 538,285 | 49,596 / 121,351 | 194,792 / 386,104 |
| Run clock p99 | 1.379,434 | 502,861 | 1.339,881 |
| Danh sách dự án p95 / p99 | 303,022 / 332,575 | 86,128 / 119,113 | 302,778 / 330,987 |

Profile PostgreSQL của r7 mất 814,08 giây pytest, so với 1.109,17 giây ở
lượt r5 đầu. R7 dùng lại các artifact build đã xác minh. Chuẩn bị profile
mất 41,66 giây. Qua sáu cửa sổ, chuẩn bị cơ sở dữ liệu và cửa sổ, khởi động
dịch vụ, chuẩn bị client, làm nóng, chạy workload đo, kết thúc đo và dọn dẹp
lần lượt mất 1,97, 242,07, 140,36, 14,87, 365,35, 0,17 và 6,86 giây.
Phần còn lại dành cho xác minh và ghi kết quả. Các cửa sổ A mất từ
40,45 đến 116,04 giây nên mức giảm tổng thời gian có phần do biến thiên
giữa các lượt đo. Cluster PostgreSQL thử nghiệm đã dừng.

Gate tải SQLite của r7 **FAIL**, đạt 28 trên 29 kiểm tra. Cả 1.200
capture NCAP khớp từng byte. Capture AND p95 là 85,662 ms với A và
98,726 ms với r7, so với ngưỡng 89,121 ms. Ba cửa sổ r7 đo được
111,156, 98,726 và 45,312 ms. Trung vị thông lượng là 2,051 → 2,061
job/giây, CPU 0,406 → 0,471 giây/job và RSS đỉnh 607,68 → 281,07 MiB.
Hai cửa sổ ứng viên đầu tạo 2.521 và 2.516 request poll, so với
1.226 và 1.156 ở hai cửa sổ đầu của lượt thử lại r5 với cùng nhịp client.

Lượt SQLite r7 mất 1.010,99 giây pytest. Chuẩn bị mất 31,94 giây.
Qua sáu cửa sổ, khởi động dịch vụ mất 217,66 giây, chuẩn bị client
205,31 giây, làm nóng 19,34 giây, chạy workload đo 528,33 giây,
kết thúc đo 0,23 giây và dọn dẹp 7,57 giây.

Lượt chẩn đoán riêng với 80 job mỗi backend ghi nhận 20% GET capture AND
chậm nhất của r7 dành trung vị 21,27 ms chờ khóa repository, 3,41 ms
đọc và xác minh tệp và 1,04 ms thực thi SQL. Thời gian chờ trải qua
các bước kiểm tra chủ sở hữu và phiên hiện có. Lượt ngắn chưa tái hiện
mức trễ của gate. Lượt gate kế tiếp giữ nguyên artifact và điều kiện,
đồng thời ghi CPU tiến trình nền trong các cửa sổ đối chứng.

Lượt SQLite lặp lại của r7 **PASS** cả 29 ngưỡng, với 1.200 capture
khớp từng byte. Capture AND p95 là 49,859 ms với A và 53,139 ms với
r7. Ba cửa sổ r7 đo được 42,237, 53,139 và 88,515 ms. Trung vị
thông lượng là 2,989 → 4,643 job/giây, CPU 0,233 → 0,194 giây/job
và RSS đỉnh 606,82 → 283,45 MiB. Tổng thời gian pytest là 809,96
giây. Chuẩn bị mất 32,20 giây. Khởi động dịch vụ, chuẩn bị client,
làm nóng, chạy workload đo, kết thúc đo và dọn dẹp lần lượt mất
237,71, 117,45, 13,36, 402,17, 0,19 và 6,18 giây. Cả hai lượt dùng
cùng build r7. Chênh lệch phản ánh biến thiên trên runner Windows và
biên nhận của cả hai lượt được lưu.

### Quyết định Gate 1 trên Windows x64

Gate Stop `saturated-v1` của r7 **PASS** cả sáu ngưỡng đã khóa trong
từng cặp của ba cặp độc lập. Mỗi bên có 100 mẫu hợp lệ mỗi cặp.
Harness kiểm digest bản phát hành, workload và probe trước khi dùng
lại ba biên nhận legacy. Mọi mẫu hợp lệ đạt yêu cầu safe ACK, dọn
worker, capture và lease bền vững. Không còn lease tồn dư. A loại một
wave và B loại 23 wave do chưa đủ tải. Ba cửa sổ ứng viên mất
384,30, 405,82 và 298,51 giây.

| Độ trễ Stop | Trung vị A p50 / p95 / p99 ms | Trung vị r7 p50 / p95 / p99 ms |
| --- | ---: | ---: |
| HTTP Stop | 54,715 / 128,714 / 336,275 | 79,088 / 114,662 / 138,435 |
| gRPC ACK | 38,254 / 117,519 / 313,666 | 50,958 / 77,013 / 88,645 |
| Giải phóng lease bền vững | 4.362,157 / 7.854,343 / 8.050,876 | 113,206 / 175,904 / 239,915 |

Mạch Stop gốc của giai đoạn 0 có biên bản xác nhận tải riêng. Lượt C++
đầu tiên với mạch đó không có mẫu đủ tải. Gate bổ sung dùng chung mạch
nặng hơn và cùng tiêu chí xác nhận tải cho hai bên, giữ cỡ mẫu và
ngưỡng tuyệt đối đã khóa. Cả 27 ca tích hợp theo kế hoạch đạt trên
wheel r7 đã cài. Bằng chứng kiểm trực tiếp, vòng đời và sanitizer
áp dụng cho Simulator, Hardware và worker có cùng byte. Hệ điều
hành giới hạn bộ nhớ và số tiến trình của worker. Hạn mức nhận việc,
số sự kiện và deadline từ host giới hạn công việc CPU.

Dùng tổ hợp r7 đã xác minh cho giai đoạn 2 với
`CIRNET_SIMULATION_BACKEND=cpp`, đường dẫn worker và SHA-256 đã ghim,
bốn worker Run và PERSIST/FULL trong cấu hình tải SQLite. SHA-256
của manifest cục bộ đã đo là
`e7e2ce0056b11eb6cbf42304cb35607b2263e464a57cddb9485e43d61ac0f50d`.
Rollback theo quy trình hủy, reap và fence thế hệ ở trên rồi cài
lại bộ tham chiếu 0.1.4. RTL, HIL và SPICE ở trạng thái `NOT RUN`
trong phạm vi gate mô phỏng ảo này trên Windows.

### Core SPICE tương lai dựa trên ngspice

**Đề xuất.** Giữ lõi số C++ và mô hình DC giới hạn của giai đoạn 1 để
bảo đảm tương thích. Phát triển backend SPICE riêng từ mã nguồn ngspice
thượng nguồn. Đánh giá thư viện C dùng chung bên trong worker C++ cách ly
để giữ ranh giới tiến trình và an toàn của Remote và Hardware. So sánh
callback và cơ chế ngắt hợp tác với tiến trình con chạy batch đã ghim trên
các mạch analog đầu tiên. Mỗi tiến trình con ban đầu chạy một mô phỏng.
Nếu hết deadline hoặc không ngắt được, phải kết thúc và thu hồi tiến
trình trước khi xác nhận dọn dẹp an toàn. [Thư viện dùng chung ngspice](https://ngspice.sourceforge.io/shared.html)

- [ ] **Chọn đầu vào có thể tái lập.** Bắt đầu thử nghiệm với bản thượng
  nguồn `ngspice-46`, build thư viện dùng chung không có giao diện đồ họa
  và bật XSPICE. Ghi SHA-256 của gói nguồn, toolchain, tùy chọn build,
  bản vá, ABI đích, hash thư viện và code model, cùng nguồn gốc, phiên
  bản và SHA-256 của từng model. Rà soát thông báo bản quyền và điều kiện
  phân phối của mã nguồn đã chọn và mọi thành phần đi kèm trước khi đóng
  gói. [Gói phát hành thượng nguồn](https://sourceforge.net/projects/ngspice/files/ng-spice-rework/old-releases/46/)
- [ ] **Chuyển đồ thị và thu capture.** Xác thực `CircuitGraph` trước.
  Gán tên net và linh kiện ổn định, ánh xạ linh kiện và thứ tự chân theo
  catalog model có phiên bản, rồi sinh netlist có giới hạn. Chỉ tra đường
  dẫn model trong thư mục đã ghim. Thu vector analog và sự kiện XSPICE
  qua callback có giới hạn. Chốt đơn vị, quy đổi thời gian, lượng tử hóa,
  thứ tự, biểu diễn khoảng trống và giá trị chưa biết trước khi xuất
  NCAP tương thích Contracts. [Tài liệu ngspice](https://ngspice.sourceforge.io/docs.html)
- [ ] **Đánh giá tương đương và xử lý lỗi.** Chạy mạch RC, diode/LED,
  cổng 74HC08, clock, fan-out, đầu vào mất nguồn, ngõ ra tranh chấp và
  cầu nối analog/digital. So với corpus C++ về thứ tự sự kiện, timestamp
  trùng nhau, độ trễ lan truyền và `0/1/X`. Định nghĩa ánh xạ logic và
  drive strength của XSPICE trước khi kiểm tra tương đương. Kiểm tra đồ
  thị/model sai, không hội tụ, vượt giới hạn, timeout, hủy, crash và
  phản hồi muộn qua Run và preview. [XSPICE trong ngspice](https://ngspice.sourceforge.io/xspice.html)

Gói nguồn `ngspice-46.tar.gz` đã tải khớp SHA-256 đã chọn
`a0d1699af1940b06649276dcd6ff5a566c8c0cad01b2f7b5e99dedbb4d64c19b`.
Kế hoạch backend của Simulator ghi hash nguồn đã xác minh cho ba model
XSPICE đầu tiên. Build SPICE, runtime, rà soát thành phần phân phối và
so sánh lõi số ở trạng thái **NOT RUN**. [Gói nguồn upstream](https://sourceforge.net/projects/ngspice/files/ng-spice-rework/old-releases/46/ngspice-46.tar.gz/download) · [Công thức build đã ghim](https://github.com/Homebrew/homebrew-core/blob/539f6abfdfdff8af39757bc100dfbce1db0c5618/Formula/lib/libngspice.rb#L3-L5)

Chỉ chọn phương án thay lõi số sau khi đạt tiêu chí tương
đương và hiệu năng. Chỉ công bố capability đã triển khai và kiểm thử
trong manifest phát hành. Tài liệu backend của Simulator ghi các bước
tích hợp chi tiết.

## 2. Contracts Rust

- [x] **Giữ nguồn chuẩn.** Repo Contracts giữ JSON Schema/manifest, `device-library/` và các bản chiếu catalog, `contracts/hardware/v2/rpc_v2.proto`, `contracts/capture/layout.json` và `ncap.schema.json`. Port `validation.py`, validator ngữ nghĩa, `capture_codec.py` và các generator trong `contracts/codegen/`. `contracts/api/openapi.json` là handoff đã duyệt từ exporter Remote. Sinh crate/kiểu Rust, SDK `@cirnet/contracts`, binding Python dùng trong pytest và giữ wheel Python cũ cho consumer chuyển tiếp. Runtime Rust và lệnh sinh SDK chạy trên máy không cài Python.
- [x] **Ma trận và gate 2.** Chạy B với wheel Python và npm hiện tại. Lặp lại với SDK từ Rust generator trên Interface và legacy wheel vẫn cài cho Remote/Hardware. Chạy cùng corpus qua legacy Python, Rust binary/binding và tarball npm đã đóng gói. Giữ descriptor field number và hai tên dịch vụ, phân biệt trường absent/default, lỗi, 0/1/X, thứ tự và byte chuẩn NCAP1/NCAP2. Kiểm JSON, timing/gap và các encoding INT16/UINT16/FLOAT32 của NCAP2. Dùng các check generator legacy, `scripts/check_public_compatibility.py`, kiểm runtime/types SDK và build sạch hai lần từ cùng commit/toolchain để so digest. Báo thời gian sinh mã, dung lượng gói và validation/codec throughput. Chỉ đổi nguồn sinh mặc định khi parity và tái lập PASS. Rollback trỏ lại cả bộ crate/SDK/wheel cũ đã xác nhận, giữ artifact trước đó.

### Xác minh ứng viên giai đoạn 2

Commit ứng viên Contracts `e640f80b1199779659d3db7817fee16d13cc24c1` được xây dựng từ
`f559ec5b21ea7ecf50db4dc5c5e1dc7c5eb5ad39`. Crate Rust cung cấp
validator ngoại tuyến, codec NCAP1 và NCAP2, kiểu và descriptor Hardware
RPC cùng bộ sinh SDK TypeScript. Binding kiểm thử đối chứng với wheel
Python 0.1.2 đã chọn. Remote và Hardware tiếp tục dùng wheel đó.

| Kiểm tra trên ứng viên đầu tiên đã khóa | Kết quả | Bằng chứng |
| --- | --- | --- |
| Rust trên Windows x64 | PASS | 41 ca, gồm sinh và đóng gói SDK trong thư mục ngoài repo. |
| Đối chứng wheel đã cài trên Windows x64 | PASS | 142 ca về kiểm tra dữ liệu, byte NCAP, thời gian, lỗi và descriptor RPC. |
| Bộ sinh mã cũ và tương thích công khai | PASS | Kiểm sinh mã Python, danh mục editor, topology breadboard và các mốc giao thức công khai. |
| SDK và Interface 0.1.4 | PASS | Gói SDK sinh bằng Rust khớp từng byte với gói npm đã khóa. Interface đạt 11 ca kiểm gói và 1.498 ca kiểm thử. Build tái tạo đủ 34 tệp phục vụ. Gói static phát hành có thêm manifest riêng. Có thể dùng lại bằng chứng tích hợp B của giai đoạn 1 cho đúng các byte chạy này. |
| Hai lượt build sạch Linux x64 không có Python | PASS | Rust 1.90.0 và Node 26.12.1 ngoại tuyến. Hai lượt tái tạo cùng digest cho binary, crate và npm. Lượt đầu xác minh crate đã đóng gói và đạt 34 ca runtime native. |
| Chẩn đoán dữ liệu vi phạm nhiều ràng buộc schema | FAIL | Một số tài liệu vi phạm nhiều ràng buộc có thể trả lỗi đầu tiên khác validator cũ. |

Hai lượt build sạch mất 33,06 và 32,54 giây trước bước sinh dữ liệu.
Sinh SDK mất 3,97 và 2,77 giây. Kiểm bộ sinh cũ mất 13,56 giây và
kiểm thêm phần sinh model Python. Binary, crate và gói SDK có kích
thước 7.045.320, 692.769 và 825.291 byte. Lưu riêng ca chẩn đoán
chưa đạt cùng các biên nhận của ứng viên đầu tiên.

R2 khôi phục thứ tự lỗi của bản cũ khi thuộc tính đã khai báo vi phạm
ràng buộc trước lỗi thiếu trường bắt buộc trực tiếp trong schema có tên.
Hai ca dữ liệu nhiều lỗi đã báo đều đạt trên profile structural và
transport. **Gate 2 PASS** với 42 ca Rust trên Windows, 146 ca đối
chứng wheel, 35 ca runtime native trong build Linux và cùng ma trận SDK
và Interface đã khóa. Hai lượt build sạch dùng cùng snapshot nguồn có
SHA-256 `d9d6de46c7cc4b46cf2fe0926ce962a5f2775a2bb8965a0e74e26f2a8447aca8`.
Cả hai tạo cùng ba artifact. Lượt đầu dựng lại crate đã đóng gói để
xác minh gói.

| Artifact r2 | Byte | SHA-256 |
| --- | ---: | --- |
| Binary Linux x64 | 7.064.152 | `a09a9341b0266b86cdc8b55b0cd4ebd56c42855d03dab27322bf5ad3ca3b5a44` |
| Crate Contracts | 693.535 | `35c22067f497d68f6461c201dc164e7567ee641fbce66cc243da8567f3b69ec7` |
| SDK npm | 825.291 | `b963cf4990fee8b5a9294a6aaf85cfd803ed7724efc9ad2b3ee1ec302646b3c8` |

Hai lượt build Release sạch mất 34,77 và 34,07 giây. Sinh dữ liệu SDK
mất 2,97 và 3,20 giây. Phép đo thông lượng trên Windows dùng ba cửa
sổ luân phiên trên cùng đầu vào và tính cả chi phí chuyển JSON qua
binding PyO3 dùng trong kiểm thử.

| Workload | Số mẫu mỗi cửa sổ | Python thao tác/giây | R2 thao tác/giây |
| --- | ---: | ---: | ---: |
| Validator trên 18 fixture | 3.000 | 4.623 | 97.352 |
| Mã hóa NCAP1 với 7.001 sự kiện | 100 | 250 | 113 |
| Giải mã NCAP1 với 7.001 sự kiện | 100 | 547 | 122 |
| Giải mã NCAP2 trên 10 fixture | 1.800 | 1.032 | 15.574 |

Hai runtime cho kết quả tương đương trên corpus đã chốt. Nội dung
thông báo lỗi schema và thứ tự lỗi đầu tiên với các tổ hợp lỗi khác
có thể khác. Chuỗi Rust yêu cầu giá trị vô hướng Unicode. Lệnh tính
thời gian frame dùng số hữu tỉ chính xác kể cả khi tốc độ mẫu là số
thập phân nguyên mà bản cũ có thể làm tròn. Lượt kiểm legacy tiếp
tục kiểm schema nội bộ. Dùng bộ sinh r2 cho SDK chuyển tiếp đã xác minh.
Cặp SDK và wheel cũ là bộ rollback và tiếp tục sẵn có cho consumer Python.

## 3. Hardware Rust

- [ ] **Thay server và lifecycle.** Hardware chuyển `server.py`, `rpc.py` và `station/` sang Rust, dùng Contracts Rust và worker C++ đã ghim. Giữ RPC 2.0 cả `cirnet.hardware.v2.HardwareService` và alias `netcircuit.hardware.v2.HardwareService`, loopback/Unix, nguyên ACK/ownership/deadline/NCAP. Preview chuyển qua endpoint nội bộ được thương lượng, giữ adapter Remote Python tương thích với Hardware cũ. Stop dùng tài nguyên riêng cho xử lý RPC, hủy worker và phản hồi an toàn. Remote tiếp tục sở hữu lease/quarantine. Không tăng khả năng công bố của trạm thiếu driver.
- [ ] **Ma trận và gate 3.** So B với Interface hiện tại → Remote Python → Hardware Rust → Simulator C++, dùng legacy wheel ở Remote và crate ở Hardware. Giữ `test_server.py`, `test_virtual_execution.py`, `test_simulation_workers.py`, `test_rpc_lifecycle.py`, `test_ncap_rpc.py`, `test_physical_station.py` làm test tham chiếu. Chuyển assertion phụ thuộc internals Python sang test pytest gọi binary riêng qua RPC để thử Start/Stop/reset, hết lease, mất kết nối, worker treo/chết, phản hồi muộn, Stop đồng thời khi queue đầy và cách ly nếu thiếu ACK. Chạy các test tích hợp Remote. Dùng [chính sách hiện hành theo môi trường](#chính-sách-nghiệm-thu-gate-3-theo-môi-trường) cho hiệu năng và Stop dưới tải. Gate PR luôn giữ kiểm điều kiện trước khi cấp điện. Chạy hai testbench RTL đã ghim và HIL đúng khả năng được công bố. Phân loại riêng thiết bị chưa có. Rollback theo quy trình lease/quarantine, phục hồi Hardware Python và worker tương thích.

### Chính sách nghiệm thu Gate 3 theo môi trường

Máy phát triển Windows x64 dùng Intel Core i5-12500H nghiệm thu chức
năng, tương thích và an toàn Giai đoạn 3. Bộ 29 chỉ số dịch vụ thông
thường trên máy này dùng để chẩn đoán. Bộ chỉ số gồm CPU/job, RAM
đỉnh, yêu cầu cố định/giây, job/giây và byte NCAP/giây, cùng p95/p99
của tạo, Run, poll và capture cho AND/CLOCK và các route đọc active,
history, projects, stations. Các phép đối chứng Windows trước đây
giữ nguyên số đo, ngưỡng và kết quả PASS/FAIL trong lịch sử. Chỉ số
dịch vụ thông thường không chặn gate Windows. Assertion chức năng
lỗi, capture lệch hoặc lượt đo không hợp lệ vẫn cần bằng chứng hợp lệ
cho yêu cầu bị ảnh hưởng. Chính sách này áp dụng cho quyết định hiện
tại. Các phần lịch sử sau biên nhận Stop chính thức giữ nguyên bối
cảnh nghiệm thu trước đây.

Windows cần ma trận B/C trên SQLite và PostgreSQL với hash NCAP khớp
và job hoàn tất hợp lệ, cả hai namespace Hardware RPC, tương thích
preview và Interface đã phát hành, chốt quyền sở hữu và phiên, xử lý
lỗi, quá hạn và kết quả cũ, ACK an toàn, lease, quarantine và rollback.
Stop dưới tải tiếp tục là gate an toàn, dùng [phương pháp đồng bộ tại Hardware đã chấp thuận](#phương-pháp-đồng-bộ-start-đã-được-chấp-thuận-cho-gate-3),
cùng workload, ba cặp cửa sổ 100 mẫu hợp lệ mỗi bên và giới hạn số
lần thử hiện có. Ghi
`CIRNET_NATIVE_STAGE3_STOP_ACCEPTANCE_SCOPE=windows-functional-safety-v1`
riêng với phương pháp Start. Cả sáu
trần vận hành p95/p99 tuyệt đối của Stop đã khóa và các deadline cứng
hiện có đều bắt buộc. Báo cáo sáu so sánh đối chứng theo mức 110% của
B cùng PASS/FAIL để chẩn đoán. Vẫn cần bằng chứng đầu nhận, worker
thoát trước ACK, thu hồi lease, quarantine và chặn kết quả muộn. Ghi
RTL và HIL riêng. Scaffold công bố thực thi vật lý không khả dụng và
HIL vẫn **NOT RUN**.

| Bằng chứng Windows trên đúng r8-R2 | Trạng thái hiện tại |
| --- | --- |
| Capture và hoàn tất job ma trận PostgreSQL | **PASS**. Lượt r8 đầy đủ xác minh 1.200 capture đo của B và C. Kết quả chỉ số dịch vụ thông thường vẫn là **FAIL** trong lịch sử. |
| SQLite API và Interface đã phát hành | **PASS** cho 130 ca SQLite/API dùng mã nguồn và capture AND trên trình duyệt B/C dùng đúng r8-R2. SHA-256 biên nhận trình duyệt `b20393483709467efa5f09e85db87172c5cadb10110e8b789994e4354376de93`. |
| Smoke ma trận SQLite và rollback trên đúng artifact | **PASS**. Hai ca tập trung trên r8-R2 trong 134,99 giây xác minh capture AND/CLOCK, hai route preview, dữ liệu trạm khớp và rollback về Hardware Python. |
| Vòng đời native và an toàn Remote | **PASS** cho 25 ca vòng đời Rust và ba ca Remote trên đúng artifact về lease, quarantine và mất kết nối. |
| Stop đồng thời khi hàng đợi Remote đầy và giới hạn dispatch | **PASS**. Hai ca kiểm thử thành phần trên bản r8 đã cài trong 5,15 giây. |
| RTL FPGA đã ghim | **PASS** cho 30 ca testbench trước đây dùng cùng FPGA scaffold đã ghim. HIL vẫn **NOT RUN**. |
| Stop dưới tải chính thức và gate Windows tổng hợp | **PASS**. Cả 600 mẫu hợp lệ đáp ứng các kiểm tra về trình tự sự kiện và an toàn. Cả sáu trần vận hành đã khóa đều đạt. Xem [biên nhận Stop chính thức](#gate-3-stop-dưới-tải-chính-thức-trên-windows). |

SHA-256 của biên nhận smoke SQLite và rollback trên đúng artifact là
`bcaf7513f286a928e3fec9a19e7dd99614ccdfdfa1f97c20540456e05b087c56`
và `d6f78f7ed3c08eb3b31c3716428237426085548e65d30b2784b8059c352d31ea`.
SHA-256 của controller là
`045a3c3aea3c687ae66a9fa9f61921e3090bbab003d4772ab6ce106f4b422080`.
Các biên nhận SQLite r4 và smoke/rollback r6 vẫn là lịch sử đối chứng
cho manifest Remote và Hardware tương ứng.

[Ca Stop khi hàng đợi đầy](../../../services/api/tests/test_control_sweep_isolation.py#L107)
lấp đủ 50 vị trí trong hàng đợi Remote, gửi Stop đồng thời cho job
đang chạy và job đang chờ, rồi xác minh giữ lease đến khi dọn dẹp an
toàn và chặn kết quả muộn. [Ca giới hạn dispatch Stop](../../../services/api/tests/test_control_sweep_isolation.py#L71)
xác minh yêu cầu hủy vượt giới hạn 16 lượt dispatch được giữ lại và
thử lại. Hai ca SQLite dùng trạm thử có kiểm soát. Lượt Stop dưới tải
chính thức kiểm tra riêng trường hợp bốn worker Hardware cùng bận.
Cả 71 tệp `app/` đã cài khớp từng byte với wheel r8 và cả 31 module
`app` đều được import từ `site-packages` của bản cài. SHA-256 biên nhận
`gate3-r8-queue-safety/4458bff5993541f09067dd3d2f82c1a5/pytest.log`
là `be0bf1403962a3a1e8df321c6d30e0a86eee56e652712da873f7050d8b8df0d5`.

Nền tảng đã chọn để nghiệm thu hiệu năng production là máy Linux Xeon.
Hiệu năng production vẫn **NOT RUN** cho đến khi máy và đúng artifact
Linux sẵn sàng. Build hoặc chọn B và C dành cho Linux theo phiên bản
đã ghim. Ghim manifest, binary, wheel, worker, toolchain, dependency
và hash harness trên Linux. Đối chứng B và C trên cùng máy Xeon, cùng
cpuset và chính sách NUMA, cấu hình Linux và cơ sở dữ liệu, dữ liệu thử,
workload, mức đồng thời, warmup, nhịp client và phương pháp đo. Ghi
topology, hệ điều hành, kernel, RAM, chính sách nguồn và lập lịch, lưu
trữ, thiết lập độ bền PostgreSQL và tải đồng thời. Khởi tạo trạng thái
cô lập tương đương và đảo thứ tự cặp.

Xác minh chức năng, tương thích và an toàn trên Linux, gồm NCAP và Stop
dưới tải, trước khi nghiệm thu production. Harness Stop trên Linux cần
bằng chứng tương đương trên đồng hồ đơn điệu cho đầu nhận, worker thoát,
ACK và lease thay cho phép đo QPC của Windows. Giữ deadline vận hành,
kiểm tra quarantine và chặn kết quả cũ. Chạy hiệu chuẩn tham chiếu Linux
riêng, rồi phê duyệt và ghi số mẫu, phương pháp đối chứng và ngưỡng dành
riêng cho Linux trong preflight trước khi đo chính thức. Kết quả Linux
dùng ngưỡng đã duyệt và digest artifact Linux. Sáu trần Stop tuyệt đối
tiếp tục áp dụng trên Windows.

Bằng chứng r8-R2 hoàn tất nghiệm thu chức năng, tương thích và an toàn
trên Windows. Commit Giai đoạn 3 trước khi bắt đầu Giai đoạn 4. Hiệu
năng Linux và nghiệm thu production/phát hành vẫn **NOT RUN**.

#### Gate 3 Stop dưới tải chính thức trên Windows

Lượt chính thức của r8-R2 **PASS** với
`CIRNET_NATIVE_STAGE3_STOP_METHOD=natural-loaded-stop-hardware-rendezvous-v1`
và `CIRNET_NATIVE_STAGE3_STOP_ACCEPTANCE_SCOPE=windows-functional-safety-v1`.
Giữ nguyên workload và giới hạn 403 lần thử mỗi bên trong từng cửa sổ.
Có 600 mẫu hợp lệ từ 802 lần thử. Bản tham chiếu Python B có 202 lần
không đạt tiêu chí lấy mẫu. Mọi lần thử của Rust C đều đủ điều kiện.

| Cửa sổ | Python B hợp lệ / lần thử | Rust C hợp lệ / lần thử |
| --- | ---: | ---: |
| 1 | 100 / 175 | 100 / 100 |
| 2 | 100 / 153 | 100 / 100 |
| 3 | 100 / 174 | 100 / 100 |

Mọi số đo trong bảng tính bằng mili giây. Cả sáu trần Windows đều đạt.
Biên nhận giữ ba kết quả đối chứng tương đối chưa đạt để chẩn đoán hiệu năng.

| Chỉ số Stop | Python B | Rust C | Trần Windows đã khóa | 110% của B | Chẩn đoán tương đối |
| --- | ---: | ---: | ---: | ---: | --- |
| HTTP p95 | 78.6032 | 89.1368 | 197.55406 | 86.46352 | FAIL |
| HTTP p99 | 100.8966 | 100.4389 | 581.1564 | 110.98626 | PASS |
| ACK an toàn gRPC p95 | 56.3787 | 62.2677 | 139.20478 | 62.01657 | FAIL |
| ACK an toàn gRPC p99 | 69.3376 | 78.5544 | 526.71179 | 76.27136 | FAIL |
| Thu hồi lease an toàn p95 | 145.9619 | 144.0377 | 2534.55686 | 160.55809 | PASS |
| Thu hồi lease an toàn p99 | 168.5140 | 163.8268 | 2598.37468 | 185.36540 | PASS |

Ca kiểm thử chính thức đạt trong 2.953,75 giây. Controller thoát mã 0
sau 2.954,467 giây. Các hash bên dưới đều dùng SHA-256.

| Artifact hoặc biên nhận | SHA-256 |
| --- | --- |
| Manifest ứng viên r8-R2 | `ebc49c57c052e0a78c98074af240c78010f787872a4ad32ac23617ada1fc15bd` |
| Harness Stop chính thức | `939b362c7fc12d463e79e7fec5a54d8a86dfa78e5c579fab1d60b0b97d08b330` |
| Workload Stop dưới tải | `e48b3d87456a93e3b97f8872fa39ea45099bbf34a49d0e32b888d9b4458a0c2c` |
| `native-hardware-stop/97612df8bfb942bfbb131dbaf78c1b10/stop-summary.json` | `41b41bb221ec29118e324637119cf2fdfd5a267760b2b7a1da8d9da3310593b0` |
| `lifecycle-rpc/start-rendezvous/r8-r2-windows-safety-stop-7afac62f5d3241489dde91a070ad2cb7/controller.json` | `35374c64a4268f56f920cf62e66ef03b6bdc721388e1723a1b32d61b954922bd` |

Harness dùng cho lượt chính thức được lưu tại
`stage3-formal-stop-harness/native_hardware_stop_cases.py` với SHA-256
gốc trong bảng. Bản trong kho mã nguồn bỏ một dòng trống ở cuối tệp
và có SHA-256
`fb07d42f98e6bcc2ebed006ce9f05364b2c2e96c2979032a7557b3da45e8d9f0`.
Cây cú pháp và các vị trí trong mã nguồn khớp với bản lưu.
Bản đã chỉnh đạt 26 ca không dùng dịch vụ và hai ca gRPC loopback
cho cả hai namespace RPC.
Mã nguồn Hardware Giai đoạn 3 được ghi tại commit
`3ad140f24ae5f3f2e6b735b5cff4beec7bffda54`.

### Tiến độ Gate 3

Ứng viên Windows x64 triển khai hai namespace RPC 2.0, vòng đời trạm ảo,
capture NCAP và lane preview riêng. Remote Python bật preview qua Hardware
bằng `CIRNET_HARDWARE_PREVIEW=true` và dùng preview cục bộ khi Hardware cũ
trả `UNIMPLEMENTED` ở bước kiểm tra phiên bản.

Phép đo r2 trên Windows x64 dùng Rust 1.90.0 và
`cargo build --release --locked --offline`. SHA-256 của binary Hardware là
`39e206e1e306f2e3e041bc52c1802ba9a6da333e1592009d01920c7c9a31221b`.
SHA-256 của wheel Remote ứng viên là
`e44bd8be68ecc46895ac195bfc8f767173a8932e1ac8d7dc9e456984bbe3d33e`.
B dùng wheel r7 của giai đoạn 1. B và C cùng dùng worker C++ r7 và wheel
Contracts Python đã duyệt. Hardware C dùng crate r2 của giai đoạn 2.

| Kiểm chứng | Trạng thái |
|---|---|
| Tương thích với worker C++ đã ghim | PASS, 4 ca gồm SHA-256 NCAP và validation graph vật lý |
| Preview Remote Python và bàn giao OpenAPI | PASS, 40 ca và đối chiếu từng byte ở cả hai cấu hình |
| Vòng đời gRPC Hardware Rust trên đúng ứng viên Windows | PASS, 12 ca gồm hết lease, mất kết nối và quarantine khi khởi động lại |
| Capture lớn trên đúng binary B và C | PASS, 100.000 mẫu và 1.100.101 byte NCAP khớp |
| Bộ kiểm thử Hardware Python tham chiếu | PASS, 46 ca |
| Tích hợp Remote và hồi quy API đã chọn | PASS, 114 ca qua lượt đầu và lượt chạy lại với cấu hình artifact đúng |
| Interface phát hành trên Chromium với dịch vụ B và C thật | PASS, dạng sóng AND và capture NCAP 124 byte giống nhau |
| Hai testbench FPGA RTL đã ghim trên Windows | PASS, 30 ca |
| HIL | NOT RUN. FPGA scaffold đã chọn chưa công bố thực thi vật lý |
| Tải B/C trên SQLite, ba cửa sổ 200 job mỗi bên | FAIL, đạt 29/29 ngưỡng đã khóa và 19/29 ngưỡng ghép cặp. Cả 1.200 capture khớp |
| Tải B/C trên PostgreSQL, ba cửa sổ 200 job mỗi bên | FAIL, đạt 29/29 ngưỡng đã khóa và 21/29 ngưỡng ghép cặp. Cả 1.200 capture khớp |
| Stop dưới tải tự nhiên | FAIL, cửa sổ Python đầu có 76 trên 100 mẫu hợp lệ cần thiết |

Chẩn đoán với worker bị treo đo ba cửa sổ, mỗi cửa sổ 100 lượt Stop mỗi bên.
Ứng viên Rust đầu tiên có p95/p99 là 31,041/34,599 ms. Khi giảm chu kỳ kiểm
tra hủy và thu hồi từ 10 ms xuống 2 ms, ứng viên đạt 18,261/19,481 ms so với
22,498/24,927 ms của lane Python đối chứng. Cả 600 lượt Stop của cặp mới đều
xác minh ACK an toàn, thu hồi worker và chặn capture cũ. Chẩn đoán này dùng
worker bị tạm dừng. Gate tải tự nhiên chạy riêng.

`GetCapabilities` qua loopback cho kết quả khớp byte ở cả 3.000 phản hồi mỗi
bên. Thông lượng gộp qua ba cửa sổ là 2.097 RPC/giây với Python và
5.822 RPC/giây với Rust. p95/p99 tương ứng là 0,681/0,954 và 0,243/0,294 ms.

Trung vị các cửa sổ SQLite là 4,943 → 4,567 job/giây và 109.315 → 101.003
byte NCAP/giây. p99 của route đọc thí nghiệm đang hoạt động là 54,776 →
110,925 ms. Cửa sổ Python đầu tiên mất 85,24 giây, hai cửa sổ sau mất
39,47 và 40,46 giây. Kết quả ghép cặp giữ đủ các cửa sổ.

Trung vị thông lượng PostgreSQL là 5,578 → 5,534 job/giây. Tám ngưỡng độ
trễ HTTP ghép cặp chưa đạt, gồm p99 Run mạch clock tăng từ 371,575 lên
501,905 ms. Cụm thử nghiệm PostgreSQL 18.6 đã dừng sau khi đo.

Cửa sổ Stop tự nhiên đầu tiên thử 403 lượt lấy mẫu. Trong 202 lượt bị loại,
ít nhất một Start đã hoàn tất trước khi Stop tới gRPC. Lượt chẩn đoán sáu
mẫu và kết quả với worker bị tạm dừng được ghi riêng. So sánh Stop dưới tải
tự nhiên vẫn thiếu mẫu.

Trong lượt chẩn đoán riêng 40 job mỗi bên, p95 tổng thời gian RPC Hardware
mỗi job giảm từ 43,47 xuống 21,77 ms. p95 thời gian chờ khóa trong scheduler
tăng từ 1.089,33 lên 1.278,57 ms, tính theo hợp các khoảng chờ. Lượt này
định vị phần thời gian đã đo. Nguyên nhân các ngưỡng HTTP chưa đạt còn mở.

Diễn tập rollback đã dừng tổ hợp Rust sau khi xử lý hết công việc, mở lại
cùng dữ liệu SQLite và capture với Hardware Python, xác minh SHA-256 của
NCAP đã lưu và hoàn tất lượt Run mới. Gate 3 đang chờ các kiểm chứng còn lại.
SHA-256 của gói bằng chứng Windows đã xác minh là
`4ed962dcc9e30c6229cd3a0490a403e1575594637e03f50d5e98abb7ba0582cd`.

### Kiểm thử lại Gate 3 trên Windows x64

r3 dùng lại bản ghi experiment đã đọc khi kiểm tra hủy và phiên trước RPC.
Kiểm tra sau RPC vẫn đọc trạng thái mới. r4 lấy chủ sở hữu và payload đã
commit trong cùng một truy vấn trước khi phát cập nhật experiment. Khóa của
scheduler vẫn giữ thứ tự chuyển trạng thái và phát sự kiện. Ca hồi quy SQLite
đã kiểm tra chuyển quyền qua kết nối độc lập và snapshot công khai tương ứng.
r4 đạt 137 ca hồi quy tập trung, bốn ca PostgreSQL về phiên và lease, và đối
chiếu OpenAPI từng byte.

| Ứng viên và profile | Kết quả | Ngưỡng đã khóa | Ngưỡng ghép cặp | Capture khớp |
|---|---|---:|---:|---:|
| r3 SQLite | FAIL | 29/29 | 14/29 | 1.200 |
| r3 PostgreSQL | NOT RUN | — | — | — |
| r4 SQLite | FAIL | 29/29 | 28/29 | 1.200 |
| r4 PostgreSQL | FAIL | 29/29 | 17/29 | 1.200 |

Mỗi profile tải dùng ba cặp cửa sổ với 200 job mỗi bên mỗi cửa sổ. Trung
vị thông lượng r4 tăng từ 4,707 lên 5,004 job/giây trên SQLite và từ 4,997
lên 5,374 trên PostgreSQL. Trung vị CPU/job giảm tương ứng từ 0,194 xuống
0,174 giây và từ 0,199 xuống 0,180 giây. SQLite trượt p95 tạo mạch clock ở
116,670 ms so với ngưỡng ghép cặp 114,925 ms. PostgreSQL trượt 12 ngưỡng độ
trễ HTTP ghép cặp, trong đó p99 poll mạch AND là 222,723 ms so với giới hạn
114,236 ms. Hồ sơ giữ mọi cửa sổ và mẫu CPU của máy.

Chẩn đoán Stop nghiêm ngặt với r3 xác minh tám mẫu mỗi bên. Chẩn đoán r4
tách riêng bước căn Start, tạm dừng bốn worker đã xác minh khi chúng rảnh
và tiếp tục cả bốn trước phần workload và Stop được đo. Phía Python đạt
8/11 lượt, phía Rust đạt 8/9 lượt. Cùng artifact Python đạt 8/35 lượt khi
chạy chẩn đoán mà chưa căn Start. Mỗi mẫu hợp lệ xác minh các worker đang
xử lý request đầy đủ, worker đích thoát trước ACK an toàn, và lease được
giải phóng bền vững sau dọn dẹp. Stop tự nhiên chính thức ở trạng thái
NOT RUN cho r3 và r4. Đường đo mặc định, ba cửa sổ 100 mẫu mỗi bên và các
ngưỡng vẫn là điều kiện của gate.

SHA-256 wheel Remote r4 là
`f4c71271760ca95843c50378fced2c4c81407fe4bfad616886cf57d273805c2f`.
SHA-256 gói bằng chứng r3/r4 đã xác minh là
`400f0bb54a731f0b1819d6d5c9c404cbe44aad1b8c7d2d68f187de2a7b0915fa`.
Gate 3 vẫn **FAIL**. Thay đổi Stage 3 đang chờ tích hợp.

### Chẩn đoán ranh giới Gate 3 sau r4

Commit nền của hai worktree là Hardware `c41027d` và Remote `fd546f1`.
Manifest r4 có SHA-256
`f8b7feb73b8cd3c2bee6b9a2528a4db04dd2951d4513e2b17fef51a13b95f694`,
khớp ba artifact đóng gói và bảy tệp runtime Remote đã ghi. Dùng lại wheel
đã cài, binary Rust, crate Contracts, worker C++ đã ghim và bằng chứng tham
chiếu. Kết quả chính thức r4 ở trên vẫn có hiệu lực. Hai phép đo ngắn dùng
schema mới trên PostgreSQL 18.6 loopback. Số đo đối chứng B lịch sử chỉ áp
dụng cho điều kiện của lượt chạy tương ứng.

Chạy các script chẩn đoán ngoài repo từ worktree Remote với Python giai
đoạn 1 đã xác minh, các manifest r4 và URL PostgreSQL riêng. Lệnh thứ hai
còn dùng wheel thử nghiệm đã xác minh độc lập.

~~~powershell
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . "$diag/rpc/test_rpc_phase_diagnostic.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . "$diag/test_auth_snapshot_http.py"
~~~

Lượt đầu đo 40 job mỗi bên với cùng wheel Remote r4 và chỉ thay Hardware.
Lượt chạy mất 287,35 giây và báo FAIL ở bộ kiểm kê tiến trình vì Rust khởi
động worker thứ hai sau warmup. Mỗi bên vẫn giữ đủ 40 job hoàn tất và bốn
capture warmup khớp hash. Script ngoài repo `analyze_retained_spans.py` chỉ
phân tích span có ID job hoặc request xác định trong trace. Với
`GET /api/experiments/active`, p95 phía server tăng từ 102,437 lên 136,512 ms.
p95 chờ khóa Repository tăng từ 78,726 lên 102,407 ms, còn SQL từ 13,414
xuống 11,644 ms. Route này không gọi Hardware. Lần chờ khóa đầu khi đọc
phiên tăng từ 42,822 lên 66,736 ms. p95 tổng khoảng RPC của scheduler giảm
từ 93,004 xuống 53,679 ms. CPU đo ở hai đầu cửa sổ giảm từ 24,609 xuống
22,672 giây ở Remote và từ 1,813 xuống 0,547 giây ở Hardware. Chênh CPU
của các worker Simulator là 0,016 và 0,031 giây theo độ phân giải bộ đếm
Windows, với số worker sau warmup khác nhau. Đã định vị được điểm chờ trong
lượt này. Nguyên nhân của toàn bộ ngưỡng trượt và ảnh hưởng của runner còn mở.

Wheel thử nghiệm chỉ đổi cách đọc cookie trên PostgreSQL và metadata wheel.
Ca logout đồng thời tái hiện chờ khóa ở r4 và PASS với bản thử. Cookie cũ
bị từ chối sau commit, còn hàng rào ghi chờ rồi từ chối phiên đã thu hồi.
Bốn ca PostgreSQL về phiên và lease cùng 50 ca hồi quy xác thực PASS.
Đối chứng HTTP 40 job mỗi bên mất 234,83 giây, dùng cùng Hardware Rust và
capture khớp từng byte. p95 đọc danh sách thí nghiệm đang hoạt động giảm
từ 128,049 xuống 109,986 ms, nhưng thông lượng giảm từ 1,585 xuống 1,302
job/giây và p95 tạo mạch clock tăng từ 164,569 lên 278,782 ms. Bản thử được
giữ ngoài repo và worktree vẫn dùng r4. Phép đo ngắn ít hơn 335,73 giây so
với lượt PostgreSQL chính thức 570,56 giây trước đó. Hai lượt có mục đích
và số mẫu khác nhau.

SHA-256 báo cáo span đã phân tích là
`7b349df4c0b597765857aacb279e611d2c86511328650b67aa5d9c851fcbef73`.
SHA-256 wheel thử nghiệm là
`8f3203fb2c60623199d2c189311008b5d293d529bbb53f2986d011919d5430bf`
và SHA-256 tóm tắt HTTP ngắn là
`10dcb8a6e9423949e0a8b74f06016d5bbfe6f78f80f9cf688ccd8ce3eed2da29`.

Gate 3 vẫn **FAIL**. Bước chẩn đoán tiếp theo cần gắn thời gian giữ khóa
với nơi gọi và tách thời gian chờ kết nối PostgreSQL. Hai bài tải SQLite,
PostgreSQL và Stop tự nhiên chính thức đang chờ ứng viên đủ điều kiện.
Số mẫu, ngưỡng ghép cặp và đã khóa, cùng bằng chứng an toàn Stop vẫn là
điều kiện nghiệm thu.

### Truy vết tranh chấp khóa và quan sát Stop ở Gate 3

Worktree Hardware vẫn dựa trên `c41027d` và Remote trên `fd546f1`.
Các phép chẩn đoán dùng lại manifest r4 đã xác minh, Python Giai đoạn 1,
binary Rust Hardware, crate Contracts và C++ Simulator đã ghim ở trên.
Chẩn đoán PostgreSQL dùng schema loopback mới trên PostgreSQL 18.6.
SHA-256 của tệp thực thi máy chủ là
`8b8bf5d400487159e3e117053d3f5a89fad0c740b310a3ac69e5720ce4f818e1`.

Chạy các phép chẩn đoán ngoài repo từ worktree Remote với môi trường
release đã xác minh, các wheel đã cài, URL PostgreSQL riêng và
`CIRNET_STAGE3_PAGE_EXPERIMENT` trỏ đến biên nhận wheel thử nghiệm.

~~~powershell
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_pg_lock_holders.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_page_snapshot_http.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_page_snapshot_http_reverse.py"
~~~

Chẩn đoán khóa trên r4 PASS trong 115,37 giây với 24 capture khớp byte.
Lượt dịch vụ mất 92,55 giây, gồm cửa sổ tải 18,46 giây. p95 của GET
active là 95,537 ms, chờ khóa repository là 69,773 ms, SQL là 8,919 ms
và lấy kết nối từ pool là 0,099 ms. Các bên giữ khóa trùng thời gian
chờ nhiều nhất đã xác định là `AuthService.current`, `page_experiments`
và `_experiment_row`. p95 của GET history là 230,914 ms, với p95
chờ khóa manager là 135,619 ms. `_transition` giữ khóa manager
trùng thời gian chờ nhiều nhất. Thời gian trùng được cộng theo từng
yêu cầu chờ. Profile xác định điểm tranh chấp trong Remote trên các
đường này. Nguyên nhân của toàn bộ ngưỡng PostgreSQL chưa đạt vẫn
đang được xác minh. SHA-256 báo cáo khóa là
`7d769352e1e59875804a193ea7e94766f89d43915c5c0b332d69f97fb7443a10`.

Harness Stop nay đợi trên đúng handle tiến trình worker Windows và
giữ bước chứng minh bằng bộ đếm pipe của cả bốn worker sau đó. Harness
kiểm tra cùng PID và thứ tự giữa quan sát cuối khi tất cả còn sống,
tín hiệu tiến trình thoát và mẫu bộ đếm sau đó. Lệnh đợi được hủy và
hoàn tất trước khi đóng handle. Các yêu cầu về ACK, thu hồi tiến trình,
lease, quarantine và chặn kết quả cũ vẫn được giữ. Năm ca tập trung
PASS trong 0,52 giây. Khi bật `CIRNET_NATIVE_STAGE3_STOP_SMOKE=1` và
`CIRNET_NATIVE_STAGE3_STOP_IDLE_BARRIER=1`, lệnh chạy
`tests/integration/native_hardware_stop_cases.py` với r4 đạt sáu ca
trong 174,35 giây. Hai bên đều đạt cả tám lượt thử. Chẩn đoán có căn
thời điểm trước đó cần 11 lượt Python và chín lượt Rust, với bốn lượt
bị loại do thời điểm quan sát. SHA-256 biên nhận smoke là
`4f8bc69684d70e66d9ad03304215cb62d3481c15854f76adcfa67d8cda494d1a`.
SHA-256 mã harness đã áp dụng là
`c0506faf521e6f4977d11fc3fb24fca0102097f715c5d3b6d525e3b1f19a626d`.
Đường nghiệm thu chính thức vẫn chạy tự nhiên với ba cửa sổ 100 mẫu hợp
lệ mỗi bên và các trần p95/p99 Giai đoạn 0 cùng đối chứng đã chốt.

Lượt chẩn đoán r4 riêng khi worker chạy tự nhiên chỉ bật
`CIRNET_NATIVE_STAGE3_STOP_SMOKE=1` và chạy
`tests/integration/native_hardware_stop_cases.py::test_stage3_natural_stop`.
Kết quả **FAIL** sau 282,01 giây vì thiếu mẫu hợp lệ. Python xác minh
được 5/35 lượt và Rust xác minh đủ 8/8. Python có 19 lượt bị loại
trước bước chứng minh cả bốn worker đang xử lý. Trong 18 lượt đó,
ít nhất một worker vẫn ghi nhận 0 byte yêu cầu mới khi đã quan sát
thấy phản hồi. Ở 18 lượt này, khoảng cách từ lúc Remote gửi RPC Start
đầu tiên đến cuối cùng có trung vị 0,365 ms và tối đa 0,991 ms. Trung
vị khoảng cách giữa phản hồi đầu và cuối là 168,743 ms. Tám lượt khác
có một RPC Start hoàn tất trước khi Stop tới. Phép đo thu hẹp vùng
điều tra xuống sau mốc Remote gửi RPC. Trace hiện chưa tách được
tiếp nhận gRPC, dispatch của Hardware và lịch chạy worker. Chẩn đoán
ngắn chưa xác lập các phân vị Stop. SHA-256 bản tóm tắt là
`e58d4618ddd0fe0165e99a42eed94be5da57a272de158b35ee92a7a5a45b3cda`.
SHA-256 bản phân tích trace là
`0a0c9315a8eed3ae63d19bc7de53fff5e0f115e12c75f7931563922bf0e7f52f`.

Bản thử PostgreSQL riêng cho phép câu SELECT lọc theo chủ sở hữu hiện
có dùng snapshot MVCC của chính câu lệnh. Hàng rào phiên, điều khiển và
ghi cùng đường SQLite vẫn được giữ. Ca chuyển quyền guest thật cho thấy
r4 phải chờ trong lúc giao dịch đang mở. Bản thử trả trang của chủ cũ
trước commit và chỉ trả trang của chủ mới sau commit, đồng thời xác minh
quyền sở hữu cursor và lease đang quarantine. Ca này PASS trong 4,26
giây. Bốn ca phiên/lease PostgreSQL PASS trong 4,32 giây và 14 ca
history/feedback PASS trong 14,62 giây. SHA-256 wheel thử nghiệm là
`15eba833e6397394ff5383da50d825a40c2b392dafe146027f6fbf9046e09d59`.

Cả hai lượt so sánh 24 job mỗi bên đều PASS kiểm tra capture và mã
trạng thái. Hai lượt dùng cùng Rust Hardware, Simulator đã ghim, 50
principal, bốn slot, bốn job clock khởi động và cùng định nghĩa tải
`3c5130be3873d53b4d65d4f1698f9a0ff5e6256999c740b6c4eb4ce0d5cc01dd`.

| Thứ tự | Tổng thời gian pytest | p95 active r4 → bản thử | p95 history r4 → bản thử | Cửa sổ tải r4 → bản thử |
| --- | ---: | ---: | ---: | ---: |
| r4 trước | 193,43 giây | 100,856 → 37,360 ms | 235,426 → 90,479 ms | 18,363 → 6,500 giây |
| Bản thử trước | 217,64 giây | 103,933 → 87,955 ms | 340,725 → 376,900 ms | 18,801 → 21,953 giây |

Lượt đầu tiết kiệm 11,86 giây trong cửa sổ tải. Lượt đảo thứ tự tăng
3,15 giây và thông lượng giảm từ 1,277 xuống 1,093 job/giây. Mức dao
động làm cho tác động tổng thể còn chưa rõ. Nguyên nhân của dao động
đang được xác minh. Bản thử trang được giữ ngoài repo. Mã ứng viên
trong worktree vẫn là r4. SHA-256 hai bản tóm tắt theo thứ tự chạy là
`27d2446000b021a8393a4338c5c169d83d310603118490bf064ae60e54a31224`
và `9c82e1b909f5c25759a70d444940de30f5c0032235712f59f4cae3db19c2bee7`.

Kết quả tải chính thức mới nhất vẫn là r4 **FAIL**, đạt 28/29 ngưỡng
đối chứng trên SQLite và 17/29 trên PostgreSQL. Cả hai đạt 29/29 ngưỡng
cố định và khớp 1.200 capture mỗi cơ sở dữ liệu. SQLite trượt
`clock_create.p95_ms`. PostgreSQL trượt p95 và p99 của AND create,
AND poll, active và history, p99 của clock capture, clock create và
projects, cùng p95 của stations.

| Biên nhận r4 chính thức | Tổng pytest | Chuẩn bị DB | Khởi động dịch vụ | Chuẩn bị client | Khởi động tải | Đo tải | Dọn dẹp |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SQLite | 552,57 giây | <0,01 giây | 179,73 giây | 95,19 giây | 6,97 giây | 243,63 giây | 4,33 giây |
| PostgreSQL | 570,56 giây | 1,49 giây | 192,30 giây | 106,45 giây | 6,41 giây | 236,92 giây | 4,68 giây |

Tổng theo pha lấy từ đồng hồ của sáu lane, chưa tính thời gian ngoài
lane, gồm bước xác minh artifact. Các phép chẩn đoán dùng lại artifact
đã cài và gói đối chiếu, không build lại bản release. Lượt chẩn đoán
có số mẫu khác nên thời gian ngắn hơn không phải mức tiết kiệm của gate.

Gate 3 vẫn **FAIL**. Hai lượt nghiệm thu lại đầy đủ SQLite và
PostgreSQL cùng gate Stop tự nhiên ba cặp vẫn **NOT RUN**. HIL vẫn
**NOT RUN** với scaffold hiện tại. Trước lượt nghiệm thu tiếp theo, cần đo mốc tiếp nhận gRPC, vào hàng
đợi Hardware và ghi yêu cầu CNP ở đối chứng Python B, rồi đối chiếu
với bộ đếm đọc của worker. Với PostgreSQL, tách thời gian giữ khóa
của `_transition` theo bước lưu trạng thái, chiếu snapshot và phát
sự kiện. Dùng kết quả chạy ngắn lặp lại được để chọn ứng viên, giữ
điều kiện tải, số mẫu và ngưỡng hiện hành.

### Truy vết Gate 3 từ gRPC đến bước lưu trạng thái

Trên Windows x64, hai phép đo dùng lại đối chứng Python B chính xác
của Giai đoạn 1 cùng các artifact r4 của Remote, Rust Hardware,
Contracts và C++ Simulator đã ghi ở trên. SHA-256 manifest Giai đoạn 1 là
`2e42cd74dbe59dd02e0afbd22aaa6ce2dd48dd9400b8c4ae83b1b0defee4e011`.
Manifest Giai đoạn 3 vẫn là r4. Hai phép đo chạy lần lượt, lưu đầu ra
ở thư mục đã cấp phát ngoài repo và dùng lại bản release đã build.

Chẩn đoán Python B dùng tải saturated-v1 đã ghim với worker chạy
tự nhiên, SHA-256
`e48b3d87456a93e3b97f8872fa39ea45099bbf34a49d0e32b888d9b4458a0c2c`.
Chẩn đoán dùng C++ worker đã cài, giữ các điều kiện xác minh mẫu và
kiểm tra capture của các worker còn lại. Probe ngoài repo ghi mốc
vào bộ nhớ rồi xuất khi Hardware dừng. Mục tiêu riêng của chẩn đoán
là bốn mẫu hợp lệ trong tối đa 19 lượt.

~~~powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
@'
import sys
sys.path.insert(0, sys.argv[1])
import pytest
raise SystemExit(pytest.main(['-q', '-s', '-p', 'no:cacheprovider',
    '--rootdir', sys.argv[1], '--basetemp', sys.argv[3], sys.argv[2]]))
'@ | & $B -I -B - $remote "$stopTrace/python_b_stop_trace.py::test_python_b_unpaused_stop_path" "$ownedTmp"
~~~

Lượt truy vết **PASS** sau 116,25 giây, đủ bốn mẫu trong sáu lượt.
Probe ghi nhận 24 RPC Start và năm lần handler Stop thực sự bắt đầu.
Một lượt bị loại vì Start đã hoàn tất trước Stop, một lượt có phản
hồi trước khi đủ bằng chứng bốn yêu cầu được đọc trọn.

| Khoảng thời gian của Start | Trung vị | p95 |
| --- | ---: | ---: |
| Từ lần gửi Remote đầu tiên đến cuối cùng trong nhóm bốn | 0,33 ms | 0,49 ms |
| Từ lúc handler Python đầu tiên bắt đầu đến cuối cùng | 134,60 ms | 161,79 ms |
| Từ Remote gửi đến lúc handler bắt đầu | 14,07 ms | 161,90 ms |
| Từ lúc handler bắt đầu đến lúc gửi việc vào executor | 0,14 ms | 0,18 ms |
| Chờ trong executor | 0,18 ms | 63,78 ms |
| Từ lúc executor bắt đầu đến lane exchange | 140,53 ms | 221,81 ms |
| Tổng hợp sự kiện CNP | 137,29 ms | 219,35 ms |
| Đóng gói frame CNP | 3,63 ms | 5,78 ms |
| Chờ trong hàng đợi pipe | 6,93 ms | 77,95 ms |
| Ghi pipe | 4,39 ms | 62,78 ms |

Ở lượt thiếu chồng lấn, bốn handler bắt đầu sau mốc Remote gửi đầu
tiên lần lượt 1,27, 66,75, 143,30 và 162,28 ms. Tại 221,99 ms,
một worker đã ghi xong phản hồi và hai worker vẫn chưa đọc byte nào.
Lượt đó chưa gửi Stop.

Bảng mô tả sáu lượt có gắn probe. Mốc handler là thời điểm Python
bắt đầu xử lý sau vận chuyển và lập lịch. Thời gian tổng hợp sự kiện
và các khoảng đo thực tế khác có thể gồm chờ GIL hoặc bộ lập lịch.
Trace xác định vị trí phát sinh độ trễ. Nguyên nhân của thời gian
chờ trước handler và vai trò của tổng hợp sự kiện còn cần xác minh.

Trong cả bốn mẫu hợp lệ, lần xác nhận cuối khi tất cả worker còn
sống nằm sau khi handler Stop bắt đầu 4,94–12,73 ms. Mốc thoát của
đúng PID nằm sau thời điểm handler bắt đầu 5,96–13,61 ms. ACK an toàn
theo sau mốc thoát 1,37–2,50 ms. Cả bốn khoảng pipe phía Hardware
đều bao phủ lúc handler nhận Stop. Bằng chứng hiện hành vẫn dùng bộ
đếm worker và mốc giải phóng lease bền vững. Giai đoạn 0 xác minh tải
tại đầu nhận Hardware. Harness chính thức Giai đoạn 3 hiện dùng mốc
API gửi Stop. Trước khi ghi PASS chính thức, cần mốc nhận Hardware
khớp với đúng RPC, hoặc bằng chứng nhân quả tương đương, cho mọi
mẫu được tính ở cả hai bên. Giữ các kiểm tra ACK, thu hồi, lease,
quarantine và chặn kết quả cũ.

SHA-256 của probe ngoài repo, trace thô và bản tóm tắt lần lượt là
`6ccd20128e22286de347241fbe9c9f826315dcb1cdc3ccfd5fdf3c492dd615d9`,
`f8969f7a23867e2c1d13b163f1431eefe809117f67d8ea8af0f8a071edfaf114`
và `dff54640a5224d9a8140b4466ca76007e77db0068588ecf22d8e5fc13047628d`.

Chẩn đoán PostgreSQL 18.6 dùng lại tệp thực thi máy chủ đã ghim.
Chạy controller ngoài repo từ worktree Remote.

~~~powershell
& "$pgTrace/launch-transition-pg.ps1"
~~~

Lần initdb đầu hết hạn 180 giây trong sandbox, trước khi chạy
pytest. Cụm mới khởi động với quyền tiến trình đã dùng ở các
lượt đo trước. Cụm chọn tối đa 100 kết nối và bộ đệm 128 MB.
Khởi tạo, khởi động, pytest và dọn dẹp lần lượt mất 8,18, 0,46,
123,16 và 0,92 giây. Pytest báo **PASS** sau 121,60 giây. Cửa sổ
tải 21,28 giây xác minh đủ 24 capture đo khớp byte. Bốn capture
khởi động cũng khớp. PostgreSQL đã dừng sau lượt đo.

Trong 373 lần `_transition` được đo, 240 lần tự lấy khóa manager
và 133 lần caller đã giữ khóa. Tổng thời gian giữ khóa riêng trong
`_transition` là 16,134 giây. Trong đó 10,017 giây (62,1%) là chờ
khóa Repository lồng bên trong. Chờ khóa khi đọc ban đầu, khi lưu
và khi đọc snapshot sau commit lần lượt là 3,952, 3,056 và 3,008 giây.

| Khoảng đo trong transition, gồm các bước con | Tổng | p95 |
| --- | ---: | ---: |
| Đọc trạng thái ban đầu | 5,355 giây | 42,099 ms |
| Lưu trạng thái | 6,163 giây | 42,379 ms |
| Đồng bộ danh mục capture trong bước lưu | 0,358 giây | 3,336 ms |
| Commit cơ sở dữ liệu trong bước lưu | 0,715 giây | 3,136 ms |
| Đọc snapshot công khai sau commit | 4,431 giây | 29,353 ms |
| Áp dụng chính sách công khai | 0,025 giây | 0,116 ms |
| Phát qua EventHub | 0,039 giây | 0,191 ms |

Trong 100 yêu cầu history, 40 yêu cầu chờ khóa manager. p95 HTTP
là 275,783 ms và p95 chờ khóa manager là 176,760 ms. Trong tổng
4,933 giây chờ khóa manager, 2,770 giây (56,1%) trùng lúc
`_transition` chờ khóa Repository và 0,013 giây trùng lúc EventHub
phát sự kiện. Probe tách bên giữ khóa ngoài khỏi các pha bên trong
`_transition`. Lượt mô phỏng có gắn probe này chưa bao phủ truy vấn
chính sách theo bài tập hoặc tải phân phối cho subscriber.

SHA-256 của launcher chẩn đoán PostgreSQL là
`3deed55a72c043fe87b0e09f504ce53c93ecd996fb6d6227c1c1daca605a9479`.
SHA-256 của bản tóm tắt là
`f6ef032a774107e34ce3ad6c095e675a80c991bffb3946ae742a61d34b67c1d8`.
Bản tóm tắt ghi digest của trace thô và mã probe. Năm ca kiểm tra
bằng chứng Stop PASS trong 0,71 giây. Hai ca snapshot chủ sở hữu
và payload trên r4 đã cài PASS trong 1,15 giây.

Tại mốc r4, Gate 3 vẫn **FAIL** với SQLite đạt 28/29 và PostgreSQL
đạt 17/29 ngưỡng đối chứng. Lượt Stop tự nhiên tiếp theo cần bằng
chứng đầu nhận Hardware ở cả hai bên. Giữ tải chạy tự nhiên, ba
cửa sổ 100 mẫu hợp lệ mỗi bên, các trần cố định và đối chứng cùng
toàn bộ điều kiện về capture và an toàn.

### Thay đổi khóa Remote của Gate 3 sau r4

Bản thử Remote r5 của Giai đoạn 3 thay khóa toàn Repository khi
đọc snapshot thí nghiệm trên PostgreSQL bằng `FOR SHARE` trên một
bản ghi ở mức `READ COMMITTED`. Hai ca hồi quy tái hiện việc chờ
khóa trên r4 trước khi sửa. Bản thử đạt 22 ca PostgreSQL thực, gồm
chuyển quyền khách và commit hoặc rollback payload trên cùng bản
ghi. Trong phép so sánh ngắn 24 job mỗi bên, thông lượng giảm từ
3,762 xuống 3,441 job/giây và CPU/job tăng 18,4%. p95/p99 của active
tăng từ 36,913/40,573 lên 51,873/57,506 ms, của history tăng từ
98,328/103,292 lên 150,233/170,668 ms. Ứng viên bị loại. Phần mã và
kiểm thử của bản thử đã được gỡ khỏi worktree. Mã snapshot chủ sở
hữu và payload của r4 đã được khôi phục đúng byte sau khi chuẩn
hóa dấu xuống dòng của checkout. Wheel r5, diff kiểm thử và phép
so sánh vẫn được lưu trong bằng chứng ngoài repo.

SHA-256 của wheel r5 bị loại là
`02245c8cca5633770d4d4666e2a9c5e7c97f2647a363aa529fab191de80ca35b`.
SHA-256 của phép so sánh và diff kiểm thử lưu trữ lần lượt là
`6c0e2429612589bd88acf6d6047ba2cb485ea59225c3237a4a1f5c60c49ca76f`
và `52340d84df168635c43f3a235333af372bd7ea6d9032f7c7857b9f29d8583918`.

Thay đổi r6 của Giai đoạn 3 trong worktree giữ một khóa Repository
qua các bước đọc trạng thái ban đầu, lưu hoặc phục hồi, rồi đọc
snapshot mới sau commit trong `ExperimentManager._transition`.
Khóa Repository được nhả trước khi tạo payload công khai và phát
sự kiện qua EventHub. Khóa manager vẫn giữ thứ tự sự kiện. Ranh
giới giao dịch và các chốt ghi về claim, phiên, capture, lease và
quarantine được giữ nguyên. Ca hồi quy đồng thời thất bại trên r4
và đạt trên r6. Ca này xác nhận luồng khác có thể lấy khóa Repository
trong cả hai callback. Fixture chuyển quyền qua kết nối độc lập vẫn
xác nhận chủ sở hữu và payload mới sau commit. Các kiểm tra liên quan
đạt **78/78** trên SQLite trong 24,31 giây và **18/18** trên PostgreSQL
trong 14,51 giây. Lượt SQLite đầu dừng tiến triển ở TestClient trong
sandbox. Số liệu trên lấy từ lượt chạy lại đầy đủ với quyền tiến trình
cần thiết.

Các phép so sánh ngắn dùng cùng Rust Hardware và worker C++ ở hai bên,
schema PostgreSQL riêng và không gắn probe theo pha. Mỗi bên chạy
24 job đo và bốn job khởi động trong mỗi thứ tự. Tất cả capture khớp
hash đã ghim. Bảng luôn trình bày số liệu theo chiều r4 → r6.

| Thứ tự chạy | Job/giây | Giây CPU/job | p95/p99 history (ms) | p95/p99 active (ms) | p95/p99 projects (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| r4 rồi r6 | 3,499 → 3,873 | 0,279 → 0,252 | 104,141/123,933 → 65,301/121,490 | 35,035/43,449 → 45,243/126,800 | 116,866/128,681 → 88,870/97,541 |
| r6 rồi r4 | 2,383 → 3,496 | 0,395 → 0,275 | 130,939/144,297 → 78,203/80,633 | 56,125/57,454 → 42,497/47,153 | 81,084/95,020 → 103,427/118,022 |

Thông lượng và p95 history cải thiện ở cả hai thứ tự. Độ trễ đuôi
của active và projects đổi chiều. p99 station và độ trễ lớn nhất
của capture AND tăng ở cả hai lượt, với 12 mẫu capture AND mỗi bên
trong từng lượt. Đây là các phép chẩn đoán ngắn. Số mẫu và ngưỡng
nghiệm thu chính thức giữ nguyên.

SHA-256 của wheel Remote r6 là
`a27f22cdffefd6f91d9102b82fa40d2749a939762a6d294a6d3cabcf25746a09`.
SHA-256 của manifest chỉ thay Remote là
`f04a0ca11c95ac79527a1dc799b6ed1c7fc219018ca904d6137d029e4c2157c5`.
Danh sách tệp API đã cài và cả 77 mục có hash trong `RECORD` đều khớp.
SHA-256 của phép so sánh thuận và đảo lần lượt là
`48a3b053d595f5f5a7ffe7474153636688fd1efdc4591d418de7da623e3eaeb0`
và `2647a8519eb963f984e1c8fa1c2c12ff6e77108f032acb99b20e57666a1f91f7`.

Kiểm tra smoke và rollback chính thức **PASS**. Nghiệm thu tải dịch vụ
r6 **FAIL**: SQLite đạt 25/29 ngưỡng cố định, 17/29 ngưỡng đối chứng
và 15/29 tổng hợp; PostgreSQL đạt 29/29 ngưỡng cố định và 14/29
đối chứng/tổng hợp. Mỗi cơ sở dữ liệu hoàn tất đúng ba cặp cửa sổ,
200 job đo mỗi bên mỗi cửa sổ; cả 1.200 capture mỗi cơ sở dữ liệu
đều khớp. SHA-256 manifest ghép r6/QPC là
`60b40c21c5bdaf78b4a7ef6e99d7203680feb461f37ce3743824b3b1aa8303d4`.
Lệnh dùng Python đối chứng đã ghim:
`-B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp <owned>/pytest-tmp tests/integration/native_hardware_gate_cases.py`,
với manifest và Python ứng viên r6 do controller PostgreSQL của phiên
chọn. Pytest ghi nhận hai ca đạt và hai ca lỗi trong 1.683,35 giây.
Các pha controller: chuẩn bị/initdb 10,759 giây, khởi động dịch vụ
0,662 giây, tiến trình kiểm thử 1.685,432 giây và dọn dẹp 1,041 giây.
Dịch vụ PostgreSQL của phiên đã dừng thành công.

Bằng chứng được giữ trong thư mục đã cấp phát `cirnet-aVTc6V`:
`native-hardware-services/sqlite-116243b649e4449f98f1cf90c9e702b0/gate-load-summary.json`
(SHA-256 `861b6d66c958cf123c1dd5856ac29bb6c131b7d17d022d4752cf161d598b6b17`),
`native-hardware-services/postgresql-7289655c93384fae9cd881b903f9b015/gate-load-summary.json`
(`4fdb68c5ff06f863c26c230fc018776509ef655f66ac67d07803a5e9784fc405`)
và `gate3-r6-pg-d402d4aa1593438c8845720a7df011f3/controller.json`
(`c2af670d1aeb6cea52199e67a45985f9f53a8201b72bb6a4d69bb69245349dda`).

Ứng viên r6 gộp khóa bị loại; phần mã và test thay đổi được lưu trữ
trước khi khôi phục transition r4. Cải thiện thông lượng trong phép
đo ngắn không dự báo được độ trễ API đủ tốt. Cửa sổ đối chứng SQLite
dao động 48,92–93,34 giây, ứng viên 40,66–86,30 giây. Số liệu xác nhận
dao động lớn nhưng chưa xác định nguyên nhân. Các snapshot theo dõi
tiến trình không đầy đủ không đủ căn cứ kết luận tải CPU nền.
Không công bố tiết kiệm thời gian kiểm thử từ lượt chạy này.

Thử nghiệm r7 tiếp theo chỉ đổi cách đọc `experiment_snapshot` sau
commit trên PostgreSQL. Mọi lượt `get_experiment` dùng cho điều khiển
và quyền truy cập vẫn giữ khóa. Đã loại phương án bỏ khóa rộng:
Stop được cấp quyền theo chủ cũ khi claim chưa commit có thể sửa
thí nghiệm của chủ mới sau commit. Các kiểm tra r7 bắt buộc gồm
claim commit/rollback, chủ và payload mới, từ chối Stop của chủ cũ,
và thu hồi phiên trước khi giao sự kiện.
Thử nghiệm đồng bộ bốn Start mà người dùng đã cho phép được đánh giá
riêng; phải chứng minh tính tương đương và an toàn trước khi dùng
nghiệm thu chính thức. Stop tự nhiên đầy đủ và HIL vẫn **NOT RUN**.
Gate 3 vẫn **FAIL/chưa đóng**, Gate 4 **NOT RUN**, mặc định giữ nguyên.

### Snapshot sau commit của Gate 3 r7

Bản Remote r7 dùng lại transition của r4. Chỉ
`Repository.experiment_snapshot` sau commit dùng câu lệnh PostgreSQL
thông thường ngoài khóa Repository. Chủ sở hữu và payload lấy từ
cùng bản ghi đã commit. SQLite và mọi lượt `get_experiment` dùng
phạm vi khóa cũ. Hai ca đồng thời tái hiện việc chờ khóa trên r4.
R7 đạt **23/23** ca PostgreSQL thật trong 25,63 giây và **115/115**
ca SQLite/API trong 78,51 giây. Các ca PostgreSQL mới kiểm tra
snapshot khi đang ghi bản ghi khác, khi chuyển quyền, khi commit
hoặc rollback payload, từ chối Stop của chủ cũ mà không sửa trạng
thái, thu hồi phiên xem và nhận đúng chủ đã commit giữa bước lưu
transition và phát sự kiện.

Lượt so sánh ngắn thuận dùng cùng Rust Hardware và worker C++,
schema PostgreSQL riêng và bộ lấy mẫu tài nguyên của gate. Mỗi
bên xác minh 24 capture đo và bốn capture khởi động theo hash đã
ghim. Trong 29 chỉ số, **23 cải thiện** và **25 nằm trong khoảng đối
chứng dùng để mô tả**. Thông lượng tăng từ 1,227 lên 1,353 job/giây
và CPU/job giảm từ 0,775 xuống 0,674 giây. p95/p99 active giảm từ
142,922/182,615 xuống 129,050/152,272 ms, history giảm từ
307,075/380,140 xuống 281,798/327,517 ms. Cả hai phân vị của
projects và stations đều giảm. Capture AND giảm từ 229,910 xuống
180,882 ms và capture CLOCK tăng từ 127,884 lên 131,540 ms.
Bốn chỉ số vượt khoảng là p95/p99 của CLOCK run và poll. Mỗi nhóm
run hoặc capture có 12 mẫu nên cả hai phân vị cùng lấy giá trị lớn nhất.

Biên nhận đủ 29 chỉ số là `gate3-r7-event-pg-receipts/c202f6e5834f4f86aed162a056feb76f/comparison-29-metrics.json`
trong thư mục phiên ngoài repo, SHA-256
`d4a68e7caf4a72bcf7cca7e9dfac8cbda035e4cfd018f6a31dfa6dfe6662704f`.
SHA-256 của wheel Remote và manifest ứng viên lần lượt là
`7be54ff8af31dccfae519d29378e11b9ce7d5006294b58ac909309bab1d4bbc8`
và `04a9016d135f4c203b0791ab3b8fca2c6b169636eeb74b836a19aba23c6f37d7`.
Danh sách tệp đã cài và cả 77 mục có hash trong `RECORD` đều khớp.
Cửa sổ r4 mất 19,57 giây, so với 6–10 giây ở các phép so sánh ngắn
trước. Lượt đảo thứ tự không tạo được cặp hợp lệ. Bộ lấy mẫu tài
nguyên nghiêm ngặt phát hiện hai lần danh sách tiến trình thay đổi
trong nhánh r4. Lỗi ghi PID của hai dịch vụ cha nhưng thiếu danh
tính tiến trình con thay đổi. Cả hai nhánh đều ghi nhận 28 job hoàn
tất, gồm khởi động, và tất cả capture lưu lại khớp hash tham chiếu.
SHA-256 của bản tóm tắt một phần từ log ứng dụng là
`f5d4b2b2e582e25bd4fba17fe3ee140dd6b0e3f3f5ac01c74b65ddd99d403042`.
Biên nhận này chỉ chứa dữ liệu ứng dụng, còn thiếu profile client
và tài nguyên đối chứng. Nghiệm thu tải chính thức của r7 vẫn
**NOT RUN**.

### Thời gian xác minh thư mục kiểm thử Gate 3

Adapter Remote chuyển context được cung cấp hoặc kế thừa trực tiếp đến
bridge `cirnet-artifact-paths` 1.0.0a1 đã ghim. Node vẫn kiểm tra các Git
root, đường dẫn đích chuẩn hóa, symlink và marker quyền sở hữu phiên.
Các đường phát hiện context từ checkout và dọn dẹp giữ quy trình hiện có.
[Mã nguồn adapter](../../../scripts/artifact_paths.py)

Một cặp đo trực tiếp trên Windows x64 ghi thời gian `_owned_directory`
sau khi nạp module, dùng cùng thư mục thuộc phiên và cùng context kế thừa
có sáu Git root. Số lượt gọi Node CLI giảm từ năm còn ba và thời gian
giảm từ 11,755 xuống 9,223 giây, tương đương 2,532 giây hay 21,5%. Phạm vi
đo gồm xác minh thư mục và xác định phiên. Mức giảm thời gian khởi động
dịch vụ và tổng thời gian gate vẫn cần được đo riêng.

Ca hồi quy đếm lệnh phát hiện năm lượt gọi trước khi sửa. Cả năm ca
kiểm tra adapter đều PASS qua hai lượt chạy. Lượt đầu đạt bốn ca và
sandbox Windows chặn tạo junction cho ca còn lại. Lượt chạy lại riêng
ca junction đạt PASS. Phạm vi gồm hai tiền tố biến môi trường, context
được cung cấp và kế thừa, JSON context sai, sai chủ sở hữu, phiên không
có chủ sở hữu, Git root ngoài phạm vi và junction thoát đường dẫn.
[Ca kiểm tra adapter](../../../tests/test_artifact_paths.py)

SHA-256 của entrypoint Node đã ghim là
`742ef11f9083beaf901d0d4f9a5a777d87aeae71a990597f9640a1b3a9329b5a`.
SHA-256 của hai biên nhận ngoài repo `timing-before.json` và
`timing-after.json` lần lượt là
`a6d737543ff0fed2f22cc4eb0ce0e36995f29ecfd4ce2a30ebee4cf8be34780f`
và `eecac21c24442fdee64b66e787d76ebf189262c9d6d98ad1763e9d7cb3cbe722`.

### Run/Stop có khóa idempotency và kết quả PostgreSQL Gate 3 r8

Với Run hoặc Stop có khóa mới, r8 kiểm tra chủ sở hữu qua Repository
có khóa trước khi tra operation. Operation đã tồn tại vẫn lấy payload
công khai mới, gồm vị trí hàng đợi, khi replay hoặc phục hồi. Hai ca hồi
quy ghi nhận ý định khi manager đang giữ khóa thất bại trên r7 và đạt
trên r8. Ứng viên đạt **130/130** ca SQLite/API và **24/24** ca PostgreSQL
thật, gồm chuyển quyền khách với Stop có và không có khóa idempotency.
Đúng tổ hợp r8-R2 đạt ba ca Remote về lease, quarantine, disconnect và
smoke trình duyệt Interface đã phát hành ở cả hai bên.

SHA-256 của wheel Remote r8 là
`0e3280dc41d81e1b00b4ee7a5e35a3646b06b32276181000ee874b43e113bd01`.
SHA-256 của đúng manifest r8-R2 là
`ebc49c57c052e0a78c98074af240c78010f787872a4ad32ac23617ada1fc15bd`.
Lượt PostgreSQL ngắn 24 job đo mỗi bên nằm trong 26/29 ngưỡng cố định,
26/29 ngưỡng đối chứng và 23/29 tổng hợp khi dùng để mô tả. Cả tám
p95/p99 của route đọc đều giảm, thông lượng tăng từ 2,765 lên 3,701
job/giây. SHA-256 biên nhận ngắn là
`2043229644d88fe38001f101a4130fa8a8c416e5dc9142b00d661429ea956b95`.

Gate tải dịch vụ PostgreSQL chính thức **FAIL** trên cùng manifest.
Ba cặp đều hoàn thành 200 job mỗi bên, với 1.200 capture đo khớp
hash đã ghim. Kết quả là **25/29 ngưỡng cố định, 4/29 ngưỡng đối
chứng và 4/29 tổng hợp**. Bốn chỉ số tổng hợp đạt là RAM đỉnh,
p95/p99 của AND Run và p95 của CLOCK Run. Các ngưỡng cố định vượt
gồm p95/p99 của capture AND ở 97,082 và 157,097 ms so với 92,557 và
153,366 ms, p99 tạo CLOCK ở 363,643 ms so với 353,771 ms và p99
history ở 355,203 ms so với 321,567 ms. p95/p99 history đối chứng tăng
từ 104,241/118,055 lên 295,570/355,203 ms. Pytest đã ghim chạy trong
789,32 giây và cụm PostgreSQL của phiên đã dừng thành công.

| Cửa sổ | Tải (giây) | Yêu cầu cố định | Poll | CPU ms/yêu cầu | CPU giây/job |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 | 51,100 | 1.000 | 1.798 | 17,211 | 0,2408 |
| C1 | 57,289 | 1.000 | 1.815 | 18,933 | 0,2665 |
| C2 | 104,110 | 1.000 | 2.558 | 25,567 | 0,4548 |
| B2 | 36,093 | 1.000 | 1.489 | 14,263 | 0,1775 |
| B3 | 119,385 | 1.000 | 3.004 | 25,186 | 0,5042 |
| C3 | 51,890 | 1.000 | 1.670 | 18,493 | 0,2469 |

Số poll và CPU trên mỗi yêu cầu cùng làm CPU/job tăng ở cửa sổ
chậm của cả hai bên. Từ B2 đến B3, số yêu cầu/job tăng 1,61 lần và
CPU/yêu cầu tăng 1,77 lần. Từ C3 đến C2, hai hệ số lần lượt là 1,33
và 1,38. CPU đo gồm API, Hardware và tiến trình con, trong đó có
công việc của scheduler. Phép đo không bao gồm tiến trình PostgreSQL
riêng hoặc hoạt động khác trên máy. Profile thiếu dấu thời gian từng
yêu cầu và thời lượng trong log ứng dụng không có đồng hồ tuyệt đối
chung. Khi yêu cầu cuối trong 400 yêu cầu đọc của mỗi nhánh hoàn tất,
log đã ghi tám capture hoàn thành, gồm bốn capture khởi động. Trung vị
p95 history trong log ứng dụng tăng từ 98,775 lên 247,712 ms, cho thấy
chênh lệch đuôi đã có ngay ở pha đầu. Giữa yêu cầu đọc hoàn tất đầu
và cuối, log ghi 71–72 transition đo ở B và 85–95 ở C. Log chưa phân
biệt được tải xen kẽ nhiều hơn hay cửa sổ đọc kéo dài hơn. Lượt ngắn
có 19,67 yêu cầu cố định/job, so với 5,00 ở lượt đầy đủ.

Bản tóm tắt chính thức `native-hardware-services/postgresql-cc20821c896941ebb7636809665369ff/gate-load-summary.json`
có SHA-256 `51fa434b570b1c8721d4ce7f6196c0e9e428ae5883e594abf17dab7b204693e6`.
Biên nhận controller `gate3-r8-formal-pg-86708c85164c418bb8457b02d3baae9a/controller.json`
có SHA-256 `5e6b41d36f6dbb499343a4b97de8cb8a7739f87abfaa697b4f3902c146382baf`.
SHA-256 của đúng harness tải dịch vụ là
`0a4af0a2daabb8ab3554b59e2fa14e0a403124ae77cf91727c2c1e6fbd182850`.
Tại mốc đó Gate 3 còn mở. SQLite và Stop dưới tải chính thức trên r8 ở
trạng thái **NOT RUN**.

### Phương pháp đồng bộ Start đã được chấp thuận cho Gate 3

Người dùng đã cho phép dùng `natural-loaded-stop-hardware-rendezvous-v1`
để nghiệm thu Stop sau khi xem kết quả chẩn đoán riêng. Chọn rõ bằng
`CIRNET_NATIVE_STAGE3_STOP_METHOD=natural-loaded-stop-hardware-rendezvous-v1`.
Khi không đặt biến, mặc định vẫn là phương pháp đồng bộ tại Remote cũ.
Đây là thay đổi phương pháp có ghi nhận, không phải kết luận phân bố
độ trễ trước/sau tương đương. Worker không bị tạm dừng. Điểm đồng bộ
bổ sung tại handler Hardware ràng buộc đúng bốn ID thí nghiệm với
cùng mốc nhả QPC trên cả Python B và Rust; hàng rào tạo ticket tại
Remote vẫn giữ. Hủy, thiếu/trùng/sai thành viên và quá hạn đều hủy
nhóm trước khi tác động lên station.

Phê duyệt ban đầu yêu cầu ba cặp cửa sổ theo thứ tự đảo, 100 mẫu hợp
lệ mỗi bên mỗi cửa sổ, tối đa 403 lần thử mỗi cửa sổ và cả sáu
ngưỡng p95/p99 cố định/110% của B. [Phạm vi Windows hiện hành](#chính-sách-nghiệm-thu-gate-3-theo-môi-trường)
giữ phương pháp, số mẫu, giới hạn lần thử và sáu trần tuyệt đối. Vẫn
phải chứng minh request frame
đầy đủ và chưa ghi reply tại lúc Stop thực sự tới Hardware, worker
thoát trước ACK an toàn, thu hồi lease bền vững, quarantine và chặn
kết quả cũ. Khi thiếu mẫu, biên bản ghi **FAIL** và các cửa sổ còn lại
**NOT RUN**, không để phép so sánh rỗng suy ra PASS.
SHA-256 harness cuối là
`519b2b6231a19d7a513b24c7dd96ce632ffa1ff40b0d5e0f8026914a76dbbd4f`.
SHA-256 binary Rust R2 chính xác là
`22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6`.
Binary đạt 25 ca lifecycle; r8-R2 đạt ba ca an toàn Remote.
Bộ kiểm tra biên bản/bằng chứng đạt 22 ca không cần dịch vụ.

Lượt chẩn đoán không tạm dừng worker có B đạt 8/10 và C đạt 8/8
lần thử, so với B 3/35 và C 8/8 trước đó. Sáu so sánh ngắn đều trong
ngưỡng, nhưng tám mẫu chưa xác minh được độ trễ đuôi chính thức.
Thời gian 199,80 so với 180,96 giây dùng số mẫu hợp lệ và warmup
khác nhau, không chứng minh tiết kiệm thời gian. SHA-256 biên bản là
`001033e2476c81f65aae46fdb754f38203d8e91a717c8e299a514499b6aac712`.
Tại mốc đó Stop đồng bộ chính thức ở trạng thái **NOT RUN** do nghiệm
thu dịch vụ chưa đạt. Xem [lượt Windows chính thức đã hoàn tất](#gate-3-stop-dưới-tải-chính-thức-trên-windows).

Log PostgreSQL r8 cũng ghi checkpoint theo thời gian trùng các cửa sổ
chậm C2 và B3: 23:56:24–23:57:04 ngày 06/11/2026 và
00:01:24–00:02:31 ngày 07/11/2026, UTC+07. Việc căn thời gian là xấp
xỉ, dựa trên thời gian tệp profile và thời lượng dọn dẹp/bài đo đã ghi.
Pha sync của checkpoint là 0,674/0,439 giây; tổng 39,770/67,281 giây
gồm cả ghi có điều tiết. Tương quan này chưa chứng minh checkpoint
gây chậm; C1/C3 cũng trượt ngưỡng đọc. Lượt chẩn đoán tiếp theo bổ sung
dấu thời gian chung và theo dõi CPU có giới hạn; chưa đổi độ bền dữ
liệu, cấu hình checkpoint hay tiêu chí gate.


## 4. Remote Rust

- [x] **Thay theo nhóm route.** Remote giữ topology, auth và orchestration hiện tại. Port route đọc và preview trước, rồi `services/auth.py`, `websocket/events.py`, persistence và cuối cùng command/idempotency/`services/experiments.py`. So exact OpenAPI handoff, HTTP/error/cookie/CSRF/origin, WebSocket hello/sequence/resync/đóng kết nối, owner/control client và disconnect. Chỉ chạy shadow các route thực sự không có tác dụng phụ trên bản sao dữ liệu. Thử bootstrap phiên và kết nối WebSocket điều khiển trong môi trường riêng vì chúng có thể đổi phiên hoặc hủy job.
- [x] **Dữ liệu và quyền điều khiển.** Port schema và migrations của Remote bằng migration native, chạy đối chiếu SQLite và PostgreSQL thực với dữ liệu cũ, CAS revision, login/ownership và capture. Diễn tập `pg_dump`/`pg_restore` cùng backup capture và kiểm hash, giữ idempotency và quarantine. Giữ endpoint điều khiển Hardware ngoài tầm truy cập của scheduler shadow. Rút quyền scheduler cũ và xác nhận tiến trình đã dừng, kiểm tra hàng đợi phục hồi trước khi cấp quyền cho ứng viên. Test hai tiến trình tranh quyền, hàng đợi còn lệnh và mất kết nối giữa cutover.
- [x] **Ma trận và Gate 4 Windows.** So Remote Python → Hardware Rust → C++ với Interface hiện tại → Remote Rust → Hardware Rust → C++ theo nhóm route. Giữ `scripts/export_openapi.py --check` cho đối chứng Python và so OpenAPI native với cùng handoff và bảng operation. Giữ assertion auth, ownership, operation identity, WebSocket và PostgreSQL qua giao diện công khai hoặc component native có phạm vi xác định. Giữ E2E Interface và Playwright Python. Áp dụng [chính sách theo môi trường](#chính-sách-nghiệm-thu-gate-4-theo-môi-trường) cho hiệu năng thông thường và Stop dưới tải. Rollback rút quyền scheduler ứng viên, phục hồi đúng cặp database/capture khi cần, rồi xác minh quyền và quarantine trước khi nối lại Python. Nghiệm thu Windows không cho phép đổi mặc định hoặc bản phát hành.
- [ ] **Production Linux/Xeon và HIL áp dụng.** Chạy tải đầy đủ và ma trận Stop đầy đủ sau khi dự án ổn định, có máy đích, đã chốt ngưỡng production và xác minh an toàn Linux. Chạy HIL thật trước khi nghiệm thu capability điều khiển phần cứng thật được công bố. Giữ nghiệm thu production/release NOT RUN đến khi mọi yêu cầu áp dụng đều đạt.

### Chính sách nghiệm thu Gate 4 theo môi trường

Chính sách được người dùng phê duyệt này thay thế phạm vi nghiệm thu
giai đoạn 4 trước đó. Thay đổi nằm ở cách sử dụng số đo, không sửa kết quả
lịch sử, artifact, digest hoặc yêu cầu an toàn. Các mốc bên dưới giữ
quyết định và PASS/FAIL/NOT RUN theo chính sách tại thời điểm ghi nhận.

Windows x64 / Intel Core i5 là máy nghiệm thu phát triển. **Gate 4 Windows**
yêu cầu bằng chứng chức năng, tương thích và an toàn cho tổ hợp Remote,
Hardware, Simulator và Contracts đã xác định. Phạm vi bắt buộc gồm
REST/OpenAPI, Interface, WebSocket và NCAP; SQLite và PostgreSQL thật,
dữ liệu cũ, migration tường minh và rollback; auth, ownership, session,
idempotency và quyền scheduler; Run/Stop, mất kết nối, worker treo/chết,
ACK thiếu/muộn, thu hồi worker, chặn kết quả cũ, lease và quarantine.
Chỉ dùng lại khi đã xác minh artifact hoặc đầu vào component biên dịch
không đổi, cấu hình, fixture và phạm vi assertion; kết quả executable cũ
vẫn gắn với executable đó. Thiếu bằng chứng hoặc bằng chứng không hợp lệ
thì yêu cầu tương ứng vẫn FAIL hoặc NOT RUN.

CPU/RAM, throughput, độ trễ API/database thông thường và so sánh tương đối
với Python trên Windows là **chẩn đoán**, không chặn gate. Bài tải đầy đủ
và ma trận Stop đồng bộ **ba cặp luân phiên × 100 mẫu hợp lệ mỗi bên**,
giữ trần 403 lần thử mỗi cửa sổ, chuyển sang nghiệm thu Linux/Xeon.
Không cần chạy lại tải Windows để vượt ngưỡng hiệu năng cũ. Lỗi chức năng
hoặc an toàn phát hiện trong bất kỳ bài chẩn đoán nào vẫn phải xử lý.

Mọi bất biến và deadline an toàn đã phê duyệt vẫn bắt buộc trên Windows.
Bằng chứng Stop phải chứng minh đúng tiền điều kiện, gồm worker còn hoạt
động tại thời điểm Hardware nhận Stop nếu ca kiểm tra tuyên bố có tải
đang chạy, thu hồi worker trước safe ACK và xác lập trạng thái an toàn
trước khi ghi giải phóng lease. ACK dọn dẹp cuối cần cho giải phóng lease bị thiếu hoặc không chắc chắn
phải giữ hạn chế quyền và quarantine; thiếu ACK của lệnh Stop ban đầu vẫn
có thể được xử lý bằng lượt dọn dẹp độc lập đã xác nhận an toàn. Kết quả
muộn không được công bố capture
hoặc khôi phục generation cũ. Các trần an toàn Stop được giữ nguyên,
đơn vị ms: HTTP p95/p99 197.55406000000002 / 581.1564, ACK thô
139.20478000000003 / 526.7117900000001, giải phóng lease đã commit
2534.55686 / 2598.3746800000004. Mẫu ngắn không phải ước lượng percentile
production. Giữ deadline của từng thao tác và hành vi đóng an toàn khi
không xác minh được; không đổi các giới hạn an toàn này thành độ trễ
tham khảo thông thường.

Trước nghiệm thu production, dự án phải ổn định và có máy Linux/Xeon thật.
Ghim đối chứng và ứng viên trên **cùng máy**, cùng database, phiên bản
phụ thuộc, workload và điều kiện đo. Ghi CPU/lõi, RAM, Linux/kernel,
filesystem, phiên bản/cấu hình/độ bền database, tùy chọn build, digest
artifact/model và harness, warmup, tải nền, thời gian từng pha và phạm vi
tài nguyên tiến trình. Chốt workload, số mẫu, phương pháp và ngưỡng hiệu
năng production trước lượt nghiệm thu đầu tiên. Thiết kế tải đầy đủ và
Stop ba cặp hiện tại là kế hoạch ban đầu; mọi thay đổi phải được quyết
định tường minh trước khi đo. Ngưỡng hiệu năng production là **TBD trước
nghiệm thu**, không chuyển từ số đo tuyệt đối Windows. Xác minh lại Stop,
deadline, hủy/thu hồi worker, kết quả muộn, quyền scheduler và lease/
quarantine trên Linux. Các probe và helper tiến trình chỉ hỗ trợ Windows
hiện tại phải được chuyển đổi và kiểm thử trước khi dùng trên Linux.

Báo riêng **Gate 4 Windows**, **hiệu năng và Stop dưới tải đầy đủ
Linux/Xeon**, và **HIL**. Linux/Xeon và HIL giữ NOT RUN cho đến khi thực
sự kiểm tra các yêu cầu tương ứng. Nghiệm thu production/release chờ
Linux/Xeon và HIL phù hợp nếu công bố khả năng điều khiển phần cứng thật.
Capability phần cứng chưa khả dụng vẫn không khả dụng. Windows PASS
không chọn bản phát hành hoặc đổi traffic mặc định. Giữ thay đổi
giai đoạn 4 trong worktree để review; cập nhật chính sách này không
cho phép commit, merge hoặc xóa branch/worktree.

### Nhóm đọc và preview đầu tiên của Giai đoạn 4

Giai đoạn 3 đã được commit và merge fast-forward cục bộ vào `master`
của cả hai repo: Hardware `3ad140f24ae5f3f2e6b735b5cff4beec7bffda54`
và Remote `3cc5063df984c73f05d50979a7b50dbc853323a9`. Hai branch
Giai đoạn 3 cùng worktree trên ổ E: đã được dọn sau kiểm tra sau merge.
Lịch sử commit và mọi biên nhận đã chọn vẫn được giữ. Worktree Hardware
detached, sạch do ứng dụng quản lý còn được giữ vì công cụ archive báo
một tác vụ khác đang sử dụng. Không cưỡng bức xóa nội dung của worktree này.

Giai đoạn 4 tiếp tục trên `codex/native-remote-stage4`. Binary native
Windows debug đầu tiên triển khai bảy operation HTTP: health, danh sách
và chi tiết project, cùng validation/preview v1 và v2. Đối chiếu tiến trình
thật với đúng Python r8 và Hardware R2 đạt 19 quan sát mỗi bên trong
26,89 giây. Các ca gồm phân trang, quyền sở hữu, phiên thiếu/bị thu hồi,
ưu tiên cookie/CSRF hiện tại và legacy, cùng preview thật. Bản sao SQLite
của native giữ nguyên từng byte và thư mục capture không phát sinh tệp.
Đây là bằng chứng chức năng cho các quan sát đó, chưa phải bằng chứng
hiệu năng hoặc bao phủ đầy đủ đầu vào lỗi.

| Artifact hoặc biên nhận nhóm đầu tiên | SHA-256 |
| --- | --- |
| Binary native Windows debug | `426073ff0f98fe076f49f555da7d09217fc340c8936906846524767bfb502eb4` |
| Harness HTTP | `0146109ea1dfeb5279733fc3494d1f05e388170476f048acd8b82ad008c58c6f` |
| `native-remote-http/7cca71c236be4ba08cd3b813e2785769/comparison.json` | `66307313fec415a2b083c8ae5544889e9efddeadaca3f37adc77a16121433d83` |

Adapter đọc SQLite/PostgreSQL có kiểu dữ liệu rõ ràng cũng đạt các ca
dữ liệu cũ và chỉ đọc. Lệnh ghi thật qua kết nối chỉ đọc bị từ chối.
SQLite chỉ dùng bản sao nhất quán đã đóng, truy cập immutable và từ chối
sidecar còn dữ liệu; không dùng chế độ này để shadow database đang thay
đổi trực tiếp. PostgreSQL dùng kết nối chỉ đọc và MVCC. Kiểm thử dùng
session `cirnet-4PiLwh` do DEV cấp cho Giai đoạn 4; bằng chứng Giai đoạn 3
vẫn nằm trong session ban đầu.

Đường ghi xác thực, migration native, WebSocket và tích hợp lệnh/scheduler
đang triển khai. 56 operation HTTP còn lại, đối chiếu OpenAPI runtime đầy
đủ, ma trận database/cutover/rollback và Gate 4 đầy đủ đều **NOT RUN**.
Thông báo chi tiết cho đầu vào v2 lỗi ngoài fixture đã chọn vẫn cần bằng
chứng tương thích. Chưa đổi traffic mặc định hoặc manifest phát hành;
nghiệm thu production Linux/Xeon vẫn **NOT RUN**.


### Mốc dữ liệu và giao thức native giai đoạn 4

Giai đoạn 4 chưa commit trên codex/native-remote-stage4, từ Remote
3cc5063df984c73f05d50979a7b50dbc853323a9. Mốc này ghi bằng chứng component
và từng nhóm route, chưa phải nghiệm thu Gate 4.

Migration native đạt 16 tình huống dữ liệu tạm trong ba test: SQLite mới
và chưa có phiên bản, cả bảy revision cũ, năm trường hợp từ chối nguyên tử,
cùng PostgreSQL cũ/capture trùng. Đối chiếu Python r8 độc lập cho thấy 56
đối tượng catalog SQLite sau chuẩn hóa bằng nhau và dump schema PostgreSQL
khớp byte (SHA-256
ba9232944070c88777670be368c47c2c4090987a93fa6bc5aef767bd7e496572).
Cả hai engine giữ năm bảng cũ và 107 chuỗi payload experiment gốc mỗi engine;
ownership, lịch sử assignment, tiếp nhận capture đã đóng và dữ liệu lập
lịch đều khớp. CLI --migrate tường minh đạt kiểm tra tạo mới và chạy lặp
không đổi; khởi động không tự migrate.

Component auth PASS trên SQLite và PostgreSQL thật, gồm hash Argon2 Python,
đổi token opaque, thu hồi phiên, bằng chứng legacy, chuyển ownership khách,
vai trò và bảo vệ admin cuối cùng. Các test dịch vụ chưa chứng minh callback
HTTP hoặc hủy job đang chạy. Component project PASS CAS qua pool độc lập
và phiên khác nhau trên cả hai engine, snapshot bất biến, cách ly owner,
từ chối phiên thu hồi và rollback nguyên tử khi một circuit con chạm giới
hạn revision. Bộ thư viện native thông thường đạt 26 test; 10 test cần môi
trường riêng bị ignore trong lượt đó, không được tính là PASS.

Bản debug đóng băng
3abbfd9ce1fa1fdd51299347a5bb9942d783e0ad97f8beedbd7fb011f223a3a0
đạt hai nhóm REST SQLite trong 57,48 giây pytest (58,62 giây gồm controller):
19/63 operation, với 19 quan sát đọc/preview và 26 quan sát tài liệu mỗi bên.
Nhóm tài liệu kiểm tra lỗi canonical, ownership, ETag, CAS và xóa mềm.
Chỉ ID mới cùng timestamp server được chuẩn hóa; timestamp được kiểm tra
giới hạn riêng và thời điểm tạo phải bằng nhau. SHA-256 biên bản project:
46aa355e16738b4734046b807d8077b0cde02a2a5c4517f4eb6bdfeb9f198ab9;
biên bản đọc/preview:
cbdf12ea6e8c6ae46a561f75643d398b3ea6c9c0d27f788d5eb38bea6145ce56.
Các ứng viên và biên bản trước vẫn được giữ làm bằng chứng lịch sử.
Ghi tài liệu cần chọn rõ CIRNET_REMOTE_READ_ONLY=false; mặc định vẫn chỉ
đọc. Tám test biên HTTP đã PASS.

EventHub đạt bốn test hàng đợi/dọn subscription. Fixture WebSocket native
độc lập đạt bốn test và khớp mười hai kết quả wire Python thật, gồm frame
sai, UTF-8, frame quá lớn, giới hạn tần suất, từ chối phiên và dọn controller
cuối cùng. Chưa nối fixture với manager experiment thật của ứng dụng;
không suy ra an toàn disconnect/Stop dưới tải từ kết quả component.

Đã tái hiện và sửa phần thiếu kiểm tra mounting vật lý trong preview đầu.
API Contracts đã ghim chưa công khai validator vật lý độc lập. Hàm tương
thích nhỏ gọi validator assignment công khai sẵn có với trường bao cố định
hợp lệ, không sao chép quy tắc hình học hoặc đổi pin phụ thuộc. Ba trường
hợp thiết kế vật lý đã ghim đều PASS. Bổ sung API producer để bỏ phụ thuộc
cấu trúc bao là việc tiếp theo.

Bằng chứng thô được giữ trong phiên DEV cirnet-4PiLwh: project-http-paired,
native-remote-projects/7e32b73bdd7049aca31ba4e1736ebc7d,
native-remote-http/a0101eb3e898420d9bf5743fb78fda6e,
project-cas-safety, stage4-db-compatibility/migration-audit và
events-websocket. Đối chiếu đầy đủ OpenAPI/63 operation, tích hợp
scheduler/control thật, Stop dưới tải, diễn tập cutover/restore/hai
scheduler và E2E Interface đều **NOT RUN**. Gate 4 **NOT RUN**. Luồng mặc
định, lựa chọn release và nghiệm thu production Linux/Xeon còn thiếu
không thay đổi.

### Mốc bài thực hành, compiler và điều khiển giai đoạn 4

Mốc này cập nhật danh mục triển khai hiện tại; các artifact và kết quả cũ
vẫn được giữ nguyên. Toàn bộ Gate 4 vẫn **NOT RUN**.

Ứng viên Windows debug đã đóng băng
`029b8c20574de6bb8bf64c604f187437df821302c332f0a21d2b9097f4c13d06`
PASS 43 quan sát cho 16 API bài thực hành và 26 quan sát cho 12 API ghi tài liệu,
so với đúng Python r8. Hai suite đối chứng mất 53,04 giây (54,20 giây tính cả
controller). Biên bản:
`native-remote-assignments/1838e04358ef4afe898f6fbbcb5ca39c/comparison.json`
(SHA-256 `2dec73fdf46e032c431c7034fa0a0250d443933bed24c9f00c5f1a31eeefaa1b`)
và `native-remote-projects/8ca55f282c3f4f51a4a16aa569dfda4d/comparison.json`
(SHA-256 `c936b51398df84cb5c89d12a427d1ca8a4372b3a27e662b297cd1e76362c2cd5`).
Kiểm tra HTTP dùng SQLite cách ly, bao phủ quyền giảng viên/sinh viên/admin,
bản công bố cố định so với bản nháp sửa tiếp, xung đột phiên bản và số phiên bản
dạng thực nguyên. Bảy API đọc/preview trước đó giữ biên bản ứng viên riêng;
đây chưa phải nghiệm thu đồng thời trên artifact cuối.

Kiểm thử hồi quy số học đã tái hiện lỗi ghi project trên SQLite và PostgreSQL
và 14 sai khác compiler trong oracle Python gồm 22 ca. Chuyển đổi số nguyên
có giới hạn nay chấp nhận token số thực nguyên hợp lệ mà không làm tròn token
số nguyên lớn. So sánh ngưỡng generator giữ thứ tự chính xác giữa số nguyên và
binary64; cấp phát endpoint vốn bắt buộc token số nguyên vẫn giữ yêu cầu đó.
Hồi quy số học project và bài thực hành đều PASS trên hai engine. Compiler
PASS corpus 173 ca ban đầu và corpus số học 22 ca riêng. Cần chạy gộp lại trên
source cuối sau các thay đổi compiler.

Kiểm tra topology bổ sung giữ thứ tự pin và giới hạn tìm kiếm. Mười tiến trình
Python mới xuất hai thứ tự của cùng chẩn đoán `shorted_nets` (6/4); chỉ danh sách
chẩn đoán đã chứng minh không có thứ tự này được so bằng đa tập. Không nới lỏng
thứ tự sự kiện, tín hiệu, timestamp, capture hoặc an toàn. Bằng chứng:
`topology-ordering/91f7cbee658e4e6f949ed6ff709b169e/ordering-summary.json`,
SHA-256 `4c864d66af4ee3587ad9067436a9d0a58a3b46a3d99daf1b79be5a9f89d0a2b0`.

Fixture HTTP auth native cách ly PASS bảy API với 25 quan sát và năm ca CORS
preflight (36,63 giây). Biên bản:
`native-remote-auth-http/cbe10a191da84e76bc0068e2877e3ec6/comparison.json`,
SHA-256 `66643ff73b3c95da60583c4ebc883da48a1df833976a05c189fbc4e948dbe009`.
Bộ nhận thu hồi chứng minh session đã bị thu hồi bền vững trước callback;
chưa chứng minh callback hủy của bộ điều phối production.

Kiểm thử repository runtime native PASS trên SQLite và PostgreSQL dùng dữ liệu
tạm riêng: đặt lease và CAS generation, tạo thí nghiệm và định danh thao tác
trong giao dịch, truy vấn lịch sử/quyền riêng tư và thu hồi capture. Kiểm thử
component manager với R2/C++ thật PASS Create → Run → NCAP đúng byte → giải phóng
lease an toàn; phục hồi khởi động lại giữ quarantine khi thiếu capability vật lý.
Lượt mở rộng PASS đọc capture, thu hồi, xóa lặp và xóa file payload. Khởi động
thực hiện dọn lease thực tế trước khi báo đích lưu capture bị chặn.

Rà soát độc lập xác định các điều kiện điều khiển bắt buộc còn mở: Stop công khai
phải kiểm tra session và chủ sở hữu hiện tại trong cùng giao dịch thay đổi trạng
thái; quyền điều phối độc quyền suốt vòng đời phải chặn tiến trình native thứ hai
thu hồi lease của tiến trình đang chạy; shutdown phải chờ các mutation đã nhận
dù HTTP đã ngắt trước khi nhả quyền đó. Đang sửa và bổ sung hồi quy xác định.
Tích hợp HTTP/WebSocket, tranh chấp điều khiển PostgreSQL, cạnh tranh bộ điều phối
và mất quyền, ma trận toàn bộ route/OpenAPI, Stop dưới tải, backup/restore/cutover/
rollback và browser E2E vẫn **NOT RUN**.

Mọi biên bản thô được giữ trong phiên DEV sở hữu `cirnet-4PiLwh`. Lịch sử và
bằng chứng giai đoạn 3 không đổi. Chưa công bố commit giai đoạn 4, chuyển lưu lượng
mặc định, chọn bản phát hành hoặc nghiệm thu production Linux/Xeon.

### Mốc tích hợp bản tối ưu giai đoạn 4

Mốc này cập nhật trạng thái triển khai ở trên, giữ nguyên artifact và kết quả
lịch sử. Giai đoạn 4 chưa commit. Gate 4 đầy đủ là **NOT RUN**; đây là mốc kiểm
tra tích hợp, chưa phải nghiệm thu release.

Ứng viên Windows tối ưu đầu tiên có SHA-256
`7bae8cdc0af803d7487c8b25df5b2333e5f43f242e87ea4d22cc837335ddce79`,
build bằng Rust 1.90.0 với `cargo build --release --locked --offline`
trong 134 giây. Biên bản build:
`native-remote-release/766f95f64741496e8f7f1cbabc2fa4ba/candidate.json`,
SHA-256 `43bcba4d0079b167ef699f68a912f7bf1621190efc3bd786eed695f4098ac4ce`.
Digest mã nguồn runtime được ghi riêng:
`1d1de69a6a7878de5b9810ccee71ae32b020a003f6de21a6ec7df9422f803787`.
Rà soát an toàn sau đó yêu cầu ứng viên mới; các kết quả dưới đây vẫn gắn
với đúng artifact nêu trên.

Đối chiếu HTTP thực tế đạt cả sáu nhóm route trên từng SQLite và PostgreSQL:
auth, project, assignment, experiment, đọc/preview và station. Hợp các nhóm
bao phủ đủ 63 operation ID chuẩn. Mỗi nhánh dùng Python r8 đã ghim, cùng Rust
Hardware R2, Contracts và worker C++, với database và tiến trình riêng.
Byte NCAP và thời điểm sự kiện số khớp; chỉ chuẩn hóa ID tài nguyên và đồng
hồ thực của máy chủ sau khi kiểm tra riêng các điều kiện tương ứng. HTTP
station kiểm tra cả hai chủ sở hữu với hàng đợi rỗng; quyền xem hàng đợi có
tải có bằng chứng component riêng. Hai runner đạt 6 test mỗi nhánh trong
191,88 và 202,77 giây, mỗi nhánh chủ động bỏ chọn sáu test của backend kia.
Lượt chức năng song song này không phải benchmark hiệu năng.
Biên bản tổng hợp: `final-http-sqlite/paired-summary.json`,
SHA-256 `a25b63b426025b6bbf6baa428ec0a91eabd88800b6f903b6fab8054ae0256ec0`.

Python `scripts/export_openapi.py --check` và export OpenAPI từ đúng binary
tối ưu đều đạt khi so với Contracts SHA-256
`dc39c874386eba2b58f8b5c631cbee0d63ded86cf287aea63f54e4a237ff8f08`.
Binary đăng ký đúng 63 operation duy nhất. CLI migration áp dụng bảy migration,
chạy lại không thay đổi và từ chối tự tạo database khi khởi động dịch vụ.
Kiểm tra Rust trên mã nguồn chốt đạt 43 test thư viện thông thường; 23 test
fixture bị ignore không được tính PASS. Các lượt chọn riêng đạt CLI,
173 ca compiler gốc, 22 ca số học, ba ca topology và 54 ca HTTP body.
Lệnh và kết quả thô nằm trong `final-native-checks` và `final-openapi`.

Các phát hiện trước về quyền Stop, quyền scheduler và tác vụ tách rời khi
shutdown đã có bằng chứng tập trung đạt. Stop công khai kiểm tra phiên và
chủ sở hữu hiện tại trong cùng transaction cập nhật. Quyền native giữ suốt
vòng đời chặn scheduler độc lập trên SQLite/PostgreSQL và từ chối tiếp tục
khi mất kết nối giữ khóa PostgreSQL. Cleanup giữ lease đến ACK an toàn cuối;
lỗi ghi nhận cleanup vào database chặn station. Test lỗi startup bao gồm cả
reservation đã commit và R2/C++ đã nhận Start: không READY, không capture cũ,
cleanup trước khi thoát.

Ứng viên tối ưu đạt diễn tập chuyển đổi và rollback PostgreSQL thực tế trong
65,30 giây. Diễn tập kiểm tra cả hai cặp backup database/capture, đóng endpoint
điều khiển cũ, từ chối tiến trình cạnh tranh trước READY, giữ danh tính operation
đang chờ, giữ hàng đợi dưới quarantine vật lý, mất đúng kết nối giữ advisory
lock, giữ lease khi ACK cuối chưa về, chặn capture từ Start về muộn và khôi
phục trước khi kết nối lại đúng Python r8. Biên bản:
`stage4-postgres-cutover/721efd638fe747caa082505aac2647fd/cutover-summary.json`,
SHA-256 `1c97f5bac090c0ebf064bed606a3c8b1cd0bb4794e03348477f56874aded9c8e`.
Lượt này dùng capability vật lý không khả dụng, không chứng minh HIL có cấp điện.

Rà soát sau lượt đo phát hiện thêm hai điểm cần kiểm chứng: panic ở monitor vẫn
phải chặn tiếp nhận và chờ cleanup; mất quyền scheduler trong bước xử lý cục bộ
sau capture phải chặn công bố kết quả. Đang bổ sung hồi quy xác định và sửa lỗi.
Các tranh chấp claim/quyền sở hữu PostgreSQL bổ sung, luồng trình duyệt, truyền
lỗi crash/timeout từ tiến trình con thực tế, so tải cố định và Stop chính thức
vẫn đang chờ. Lỗi driver trình duyệt gặp ở phía Python được giữ là lỗi harness,
không gán thành kết quả API native.

Adapter Stop giữ workload đồng bộ Start đã duyệt, ba cặp cửa sổ với 100 mẫu
hợp lệ mỗi bên, trần 403 lần thử và cả sáu giới hạn an toàn tuyệt đối.
Gate 4 vẫn giữ phép so 110% với đối chứng; không tự mở rộng ngoại lệ hiệu năng
Windows của Gate 3 sang Gate 4. Đo ngắn không thay thế nghiệm thu chính thức.
Hiệu năng production Linux/Xeon và HIL vật lý là **NOT RUN**. Luồng mặc định,
ghim release, commit giai đoạn 3 và bằng chứng nghiệm thu được giữ nguyên.
Toàn bộ bằng chứng thô nằm trong phiên DEV sở hữu `cirnet-4PiLwh`.

### Mốc an toàn và tương thích giai đoạn 4: 20cbd915

Mốc này ghi nhận ứng viên Windows mới hơn, giữ nguyên các ứng viên và kết quả
trước đó. Giai đoạn 4 chưa commit trên `codex/native-remote-stage4`, dựa trên
Remote `3cc5063df984c73f05d50979a7b50dbc853323a9`. SHA-256 executable là
`20cbd915780e6bc14a0fef95d1c2359ab2771ffe37b745d77639f4457411ff36`.
Build release mất 39,82 giây. Biên bản:
`native-remote-release-successor/c1c9ab11b1194fc9b79942cbbf0b8e49/candidate.json`,
SHA-256 `872f14b968a9cf78e64a109a9927553a0203418077ecca27df6af51cfba8c35f`.
Mọi đường dẫn dữ liệu thô dưới đây đều tương đối với phiên DEV sở hữu
`cirnet-4PiLwh`.

Ba phát hiện an toàn đã có ca tái hiện thất bại rồi hồi quy đạt. Monitor kết
thúc hoặc panic sẽ đóng tiếp nhận và vẫn hoàn tất dọn dẹp; lỗi ghi chẩn đoán
không được ngắt dọn dẹp. Mất kết nối giữ quyền scheduler PostgreSQL sau khi
niêm phong capture sẽ chặn công bố thông thường và xóa capture chưa được tham
chiếu. Phục hồi hiện xóa generation riêng của reservation cũ trong cùng giao
dịch với trạng thái kết thúc, xử lý lease và audit. Worker cũ không thể dùng
revision mới của bên kế nhiệm để ghi đè phục hồi hoặc giải phóng quarantine.
Cả hai trường hợp kế nhiệm release và quarantine đều đạt. Điều này không
khẳng định kiểm tra kết nối và mọi commit sau đó qua pool là một thao tác
nguyên tử. Các kiểm tra manager thông thường đạt 6/6 trong 4,43 giây; bản ghi
runtime SQLite/PostgreSQL đạt 2/2 trong 0,81 giây.

Quy tắc ignore `db/` kế thừa đã che mười tệp nguồn database Rust khỏi bản kê
dựa trên Git trước đây. Các ngoại lệ nguồn có phạm vi hẹp hiện đã bao gồm các
tệp đó. Giữ nguyên các bản kê lịch sử và ghi rõ chúng chưa đầy đủ; không đổi
nhãn kết quả executable đã kiểm tra. Bản kê filesystem hiện tại, đầu vào phụ
thuộc Cargo và hash giao thức sinh ra đã được đối chiếu trước/sau lệnh release
khóa phiên bản và offline. Cargo báo executable còn hợp lệ trong 0,67 giây,
không biên dịch và giữ nguyên hash. Đây là kiểm tra đầu vào/danh tính, không
phải build sạch lần thứ hai. Biên bản:
`native-remote-release-dependency-audit/655607b9c0df463087ed9d52b8eccf88/verification.json`,
SHA-256 `d7c72263a46ac6ebfd241b610c5c82fde8d93042528ad27a85c52cb41e9b1953`.
SHA-256 bản kê phụ thuộc đầy đủ:
`7a7d4c47fed1bc197c659872388b469a7ac01f66aaf9aefea71161a221d371e5`.

| Kiểm tra đúng ứng viên | Kết quả và phạm vi |
| --- | --- |
| Tương thích HTTP đối chứng | PASS: 12 nhóm backend/route, đủ 63 operation; SQLite 161,63 giây và PostgreSQL 172,85 giây. Sáu ca chủ động bỏ chọn backend còn lại trên mỗi runner không tính PASS. |
| Tích hợp trình duyệt và Interface | PASS: hai ca Interface đã chọn trên mỗi runtime cùng Playwright Python kiểm tra WebSocket reconnect/resync, NCAP 124 byte giống hệt, hiển thị waveform, physical preview và phục hồi khi mất phản hồi Create. Đây chưa phải toàn bộ ma trận trình duyệt giai đoạn 5. |
| Tranh chấp giao dịch và điều khiển PostgreSQL | PASS trong 23,69 giây: chặn/commit thật, quyền sở hữu, giới hạn revision, công bố/tiếp nhận, Stop phiên cũ và thu hồi WebSocket. Rollback audit phục hồi không an toàn rồi quarantine cũng đạt. |
| Cutover và rollback PostgreSQL | PASS trong 54,12 giây: cặp backup database/capture, loại scheduler cạnh tranh, hàng đợi chờ, mất quyền, giữ safe ACK, chặn kết quả muộn và xác minh kết nối lại Python. |
| Lỗi worker C++ thật | PASS trong 52,00 giây: crash và timeout mười giây trên cả hai runtime; tiến trình con thoát trước safe ACK, không capture lỗi hoặc lease tồn dư, sau đó capture worker thay thế khớp. |
| Tải cố định và Stop dưới tải chính thức | NOT RUN cho ứng viên này. Đối chiếu Stop ngắn dưới đây không thay cho gate chính thức. |
| Hiệu năng Linux/Xeon, thực thi signal Linux và HIL vật lý | NOT RUN. Không công bố production hoặc release PASS. |

Biên bản HTTP đúng ứng viên: `successor-http-sqlite/paired-summary.json`,
SHA-256 `ac9e7a32c98745e3165abda288121b0cbd5867622f3f76098b71f12100cd9c82`.
Bằng chứng trình duyệt:
`stage4-interface-e2e/paired-d07fdf7109f84ad6ae32d7771e1aa51a/comparison.json`,
SHA-256 `7caa567e646ccf9be88c330dd5267bddd591d5a2a40db633ff14248815ac50da`.
Ứng viên mất 140,86 giây; dùng lại đối chứng Python 136,46 giây sau khi xác
minh biên bản, nguồn, cấu hình và digest capture thô. Việc dùng lại tránh một
lượt đối chứng đã đo là 136,46 giây; không chứng minh ứng dụng chạy nhanh hơn.
Các biên bản PostgreSQL, rollback và lỗi worker:
`stage4-postgres-races/32db37b4196649828428de6f6a6c7f32/observations.json`
(SHA-256 `f6664656b31788e3af8829d5fc53dfb4a2e644b3f053f6db7eafa2482d9b1cc0`),
`stage4-postgres-cutover/694141961f524dc088a29603a4d01f33/cutover-summary.json`
(SHA-256 `9d918ad480d03ce359d259d9d61393259c1b2f1feaa811d21c5e0837e5d79fa6`),
và `stage4-worker-faults/6d36cc0329194a4887a72087e72b46d2/worker-fault-summary.json`
(SHA-256 `220c0b12dcab96997dc866c60af68c3f8ae33e8e41bedd44661cd20143fb8847`).
Chưa chạy lại đúng điểm dừng nội bộ cũ giữa commit và truy vấn sự kiện, hoặc
đúng thao tác xen kẽ reservation trực tiếp ở repository. Các phép kiểm tương
đương qua giao thức công khai được ghi riêng, không coi là chính các ca nội
bộ đó.

Ứng viên lịch sử `7bae8cdc` cũng đạt năm kiểm tra restore/index database cũ
trong 156,80 giây: revision 0001/0003/0004/0005, 107 payload giữ nguyên, schema
catalog khớp và truy vấn active-index với 2.000 dòng kết thúc. Biên bản
`old-restore-controller/summary.json`, SHA-256
`da313495a5b7e7a29c3b7f634d31d0c73b5e9653ffee4a9dbb181abd83182fc9`.
Danh tính nguồn migration và truy vấn cho phép giữ bằng chứng trong phạm vi
đó; đây không phải lượt chạy mới trên `20cbd915`. Kết quả CLI/OpenAPI tối ưu
trước đó cũng giữ nguyên executable gốc.

Lượt Stop ngắn đầu tiên thất bại ở điều kiện Run với HTTP 429. Driver chung
tính khoảng nghỉ một giây theo chủ sở hữu trước khi nhận đủ bốn phản hồi Run,
nên một lượt tiếp nhận muộn có thể chưa hết giới hạn. Adapter giai đoạn 4 hiện
chờ đủ 1,010 giây từ phản hồi Run thành công cuối cùng trước Create tiếp theo.
Áp dụng giống nhau cho hai phía; không thay giới hạn Run hoặc chính sách thử
lại. Ba ca hồi quy xác định cho cách nghỉ này đều đạt. SHA-256 adapter:
`51c5f933d80068ffe999a4788c8f3dfa0ea5b294ec47953ea760aad60f67d361`.
Giữ nguyên khoảng đo Stop, Start đồng bộ, workload, bốn worker đang chạy,
điều kiện pipe, thu hồi worker trước ACK, capture, lease và quarantine.

Lượt chẩn đoán đã sửa mất 104,63 giây: B và D đều đủ 8/8 lượt, không loại mẫu
và có tám warmup. Sáu đối chiếu an toàn tuyệt đối đạt; hiệu năng đối chứng đạt
4/6. HTTP p95/p99 là 77,5356 ms cho B và 100,8298 ms cho D, vượt giới hạn đối
chứng 85,28916 ms. Với tám mẫu, hai giá trị đuôi này chính là cực đại, chưa
phải ước lượng đuôi chính thức. ACK thô là 56,7754/38,2203 ms; giải phóng lease
bền vững là 124,9691/88,7484 ms. Thời gian nghỉ thêm ngoài phép đo là
4,1486/4,1984 giây. Phản hồi HTTP native chậm nhất nhận ACK ở 38,22 ms,
commit giải phóng lease ở 83,42 ms và trả về ở 100,83 ms. Bằng chứng hiện có
khoanh vùng thời gian tăng sau ACK nhưng chưa tách được nhận kết nối database,
SQL, commit và công việc phản hồi. Biên bản:
`native-remote-loaded-stop/91e03eabd3bc486ba27ec2ae501f0924/stop-summary.json`,
SHA-256 `c967c9e09daa1bf8973731dd0627fd41c3fe7658f3789d7bfbc312d3bfb40f22`.

Gate 4 đầy đủ chưa được nghiệm thu. Giữ ba cặp cửa sổ Stop, mỗi bên 100 mẫu
đủ chuẩn, trần 403 lần thử, đủ sáu giới hạn an toàn tuyệt đối và đối chứng.
Nghiệm thu tải cố định vẫn cần SQLite và PostgreSQL, ba cặp cửa sổ mỗi bên
200 job, giữ workload và ngưỡng đã ghim/đối chứng. Phải xác định thời gian
database riêng với HTTP. Chính sách Windows Gate 3 không miễn các yêu cầu
giai đoạn 4 này. Giữ nguyên luồng mặc định, lựa chọn release bất biến, commit
giai đoạn 3 và toàn bộ bằng chứng lịch sử.


### Mốc tương thích và an toàn Windows giai đoạn 4 · 717402ba

Ứng viên Windows x64/MSVC là `native-remote-sqlite-writer-release/f07bbb29b41d4a7c9120379547450752/cirnet-remote.exe`
(SHA-256 `717402ba92e7a0f1864fe4f5f70dbc8f6a55c154e9880a35d470dd2e07f51203`).
Rust 1.90.0 build ứng viên trong 39,10 giây bằng
`cargo +1.90.0 build --release --locked --offline --bin cirnet-remote`.
Manifest ứng viên có SHA-256 `6bd5a0d8d71303f62f149c492f541f04221dc30bc82688fcab12b925cd0a9a51`.
Biên bản kiểm đầy đủ đầu vào biên dịch `complete-after.json` có SHA-256
`f7adace56acb5817bfba4da3b16e9207455062def19aefa4c2efe5cf90cda9f4`. Kết quả lịch sử của
`20cbd915` và `d4d0fa3e` giữ nguyên ứng viên và kết luận ban đầu.

| Kiểm tra | Bằng chứng và phạm vi |
| --- | --- |
| Tương thích HTTP và CLI | **PASS**. Đủ 63 thao tác qua 12 nhóm HTTP đối chứng. SQLite mất 237,36 giây, PostgreSQL mất 250,94 giây, mỗi lượt chủ đích loại sáu nhóm của backend còn lại. Bản xuất CLI khớp các thao tác đã đăng ký. Áp dụng bảy migration, chạy lại không có thay đổi. Từ chối khi thiếu cơ sở dữ liệu. |
| Interface | **PASS** trong 152,75 giây. Playwright Python xác minh WebSocket kết nối lại và đồng bộ, giao diện hiển thị dạng sóng, NCAP 124 byte khớp từng byte, preview vật lý qua mô phỏng và Stop sau khi Create đã commit. Hai ca được chọn từ mã nguồn Interface cũng đạt. Tái sử dụng đối chứng Python 136,46 giây sau khi kiểm hash của luồng kiểm thử, công cụ, fixture và bằng chứng thô. Ma trận trình duyệt đầy đủ của giai đoạn 5 còn chờ. |
| Thành phần SQLite và scheduler | **PASS**. Hai ca kiểm thử bản tối ưu cổng ghi bao phủ truy cập đồng thời qua các bản sao, hủy và rollback. Sáu ca manager với Hardware đã ghim bao phủ điều khiển, quarantine và dọn dẹp. Các ca này chạy bằng executable kiểm thử Rust. |
| Giao dịch và phục hồi PostgreSQL | **PASS**. Hai ca qua giao diện công khai trong 75,38 giây bao phủ chặn giao dịch thật, công bố và tiếp nhận, chuyển quyền và thu hồi phiên, bàn giao WebSocket, rollback khi phục hồi lỗi rồi quarantine và thu hồi generation. |
| Chuyển đổi PostgreSQL và lỗi worker thật | **PASS**. Xác minh cặp backup, scheduler độc quyền, mất quyền điều phối, giữ lease khi chờ ACK an toàn, chặn capture muộn và kết nối lại Python. Kiểm lỗi crash và timeout trên worker C++ thật xác minh thu hồi tiến trình trước ACK an toàn, xử lý lease và capture khớp trên worker thay thế. |
| Stop ngắn dưới tải | **PASS cho điều kiện chức năng/an toàn đã quan sát; thời gian CHẨN ĐOÁN**, trong 103,54 giây với probe đo pha tùy chọn được bật. B và D mỗi bên đủ 8/8 mẫu, có tám lượt làm nóng và không loại mẫu. Điều kiện nhận mẫu kiểm bốn worker thực sự đang xử lý, thu hồi trước ACK an toàn và dọn dẹp bền vững. Sáu so sánh tuyệt đối và sáu so sánh đối chứng đều đạt trên số mẫu này. HTTP p95/p99 của B là 67,0223 ms, của D là 43,8271 ms. Với số mẫu này cả hai giá trị đuôi đều bằng cực đại của từng bên. |
| Phạm vi chức năng, tương thích và an toàn Windows | **PASS**. Phạm vi Windows đã duyệt giữ các deadline và bất biến an toàn bắt buộc. Hiệu năng thông thường và số đo đối chứng phục vụ chẩn đoán. |
| Hiệu năng và Stop dưới tải đầy đủ Linux/Xeon | **NOT RUN**. Chờ dự án ổn định, máy đích thật, phương pháp/ngưỡng production đã chốt và xác minh an toàn trên nền tảng đích. |
| HIL | **NOT RUN**. Capability phần cứng thật vẫn không khả dụng; HIL thật bắt buộc nếu công bố điều khiển phần cứng. |

**Gate 4 Windows: PASS** cho phạm vi chức năng, tương thích và an toàn
đã nêu, trên ứng viên Windows xác định. **Hiệu năng và Stop dưới tải đầy
đủ Linux/Xeon: NOT RUN. HIL: NOT RUN. Production/release: NOT RUN**, chờ
các gate nền tảng và phần cứng áp dụng. Cập nhật chính sách này không đổi
mặc định, chọn bản phát hành, commit, merge hoặc xóa branch/worktree.

Tổ hợp chính xác là Remote `717402ba…`, Hardware Rust R2 SHA-256
`22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6`,
worker C++ SHA-256
`c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf`,
Contracts native 0.1.2 tại `e640f80b1199779659d3db7817fee16d13cc24c1`,
Interface source `66845b01f9b02b70e6ec28ececd163133cdcdfa2`.
Manifest đối chứng Python r8 được ghim trong từng biên bản. Nghiệm thu
Windows hiện tại dùng lại bằng chứng có phạm vi hợp lệ và đối chứng
trình duyệt Python đã xác minh; không đổi FAIL hiệu năng cũ thành PASS.
Không ước tính tổng thời gian tiết kiệm do bỏ lượt Windows đầy đủ chưa
chạy. Lượt hiệu chuẩn trình duyệt được dùng lại từng mất 136,46 giây;
đây không phải mức cải thiện hiệu năng ứng dụng.

Các biên bản nằm trong phiên DEV `cirnet-4PiLwh` bên dưới. Giữ workload
chính thức gồm ba cặp cửa sổ 200 job mỗi bên cho từng cơ sở dữ liệu và ba cặp
cửa sổ Stop 100 mẫu đủ chuẩn mỗi bên, trần 403 lần thử. Chẩn đoán Windows và
so sánh lịch sử giữ nguyên phạm vi đã ghi. Giữ worktree để rà soát trước khi
tích hợp Git hay thay đổi mặc định hoặc release.

| Biên bản | Đường dẫn tương đối trong phiên | SHA-256 |
| --- | --- | --- |
| HTTP | `native-remote-writer-http/sqlite-85cbfefdf1634643b6e22329c2159655/paired-summary.json` | `5aeac02e40c8ce368e2e90ec48e4f4571b7c89af230d1e3e15fe72a31721d224` |
| CLI | `stage4-717-cli/fa738d3f78ea4003bd4a350d2895f4ae/cli-summary.json` | `d6a52004606ab8197be52b5a266232a69bd7ecf30e07b9e22f74cd2f4c968e6f` |
| Interface | `stage4-interface-e2e/paired-e1b9932fcb4e4fe0b2549f9942e03417/comparison.json` | `ef7f7d2f047acf972c291d8d2e520621e971b6c904b078c084bc6e43a1e22b7f` |
| Đối chứng trình duyệt Python đã tái sử dụng | `stage4-interface-e2e/paired-35ff5d0d77134e5b93e419417fa99f16/reference-calibration.json` | `456868143719bbe7a2218cb34cd30351caf1ce1d7ce4269fcbdb52245e535e0b` |
| Thành phần cổng ghi | `stage4-sqlite-writer-gate/3aca07aa008b4c929fc9d851600ade6b/cargo.log` | `134a30e4754fda5e50fe04ebe7bbafd8069dbed5eedf9e5181ea4b6a93955e48` |
| Thành phần manager | `stage4-sqlite-writer-gate-safety/fad56c3c234f471b9f238b57e39aa1f8/tests.log` | `04fb67b7330ccc43759dedf2f2a5ff833b56ca79b2451ef5d9448cd8a8d35d30` |
| Tranh chấp PostgreSQL qua giao diện công khai | `stage4-postgres-races/dd38c8bba6ef404381e29dd295e75812/observations.json` | `248528c8642941abddba59f7ef8e0b47ea11c85e24e4aa749de55a0feb4687f1` |
| Phục hồi PostgreSQL thiếu ACK an toàn | `stage4-postgres-races/unsafe-recovery-6843987f616b49b2965d8bf7e3ceb077/observations.json` | `01772fef03d94176b2f672e31d9c0019711ff7d453f5f4cf31bba3107218b2ef` |
| Chuyển đổi và rollback PostgreSQL | `stage4-postgres-cutover/6e26c077430a483c94a835e222ca71c5/cutover-summary.json` | `c07283642f8a6faa2a7e72d1da9ec83fecd55521d8fc4917d65e69f232e56301` |
| Lỗi worker C++ | `stage4-worker-faults/81e17b60192747249448db86b353575d/worker-fault-summary.json` | `b848f2e26544a599737dfe48280c1cfd207c53372a8c17288946b6ad651fce7e` |
| Stop ngắn dưới tải | `native-remote-loaded-stop/7cf28ed9776c46b58bd8f3fd3e2578c8/stop-summary.json` | `7a401513a5ab7b475eaab107699557bb5d533702d0e137d723aba831cfe9d98c` |

Nghiệm thu dữ liệu cũ trên đúng ứng viên đã bao phủ revision 0001, 0003,
0004 và 0005 cùng truy vấn active-index. Lượt đầu mất 126,75 giây: bốn ca
PASS; revision 0004 dừng khi chuẩn bị fixture vì database nguồn còn báo
một backend sau seed, trước mọi dump hoặc migration native. Biên bản gốc
giữ FAIL (`old-restore-controller/717-a12e0a60907943f198458e74362a7003/summary.json`,
SHA-256 `c4500aa8392ad9354f5ffa2b828288479f5e5e569c84d9bedb0c18c7c0da9aa9`).
Chỉ chạy lại revision 0004, PASS trong 29,35 giây với cùng binary bất biến,
harness, seed và assertion. Bộ quan sát sẵn sàng có phiên bản riêng giữ
điều kiện không còn backend; nó thấy số lượng bằng không ngay và không
chờ. Chưa rõ loại backend ở lượt đầu, chưa chứng minh là autovacuum.
Biên bản chạy lại:
`old-restore-controller/717-r4-retry-f2ad472e7f754c8b80ed457999f666d4/rank4-summary.json`,
SHA-256 `1c6505f3bfa423cbcf69458024cd81329f5435be3e7b3ce2e99139a92c0636ea`.
Bằng chứng này khép phần còn thiếu về đúng artifact do kiểm kê cũ chưa
đầy đủ; bằng chứng lịch sử `7bae8cdc` được giữ nguyên.

Kiểm tra mã nguồn biên dịch hiện tại đạt 47 test thư viện mặc định và
mười ca chọn riêng về ghi SQLite/PostgreSQL, runtime, quyền scheduler,
quyền ghi và Stop sau chuyển quyền. Fixture chuyển quyền PostgreSQL đầu
tiên dùng tên không được phép và dừng trước mutation cần kiểm tra;
biên bản lỗi gốc được giữ nguyên. Cùng executable kiểm thử đã PASS trên
fixture mới có tên đúng. Biên bản:
`stage4-717-db-regressions/6ae81db335a84e41a618cd6d34d99401/component-regressions.json`
(SHA-256 `f225089fd9c2e80db855d1437121c526e2a4cf81997a15b5687352c51eb325b7`)
và `stage4-717-db-regressions/b3a854439c364bc7859943135d009003/postgres-stop-claim-retry.json`
(SHA-256 `68b9f8848d1cde10e77da4d6c6365ba0bde299e39cce10ea4e2ff888d4d41259`).
Đối chiếu cuối xác nhận cả 87 file Rust, 55 đầu vào nguồn biên dịch,
hai đầu vào giao thức sinh và ba manifest build khớp bản build đã ghim
(`stage4-policy-docs/current-compiled-input-audit.json`,
SHA-256 `ebfec38409c1d0b2b55dc60ad217a40bd128e6c1881d19070c39295920618280`).

Chỉ dùng lại kiểm tra lịch sử về wrapper xử lý monitor panic/dọn dẹp và
các ca mất quyền PostgreSQL sau đóng capture/scheduler kế nhiệm theo
helper/mã nguồn và nhánh PostgreSQL đã xác minh không đổi. Không báo
chúng là lượt chạy mới trên CLI bất biến. Cutover, phục hồi không an
toàn, lỗi worker và giữ ACK trên 717 hiện tại bao phủ đường tích hợp.
Biên bản phạm vi và tái sử dụng:
`old-restore-controller/717-a12e0a60907943f198458e74362a7003/windows-coverage-audit.md`,
SHA-256 `2b4ffa09bb74149088a57413e4e56bfc38fe624d43f871e81e11a7a0125cc9fe`.
Các ca dừng/tra cứu bên trong Python trước đây vẫn chưa chạy lại nguyên
xi; ca tương đương qua giao thức công khai được ghi riêng. Ma trận trình
duyệt đầy đủ giai đoạn 5, xử lý signal Linux, tải và Stop đầy đủ
Linux/Xeon, cùng HIL thật vẫn NOT RUN.

Sau đó đã kiểm trực tiếp hai nhánh kích hoạt theo đồng hồ còn thiếu
trên CLI 717 bất biến. WebSocket điều khiển im lặng được server đóng mã
4401 khi timestamp hết hạn phiên đi từ tương lai sang quá hạn, không
có thu hồi phiên tường minh, Stop, đóng kết nối từ client hoặc đổi auth
revision. Dọn dẹp giữ `SESSION_EXPIRED`. Ca riêng với phiên còn hiệu
lực làm lease thật hết hạn và giữ `TIMEOUT`. Cả hai xác minh giữ lease
sau ACK ban đầu và khi giữ ACK dọn dẹp cuối, chỉ giải phóng sau ACK đó,
không công bố capture từ Start muộn. Relay giữ phản hồi Start thành công
sau khi Hardware đã xử lý xong; đây là bằng chứng hết hạn/điều khiển,
không chứng minh worker còn thực thi. Lượt Stop 16 mẫu riêng chứng minh
điều kiện worker còn hoạt động.

Ca phiên đầu đã đến dọn dẹp sau các assertion chức năng nhưng lỗi timeout
ở câu lệnh DROP database tạm; lượt hai ca dài 70,08 giây giữ nguyên một
FAIL/một PASS. Giữ PASS của lease theo harness
`74de6ae93d24abb0aece8a095bba0c934a1e16ea3c508b0bbe05fe88a72548f0`.
Chỉ chạy lại ca phiên, PASS trong 30,58 giây, sau khi harness giữ database
thuộc phiên và ghi quan sát chức năng trước dọn dẹp. Vòng chỉ nhận cho
phép event từ server trước khi đóng. Harness cuối là
`1fd1613e90bfa2a1aab2fb221fefc2b7f50a9f21aaefe83ef6a983a8f36bd8a4`;
bài kiểm lease và deadline sản phẩm không đổi.
Biên bản: `stage4-clock-expiry/session-cf553de8ad614ca98165963ef8e9e0de/expiry-summary.json`
(SHA-256 `67fef4569f07b9ef04e94ad5d54365e409f4d1eac2603cff67c0576a3756681f`)
và `stage4-clock-expiry/lease-b157b5485b3549de899556006493f229/expiry-summary.json`
(SHA-256 `d28184bef17926b839d355ae2c937f51a0b50234794815b1677d4210dbdd0409`).
Không đổi mã nguồn sản phẩm hoặc executable trong cập nhật chính sách này.
Sau các kiểm tra, đã dừng server PostgreSQL riêng của phiên khi không còn
client bên ngoài; giữ dữ liệu, dump và bằng chứng. Biên bản dọn tài nguyên:
`stage4-policy-docs/postgres-closeout.json`,
SHA-256 `4216c7c6690a44a42c35ea71c54282fc5d0cdf96779c6fc213d3327fbbbadd24`.

### Chẩn đoán SQLite và bằng chứng Windows hiện tại

Ứng viên hiện tại thêm quyền ghi độc quyền dành riêng cho SQLite trước khi
lấy kết nối từ pool. Các repository clone dùng chung quyền này; đọc đi
thẳng vào pool và PostgreSQL không đổi. Quyền được giữ đến khi
commit/rollback kết thúc. `BEGIN IMMEDIATE`, commit bền vững và khóa của
driver SQLite vẫn bảo vệ giữa các pool độc lập. Chờ quyền ghi và lấy kết
nối dùng chung ngân sách 30 giây hiện có, sau đó là busy timeout của driver
không đổi. Một yêu cầu bị tranh chấp có thể chờ ở quyền ghi lâu hơn trước
khi tới kết nối database bận; lỗi chờ hoặc commit không giải phóng lease.

Ứng viên có đo pha trước đó `d4d0fa3e…` xác định lấy kết nối cộng BEGIN
là khoảng đo lớn nhất sau ACK; điều này không loại trừ chi phí RPC hoặc
giải mã ở các pha khác. Test SQLite có kiểm soát
đã tách hai pha: trung vị lấy kết nối khoảng 0,05–0,06 ms, còn BEGIN cạnh
tranh chờ 45,36–92,62 ms khi giao dịch ghi được giữ 10/25/50 ms.
Ca tái hiện thiếu kết nối đọc ban đầu FAIL rồi PASS sau thay đổi, cùng
các ca hủy/drop/rollback và khóa giữa pool độc lập. Hai test quyền ghi
PASS trong 0,14 giây; sáu ca an toàn manager PASS trong 1,64 giây.
Đây là bằng chứng component về nguyên nhân và chẩn đoán ngắn, không phải
nghiệm thu hiệu năng production.

Trên đúng `717402ba…`, có bật probe đo pha tùy chọn, bài Stop tám mẫu
mỗi bên mất 103,54 giây,
16/16 lần thử hợp lệ, không loại mẫu. Mỗi mẫu chứng minh bốn worker C++
thật còn hoạt động khi Hardware nhận Stop, dữ liệu pipe tăng nhưng chưa
có phản hồi, worker mục tiêu được thu hồi trước safe ACK, giải phóng lease
bền vững sau ACK dọn dẹp, ba capture ngang hàng khớp byte và không có
capture của lượt bị dừng. Cả sáu so sánh an toàn tuyệt đối đều PASS.
Cực đại quan sát HTTP/ACK thô/lease là B 67,0223/52,4368/106,3526 ms
và D 43,8271/29,3413/76,9102 ms. Sáu so sánh tương đối cũng PASS nhưng
chỉ dùng chẩn đoán theo chính sách hiện tại. Với tám mẫu, p95/p99 được
báo là cực đại, không phải ước lượng đuôi phân phối chính thức.
Trung vị lấy kết nối cộng BEGIN native giảm từ 25,229 ms ở lượt chẩn
đoán trước xuống 2,5583 ms; các cửa sổ ngắn khác nhau chưa chứng minh
hiệu năng đuôi production. Biên bản
`native-remote-loaded-stop/7cf28ed9776c46b58bd8f3fd3e2578c8/stop-summary.json`
có SHA-256 `7a401513a5ab7b475eaab107699557bb5d533702d0e137d723aba831cfe9d98c`;
`phase-summary.json` có SHA-256
`ce06b34ecf3952d40e5d4362e86527bf78394ab24cec323e0638df3625cf079c`.
Phương pháp ngắn giữ đồng bộ Start đã phê duyệt và pacing/workload không
đổi; chuyển ma trận mẫu đầy đủ sang Linux là quyết định chính sách,
không phải tuyên bố 16 mẫu thay thế bằng chứng thống kê của ma trận đó.

Chưa khởi chạy tải đầy đủ hoặc nghiệm thu Stop 600 mẫu trên Windows khi
chính sách thay đổi. Bài đối chiếu SQLite ngắn đang chạy kết thúc bình
thường trong 101,44 giây: một test PASS, PostgreSQL được bỏ qua có chủ ý.
Biên bản giữ **DIAGNOSTIC**, không có quyết định theo ngưỡng chính thức:
`native-remote-load/sqlite-diagnostic-01953cf81ac34f908ac19e07abfae22f/load-summary.json`,
SHA-256 `b77f7ba3aee72228aae6387a0d261f365994bc629dacfe7947d1f73b1d054408`.
Mỗi bên chạy tám job đo; CPU/job B/D là 0,7734375/0,234375 giây,
RSS đỉnh 257708032/134193152 byte, throughput 1,38175/3,97858 job/giây.
Sau dọn dẹp, mọi PID API, worker và console host đã ghi đều không còn.
Biên bản kết thúc:
`stage4-policy-closeout/bb0520bdb9024eb6a2428fab27ecee7f/diagnostic-closeout.json`,
SHA-256 `dea388bf2af5c409eddf3fd81f6bfd3689f676c85df88d30c3f93459130526b5`.

Giữ nguyên các lỗi thiết lập bài tải trước đó. Helper kiểm kê ban đầu
đếm console host Windows thành worker, rồi yêu cầu nhầm bốn worker
thường trú. Workload không đổi cấu hình bốn slot và bốn job warmup,
nhưng Rust Hardware tạo worker khi cần. Kiểm kê đã sửa chấp nhận một
đến bốn worker đúng artifact và chỉ console host hệ thống đã xác minh;
bộ đo tài nguyên gốc vẫn yêu cầu PID ổn định. Thay đổi này không nới
điều kiện bốn worker hoạt động của Stop dưới tải. Sáu kiểm tra helper
không cần dịch vụ đã PASS, sau đó bài tải ngắn hoàn tất. Lượt giai
đoạn 4 này dùng `journal_mode=DELETE` và `synchronous=FULL` trên Windows,
khác PERSIST ở giai đoạn 3;
giai đoạn 0 không ghi PRAGMA journal. Không suy ra tương đương Linux.

Các chẩn đoán thời gian repository SQLite/PostgreSQL riêng được giữ
trong `native-remote-db-component`. Chúng dùng ba cặp luân phiên,
200 thao tác sau mười warmup, fixture 2010 hàng giống nhau trên mã
nguồn đo pha trước đó. Chúng so toàn bộ thao tác repository, không
đánh đồng thời điểm BEGIN trì hoãn ở Python với BEGIN tường minh ở Rust.
Thư viện SQLite client khác phiên bản (3.50.4 và 3.46.0); PostgreSQL
dùng cùng server riêng. Không gán lại các số đo đó cho `717402ba…`.


## 5. Nghiệm thu đúng bộ artifact phát hành

- [ ] **Thay lối vào sản phẩm.** Remote thêm manifest và trình kiểm native, chuyển `run-cirnet.bat` và `scripts/launcher/` sang gọi binary, cập nhật `deployment/` (systemd, Nginx, migration/admin/maintenance), workflows phát hành và bootstrap. Interface thay `scripts/build_release.py` trong quy trình build sản phẩm, giữ Node/Vue. Contracts dùng generator Rust. Manifest mới liệt kê commit, version, SHA-256, platform/ABI và khả năng công bố. Giữ immutable manifest 0.1.4, gói cũ, installer v1 và môi trường Python riêng để rollback. Kiểm gói thiếu, digest sai, target sai, path traversal, provenance và đóng gói tái lập.
- [ ] **Smoke tiến trình thật.** Dùng lane build sạch không có Python để build sản phẩm và sinh SDK. Chuyển đúng bộ artifact đã băm vào image runtime sạch khác để cài, khởi động, chạy Doctor và vận hành. Ghi digest manifest ở cả hai lane và kiểm cây tiến trình, entrypoint, dependency. Interface/static server, Remote, Hardware và Simulator là các tiến trình riêng. Smoke đăng nhập, Run → NCAP → hiển thị, preview, WebSocket reconnect và Stop dưới tải. Thu PID, readiness, cleanup và quy tắc một scheduler. Client kiểm thử Python chạy trên host điều phối bên ngoài image.
- [ ] **Gate phát hành.** Chạy full browser E2E (Playwright Python, giữ các ca hiện có kể cả WebGL, Web Locks và matrix hình ảnh đến khi chứng minh bao phủ tương đương), PostgreSQL backup/restore, đóng gói/SDK/tương thích, security, performance/load và hai RTL testbench bằng toolchain ghim. Security bao gồm auth/CSRF/origin, revocation, giới hạn frame, RPC loopback, khai báo không driver và kiểm dependency. FPGA hiện chỉ công bố scaffold. Ghi HIL NOT RUN cho scaffold và kiểm khả năng vật lý vẫn không khả dụng. Nếu công bố thực thi vật lý, HIL trên thiết bị phù hợp trở thành gate bắt buộc. Diễn tập rollback thật về 0.1.4 và tổ hợp gần nhất đã qua gate nếu khác 0.1.4, dùng đúng cặp backup, kiểm trạm/quarantine và lệnh dở. Có gate độc lập cho từng platform công bố. Chỉ chọn manifest mới sau khi tất cả gate bắt buộc PASS.

## Mẫu biên bản từng giai đoạn

- Repo và file thực sự đổi, commit/harness, danh sách artifact và digest, config, môi trường và lệnh chạy.
- Ma trận từng tổ hợp và PASS/FAIL/NOT RUN cho từng gate. Ghi mô phỏng, RTL và HIL thành dòng riêng.
- Số mẫu, p50/p95/p99, throughput, CPU/job, RSS và Stop đến an toàn trước/sau. Ghi số tuyệt đối, độ biến động và ngưỡng quyết định.
- Lỗi còn mở, điều kiện chuyển mặc định, artifact/backup cần để rollback và kết quả diễn tập.
