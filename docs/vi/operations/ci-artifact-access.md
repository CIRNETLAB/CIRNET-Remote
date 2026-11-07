# Quyền tải artifact phát hành của CI

[English](../../en/operations/ci-artifact-access.md) · [Mục lục](../index.md)

[Khóa phát hành hệ thống](../../../integration/release-set.json) chọn đúng
URL tài sản GitHub dạng số và digest SHA-256 cho hệ thống **0.1.4**. Tài sản
đã phát hành của sáu repo công khai cho phép tải ẩn danh. Kiểm tra quyền truy
cập draft riêng bằng thông tin xác thực dự kiến sử dụng. Tải công khai thành
công chưa chứng minh quyền xem draft hay phạm vi thông tin xác thực.

## Thông tin xác thực và phạm vi

[Workflow Integration](../../../.github/workflows/integration.yml) ưu tiên
`CIRNET_ARTIFACTS_READ_TOKEN` và giữ `NETCIRCUIT_ARTIFACTS_READ_TOKEN` làm secret
dự phòng hiện có. `system-artifact-access` yêu cầu một trong hai. Dùng token
phân quyền chi tiết, có hạn dùng cho `cirnetlab`, với `Contents: Read-only`
và quyền đọc metadata tự động, giới hạn trong đúng sáu repo. Lưu thông tin
xác thực dưới tên `CIRNET_ARTIFACTS_READ_TOKEN`. Dùng thông tin riêng cho phát
hành hoặc thao tác ghi Git. Giữ giá trị token ngoài manifest, đối số lệnh,
báo cáo, chat và mã nguồn. `contents: read` của workflow giới hạn
`GITHUB_TOKEN`. Secret Actions riêng giữ phạm vi đã cấp khi cấu hình.

Sáu repo gồm `cirnet-remote`, `cirnet-contracts`, `cirnet-interface`,
`cirnet-simulator`, `cirnet-hardware` và `cirnet-fpga`.

## Đổi và xác minh

Gia hạn trước khi hết hạn và cập nhật các secret đã cấu hình. Dùng lượt chạy
thủ công của Integration để chạy lại gate truy cập tại revision đã chọn.
Job cài cả 15 artifact vào môi trường mới, băm lại đầu vào đã chọn và đầu vào
khôi phục, rồi kiểm tra phiên bản và nguồn cài. Ghi revision, danh tính
consumer và receipt đã loại bỏ thông tin nhạy cảm. Receipt tải thành công
vẫn báo `credentialScopeVerification` là `NOT_VERIFIED`. Ghi xác nhận cấp
quyền riêng. Kiểm tra khả năng xem draft bằng thông tin đọc mới, độc lập với
quyền phát hành.

CI có xác thực sẽ dừng khi thiếu đầu vào hoặc lỗi xác thực. Giữ pin chính xác
và xác minh trước khi dùng. Trình cài không chọn `latest`, checkout lân cận
hay gói editable làm dự phòng. Xem [quy trình phát hành](release-and-rollback.md)
để thiết lập cục bộ. [Hồ sơ quyền truy cập sau đổi tên](../../en/history/ci-artifact-access-record.md)
bằng tiếng Anh ghi các revision và receipt lịch sử.
