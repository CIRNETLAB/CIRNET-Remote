# Đặc tả mạch và phòng thí nghiệm vật lý

[English](../../en/api/circuit-and-physical-lab.md) · [Điểm vào đặc tả mạch](../../en/api/circuit-spec-reference.md) · [Kiến trúc chuẩn Lab-First v3.1](../../en/architecture/lab-first-v3-1.md) · [API ứng dụng](application.md)

## CircuitGraph và cách đặt linh kiện

`CircuitGraph` là `DesignGraph` logic. Contracts `0.1.2` đã chọn có schema riêng cho `schema_version` 1.0, 1.1 và 1.2 bổ sung. Thao tác kiểm tra mạch cũ chấp nhận 1.0 và 1.1. `POST /api/v2/circuits/validate` và `POST /api/v2/circuits/physical-preview` chấp nhận 1.0, 1.1 và 1.2. Xem trước mạch vật lý là mô phỏng, có `provenance: simulation_preview`. Mô phỏng dùng các mô hình DC và số phục vụ học tập trong phạm vi thực thi được hỗ trợ. [Schema mạch](https://github.com/cirnetlab/cirnet-contracts/tree/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/circuit-schema) · [Đăng ký route theo phiên bản](../../../services/api/app/api/placement.py)

| Phiên bản đồ thị | Đặt và lưu linh kiện |
| --- | --- |
| 1.0 | Chuỗi điểm cuối nguồn và đích logic giữ nguyên ý nghĩa ban đầu |
| 1.1 | Tư thế gắn linh kiện cứng theo hệ tọa độ bo, linh kiện/vỏ có phiên bản và liên kết chân–tiếp điểm đã kiểm tra. Tài liệu trước đó giữ nguyên ý nghĩa. |
| 1.2 | `FlexibleMountV1` bổ sung một tư thế 3D làm nguồn chuẩn cho thân linh kiện theo hệ tọa độ bo, profile cơ khí có phiên bản, hai liên kết chân–tiếp điểm ổn định và các điểm điều khiển chân dẫn có giới hạn. Linh kiện đã gắn lưu một tư thế duy nhất và chỉ lưu dữ liệu thiết kế. |

Thao tác đặt tự động mới dùng `FlexibleMountV2` với `version: 2`, `geometryRevision: 2` và mẫu định tuyến tường minh. Tư thế V1 và điểm điều khiển uốn thủ công đã lưu tiếp tục chi phối những linh kiện tương ứng. Linh kiện vật lý đặt tự do có thể khóa `physicalDescriptor`. Bộ đọc phân giải đúng phiên bản linh kiện và vỏ cũ. Đọc hoặc lưu thông thường giữ nguyên hình học. Thao tác dựng lại hoặc chuyển đổi tường minh có thể chọn biểu diễn khác đã qua kiểm tra. Đây là hành vi đặt và lưu linh kiện đã triển khai. [Hướng dẫn đặt linh kiện](../../en/architecture/component-placement.md) · [Đặc tả gắn linh hoạt đã chọn](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/design-models/flexible-placement.md)

Cổng nguồn/đích có tên và liên kết tiếp điểm đã khai báo xác định kết nối điện. Giữ các kiểm tra chuẩn về hướng, độ rộng, trùng lặp và ngõ kích bổ sung khi tạo mạch. Schema bộ nhớ giữ phiên bản `1.0` riêng. Điều khiển nguồn và thiết bị đo trên giao diện cần nguồn điện hoặc đường đo được khai báo riêng. [Biên bản kiểm chứng nguồn điện theo thời điểm](../history/power-supply-controls.md)

## Quan sát, bài tập và thực thi

`DetectedTopologyGraph` là hợp đồng quan sát có phiên bản riêng. Nó giữ nguyên dây nối sai, thiếu hoặc phát sinh, thành phần chưa nhận dạng và điểm còn mơ hồ. Tiếp điểm vật lý, nút điện, tài nguyên định tuyến và kênh FPGA là các định danh khác nhau. `AssignmentDefinition` giữ liên kết `LabEndpoint`, cấu trúc và thiết kế tham chiếu tùy chọn, profile, hành vi mong đợi và chính sách đánh giá. Việc chấm dùng bằng chứng cấu trúc và chức năng theo chính sách của bài tập, độc lập với tọa độ đặt linh kiện của giảng viên.

Linh kiện quan sát được có thể cung cấp `pins: ObservedPinBinding[]`, gồm định danh chân/nút, độ tin cậy, vai trò suy ra và ghi nhận tùy chọn. Phần thiếu bằng chứng giữ trạng thái chưa rõ, và danh tính chưa xác định giữ `UNKNOWN`. Kiểm tra Python và trình duyệt từ chối chân hoặc kết nối trùng và tham chiếu nút không tồn tại. Bộ kiểm tra `CircuitGraph` hiện có kiểm tra `DesignGraph` tham chiếu.

| Dạng `LabEndpoint` | Ý nghĩa |
| --- | --- |
| `fixed_node_id` | Vị trí cố định bắt buộc trên trạm |
| `reference_node_id` | Tham chiếu độc lập với vị trí, cần phân giải |
| `design_port` | Cổng thực thi ảo |
| `node_id` cũ | Tên đã ngừng khuyến nghị, chỉ mang nghĩa vị trí cố định |

Kênh thiết bị đo hiển thị cho người dùng, kể cả Logic Analyzer, đánh số từ **1**. Driver chuyển sang cách đánh số nội bộ. `TopologyResolutionResult` ghi `RESOLVED`, `PARTIAL`, `AMBIGUOUS` hoặc `UNRESOLVED` cùng nút điểm cuối thực tế quan sát được, độc lập với chấm điểm. Bằng chứng có cấu trúc giữ lỗi an toàn, chẩn đoán linh kiện/net/chân và các mốc chức năng mong đợi hoặc quan sát được. Hợp đồng Lab 1.0 hiện có đã đóng băng. `AssignmentDefinitionV2` mang tham chiếu Graph 1.2 qua thao tác soạn bài theo phiên bản và chế độ xem của sinh viên/giảng viên. Hardware RPC và các phiên bản Lab còn lại có miền phiên bản riêng.

```text
DetectedTopologyGraph -> TopologyResolver
-> ResolvedLabBindings (TopologyResolutionResult.endpoint_bindings)
-> LabExecutionCompiler
```

Bộ phân giải ghép danh tính được hỗ trợ hoặc profile tường minh và so sánh quan hệ linh kiện–chân–net. Bộ phân giải đếm linh kiện lặp theo đa tập và ghi nhận mơ hồ khi còn nhiều ánh xạ hoặc tìm kiếm đạt giới hạn. Nút tham chiếu cần ánh xạ sang nút thực tế quan sát được. Điểm cuối thiết bị đo có mốc xác định vẫn có thể phân giải khi dây nối bên trong bị sai. Định tuyến dùng dây thực tế quan sát được. Bằng chứng vật lý sai cấu trúc dẫn đến `DRIVER_ERROR` và quay về trạng thái an toàn. [Triển khai bộ phân giải](../../../services/api/app/services/topology_resolver.py)

`SafetyVerificationResult`, `TopologyVerificationResult` và `FunctionalVerificationResult` độc lập. `ExecutionDecision` chặn khi không an toàn, an toàn chưa xác định hoặc hạ tầng không thể thực thi. Lab Execution Compiler sinh `InstrumentationExecutionPlan` cho nguồn, ngõ kích, clock, thiết bị đo, đường đọc tín hiệu, bản thu, vector thử và bảo vệ khi chạy. Dây nối bên trong do sinh viên lắp vẫn là hiện trạng vật lý. Kết quả chức năng chứa các mốc mong đợi/quan sát đã khai báo và các dòng bảng chân trị thực sự được thử. Mức logic `X` khác với không có phản hồi. Chính sách đánh giá quyết định cách chấm riêng với an toàn và khả năng thực thi. Phản hồi trình duyệt và Python dùng schema chung và kiểu sinh tự động. Chạy `python -B scripts/sync_lab_contracts.py --check` để kiểm tra các bản chiếu sau khi đổi hợp đồng. [Chính sách thực thi](../../../services/api/app/services/execution_policy.py)

## Năng lực trạm và đích phần cứng

`StationCapabilities` báo trạng thái khả dụng và chế độ, hỗ trợ số hoặc tương tự ảo/vật lý, quét/an toàn/chạy có bảo vệ, chế độ phân giải, `instrument_capabilities`, định tuyến/tài nguyên cùng `hardware_rpc_version`, `fpga_protocol_version`, `firmware_version` và `hardware_profile_version`. Các miền phiên bản độc lập với CircuitGraph, lớp truyền thông và bản phát hành sản phẩm. `instrument_capabilities` là nguồn quyết định năng lực thiết bị đo khi chạy. Có 0 kênh nghĩa là chưa khả dụng. Profile cung cấp giới hạn tùy chọn và cờ cấu hình lại khi chạy. `InstrumentationExecutionPlan` chứa cấu hình Generator ban đầu. Thay đổi khi chạy cần hỗ trợ đã công bố, trạng thái `RUNNING`, quyền sở hữu, quyền giữ trạm còn hiệu lực và bằng chứng an toàn hiện tại trong giới hạn profile. Năng lực hiện tại cho biết số suất vật lý. Hai dịch vụ dùng chung `CIRNET_SIMULATION_WORKERS`, số nguyên dương mặc định 4, cho các tiến trình mô phỏng `spawn`.

Máy chủ triển khai đích là Linux Mini PC dùng Intel Xeon W-1370, RAM 16 GB và SSD 256 GB. Kế hoạch phần cứng dùng nguyên mẫu EP4CE6E22C8N không SDRAM và đích tương lai EP4CE10E22C8N với SDRAM ngoài, hai kênh Scope, hai kênh Generator, Logic Analyzer và phân quyền tài nguyên dùng chung. Định tuyến tương tự vật lý ở V1 là `false`. Mục tiêu là một suất vật lý dùng chung. Profile thực tế cung cấp số bo, tài nguyên và kênh khả dụng. Hỗ trợ vật lý cần bằng chứng về driver và phần cứng. Sản phẩm FPGA 0.1.2 đã chọn là khung mã nguồn. [Đối chiếu hợp đồng FPGA](../architecture/fpga-contract-conformance.md) · [Khóa bản phát hành đã chọn](../../../integration/release-set.json)

Cơ chế bảo vệ cần giới hạn và đo dòng, ngắt nhanh, ngõ kích ba trạng thái, tuyến mặc định hở, ngõ ra số có bảo vệ, cấp nguồn có kiểm soát, watchdog và bảo vệ khi chạy, cùng thời gian về trạng thái an toàn có giới hạn. Sơ đồ chân/điện áp bank, sơ đồ chuyển mạch và bảo vệ, lựa chọn ADC/DAC/AFE, linh kiện và timing SDRAM, IC truyền thông, các giới hạn và phép đo dòng, áp, tốc độ lấy mẫu, tần số vẫn là `TBD_BY_HARDWARE_DESIGN`. Kiểm thử phần mềm xác lập hành vi điều khiển. Kiểm chứng điện cần sơ đồ, linh kiện và kết quả đo riêng. [An toàn phòng thí nghiệm vật lý](../architecture/physical-lab-safety.md) · [Bằng chứng phát hành cục bộ theo ngày](../../en/history/verification/2026-11-05-cirnet-release-0.1.4.md)

## Bản thu và bằng chứng

`CaptureMetadata` nằm trong bản ghi vòng đời và SQL. `CaptureStore` giữ riêng nội dung bản thu. NCAP `digital_events` v1 bắt đầu bằng mã nhận dạng `NCAP`, phiên bản `uint8`, độ dài header JSON UTF-8 kiểu `uint32` little-endian, rồi đến header. Phần thân gồm các sự kiện little-endian dài 11 byte với chỉ số kênh `uint16`, `uint64 time_ns` và giá trị `uint8` (`0`, `1` hoặc `2` cho `X`). Định dạng giới hạn 100.000 sự kiện, 4.096 kênh và header 64 KiB. Thời điểm và thời lượng tín hiệu số là số nguyên an toàn của JavaScript. `timestamp_ns` theo epoch là chuỗi thập phân.

NCAP v2 cung cấp codec `INT16`, `UINT16`, `FLOAT32`, mô tả và fixture tổng hợp để kiểm tra tương thích. Bộ tạo dữ liệu lấy mẫu khi chạy và endpoint v2 mặc định là `NOT_IMPLEMENTED`. Scope chưa khả dụng. Chủ sở hữu tải hoặc xóa riêng nội dung qua `/api/captures/{capture_id}/payload`. Khi loại bỏ, hệ thống giữ siêu dữ liệu và lịch sử, đồng thời đặt `available=false`. [Định dạng bản thu đã chọn](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/capture/README.md) · [Danh mục bản thu](../architecture/capture-catalog.md)

## Tạo dây nối breadboard ghi nhận ngày 2026-10-14

CircuitGraph 1.0 giữ chuỗi điểm cuối nguồn/đích. Ví dụ, `BB.contact:terminal:A:01` được phân giải qua danh mục breadboard của Contracts. Các nút năm lỗ nối sẵn và hàng thanh nguồn liền mạch được khai báo tường minh. Điểm gấp, màu và chế độ đi dây chỉ nằm trong `metadata.wireVisual`, dùng mốc theo hệ tọa độ thế giới hoặc theo linh kiện. Gắn một đầu nối cần kết nối đã khai báo. Trình biên dịch ảo hợp nhất nút nối sẵn, dây nối tường minh và đầu nối linh kiện được hỗ trợ trước khi chuyển thành net số. Thực thi vật lý dùng cấu trúc quan sát được và tài nguyên trạm. Tiếp điểm trong trình biên tập là định danh ở lớp thiết kế. [Danh mục breadboard đã chọn](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/design-models/breadboards.json) · [Phân tích công cụ đi dây gốc](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md)
