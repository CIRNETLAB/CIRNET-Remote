# Kiến trúc hệ thống CIRNET Remote

[English](../../en/architecture/system.md) · [Tài liệu kiến trúc chuẩn Lab-First v3.1](../../ARCHITECTURE.md)

## Ranh giới hệ thống

Trình duyệt dùng Vue 3, TypeScript, Pinia và Three.js trong một không gian làm việc. Khi triển khai production, Nginx phục vụ Interface và chuyển REST, WebSocket cùng origin đến một tiến trình FastAPI điều phối tại `127.0.0.1:8000`. API gọi Hardware Service chạy riêng qua gRPC nội bộ tại `127.0.0.1:50051`. Hardware Service quản lý vòng đời trạm và lớp truyền thông FPGA riêng. PostgreSQL lưu trạng thái bền vững trong production. SQLite dùng cho phát triển và kiểm thử. Cơ sở dữ liệu lưu siêu dữ liệu bản thu, còn kho bản thu giữ nội dung dung lượng lớn.

| Kho mã | Trách nhiệm |
| --- | --- |
| [cirnet-remote](https://github.com/cirnetlab/cirnet-remote) | API, xác thực, lưu trữ, điều phối, triển khai và kiểm chứng tích hợp |
| [cirnet-contracts](https://github.com/cirnetlab/cirnet-contracts) | Schema, danh mục thiết bị, hợp đồng giao thức RPC/FPGA, tài nguyên sinh tự động và SDK công khai |
| [cirnet-interface](https://github.com/cirnetlab/cirnet-interface) | Trình biên tập Web, lớp gọi API từ trình duyệt, tài nguyên sản phẩm và các phép kiểm tra trình duyệt |
| [cirnet-simulator](https://github.com/cirnetlab/cirnet-simulator) | Bộ mô phỏng và giao diện thay thế backend |
| [cirnet-hardware](https://github.com/cirnetlab/cirnet-hardware) | RPC nội bộ, bộ điều hợp trạm ảo/vật lý và lớp truyền thông riêng |
| [cirnet-fpga](https://github.com/cirnetlab/cirnet-fpga) | Khung RTL, testbench và bộ công cụ kiểm chứng đã khóa phiên bản |

[Khóa bản phát hành](../../../integration/release-set.json) chọn hệ thống và Interface `0.1.4`, cùng API, Contracts, Simulator, Hardware và khung FPGA `0.1.2`. Tệp này khóa chính xác gói phát hành, RPC `2.0`, giao thức logic FPGA `1.0-scaffold` và sơ đồ thanh ghi `1.0-reserved`. Khung FPGA được phân phối dưới dạng mã nguồn. [API ứng dụng](../api/application.md) · [Đối chiếu hợp đồng FPGA](fpga-contract-conformance.md)

## Thiết kế và cấu trúc mạch quan sát được

`CircuitGraph` 1.0, 1.1 và 1.2 là nguồn dữ liệu chuẩn của thiết kế logic. Phiên bản 1.1 bổ sung cách gắn linh kiện cứng và liên kết tiếp xúc đã kiểm tra. Phiên bản 1.2 bổ sung cụm linh hoạt và mô tả linh kiện tự do được khóa theo phiên bản. Thao tác đặt linh kiện linh hoạt mới dùng `FlexibleMountV2` tự động. Hình học V1 đã lưu và các phiên bản mô tả cũ vẫn đọc được. Three.js hiển thị đồ thị này. Tọa độ tự thân không tạo net. Linh kiện xem trước chỉ vào đồ thị khi người dùng xác nhận đặt. Các thao tác `/api/v2` tiếp nhận cấu trúc mới song song với các thao tác hiện có. [Đặc tả mạch](../../CIRCUIT_SPEC.md) · [Hướng dẫn đặt linh kiện](../../COMPONENT_PLACEMENT.md)

`DetectedTopologyGraph` ghi lại những gì thực sự quan sát được, gồm linh kiện và net thiếu hoặc phát sinh, thông mạch chưa rõ và danh tính linh kiện chưa xác định. `AssignmentDefinition` có thể chứa thiết kế hoặc cấu trúc mạch tham chiếu, hành vi mong đợi, chính sách chấm điểm và liên kết `LabEndpoint`. Điểm cuối có thể chọn nút quan sát cố định, nút tham chiếu cần phân giải hoặc cổng thiết kế ảo. Bộ phân giải ánh xạ điểm cuối tham chiếu đủ bằng chứng sang nút thực tế của sinh viên. Quan sát chưa rõ giữ nguyên trạng thái chưa rõ. Hệ thống chặn chạy khi không phân giải được điểm cuối bắt buộc.

## Chạy, quan sát và đánh giá

```text
Xếp lịch FIFO và giữ quyền sử dụng -> SAFE_STATE -> quét -> kiểm tra an toàn
-> phân giải và chẩn đoán cấu trúc mạch -> biên dịch và quyết định khả năng chạy
-> định tuyến và cấp nguồn có bảo vệ -> chạy và thu tín hiệu -> kiểm tra chức năng
-> dọn dẹp an toàn -> giải phóng hoặc cách ly trạm
```

Lab Execution Compiler kiểm tra khả năng thực thi trước khi cho phép cấp nguồn và xuất `InstrumentationExecutionPlan`. Kế hoạch gồm hạ tầng như VCC/GND, kích và đo tín hiệu, clock, phân bổ thiết bị đo, kích hoạt thu và bảo vệ. Kế hoạch giữ nguyên IC và dây nối sinh viên đã lắp, đồng thời không chứa thanh ghi FPGA thô, địa chỉ MUX hay định danh truyền thông Linux. [An toàn phòng thí nghiệm vật lý](physical-lab-safety.md)

| Bằng chứng | Kết quả |
| --- | --- |
| An toàn `UNSAFE` hoặc `INDETERMINATE` | `BLOCK_SAFETY` |
| Thiếu tài nguyên, liên kết hoặc khả năng bắt buộc | `BLOCK_UNEXECUTABLE` |
| Mạch an toàn, thực thi được nhưng sai cấu trúc | `RUN_NORMAL` hoặc `RUN_GUARDED`, kèm chẩn đoán cấu trúc riêng |
| Chưa rõ danh tính linh kiện, nhưng an toàn, định tuyến được và có bảo vệ | `RUN_GUARDED` |

An toàn, cấu trúc và chức năng cho ba kết quả độc lập. Kiểm tra chức năng dùng hành vi thu được. Chính sách đánh giá điều khiển cách chấm và nội dung được công bố. Ví dụ, mạch đi dây sai nhưng vẫn an toàn có thể chạy theo đúng dây quan sát được rồi không đạt kiểm tra chức năng. Kết quả cấu trúc vẫn được giữ làm chẩn đoán riêng.

## Ranh giới khi chạy

- Trạm ảo chạy bộ mô phỏng số hiện có và phần DC giới hạn. Giá trị chọn `ngspice` được dành trước và báo chưa khả dụng. Mô phỏng tương tự hoặc hỗn hợp đầy đủ cần backend thực sự hỗ trợ. [Miền tín hiệu và mô phỏng](signal-domains-and-simulation.md)
- `instrument_capabilities` công bố các kênh dùng được. Giá trị `0` nghĩa là chưa khả dụng. Giao diện đánh số kênh từ 1. Logic Analyzer ảo có bốn kênh. Scope và Generator có 0 kênh ở cấu hình cơ sở. [Cô lập điều khiển](control-isolation-and-runtime-index.md)
- Bộ điều phối nhận việc vật lý theo `physical_execution_slots` hiện tại. Mất kết nối, hết hạn giữ trạm hoặc lỗi kích hoạt Stop và dọn dẹp an toàn. Dọn dẹp thất bại khiến trạm bị cách ly. API và Hardware Service dùng chung `CIRNET_SIMULATION_WORKERS`, mặc định bốn, với các tiến trình `spawn` cho mô phỏng nặng CPU.
- Danh tính bền vững sở hữu dự án và bản thu. Phiên máy chủ xác thực yêu cầu. Định danh tab điều khiển gắn vòng đời lần chạy với phiên đã xác thực. Tab xem đọc được trạng thái đã cấp quyền. Kết nối lại đối soát kết quả lệnh đã lưu và không phát lại lệnh. [Dự án và phiên bản](projects-and-revisions.md) · [Theo dõi kết quả đang chờ](pending-observations.md)
- HTTP và sự kiện thời gian thực ẩn đáp án tham chiếu theo chính sách bài tập mặc định `observed_only`. JSON thí nghiệm và sự kiện mang `CaptureMetadata`. Endpoint bản thu kiểm tra quyền sở hữu rồi cung cấp dữ liệu nhị phân NCAP. Codec NCAP v2 hỗ trợ định dạng dữ liệu lấy mẫu, còn bộ tạo bản thu hiện tại dùng NCAP v1. [Công bố bài tập](assignments-and-publication.md) · [Danh mục bản thu](capture-catalog.md)

[Báo cáo phát hành cục bộ 0.1.4](../../verification/2026-11-05-cirnet-release-0.1.4.md) ghi kết quả Windows và các kiểm tra phần mềm tương ứng. [Báo cáo kiểm tra hạ tầng sau đó](../../verification/2026-11-05-test-infrastructure-audit.md) tách kết quả hosted của bản phát hành và kết quả cục bộ sau bản sửa. [Biên bản chuyển đổi native Giai đoạn 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md) ghi môi trường riêng và các cổng kiểm tra còn mở. Kết luận về an toàn điện và triển khai đích cần bằng chứng từ đúng môi trường tương ứng.
