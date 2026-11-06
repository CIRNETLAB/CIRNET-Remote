# Kế hoạch chuyển đổi CIRNET sang C++ và Rust

[English](../../en/architecture/native-migration.md) · [Kế hoạch gốc ngày 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Biên bản giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

**Gate 0 PASS trên bộ tham chiếu 0.1.4 đã chọn. Gate 1 PASS trên Windows x64 với r7.** Tổ hợp r7 là B cho giai đoạn 2. Profile 0.1.4 đã phát hành là bản tham chiếu để rollback. Giai đoạn 2–5 ở trạng thái `NOT RUN`.

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
