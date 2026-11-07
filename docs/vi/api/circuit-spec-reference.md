# Đặc tả mạch và phòng thí nghiệm vật lý theo Lab-First

[English](../../en/api/circuit-spec-reference.md) · [Tham chiếu mạch và phòng thí nghiệm vật lý](circuit-and-physical-lab.md)

Trang tham chiếu mô tả các phiên bản đồ thị hiện hành, cấu trúc quan sát được,
năng lực trạm và định dạng NCAP. [Đặc tả Lab-First](../architecture/lab-first-v3-1.md)
quy định hành vi hệ thống. Xem [đặt linh kiện](../architecture/component-placement.md)
và [hợp đồng an toàn vật lý](../architecture/physical-lab-safety-contract.md)
để tra các yêu cầu chi tiết.

`CircuitGraph` mô tả thiết kế còn `DetectedTopologyGraph` mô tả dây nối quan
sát được. Lab Execution Compiler tạo `InstrumentationExecutionPlan` cho hạ
tầng phòng thí nghiệm. Kế hoạch phần cứng bắt đầu với EP4CE6E22C8N không có
SDRAM và dành EP4CE10E22C8N có SDRAM ngoài cho mục tiêu tương lai.

## Kết nối trên breadboard

Định danh tiếp điểm như `BB.contact:terminal:A:01` được phân giải qua danh
mục Contracts. Các cụm năm lỗ và thanh nguồn liền mạch có kết nối khai báo.
Điểm gấp, màu và chế độ đi dây nằm trong `metadata.wireVisual` và ảnh hưởng
đến hiển thị. Trình biên dịch ảo hợp nhất các nút nối sẵn, dây nối đã khai báo
và đầu nối linh kiện được hỗ trợ trước khi tạo net số. Luồng thực thi vật lý
dùng dây nối quan sát được và tài nguyên trạm đã xác thực.
[Chi tiết breadboard và bằng chứng gốc](circuit-and-physical-lab.md#tạo-dây-nối-breadboard-ghi-nhận-ngày-2026-10-14)
