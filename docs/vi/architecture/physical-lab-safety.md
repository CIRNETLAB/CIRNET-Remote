# An toàn phòng thí nghiệm vật lý

[English](../../en/architecture/physical-lab-safety.md) · [Hợp đồng an toàn chuẩn](../../en/architecture/physical-lab-safety-contract.md) · [Kiến trúc hệ thống](system.md)

An toàn và tính đúng đắn độc lập với nhau. Danh tính linh kiện chưa rõ giữ trạng thái `UNKNOWN`. Mạch có linh kiện chưa rõ chỉ chạy theo chế độ `RUN_GUARDED` khi đã chứng minh bảo vệ và có thể thực thi liên kết điểm cuối.

| Ranh giới | Hành vi bắt buộc | Thông số điện |
| --- | --- | --- |
| Nguồn | Giới hạn và đo dòng, ngắt nhanh, cấp nguồn theo từng bước | `TBD_BY_HARDWARE_DESIGN` |
| Kích tín hiệu | Mặc định ba trạng thái, bảo vệ ngõ kích số và chống xung đột ngõ ra | `TBD_BY_HARDWARE_DESIGN` |
| Chuyển mạch | Mặc định hở, chuyển mạch an toàn và giữ nguyên dây sinh viên đã nối | `TBD_BY_HARDWARE_DESIGN` |
| Khởi động | Cấp nguồn có bảo vệ sau lần quét mới, kết quả an toàn và kế hoạch khả thi đã áp dụng | `TBD_BY_HARDWARE_DESIGN` |
| Khi chạy | Giám sát watchdog, tín hiệu heartbeat, liên động khi lỗi và bảo vệ trong lúc chạy | `TBD_BY_HARDWARE_DESIGN` |
| Dọn dẹp | Giới hạn thời gian về trạng thái an toàn, tắt nguồn tín hiệu/clock/generator và giải phóng hoặc cách ly trạm | `TBD_BY_HARDWARE_DESIGN` |

Các lỗi gồm chập VCC/GND, xung đột ngõ ra nguy hiểm, rủi ro về cực tính/điện áp/dòng điện, cơ chế bảo vệ hỏng, bản quét hoặc kế hoạch hết hiệu lực, driver lỗi hoặc mất kết nối, hết thời gian chờ và sai giao thức. `UNSAFE` hoặc `INDETERMINATE` chặn cấp nguồn và khởi chạy. Thiếu driver giữ `hardware_applied=false` và báo chưa khả dụng. Nếu dọn dẹp an toàn thất bại, trạm vẫn bị cách ly và chưa được cấp lại.

Bản quét phải có tham chiếu nút, kết nối và chân hợp lệ, với ID chân không trùng. Bằng chứng sai cấu trúc dẫn đến `DRIVER_ERROR` và quay về trạng thái an toàn trước khi định tuyến hoặc cấp nguồn. `TopologyResolver` ánh xạ điểm cuối tham chiếu sang nút thực tế quan sát được. Liên kết bắt buộc chưa phân giải dẫn đến `BLOCK_UNEXECUTABLE`. Sai cấu trúc và kết quả chấm vẫn là các chẩn đoán riêng. Ví dụ, lần chạy có bảo vệ với linh kiện chưa rõ có thể cho kết quả chức năng `FAIL` mà không đổi kết quả an toàn đã đánh giá. Kết quả chức năng gồm `PASS`, `FAIL`, `PARTIAL`, `NO_RESPONSE` và `NOT_EVALUATED`.

Kế hoạch kiểm tra cấu hình Generator ban đầu trước khi cấp nguồn có bảo vệ. Thay đổi khi đang chạy cần tính năng được công bố, trạng thái `RUNNING`, đúng chủ sở hữu và quyền giữ trạm còn hiệu lực, bằng chứng an toàn mới từ driver, và giới hạn ghi trong cấu hình phần cứng. Cấu hình cơ sở thiếu ADC/DAC/AFE cần thiết nên Scope và Generator có 0 kênh và không thể Apply khi chạy. Ca thử nhận việc hai suất kiểm tra bộ điều phối. Cấu hình vật lý nhiều suất cần phân vùng độc lập có bảo vệ. [Cô lập điều khiển](control-isolation-and-runtime-index.md) · [Đối chiếu hợp đồng FPGA](fpga-contract-conformance.md)

Kết luận về an toàn điện cần sơ đồ nguyên lý, datasheet và ánh xạ chân của linh kiện đã chọn, cùng kết quả đo. Kiểm thử máy trạng thái và RTL xác lập các bất biến điều khiển. [Báo cáo phát hành cục bộ 0.1.4](../../en/history/verification/2026-11-05-cirnet-release-0.1.4.md) ghi kiểm chứng FPGA vật lý là `NOT RUN` trong lần chạy đó.
