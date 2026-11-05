# Đối chiếu Contracts với đề xuất FPGA

[English](../../en/architecture/fpga-contract-conformance.md) · [Tài liệu gốc đầy đủ](../../architecture/fpga-contract-conformance.md)

Đề xuất FPGA phiên bản 2.1 là tài liệu thiết kế tham chiếu đang chờ thẩm định phần cứng và ABI. [Kiến trúc hệ thống](system.md) hiện tại và Contracts đã cài quy định hành vi khi chạy. Hệ thống 0.1.4 chọn Contracts 0.1.2 và scaffold FPGA 0.1.2. Hardware RPC 2.0, giao thức logic FPGA `1.0-scaffold` và sơ đồ thanh ghi `1.0-reserved` là các miền phiên bản độc lập. Kết luận M5 giải thích vì sao nhãn mục tiêu `2.0-scaffold` trong ví dụ chưa khả dụng không khớp với envelope logic đã đăng ký.

## Ranh giới thực thi

| Phần trong đề xuất | Ranh giới phần mềm hiện tại |
| --- | --- |
| Kế hoạch chạy | `InstrumentationExecutionPlan` 1.0 nội bộ gắn thí nghiệm, trạm, cấu hình nguồn, đầu nối và tuyến được duyệt, phân bổ, xung nhịp, máy phát, capture và vector kiểm thử. Bộ biên dịch định tuyến hạ tầng. `PhysicalExecutionPlan` chưa có bí danh đã đăng ký. |
| Ảnh thực thi trên bo | Hardware Service kiểm tra kế hoạch rồi chuyển sang ranh giới driver. Chưa có bộ mã hóa ảnh cho bo hoặc ABI đã chứng minh cho việc cài nguyên tử, phiên bản và định danh. |
| An toàn và tính mới | Kết quả an toàn, topology và chức năng độc lập. Trạm vật lý kiểm tra lại an toàn ngay trước khi cấp điện. API ràng buộc quyền điều khiển theo chủ sở hữu, phiên, tab, phiên bản và thế hệ đặt chỗ. Kết quả quét vật lý dùng TTL đơn điệu riêng, mặc định 30 giây, và hết hiệu lực khi đưa về trạng thái an toàn, reset hoặc lỗi. Epoch khởi động bo, xóa dữ liệu cầu nối và hành vi khi reset hoặc nhận lệnh lặp cần được chứng minh. |
| Điều khiển và khả năng | RPC hỗ trợ trạng thái an toàn, quét, chuẩn bị, định tuyến, cấp điện có bảo vệ, arm, start, Stop và capture. API giữ lease cho đến khi xác nhận dọn dẹp an toàn. Dọn dẹp thất bại khiến lease bị cách ly. Khả năng công khai bỏ thông tin định tuyến riêng và báo 0 kênh nếu không khả dụng. Lệnh RTL logic chưa quy định opcode trên đường truyền vật lý. |
| Capture | NCAP v1 niêm phong các sự kiện số có giới hạn cùng số byte và SHA-256, giữ các thế hệ riêng theo chủ sở hữu. Hợp đồng sampled-v2 và fixture tổng hợp định nghĩa định dạng và metadata chất lượng. Nguồn phát mẫu, vòng đời bộ nhớ FPGA và phép đo thu nhận vẫn là việc chưa hoàn tất. |

Các adapter Serial và USB/SPI giữ chỗ trả `HARDWARE_UNAVAILABLE`. Hợp đồng trình duyệt không có quyền truy cập trực tiếp thanh ghi, MUX, SDRAM hoặc điều khiển transport FPGA. Nếu thiếu driver vật lý, hệ thống báo 0 slot thực thi và 0 kênh thiết bị. Scaffold chứng minh sự phù hợp logic và hành vi. Timing và CDC trên bo, ngắt điện độc lập, ADC/DAC, SDRAM, hiệu chuẩn và chất lượng thu nhận cần bằng chứng phần cứng.

Repo FPGA sở hữu các bước kiểm RTL bằng slang và Icarus/vvp theo phiên bản đã khóa. Remote kiểm tra mã nguồn FPGA đã chọn với Contracts và Hardware đã cài. Tài liệu gốc giữ bảng đối chiếu khái niệm của đề xuất và kết luận tương thích M5 có ngày. Xem [an toàn phòng thí nghiệm vật lý](physical-lab-safety.md) và [miền tín hiệu và mô phỏng](signal-domains-and-simulation.md).
