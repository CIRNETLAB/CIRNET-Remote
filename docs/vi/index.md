# Tài liệu CIRNET Remote

[English](../en/index.md) · [Repo](../../README.md) · [Chỉ dẫn repo](../../AGENTS.md)

Các trang tiếng Anh là hướng dẫn hiện hành mặc định của repo. Mục lục tiếng Việt có cùng cấu trúc.

## Hướng dẫn sử dụng

- [Chạy phòng lab cục bộ và dùng trình khởi chạy Windows](guides/getting-started.md)

<a id="api-và-kiến-trúc"></a>

## Tham chiếu API

- [API ứng dụng và phát triển](api/application.md)
- [Consumer Contracts đã cài](api/contracts-consumer.md)
- [Đặc tả mạch và phòng lab vật lý](api/circuit-and-physical-lab.md)
## Kiến trúc và trạng thái

- [Kiến trúc hệ thống](architecture/system.md)
- [Bối cảnh làm việc](architecture/context.md)
- [An toàn phòng lab vật lý](architecture/physical-lab-safety.md)
- [Bài thực hành và công bố](architecture/assignments-and-publication.md)
- [Xác thực và migration](architecture/auth-and-migrations.md)
- [Danh mục capture](architecture/capture-catalog.md)
- [Cách ly điều khiển và chỉ mục runtime](architecture/control-isolation-and-runtime-index.md)
- [Tuân thủ hợp đồng FPGA](architecture/fpga-contract-conformance.md)
- [Quan sát thao tác đang chờ](architecture/pending-observations.md)
- [Dự án và revision](architecture/projects-and-revisions.md)
- [Miền tín hiệu và mô phỏng](architecture/signal-domains-and-simulation.md)
- [Trạng thái chuyển đổi native và bằng chứng từng giai đoạn](architecture/native-migration-status.md)

<a id="đóng-góp-và-vận-hành"></a>

## Đóng góp

- [Xác minh và artifact ngoài repo](contributing/verification.md)
- [Build, kiểm thử và fixture Remote Rust](contributing/rust-verification.md)
- [Quy ước viết tài liệu](contributing/writing-documentation.md)
## Vận hành

- [Phát hành và khôi phục hệ thống](operations/release-and-rollback.md)
- [Quyền tải artifact của CI](operations/ci-artifact-access.md)
- [Triển khai sản xuất](operations/deployment.md)
- [Rà soát triển khai Mini PC Linux](operations/mini-pc.md)

## Lịch sử

- [Lịch sử phát hành, kế hoạch và bằng chứng](history/index.md)

Remote sở hữu tích hợp hệ thống, API, lưu trữ, lập lịch và triển khai. Các
repo sản phẩm sở hữu SDK và schema, bàn làm việc trên trình duyệt, bộ mô
phỏng, dịch vụ Hardware RPC cục bộ và RTL FPGA. Xem
[sơ đồ repo](architecture/system.md#ranh-giới-hệ-thống) để đến từng repo
và xem bộ phát hành chính xác.
