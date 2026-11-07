# Bất biến của CIRNET Remote

[English](../../en/architecture/context-invariants.md) · [Bối cảnh làm việc](context.md)

[Đặc tả Lab-First v3.1](lab-first-v3-1.md) quy định các yêu cầu hệ thống.

- Duy trì một không gian làm việc ưu tiên Web và có bước kiểm tra an toàn.
  Bản đang chọn nhắm đến Mini PC chạy Linux với PostgreSQL.
  [Kiến trúc hệ thống](system.md) · [Mức sẵn sàng của máy đích](../operations/mini-pc.md)
- Giữ `CircuitGraph` riêng với `DetectedTopologyGraph`. Phân giải các liên kết
  tham chiếu vật lý `LabEndpoint` trong `AssignmentDefinition` theo dây nối quan
  sát được. `InstrumentationExecutionPlan` điều khiển hạ tầng.
  `ExecutionDecision` dựa vào `SafetyVerificationResult` và khả năng thực thi.
  `TopologyVerificationResult` và `FunctionalVerificationResult` cung cấp
  bằng chứng riêng cho việc đánh giá.
- `HardwareStation` phải tuân theo vòng đời an toàn vật lý. Nguyên mẫu dùng
  EP4CE6E22C8N không có SDRAM. Mục tiêu tương lai dùng EP4CE10E22C8N với SDRAM
  ngoài. Frontend không được chứa thanh ghi FPGA thô, địa chỉ MUX thô hoặc
  định danh truyền thông Linux. [Yêu cầu bảo vệ trạm](physical-lab-safety-contract.md)
- Yêu cầu được xác thực bằng phiên với thông tin xác thực bất khả kiến được lưu
  dưới dạng digest. Production yêu cầu người dùng đã xác thực. Migration giữ
  quyền sở hữu, định danh thao tác, bản thu và lượt thuê trạm bị cách ly. Giới
  hạn khôi phục và phản hồi cũ theo danh tính bền vững. Polling chỉ có một thao
  tác đang xử lý và hỗ trợ hủy, giãn khoảng cách khi thử lại. Khi chưa biết kết
  quả, giữ khóa thao tác qua lần tải lại hoặc mất kết nối.
  [Xác thực và migration](auth-and-migrations.md) · [Quan sát đang chờ](pending-observations.md)
- Đọc và ghi nội dung bản thu ngoài khóa điều khiển. Áp hạn mức thư mục và
  bảo vệ bản thu thuộc lượt thuê đang hoạt động hoặc bị cách ly khi dọn dẹp
  theo lô giới hạn. [Lưu trữ và loại bỏ bản thu](capture-catalog.md)

Dùng [AGENTS.md](../../../AGENTS.md) và [hướng dẫn xác minh](../contributing/verification.md)
khi thay đổi mã nguồn hoặc tạo bằng chứng ngoài repo. Xem hồ sơ chuyển đổi và
nghiệm thu theo ngày trong [mục lục lịch sử](../history/index.md).
