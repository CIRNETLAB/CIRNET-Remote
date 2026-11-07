# Hợp đồng an toàn phòng thí nghiệm vật lý

[English](../../en/architecture/physical-lab-safety-contract.md) · [Đặc tả Lab-First v3.1](lab-first-v3-1.md) · [Tổng quan an toàn](physical-lab-safety.md)

An toàn và tính đúng độc lập. Đánh giá linh kiện chưa nhận dạng bằng bằng
chứng quan sát và năng lực bảo vệ của trạm.

| Ranh giới | Hành vi bắt buộc | Thông số điện |
| --- | --- | --- |
| Nguồn | Giới hạn và đo dòng, ngắt nhanh, cấp nguồn theo giai đoạn | `TBD_BY_HARDWARE_DESIGN` |
| Ngõ kích | Mặc định ba trạng thái, bảo vệ ngõ ra số và tranh chấp | `TBD_BY_HARDWARE_DESIGN` |
| Chuyển mạch | Tuyến mặc định hở, chuyển an toàn, giữ dây nối sinh viên | `TBD_BY_HARDWARE_DESIGN` |
| Khởi động | Cấp nguồn có bảo vệ sau khi quét mới, kiểm tra an toàn và áp dụng kế hoạch thực thi | `TBD_BY_HARDWARE_DESIGN` |
| Khi chạy | Watchdog, heartbeat, liên động lỗi, bảo vệ khi chạy | `TBD_BY_HARDWARE_DESIGN` |
| Dọn dẹp | Giới hạn thời gian về trạng thái an toàn, tắt nguồn kích/clock/Generator, giải phóng hoặc cách ly | `TBD_BY_HARDWARE_DESIGN` |

Lỗi gồm chập VCC/GND, tranh chấp ngõ kích nguy hiểm, rủi ro cực tính, điện
áp, dòng điện, hỏng bảo vệ, kết quả quét hoặc kế hoạch đã cũ, lỗi hoặc mất
driver, timeout hoặc sai giao thức. `UNSAFE` và `INDETERMINATE` chặn cấp nguồn
và bắt đầu chạy. Thiếu driver báo chưa khả dụng và `hardware_applied=false`.
Dọn dẹp an toàn thất bại giữ trạm ở trạng thái cách ly.

Mạch có linh kiện sai hoặc chưa nhận dạng vẫn có thể chạy có bảo vệ khi
xác thực được an toàn, bảo vệ và khả năng thực thi của điểm cuối. Hành vi
quan sát xác định `PASS`, `FAIL`, `PARTIAL` hoặc `NO_RESPONSE`. Công bố an
toàn điện cần sơ đồ, datasheet linh kiện đã chọn, ánh xạ chân và phép đo.
Kiểm thử máy trạng thái và RTL xác minh bất biến điều khiển.

Quan sát cần tham chiếu nút, kết nối và chân hợp lệ, ID chân duy nhất và
`UNKNOWN` cho danh tính chưa rõ. Bằng chứng driver sai trả `DRIVER_ERROR`
và quay về trạng thái an toàn trước khi định tuyến hoặc cấp nguồn.
`TopologyResolver` ánh xạ điểm cuối tham chiếu tới nút thực tế đã quan
sát của sinh viên. Điểm cuối bắt buộc chưa phân giải chặn thực thi. Sai
lệch, mơ hồ cấu trúc và chấm điểm độc lập với an toàn điện.

Kế hoạch kiểm tra cấu hình Generator ban đầu trước khi cấp nguồn có bảo
vệ. Cập nhật trực tiếp cần hỗ trợ cấu hình lại, `RUNNING`, chủ sở hữu, lượt
thuê đang hoạt động, bằng chứng an toàn mới từ driver và giới hạn profile.
Thiếu thiết kế ADC/DAC/AFE thì Scope và Generator có 0 kênh và Apply trực
tiếp chưa khả dụng. Ca kiểm thử hai suất chỉ xác minh tiếp nhận của bộ
điều phối. Profile nhiều suất vật lý cần phân vùng bảo vệ độc lập. Mọi
giới hạn điện còn thiếu là `TBD_BY_HARDWARE_DESIGN`.
