# Kế hoạch chuyển đổi CIRNET sang C++ và Rust

[English](../../en/architecture/native-migration.md) · [Kế hoạch gốc ngày 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Biên bản giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

**Gate 0 PASS trên bộ tham chiếu 0.1.4 đã chọn. Gate 1 còn mở.** Sáu lượt tải, hai lượt phân pha, ba lượt Stop dưới tải và hai lượt phục hồi database/capture đều đạt. Lát cắt C++ 74HC08 cục bộ đã qua Run, capture và preview. Giai đoạn 2–5 ở trạng thái `NOT RUN`.

> **Dành cho agent triển khai.** Dùng superpowers:subagent-driven-development hoặc superpowers:executing-plans. Hoàn thành và ghi bằng chứng từng gate trước khi bắt đầu giai đoạn kế tiếp.

**Mục tiêu.** Giữ tương thích với hệ thống đang phát hành, rồi chuyển sang Interface Vue/TypeScript → Remote Rust → Hardware Rust → Simulator C++.

**Kiến trúc.** Interface giữ REST và WebSocket cùng origin. Remote giữ quyền điều phối, dữ liệu và lease. Hardware giữ RPC cục bộ, quyền điều khiển trạm và tiến trình Simulator. Contracts cung cấp schema, SDK và dữ liệu chuẩn cho các thành phần. Trong giai đoạn 1–2, preview tiếp tục đi qua adapter của Remote. Từ giai đoạn 3, preview có thể đi qua Hardware khi tổ hợp giai đoạn đó đã vượt qua gate.

**Công cụ.** C++20 và CMake cho worker, Rust và Cargo lock cho các binary và công cụ sinh mã, Node cho SDK TypeScript, pytest và Playwright Python để nghiệm thu. Chốt phiên bản compiler, linker, target và phụ thuộc trong manifest ứng viên trước khi đo. Các phiên bản công cụ C++/Rust dùng cho phát hành sẽ được chọn ở giai đoạn tương ứng.

## Quy tắc áp dụng cho mọi giai đoạn

- Theo đúng thứ tự **0 → 1 → 2 → 3 → 4 → 5**. Mỗi gate bắt buộc cần có lệnh chạy, tổ hợp artifact, kết quả và bằng chứng riêng. FAIL hoặc NOT RUN ở gate bắt buộc chặn cả đổi mặc định và giai đoạn tiếp theo.
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

- [ ] **Lát cắt số.** Trong Simulator, thêm CMake và worker C++ độc lập, bắt đầu với AND 74HC08 từ corpus và kiểm chuỗi sự kiện qua adapter `cirnet_sim/backends.py`. Mở rộng theo hành vi của `engine.py`, `nets.py`, `logic.py`, `dispatch.py` và model đang được công bố. Giữ preview và các fixture DC tĩnh đã hỗ trợ (nguồn, điện trở, LED và 74HC08 có nguồn cấp). Giữ analog/SPICE/mixed ở trạng thái không khả dụng. So timestamp, thứ tự sự kiện đồng thời và giá trị 0/1/X, byte NCAP và lỗi. Chạy test Simulator và pytest gọi trực tiếp binary, ASan/UBSan trên target hỗ trợ.
- [ ] **Đóng gói và giám sát.** Dùng IPC cục bộ có frame giới hạn, handshake version và ID yêu cầu/thế hệ. Artifact Simulator xuất binary và mô tả giao thức riêng. Adapter Hardware `station/virtual.py` cho Run và adapter preview ở Remote dùng cùng lõi, ngân sách và pool riêng. Có deadline từ host, giới hạn queue/CPU/RAM, hủy, reap tiến trình và fence kết quả trả muộn. Kiểm timeout, frame lỗi, worker treo/chết, Stop/reset và chạy lại. REST, RPC 2.0 và NCAP giữ nguyên.
- [ ] **Ma trận và gate 1.** A = Interface hiện tại / Remote Python / Hardware Python / Simulator Python. B = cùng tổ hợp với worker C++ được bật ở cả Run và preview, Contracts Python 0.1.2 giữ nguyên. Chạy fixture, `tests/integration/test_virtual_lab_execution.py`, `test_capture_rpc_data_plane.py`, `test_simulation_backend_selection.py` và `services/api/tests/test_physical_preview.py` trên artifact. So số đo theo giai đoạn 0. Chỉ chọn B khi đạt tương đương và cải thiện đo được. Rollback về A sau hủy, reap và fence thế hệ. Không tự chạy lại job dở.

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

## 2. Contracts Rust

- [ ] **Giữ nguồn chuẩn.** Repo Contracts giữ JSON Schema/manifest, `device-library/` và các bản chiếu catalog, `contracts/hardware/v2/rpc_v2.proto`, `contracts/capture/layout.json` và `ncap.schema.json`. Port `validation.py`, validator ngữ nghĩa, `capture_codec.py` và các generator trong `contracts/codegen/`. `contracts/api/openapi.json` là handoff đã duyệt từ exporter Remote. Sinh crate/kiểu Rust, SDK `@cirnet/contracts`, binding Python dùng trong pytest và giữ wheel Python cũ cho consumer chuyển tiếp. Runtime Rust và lệnh sinh SDK chạy trên máy không cài Python.
- [ ] **Ma trận và gate 2.** Chạy B với wheel Python và npm hiện tại. Lặp lại với SDK từ Rust generator trên Interface và legacy wheel vẫn cài cho Remote/Hardware. Chạy cùng corpus qua legacy Python, Rust binary/binding và tarball npm đã đóng gói. Giữ descriptor field number và hai tên dịch vụ, phân biệt trường absent/default, lỗi, 0/1/X, thứ tự và byte chuẩn NCAP1/NCAP2. Kiểm JSON, timing/gap và các encoding INT16/UINT16/FLOAT32 của NCAP2. Dùng các check generator legacy, `scripts/check_public_compatibility.py`, kiểm runtime/types SDK và build sạch hai lần từ cùng commit/toolchain để so digest. Báo thời gian sinh mã, dung lượng gói và validation/codec throughput. Chỉ đổi nguồn sinh mặc định khi parity và tái lập PASS. Rollback trỏ lại cả bộ crate/SDK/wheel cũ đã xác nhận, giữ artifact trước đó.

## 3. Hardware Rust

- [ ] **Thay server và lifecycle.** Hardware chuyển `server.py`, `rpc.py` và `station/` sang Rust, dùng Contracts Rust và worker C++ đã ghim. Giữ RPC 2.0 cả `cirnet.hardware.v2.HardwareService` và alias `netcircuit.hardware.v2.HardwareService`, loopback/Unix, nguyên ACK/ownership/deadline/NCAP. Preview chuyển qua endpoint nội bộ được thương lượng, giữ adapter Remote Python tương thích với Hardware cũ. Stop dùng tài nguyên riêng cho xử lý RPC, hủy worker và phản hồi an toàn. Remote tiếp tục sở hữu lease/quarantine. Không tăng khả năng công bố của trạm thiếu driver.
- [ ] **Ma trận và gate 3.** So B với Interface hiện tại → Remote Python → Hardware Rust → Simulator C++, dùng legacy wheel ở Remote và crate ở Hardware. Giữ `test_server.py`, `test_virtual_execution.py`, `test_simulation_workers.py`, `test_rpc_lifecycle.py`, `test_ncap_rpc.py`, `test_physical_station.py` làm test tham chiếu. Chuyển assertion phụ thuộc internals Python sang test pytest gọi binary riêng qua RPC để thử Start/Stop/reset, hết lease, mất kết nối, worker treo/chết, phản hồi muộn, Stop đồng thời khi queue đầy và cách ly nếu thiếu ACK. Chạy các test tích hợp Remote. So Stop/p95/p99, RSS/CPU, throughput RPC và NCAP. Gate PR luôn giữ kiểm điều kiện trước khi cấp điện. Chạy hai testbench RTL đã ghim và HIL đúng khả năng được công bố. Phân loại riêng thiết bị chưa có. Chỉ đổi mặc định khi tổ hợp mới qua gate. Rollback theo quy trình lease/quarantine, phục hồi Hardware Python và worker tương thích.

## 4. Remote Rust

- [ ] **Thay theo nhóm route.** Remote giữ topology, auth và orchestration hiện tại. Port route đọc và preview trước, rồi `services/auth.py`, `websocket/events.py`, persistence và cuối cùng command/idempotency/`services/experiments.py`. So exact OpenAPI handoff, HTTP/error/cookie/CSRF/origin, WebSocket hello/sequence/resync/đóng kết nối, owner/control client và disconnect. Chỉ chạy shadow các route thực sự không có tác dụng phụ trên bản sao dữ liệu. Thử bootstrap phiên và kết nối WebSocket điều khiển trong môi trường riêng vì chúng có thể đổi phiên hoặc hủy job.
- [ ] **Dữ liệu và quyền điều khiển.** Port schema và migrations của Remote bằng migration native, chạy đối chiếu SQLite và PostgreSQL thực với dữ liệu cũ, CAS revision, login/ownership và capture. Diễn tập `pg_dump`/`pg_restore` cùng backup capture và kiểm hash, giữ idempotency và quarantine. Giữ endpoint điều khiển Hardware ngoài tầm truy cập của scheduler shadow. Rút quyền scheduler cũ và xác nhận tiến trình đã dừng, kiểm tra hàng đợi phục hồi trước khi cấp quyền cho ứng viên. Test hai tiến trình tranh quyền, hàng đợi còn lệnh và mất kết nối giữa cutover.
- [ ] **Ma trận và gate 4.** So Remote Python → Hardware Rust → C++ với Interface hiện tại → Remote Rust → Hardware Rust → C++ theo từng nhóm route. Giữ `scripts/export_openapi.py --check` làm phép đối chiếu bản Python. Xuất hoặc phục vụ OpenAPI từ binary Rust và so với handoff cùng bảng operation. Giữ fixture auth/ownership/operation identity/WebSocket và `services/api/tests/postgres_cases.py`. Port assertion phụ thuộc internals sang pytest dùng REST/WebSocket, binary và lệnh migration Rust trên DB thử thật. Giữ E2E Interface hiện có và thêm Playwright Python. So p95/p99 API/DB, CPU/RSS, throughput và Stop dưới tải. Khi tất cả route và diễn tập rollback PASS mới chuyển lưu lượng mặc định. Rollback hủy quyền scheduler ứng viên, phục hồi DB và capture cặp đôi khi cần, xác minh quyền và cách ly trước khi nối lại backend cũ.

## 5. Nghiệm thu đúng bộ artifact phát hành

- [ ] **Thay lối vào sản phẩm.** Remote thêm manifest và trình kiểm native, chuyển `run-cirnet.bat` và `scripts/launcher/` sang gọi binary, cập nhật `deployment/` (systemd, Nginx, migration/admin/maintenance), workflows phát hành và bootstrap. Interface thay `scripts/build_release.py` trong quy trình build sản phẩm, giữ Node/Vue. Contracts dùng generator Rust. Manifest mới liệt kê commit, version, SHA-256, platform/ABI và khả năng công bố. Giữ immutable manifest 0.1.4, gói cũ, installer v1 và môi trường Python riêng để rollback. Kiểm gói thiếu, digest sai, target sai, path traversal, provenance và đóng gói tái lập.
- [ ] **Smoke tiến trình thật.** Dùng lane build sạch không có Python để build sản phẩm và sinh SDK. Chuyển đúng bộ artifact đã băm vào image runtime sạch khác để cài, khởi động, chạy Doctor và vận hành. Ghi digest manifest ở cả hai lane và kiểm cây tiến trình, entrypoint, dependency. Interface/static server, Remote, Hardware và Simulator là các tiến trình riêng. Smoke đăng nhập, Run → NCAP → hiển thị, preview, WebSocket reconnect và Stop dưới tải. Thu PID, readiness, cleanup và quy tắc một scheduler. Client kiểm thử Python chạy trên host điều phối bên ngoài image.
- [ ] **Gate phát hành.** Chạy full browser E2E (Playwright Python, giữ các ca hiện có kể cả WebGL, Web Locks và matrix hình ảnh đến khi chứng minh bao phủ tương đương), PostgreSQL backup/restore, đóng gói/SDK/tương thích, security, performance/load và hai RTL testbench bằng toolchain ghim. Security bao gồm auth/CSRF/origin, revocation, giới hạn frame, RPC loopback, khai báo không driver và kiểm dependency. FPGA hiện chỉ công bố scaffold. Ghi HIL NOT RUN cho scaffold và kiểm khả năng vật lý vẫn không khả dụng. Nếu công bố thực thi vật lý, HIL trên thiết bị phù hợp trở thành gate bắt buộc. Diễn tập rollback thật về 0.1.4 và tổ hợp gần nhất đã qua gate nếu khác 0.1.4, dùng đúng cặp backup, kiểm trạm/quarantine và lệnh dở. Có gate độc lập cho từng platform công bố. Chỉ chọn manifest mới sau khi tất cả gate bắt buộc PASS.

## Mẫu biên bản từng giai đoạn

- Repo và file thực sự đổi, commit/harness, danh sách artifact và digest, config, môi trường và lệnh chạy.
- Ma trận từng tổ hợp và PASS/FAIL/NOT RUN cho từng gate. Ghi mô phỏng, RTL và HIL thành dòng riêng.
- Số mẫu, p50/p95/p99, throughput, CPU/job, RSS và Stop đến an toàn trước/sau. Ghi số tuyệt đối, độ biến động và ngưỡng quyết định.
- Lỗi còn mở, điều kiện chuyển mặc định, artifact/backup cần để rollback và kết quả diễn tập.
