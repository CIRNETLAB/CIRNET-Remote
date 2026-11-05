# Miền tín hiệu và mô phỏng cục bộ

[English](../../en/architecture/signal-domains-and-simulation.md) · [Tài liệu gốc đầy đủ](../../architecture/signal-domains-and-simulation.md)

`SignalDomain` mô tả ý định thiết kế bằng `DIGITAL`, `ANALOG`, `POWER`, `GROUND`, `CLOCK` và `MIXED`. Contracts định nghĩa cấu trúc, còn thư viện linh kiện khai báo miền cho cổng chức năng và chân vật lý. Python và trình duyệt dùng catalog được sinh và fixture dùng chung. Các cổng của bộ thực thi cũ như AND/NOT và INPUT/OUTPUT vẫn được nhận diện mà không thêm linh kiện vào bảng chọn của trình biên tập.

## Tài liệu và tính tương thích

Namespace tùy chọn có phiên bản và nằm nguyên trong tài liệu như đã soạn. Đọc, phân loại, lưu hoặc thực thi đồ thị cũ giữ định danh, phiên bản và metadata đã có.

```json
{"signal_domains":{"version":"1.0","ports":{"OUT":"CLOCK"}}}
```

Namespace 1.0 kiểm tra định danh cổng và giá trị miền. Cổng đã biết giữ khai báo trong catalog. Kiểu chưa biết vẫn chưa biết dù được gắn DIGITAL. Phiên bản namespace tương lai vẫn lưu được, còn thực thi trả `UNSUPPORTED_SIGNAL_DOMAIN_VERSION`. Kết nối trực tiếp yêu cầu miền trùng nhau hoặc cặp CLOCK/DIGITAL đã quy định. Miền chưa biết không tương thích, và MIXED không khớp tùy ý với miền khác. Tiếp điểm breadboard nhận hành vi của mạch nối theo đồ thị.

Phân loại tách DIGITAL, DC_DIGITAL, ANALOG, MIXED và UNKNOWN. POWER và GROUND mô tả hạ tầng. Adapter DC có giới hạn hỗ trợ các profile `dc-source`, `hc08-powered`, `resistor-dc`, `led-dc` và `contact-switch` đã khai báo. Adapter kiểm tra tham chiếu nguồn, cực tính, dải điện áp, đầu vào thả nổi và topology. Vector số không thể ghi đè đầu nguồn DC. Preview có thể hiện giá trị chưa biết và thiết bị chưa hỗ trợ mà không tuyên bố đã mô phỏng hành vi của chúng.

## Thực thi và khả năng hiện có

`cirnet_sim.dispatch.SimulationDispatcher` nhận `SimulationRequest` có kiểu hoặc `SimulationRequestV2` với Graph 1.2 rồi trả kết quả hay lỗi có kiểu. Provider mặc định `legacy` dùng bộ máy sự kiện số hiện có và hành vi DC có giới hạn. Adapter analog và mixed trả `ANALOG_UNAVAILABLE` hoặc `MIXED_SIGNAL_UNAVAILABLE` mà không tạo capture. `ngspice` là mã backend giữ chỗ với 0 khả năng thực thi và thiết bị.

API và Hardware chốt `CIRNET_SIMULATION_BACKEND` khi khởi động. Kế hoạch mang định danh provider, phiên bản adapter, định dạng và payload đã tuần tự hóa để worker xác định đúng provider. Provider chưa biết, bị thiếu hoặc không khớp đều gây lỗi rõ ràng. Lưu và phân loại tài liệu độc lập với khả năng của solver. Chạy ảo qua vòng đời Lab và RPC cục bộ đến worker tiến trình có giới hạn. Luồng vật lý cần topology quan sát được và quyết định an toàn riêng.

`CaptureConfiguration.max_events` cho phép tối đa 1.000.000 sự kiện được lập lịch. Capture số có giới hạn riêng 100.000 mẫu. Nếu số thay đổi quan sát vượt giới hạn đó, bộ máy trả `CAPTURE_LIMIT` mà không trả capture một phần, và Hardware ánh xạ lỗi thành `UNEXECUTABLE`. Xem [catalog capture](capture-catalog.md) và [an toàn phòng thí nghiệm vật lý](physical-lab-safety.md).
