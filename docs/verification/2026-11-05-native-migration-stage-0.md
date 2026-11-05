# CIRNET native · Biên bản giai đoạn 0

**Gate 0 chưa đạt.** Đã xác thực và chạy bộ tham chiếu 0.1.4. Còn thiếu Stop khi worker đang tải, số đo tích hợp theo từng pha, tải PostgreSQL, bản đối chứng DB/capture để chuyển giao và ngưỡng tuyệt đối. Giai đoạn 1–5 đang ở trạng thái NOT RUN.

[Kế hoạch và ma trận chuyển đổi](../superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Manifest bộ tham chiếu](../../integration/release-set.json)

## Provenance

- Remote HEAD dùng để chạy kiểm thử là `37cb350b8492799fa1f8ad2ec85b11fbdd2d5bda`. Wheel API cài đặt được tạo tại `ce84ec4cf3602ef6fd001f91877e864c8955f9c7`. SHA-256 của manifest là `90a8ef4d30ddc19d3024dcb3790fef5d5e041f45fa47922bfd5e34c2fd19c419`. Cả 15 artifact tải về khớp dung lượng và SHA-256 trong manifest. Python xác nhận `app`, `contracts`, `cirnet_sim` và `hardware_service` đến từ venv riêng.
- Windows 11 build 26300 x64, Intel Core i5-12500H, 12 lõi / 16 luồng, 34.049.417.216 byte RAM. CPython 3.14.4, SQLite 3.50.4, Node 26.12.1, npm 12.2.2, pytest 9.1.1, psutil 7.2.2, gRPC 1.84.0. Gate dữ liệu chạy PostgreSQL 18.6 trên cluster riêng.
- Hai script benchmark và khởi chạy API/gRPC giống byte giữa HEAD và commit phát hành. SHA-256 của `scripts/benchmark_web_sessions.py` là `dcb32ec2655636aa9799f84e480d0b01a30b17d70ba2a60c672869d186ad5b9e`. SHA-256 của `scripts/e2e_web_server.py` là `21918dfebdb403c77f21f985b38dbedcf424d1c800f66c0d7c6729859ac23334`.

## Gate đã chạy

| Kiểm tra | Kết quả | Phạm vi đã kiểm |
| --- | --- | --- |
| Cài đặt và provenance | PASS | `scripts.install_release` trên manifest 0.1.4, đối chiếu 15 digest/dung lượng, import từ venv, `pip check`. |
| HTTP, SQLite, gRPC và Simulator | PASS | 50 principal khác nhau, 50 kiểm tra CAS và 50 lần từ chối đọc tài liệu của principal khác, 8 Run có capture, 8 lần đọc lại capture sau Stop. |
| OpenAPI và public wire | PASS | `scripts.export_openapi --check` trên wheel API và `scripts.check_public_compatibility` với resource cài đặt. |
| SDK npm đã đóng gói | PASS | 88 ca trong corpus, 89 phép đối chiếu profile/shape công khai và kiểm ranh giới kiểu public/private. |
| NCAP1, NCAP2 và validation | PASS | 122 ca trong `test_capture_format.py`, `test_sampled_capture_semantics.py` và `test_validation_profiles.py`. |
| API, dữ liệu đã lưu và điều khiển | PASS | 69 ca trong các nhóm Run gRPC thật, tài liệu đã lưu, truyền NCAP 100.000 mẫu, auth, WebSocket, preview, cô lập điều khiển và migration capture. Chạy từ entrypoint file ngoài Git và kiểm `app.*` đến từ wheel. |
| Bảo vệ cấp điện và đường Stop | PASS | 20 ca trong `test_physical_station.py` và `test_rpc_control_remains_available_while_configured_simulations_wait`. Trạm thử và phép gây nghẽn xác định dùng để kiểm bất biến. |
| PostgreSQL | PASS | `scripts.check_release --group postgres` chạy 18 ca, gồm upgrade, backup/restore, CAS và khôi phục lease. Cluster loopback thử đã tắt. |
| Compile, run và codec trong tiến trình pytest | PASS | `tests/integration/native_baseline_cases.py`. Đo với wheel Simulator/Contracts đã xác nhận, fixture AND khóa SHA-256. |
| Stop dưới tải thực, phân pha tích hợp, tải PostgreSQL, cặp snapshot đối chứng | NOT RUN | Cần bổ sung harness, đo lại và khóa ngưỡng. |
| RTL | NOT RUN | Gate này chỉ ghi kết quả mới. |
| HIL | NOT RUN | Artifact FPGA 0.1.2 công bố scaffold. |
| Giai đoạn 1–5 | NOT RUN | Ứng viên C++ và Rust chưa có kết quả tích hợp hoặc phát hành. |

Lượt chạy đầu thiếu compiler TypeScript trong bản Interface giải nén. Sau bootstrap từ manifest và `npm ci`, kiểm SDK PASS. Bốn ca Run bị `DRIVER_ERROR` khi Windows `spawn` khởi tạo từ `<stdin>`. Đã tái hiện lỗi spawn độc lập và chạy lại 69 ca từ file có guard `__main__`. Ba ca validation dùng fixture test cùng thư mục cần pytest import mode `prepend`. Chạy lại cả nhóm đạt 122/122.

## Độ trễ và tài nguyên của một lượt smoke

Chạy `python -B -m scripts.benchmark_web_sessions --sessions 50 --concurrency 10 --runs 8 --read-rounds 3` ngày 2026-11-05, bắt đầu 21:55 giờ Việt Nam. API và Hardware RPC chia sẻ một tiến trình trong harness. Simulator dùng tối đa bốn worker. Payload 124 byte mỗi capture chứa X tại 0 ns, 0 tại 8 ns và 1 tại 28 ns.

| Thao tác | Mẫu | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: | ---: |
| Đọc dự án | 150 | 37,043 | 57,860 | 63,176 |
| Đọc lịch sử | 150 | 33,232 | 51,484 | 56,927 |
| Đọc trạng thái thí nghiệm | 109 | 27,197 | 55,078 | 80,733 |
| Lưu tài liệu | 50 | 163,189 | 227,371 | 235,786 |
| HTTP Run | 8 | 110,603 | 488,960 | 488,960 |
| GET payload capture | 8 | 21,985 | 37,732 | 37,732 |
| HTTP Stop sau COMPLETE | 8 | 51,973 | 73,549 | 73,549 |

Trong cửa sổ tải 8,884 giây, 1.049 request hoàn tất theo trạng thái dự kiến, tương đương **118,08 request/s**. Tám job tạo capture tương đương **0,90 job/s** trên cùng cửa sổ hỗn hợp. Hai lần đọc mỗi capture trả 1.984 byte NCAP. Thời gian chuẩn bị phiên là 301,594 giây. Cây tiến trình dịch vụ tiêu thụ 47,922 CPU-giây và đạt peak tổng RSS 414.294.016 byte (~395,1 MiB) trong toàn bộ lượt chạy, gồm chuẩn bị. Có 2.687 lần lấy mẫu, không có lỗi truy cập khi lấy mẫu, không có lỗi truyền tải và backend thoát với mã 0.

Các phân vị của nhóm tám mẫu chỉ mô tả lượt smoke. GET capture gồm chi phí API và lưu trữ. Stop trong bảng gửi sau khi job đã COMPLETE và lease đã được thả. Cần số đo riêng cho Stop khi worker đích đang chạy, gRPC ACK, safe release hoặc quarantine, và thời điểm worker thật sự kết thúc.

## Phép đo trong tiến trình pytest

Mỗi pha có 20 lượt warmup và ba lô, mỗi lô 200 quan sát. Bảng lấy trung vị của ba giá trị theo từng cột, kèm khoảng dao động p95. Compile gồm dựng plan và kiểm pickle. Run dùng plan đã biên dịch và tạo các mẫu đầu ra. Hai phép NCAP chỉ dùng capture ba mẫu, 124 byte. Độ phân giải CPU trên máy này chưa đủ cho các lô codec khoảng 1 ms.

| Pha | p50 µs | p95 µs | p99 µs | Khoảng p95 µs |
| --- | ---: | ---: | ---: | ---: |
| Compile graph | 1.515,5 | 1.706,4 | 2.003,0 | 1.659,1–1.898,4 |
| Run plan | 180,2 | 207,2 | 248,5 | 181,2–239,4 |
| Mã hóa NCAP | 5,0 | 5,3 | 5,6 | 5,3–5,6 |
| Giải mã NCAP | 4,9 | 5,2 | 5,4 | 5,2–5,4 |

SHA-256 harness là `623c64784706ad4dd35870943e3ae063dd59cc7231b4bbd1a5fcfa5457f145bb`. SHA-256 workload là `74d014c5eda9661e38b61e319b76ebcf6da905ebd1a3534130a221a2bccb6e06`. Khi chạy lại, harness ghi ID riêng cho từng lần đo cùng SHA-256 của hai wheel, các mẫu thô và thời gian mỗi lô. Bảng này không gồm IPC, truyền gRPC, hàng đợi, API hoặc database.

## Các đối chứng đã khóa theo SHA-256

Các resource sau đến từ wheel Contracts đã chọn. Có thể dùng lại bằng đúng manifest và test hiện tại.

| Resource | SHA-256 |
| --- | --- |
| `api/openapi.json` | `dc39c874386eba2b58f8b5c631cbee0d63ded86cf287aea63f54e4a237ff8f08` |
| `capture/layout.json` | `725ad1207576be10bfcda399742ec50bab5b9dfa4f09014bab60b693ad52f0f9` |
| `fixtures/capture/conformance.json` | `4795c2306eb927089eb1640ee405efbcbf584a2275707b7d69c8087dabe709d4` |
| `fixtures/conformance.json` | `b0c4a03ec2fca33455f624707cb43779d9c964cbeeff0c2bc92fe68dbaf9b5d0` |
| `fixtures/diagnostics.json` | `53ef6625a36fb716ac10897cb2e4b5abfcfa9772e8a54081a554ac5d38edd085` |
| `fixtures/signal-domains-conformance.json` | `d315c955e0cba60b841d789feb7a5318d2586bdbbdbed4e8190506c79453ca54` |
| `hardware/v2/rpc_v2.proto` | `ac4942c024c8bb163404715cf081b0eb7d85fa8beccd158bc0fb7c811fee678b` |
| Descriptor Protobuf đã sinh | `37a37116a061db08369d69284a1ff847956c7306c07694d5fa1995dda3b772d0` |
| `compatibility/2026-10-16/public-wire-baseline.json` | `b0b18f1ad3181f271c0731ab994c6c32302a6569cb7b54e32e9ea385719e7e5a` |
| NCAP1 của fixture AND 74HC08 | `a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010` |

Đã xác nhận `GeneratorCapability.offset_min_v` vắng mặt và có mặt với giá trị 0 đọc ra cùng giá trị số. Hai bản tin có kết quả `HasField` và byte serialize khác nhau.

## Quyết định chuyển mặc định

Ngưỡng tương đối dự kiến nằm trong kế hoạch. Các giá trị tuyệt đối vẫn chờ phân phối từ workload nhiều sự kiện, tải PostgreSQL và Stop thực với ít nhất 100 mẫu hợp lệ mỗi lần đo. Tổ hợp được nghiệm thu ở đây là API, Hardware, Simulator và Contracts Python 0.1.2, cùng SDK npm 0.1.2 của system release 0.1.4. Bộ Interface 0.1.4 đã xác minh byte và dùng toolchain của source artifact để kiểm SDK.

Chưa có số đo ứng viên để so trước/sau. Khi cần tái lập tổ hợp tham chiếu, cài lại đúng manifest 0.1.4 vào môi trường riêng. Rollback của từng ứng viên sẽ yêu cầu xác minh cặp DB/capture và xử lý lease, quarantine, hàng đợi như kế hoạch.
