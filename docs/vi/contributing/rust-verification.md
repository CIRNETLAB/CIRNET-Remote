# Kiểm thử Remote Rust

[English](../../en/contributing/rust-verification.md) · [Tài liệu](../index.md)

Dùng hướng dẫn này cho executable native `cirnet-remote`.
[Hướng dẫn xác minh hệ thống](verification.md) quy định cấp thư mục đầu
ra và kiểm tra artifact đã phát hành.
[Trạng thái chuyển đổi](../architecture/native-migration-status.md)
ghi ứng viên Gate 4 Windows và các gate còn chờ.

## Build và chạy kiểm thử thông thường

Dùng Rust `1.90.0` theo [rust-toolchain.toml](../../../rust-toolchain.toml).
[Cargo.toml](../../../Cargo.toml) và [Cargo.lock](../../../Cargo.lock) ghim
các phụ thuộc, gồm Contracts native `0.1.2` tại
`e640f80b1199779659d3db7817fee16d13cc24c1`. Chạy từ thư mục gốc Remote trong
một phiên ngoài checkout mới có chủ sở hữu. Kiểm tra allocator trả về các
đường dẫn yêu cầu trước khi gọi Cargo. Dùng `--offline` khi cache đã có các
phụ thuộc theo lock.

```powershell
$env:CARGO_TARGET_DIR = node scripts/artifact-paths.mjs rust-remote/target
$env:TEMP = $env:TMP = $env:TMPDIR = node scripts/artifact-paths.mjs rust-remote/tmp
cargo build --locked --release --bin cirnet-remote
cargo test --locked --lib --bins
cargo test --locked --lib --bins -- --list
```

Các test thông thường kiểm tra cấu hình, ranh giới API, logic WebSocket
và giám sát quá trình dừng. Liệt kê test để chọn các ca cần fixture bên
dưới. Các lệnh này kiểm tra bản build cục bộ. Gate đã ghi dùng một
executable được đóng băng riêng và đúng bộ artifact tích hợp.

## Chọn fixture cho từng kiểm thử

Ca migration CLI cần `CIRNET_REMOTE_CLI_DIR` rỗng trong phiên đã cấp.
Ca OpenAPI cần `CIRNET_CONTRACTS_ROOT` trỏ đến tài nguyên Contracts đã ghim
chứa `contracts/api/openapi.json`. Ca này đối chiếu
từng byte bản xuất và kiểm tra đủ 63 operation ID. Đặt đầu vào trước khi
chọn ca tương ứng. Ca migration tạo database tạm, kiểm tra migration tường
minh và xác nhận lượt thứ hai không có thay đổi.

```powershell
$env:CIRNET_REMOTE_CLI_DIR = node scripts/artifact-paths.mjs rust-remote/cli
cargo test --locked --test cli migrations_are_explicit_and_idempotent -- --ignored --exact
cargo test --locked --test cli openapi_export_matches_pinned_handoff_and_route_inventory -- --ignored --exact
```

Để đối chiếu đọc SQLite, đặt `$referencePython` thành executable Python
đã cài đúng bộ đối chứng r8 giai đoạn 3. Script seed tự tạo thư mục
fixture đã đặt tên. Thư mục đó phải chưa tồn tại khi bắt đầu.

```powershell
$fixtureParent = node scripts/artifact-paths.mjs rust-remote
$env:CIRNET_REMOTE_DB_FIXTURE_DIR = Join-Path $fixtureParent 'sqlite-read'
& $referencePython -I -B native/tests/db_seed_legacy.py
cargo test --locked --test db_readonly reads_legacy_sqlite_without_mutating_files -- --ignored --exact
```

| Nhóm kiểm thử | Đầu vào và điểm chạy |
| --- | --- |
| Migration và ghi database | Dùng [db_seed_migrations.py](../../../native/tests/db_seed_migrations.py) cho `db_migrations`, và bản sao mới của dữ liệu cũ cho [db_write.rs](../../../native/tests/db_write.rs). Đặt `CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR`, `CIRNET_REMOTE_DB_WRITE_SQLITE_DIR` hoặc biến chọn PostgreSQL tương ứng trong test. Fixture đọc PostgreSQL dùng `CIRNET_REMOTE_DB_FIXTURE_POSTGRES` và database loopback riêng có tiền tố `cirnet_stage4_db_`. |
| Xác thực, runtime và scheduler | Chọn [auth_lifecycle.rs](../../../native/tests/auth_lifecycle.rs), [runtime_records.rs](../../../native/tests/runtime_records.rs), [stop_claim_authority.rs](../../../native/tests/stop_claim_authority.rs) hoặc [scheduler_authority.rs](../../../native/tests/scheduler_authority.rs) rồi chuẩn bị fixture SQLite hoặc PostgreSQL cô lập. Script seed [runtime](../../../native/tests/seed_runtime_records.py) và [Stop sau chuyển quyền](../../../native/tests/seed_stop_claim.py) dùng bản đối chứng Python đã cài. Các ca helper dành cho tiến trình con do harness tương ứng gọi. |
| Compiler và xem trước qua Hardware | [compiler_cases.rs](../../../native/tests/compiler_cases.rs) dùng `CIRNET_REMOTE_COMPILER_CORPUS` từ [compiler_fixture.py](../../../native/tests/compiler_fixture.py) và `CIRNET_CONTRACTS_ROOT`. [preview_hardware.rs](../../../native/tests/preview_hardware.rs) dùng đúng Hardware R2 qua `CIRNET_NATIVE_STAGE3_HARDWARE` và worker C++ đã ghim qua `CIRNET_SIM_CPP_WORKER`. |
| Capture, realtime và vòng đời | [experiment_captures.rs](../../../native/tests/experiment_captures.rs) dùng `CIRNET_REMOTE_CAPTURE_TEST_DIR` thuộc phiên và Contracts đã ghim. [websocket_protocol.rs](../../../native/tests/websocket_protocol.rs) và [experiment_manager.rs](../../../native/tests/experiment_manager.rs) mô tả `CIRNET_REMOTE_WS_FIXTURE_DIR` và các đầu vào kiểm thử SQLite/PostgreSQL khác thuộc phiên. |

Chọn ca theo tên sau khi chuẩn bị đúng đầu vào. Dùng bước teardown của
ca đó, sau đó xem bằng chứng và dọn phiên thuộc quyền sở hữu theo
[xác minh hệ thống](verification.md). Giữ thông tin đăng nhập PostgreSQL và
dữ liệu database/capture trong môi trường kiểm thử, rồi ghi digest artifact.

## Kiểm tra đúng tổ hợp artifact

Các bộ `tests/integration/native_remote_*_cases.py` được chọn tường minh
để pytest chạy với các tiến trình riêng.
[Bộ chọn đối chứng](../../../tests/integration/native_remote_gate_cases.py)
cần `CIRNET_NATIVE_STAGE3_CANDIDATE`, `CIRNET_NATIVE_STAGE1_CANDIDATE` và
`CIRNET_NATIVE_STAGE3_PYTHON`. Đặt `CIRNET_NATIVE_REMOTE_EXE` trỏ đến
executable Rust đã chọn và đáp ứng kiểm tra digest trong driver tương ứng.

- [Ma trận HTTP](../../../tests/integration/native_remote_matrix_cases.py)
  kiểm tra SQLite và PostgreSQL với dữ liệu cô lập. Chạy
  [ca chuyển đổi và rollback](../../../tests/integration/native_remote_cutover_cases.py)
  với trạng thái PostgreSQL thuộc phiên và công cụ sao lưu tương ứng.
  [Khôi phục dữ liệu cũ](../../../tests/integration/native_remote_old_restore_cases.py)
  và [hết hạn theo đồng hồ](../../../tests/integration/native_remote_expiry_cases.py)
  kiểm tra dữ liệu cũ và an toàn scheduler.
- [Ca Interface](../../../tests/integration/native_remote_browser_cases.py)
  ghim source/static artifact của Interface và Playwright Python/Chromium.
  [Các ca lỗi worker](../../../tests/integration/native_remote_worker_fault_cases.py)
  kiểm tra crash và timeout của worker C++ thật.
- [Driver Stop dưới tải](../../../tests/integration/native_remote_stop_cases.py)
  và [driver tải cố định](../../../tests/integration/native_remote_load_cases.py)
  có biến chọn lượt chạy tường minh. Áp dụng
  [chính sách theo môi trường](../architecture/native-migration.md#chính-sách-nghiệm-thu-gate-4-theo-môi-trường)
  để xác định phạm vi nghiệm thu phù hợp.

[Biên bản Windows](../architecture/native-migration.md#mốc-tương-thích-và-an-toàn-windows-giai-đoạn-4--717402ba)
ghi Gate 4 PASS cục bộ với ứng viên đã ghim. Hiệu năng và Stop dưới tải
đầy đủ Linux/Xeon, xử lý signal Linux, HIL vật lý và nghiệm thu phát hành
production vẫn **NOT RUN**. Các workflow trong repo bao phủ tài liệu, dịch
vụ Python và tích hợp artifact, trình duyệt, Contracts và FPGA. Nghiệm thu
Remote Rust chạy cục bộ theo lựa chọn tường minh. Xem
[workflow tài liệu](../../../.github/workflows/docs.yml) và
[workflow tích hợp](../../../.github/workflows/integration.yml).
