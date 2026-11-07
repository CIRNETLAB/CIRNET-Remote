# Trạng thái và bằng chứng chuyển đổi native

[English](../../en/architecture/native-migration-status.md) · [Tài liệu](../index.md)

[Biên bản chuyển đổi native](../history/native-migration-ledger.md) ghi
định danh artifact, phép đo và kết quả của từng ứng viên.

## Mã nguồn, ứng viên và bản phát hành

- **Mã nguồn.** Các repo sở hữu triển khai Contracts Rust, Simulator C++,
  Hardware Rust và Remote Rust. Remote ghi tích hợp giai đoạn 3 tại
  `3cc5063df984c73f05d50979a7b50dbc853323a9` và triển khai giai đoạn 4 tại
  `13a35145b6d15644c7be10d95a5410bf69e11867`. Xem
  [kiến trúc hệ thống](system.md) để tra trách nhiệm của từng thành phần.
- **Ứng viên đã nghiệm thu.** Mỗi kết quả áp dụng cho bộ artifact và nền
  tảng được nêu trong bằng chứng. Executable Windows giai đoạn 4 có SHA-256
  `717402ba92e7a0f1864fe4f5f70dbc8f6a55c154e9880a35d470dd2e07f51203`.
  [Biên bản](../history/native-migration-ledger.md#mốc-tương-thích-và-an-toàn-windows-giai-đoạn-4--717402ba)
  ghi Interface, Contracts, Hardware và worker C++ tương ứng.
- **Bản phát hành được chọn và rollback.**
  [Khóa phát hành](../../../integration/release-set.json) chọn hệ thống và
  Interface `0.1.4`, cùng API, Contracts, Simulator, Hardware và mã nguồn FPGA
  `0.1.2`. [Phát hành và rollback](../operations/release-and-rollback.md)
  hướng dẫn cài đặt và khôi phục bằng đúng các artifact được chọn.

## Nghiệm thu theo giai đoạn

| Giai đoạn | Quyết định đã ghi | Bằng chứng và phạm vi |
| --- | --- | --- |
| 0. Đối chứng | **PASS** trên bộ tham chiếu `0.1.4` đã chọn | [Gói lưu trữ, ngưỡng và nguồn gốc](../history/native-migration-ledger.md#gói-đối-chứng-và-ngưỡng-nghiệm-thu) |
| 1. Simulator C++ | **PASS** với r7 trên Windows x64 | [Quyết định, Stop và tích hợp](../history/native-migration-ledger.md#quyết-định-gate-1-trên-windows-x64), [Phạm vi SPICE](../history/native-migration-ledger.md#core-spice-tương-lai-dựa-trên-ngspice) |
| 2. Contracts Rust | **PASS** với ma trận r2 | [FAIL của ứng viên đầu, đối chiếu r2 và biên bản build sạch](../history/native-migration-ledger.md#xác-minh-ứng-viên-giai-đoạn-2) |
| 3. Hardware Rust | **PASS** chức năng, tương thích và an toàn Windows với r8-R2 | [Chính sách theo môi trường](../history/native-migration-ledger.md#chính-sách-nghiệm-thu-gate-3-theo-môi-trường), [Stop chính thức dưới tải](../history/native-migration-ledger.md#gate-3-stop-dưới-tải-chính-thức-trên-windows) |
| 4. Remote Rust | **PASS** chức năng, tương thích và an toàn Windows với `717402ba` | [Chính sách theo môi trường](../history/native-migration-ledger.md#chính-sách-nghiệm-thu-gate-4-theo-môi-trường), [bằng chứng artifact, HTTP, dữ liệu, Interface và an toàn](../history/native-migration-ledger.md#mốc-tương-thích-và-an-toàn-windows-giai-đoạn-4--717402ba) |
| 5. Đúng bộ artifact phát hành | **NOT RUN** | [Trạng thái xác minh phát hành và rollback](../history/native-migration-ledger.md#5-nghiệm-thu-đúng-bộ-artifact-phát-hành) |

Nghiệm thu giai đoạn 3 và 4 áp dụng các giới hạn an toàn trên Windows/i5.
So sánh hiệu năng thông thường dùng để chẩn đoán. Hiệu năng production của
giai đoạn 3, cùng hiệu năng và Stop dưới tải đầy đủ của giai đoạn 4 trên
Linux/Xeon, vẫn **NOT RUN**. HIL vật lý và nghiệm thu production và phát hành
cũng ở trạng thái **NOT RUN**. Bản phát hành công bố điều khiển vật lý cần HIL phù hợp.

[Hướng dẫn kiểm thử Remote Rust](../contributing/rust-verification.md)
ghi các bài kiểm tra và đầu vào fixture. [Mục lục lịch sử phát hành](../history/index.md)
dẫn đến các biên bản theo thời điểm khác.
