# Lịch sử phát hành và bằng chứng

[English](../../en/history/index.md) · [Mục lục](../index.md)

Các hồ sơ này mô tả revision, đầu vào và môi trường cụ thể. Dùng
[khóa phát hành hiện hành](../../../integration/release-set.json) và
[hướng dẫn xác minh](../contributing/verification.md) khi chuẩn bị lượt mới.

Với chuyển đổi native, xem [trạng thái và bằng chứng theo giai đoạn](../architecture/native-migration-status.md).

| Hồ sơ | Ngôn ngữ | Phạm vi |
| --- | --- | --- |
| [Nhật ký thay đổi](../../CHANGELOG.md) | Tiếng Anh | Thay đổi theo thời gian |
| [Biên bản Lab-First R0–R7](../../MIGRATION_LAB_FIRST.md) | Tiếng Anh | Chuyển đổi và bằng chứng |
| [Biên bản phát hành M6](../../verification/2026-10-27-multi-repo-migration-m6.md) | Tiếng Anh | Lịch sử phát hành theo phiên bản và xác minh |
| [Phát hành 0.1.4 cục bộ](../../verification/2026-11-05-cirnet-release-0.1.4.md) | Tiếng Anh | Kiểm thử phát hành cục bộ và gate chưa chạy |
| [Rà soát hạ tầng CI](../../verification/2026-11-05-test-infrastructure-audit.md) | Tiếng Việt | Thay đổi P0–P3, số đo và giới hạn |
| [Kế hoạch chuyển đổi native gốc](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) | Tiếng Việt | Kế hoạch C++ và Rust theo giai đoạn, tách riêng môi trường hiện hành |
| [Chuyển đổi native giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md) | Tiếng Việt | Một phần số đo tham chiếu và ngưỡng chưa chốt |
| [Điều khiển nguồn 3D gốc](../../POWER_SUPPLY_CONTROLS.md) | Tiếng Việt | Tương tác mô hình cũ và kết quả theo ngày |

## Hồ sơ lưu trữ

- [Bàn giao phát triển](../../DEV_LOG.md) ghi công việc và marker bàn giao trước đây.
- [Kho lưu trữ](../../archive/) giữ prompt gốc và đặc tả đã được thay thế.
- [Sổ xác minh](../../VERIFICATION.md) và [bằng chứng theo ngày](../../verification/) ghi đầu vào và kết quả kiểm thử.
- [Remote trước khi tách repo](https://github.com/cirnetlab/cirnet-remote/tree/989954f95c1c6b1d224e31a53fb33f125f0a81a9) chứa các phần triển khai tích hợp trước đây.
- [Tài liệu trước khi tinh gọn](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs) chứa các thiết kế, tư liệu hình ảnh linh kiện và thiết bị vật lý, cùng báo cáo xác minh cũ. [Điểm vào bộ kiểm thử trình duyệt](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/tests/end-to-end) ở revision đó dẫn tới bộ kiểm thử đã chuyển.
