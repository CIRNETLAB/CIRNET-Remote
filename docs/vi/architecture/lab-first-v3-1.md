# CIRNET Remote — Lab-First v3.1

[English](../../en/architecture/lab-first-v3-1.md) · [Kiến trúc hệ thống](system.md)

Đặc tả này quy định các yêu cầu hệ thống và an toàn của Lab-First.
[Kiến trúc hệ thống](system.md) mô tả topology của bản đang chọn, còn
[trạng thái chuyển đổi](native-migration-status.md) ghi các tổ hợp native đã
xác minh. Báo cáo theo ngày và đề xuất lưu trữ có phạm vi riêng.
[Tên và bí danh tương thích](../operations/namespace-compatibility.md)

Phòng thí nghiệm ưu tiên thao tác thực hành, kiểm tra an toàn trước khi chạy,
và dùng hợp đồng chung để nối môi trường ảo với thiết bị vật lý. Máy kiểm tra
an toàn, mạch an toàn được chạy và phần mềm quan sát hành vi thực để đánh giá.
An toàn, độ chắc chắn về danh tính, độ khớp cấu trúc và khả năng chạy được xét riêng.

## Ranh giới hệ thống

Bản đang chọn dùng trình duyệt Vue 3, TypeScript, Pinia và Three.js. Nginx nhận
REST và WebSocket cùng origin, chuyển tới FastAPI. API gọi Hardware Service
qua gRPC nội bộ. API dùng chung giao diện `HardwareStation` cho trạm ảo và trạm
vật lý. Hardware Service chạy riêng, sở hữu điều khiển và truyền thông FPGA.

Máy đích production là Mini PC Linux với Intel Xeon W-1370, RAM 16 GB và SSD
256 GB. Bản đã chọn dùng Nginx, systemd, FastAPI, Hardware Service và PostgreSQL.
SQLite dùng được cho phát triển và kiểm thử. Cơ sở dữ liệu giữ siêu dữ liệu
bản thu. Kho bản thu giữ nội dung dung lượng lớn.

Năng lực công bố theo hỗ trợ đã triển khai. Thực thi tương tự ảo cần backend
SPICE hoạt động. Thực thi số vật lý cần driver, profile và bảo vệ đã xác thực.
Định tuyến tương tự vật lý nằm ngoài V1.

## Thiết kế và hiện trạng vật lý

`CircuitGraph` 1.0, 1.1 và 1.2 là nguồn dữ liệu của thiết kế logic. Cảnh Three.js
hiển thị đồ thị. Phiên bản 1.1 bổ sung tư thế gắn linh kiện cứng theo hệ tọa độ
bo, phiên bản linh kiện và vỏ, cùng liên kết chân–tiếp điểm đã kiểm tra. Phiên bản
1.2 bổ sung cụm linh hoạt và mô tả linh kiện tự do khóa theo phiên bản. Thao tác
mới dùng hình học `FlexibleMountV2` tự động. V1 uốn tay đã lưu và mô tả cũ giữ
nguyên ý nghĩa. Các thao tác tài liệu và bài tập `/api/v2` nhận đồ thị mới song
song với hợp đồng cũ đã chốt. Tọa độ tự thân không tạo net. Giữ lệnh, lịch sử,
kết nối tường minh, bóng xem trước, gizmo, camera và quyền sở hữu tài nguyên.
Bóng chỉ vào đồ thị khi xác nhận đặt. [Đặt linh kiện](component-placement.md) · [Hợp đồng gắn linh hoạt](https://github.com/cirnetlab/cirnet-contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md)

Quy tắc cạnh trùng, hướng, độ rộng và ngõ kích bổ sung áp dụng khi thiết kế.
`DetectedTopologyGraph` giữ dây nối sai, thiếu, phát sinh, linh kiện sai hoặc
chưa rõ và các quan sát mơ hồ. Trong V1 lắp breadboard thủ công, IC và dây nối
do sinh viên lắp là hiện trạng vật lý. Việc chấm xét bằng chứng, độc lập với
vị trí đặt linh kiện của giảng viên.

`AssignmentDefinition` có thể giữ thiết kế và cấu trúc tham chiếu, linh kiện
mong đợi, profile chân, hành vi mong đợi, chính sách đánh giá và các
`LabEndpoint`. Vai trò gồm `INPUT_SOURCE`, `OUTPUT_SENSE`, `CLOCK`, `VCC`,
`GND`, `GENERATOR`, `SCOPE`, `LOGIC_ANALYZER`. Chế độ phân giải gồm
`AUTO_DISCOVERY`, `INSTRUCTOR_PROFILE` và `HYBRID`. V1 ưu tiên `HYBRID`.
`OPAQUE_PHYSICAL_COMPONENT` biểu diễn linh kiện chưa nhận dạng.

`ObservedPinBinding` ánh xạ `pin_id` sang `node_id` và có thể giữ độ tin cậy,
vai trò suy ra và ghi nhận. Thiếu bằng chứng giữ trạng thái chưa rõ. Danh tính
chưa rõ là `UNKNOWN`. Python và trình duyệt từ chối chân hoặc kết nối trùng
định danh và tham chiếu nút không tồn tại. `DesignGraph` tham chiếu dùng bộ
kiểm tra `CircuitGraph`.

Mỗi `LabEndpoint` chọn `fixed_node_id`, `reference_node_id` hoặc `design_port`
ảo. Trường `node_id` cũ chỉ chọn vị trí cố định. `TopologyResolutionResult`
ghi `RESOLVED`, `PARTIAL`, `AMBIGUOUS` hoặc `UNRESOLVED`, cùng các cặp linh kiện
và `ResolvedEndpointBinding` tới nút thực tế của sinh viên. Nút tham chiếu chỉ
được dùng để định tuyến sau khi phân giải. Scope, Generator và Logic Analyzer
đánh số kênh hiển thị từ 1.

```text
DetectedTopologyGraph + AssignmentDefinition / profile giảng viên
        ↓
TopologyResolver
        ↓
ResolvedLabBindings (TopologyResolutionResult.endpoint_bindings)
        ↓
LabExecutionCompiler
```

Điểm cuối bắt buộc chưa phân giải dẫn tới `BLOCK_UNEXECUTABLE`, độc lập với
chấm cấu trúc. Bằng chứng nút, chân hoặc kết nối sai cấu trúc dẫn tới
`DRIVER_ERROR` và quay về trạng thái an toàn.

## Chạy vật lý

Bộ điều phối cấp lượt thuê trạm, đưa trạm về `SAFE_STATE`, rồi quét cấu trúc.
Luồng tiếp theo kiểm tra an toàn, phân giải điểm cuối và chẩn đoán cấu trúc.
Bộ biên dịch kiểm tra khả năng thực thi trước khi cho phép cấp nguồn. Việc
biên dịch không thao tác phần cứng. `ExecutionDecision` dùng kết quả an toàn
và khả năng thực thi. Chẩn đoán cấu trúc phục vụ phản hồi.

Bộ phân giải hợp nhất các kết nối điện đã quan sát và so sánh quan hệ linh
kiện–chân–net độc lập với nhãn nút. Các chế độ dùng danh tính được hỗ trợ hoặc
profile giảng viên tường minh. Chân thiếu bằng chứng và linh kiện chưa nhận
dạng giữ nguyên trạng thái. Bộ đếm giữ số lượng từng loại linh kiện lặp.
Việc ghép giới hạn ở 32 linh kiện, 64 ánh xạ ứng viên và 4.096 bước tìm kiếm.
Nhiều ánh xạ hoặc hết ngân sách tìm kiếm trả `AMBIGUOUS`. Mốc linh kiện duy
nhất có thể phân giải điểm cuối dù mạch đi dây sai. Định tuyến giữ dây thực
tế. Điểm cuối cố định vẫn dùng được nếu phần mơ hồ không liên quan.
[Bộ phân giải Python](../../../services/api/app/services/topology_resolver.py) · [Bộ phân giải ứng viên Rust](../../../native/src/compiler/topology.rs)

Bộ cấp phát chọn chung bí danh đầu nối trên cùng net đã được chứng minh với
tài nguyên hoàn chỉnh cho tất cả điểm cuối. Quan sát mơ hồ toàn cục hoặc thông
mạch có độ tin cậy bằng 0 chặn suy diễn liên kết tham chiếu. Chân có độ tin cậy
bằng 0 loại cặp linh kiện liên quan. Điểm cuối quan sát cố định vẫn dùng được.
Khi có độ tin cậy dương, kết quả lấy giá trị nhỏ nhất của bằng chứng đã cung
cấp. Ngưỡng an toàn điện cần được xác định riêng.

Quyết định chặn kết thúc yêu cầu. Khi được phép, hệ thống áp dụng kế hoạch
hạ tầng, định tuyến, cấp nguồn có bảo vệ, chạy mạch thật, quan sát tín hiệu
rồi kiểm tra chức năng.

- `SafetyVerificationResult` có `SAFE`, `UNSAFE`, `INDETERMINATE`. Hai kết quả
  sau chặn cấp nguồn. Các lỗi gồm chập nguồn, tranh chấp ngõ kích nguy hiểm,
  rủi ro cực tính, điện áp, dòng điện và hỏng bảo vệ.
- `TopologyVerificationResult` có `MATCH`, `MISMATCH`, `UNKNOWN`, `AMBIGUOUS`
  và phục vụ chẩn đoán, đánh giá và phản hồi.
- `FunctionalVerificationResult` có `PASS`, `FAIL`, `PARTIAL`, `NO_RESPONSE`,
  `NOT_EVALUATED` và dựa vào hành vi quan sát sau khi chạy.

Bằng chứng có cấu trúc giữ lỗi an toàn, linh kiện/net/chân khác biệt, tín hiệu
mong đợi và quan sát được, cùng các trường hợp bảng chân trị đã thử.

| Bằng chứng | `ExecutionDecision` |
| --- | --- |
| Không an toàn hoặc an toàn chưa xác định | `BLOCK_SAFETY` |
| Thiếu điểm cuối, tài nguyên hoặc năng lực bắt buộc | `BLOCK_UNEXECUTABLE` |
| Sai IC, dây nối hoặc cấu trúc, nhưng vẫn an toàn | `RUN_NORMAL` hoặc `RUN_GUARDED` khi thực thi được |
| Chưa rõ danh tính, nhưng an toàn, thực thi được và có bảo vệ | `RUN_GUARDED` |

Bảo vệ điện cần bằng chứng riêng. [Hợp đồng an toàn vật lý](physical-lab-safety-contract.md)

## Biên dịch và định tuyến

Lab Execution Compiler sinh `InstrumentationExecutionPlan` cho hạ tầng
VCC/GND, chính sách cấp nguồn, ngõ kích, clock, Generator, đường đo, cấp phát
Scope/Logic Analyzer, kích hoạt thu, vector thử và bảo vệ khi chạy. Bộ giải
định tuyến dùng tài nguyên trạm thực tế và giữ nguyên dây nối bên trong do
sinh viên lắp. Kế hoạch dùng định danh lớp ứng dụng, không chứa thanh ghi FPGA
thô, địa chỉ MUX hoặc định danh truyền thông Linux.

## Vòng đời và đồng thời

Các thao tác của `HardwareStation` gồm `get_capabilities`, `enter_safe_state`,
`scan_topology`, `read_runtime_safety`, `prepare_execution`, `apply_routing`,
`guarded_power_up`, cấu hình clock/Generator/trigger, `arm_capture`,
`start_execution`, `stop_execution`, `read_capture` và `reset`. Chạy vật lý
cần kết quả quét và an toàn mới, kế hoạch khớp trạm và thí nghiệm, định tuyến
đã áp dụng, cấp nguồn có bảo vệ và sẵn sàng thu.

Trạng thái phần cứng gồm `OFFLINE`, `IDLE`, `RESERVED`, `SAFE_STATE`,
`TOPOLOGY_SCAN`, `SAFETY_CHECK`, `ROUTE_PREPARE`, `GUARDED_POWER_UP`, `READY`,
`ARMED`, `RUNNING`, `CAPTURING`, `VERIFYING`, `STOPPING`, `RELEASE`, `FAULT`.
Trạm ảo có thể bỏ bước quét điện và chỉ báo bước thực sự diễn ra.

```text
QUEUED → RESERVED → SAFE_STATE → TOPOLOGY_SCAN → SAFETY_CHECK
→ EXECUTION_DECISION → ROUTE_PREPARE → GUARDED_POWER_UP → RUNNING
→ CAPTURING → FUNCTIONAL_VERIFY → COMPLETE → SAFE_STATE → RELEASE
```

Lỗi, ngắt kết nối, hết lượt thuê hoặc vượt thời gian chạy kích hoạt Stop và
dọn dẹp an toàn, sau đó giải phóng hoặc cách ly. Hàng đợi FIFO và hạn mức mỗi
người dùng điều phối phần cứng dùng chung.

Mục tiêu 30–50 phiên kết nối tách riêng với năng lực chạy vật lý. V1 nhắm đến
một suất trên mỗi hạ tầng dùng chung. Trạm báo số suất qua
`physical_execution_slots` đã xác thực. Trạm offline hoặc có 0 suất không
nhận chạy. FIFO lấp chỗ trống và việc giải phóng đưa yêu cầu tiếp theo vào
chạy. Trạm bị cách ly không nhận việc. Kiểm thử hai suất kiểm tra bộ điều phối.
Nhiều suất vật lý cần các phân vùng độc lập về điện.

Trạm ảo giới hạn mô phỏng nặng CPU bằng worker chạy ngoài event loop FastAPI.
Hai dịch vụ dùng chung số nguyên dương `CIRNET_SIMULATION_WORKERS`, mặc định 4.
Pool của bản đang chọn dùng `spawn`, tuần tự hóa việc nộp và kết thúc công
việc, rồi chờ worker thuộc quyền quản lý khi đóng. Mỗi pool luồng điều phối
dành thêm bốn luồng cho điều khiển để Stop có thể ngắt việc đang chạy.
V1 dùng một tiến trình điều phối API.

## Danh tính Web và ranh giới công khai

Danh tính bền vững sở hữu dữ liệu, độc lập với phiên xác thực phía máy chủ.
Mật khẩu dùng Argon2id và chỉ lưu digest của thông tin xác thực trong cookie.
Đăng nhập, đăng xuất, nhận quyền khách và đổi quyền thu hồi phiên cũ. Thao tác
HTTP thay đổi trạng thái cần Origin đã cấu hình chính xác và CSRF của phiên.
Production yêu cầu PostgreSQL, origin HTTPS tường minh và tắt khách. Khách
phát triển cần bật tường minh và có quyền Student. Vai trò không cấp quyền
đọc thí nghiệm hoặc bản thu riêng của người khác. Bootstrap cần mật khẩu
tường minh. Alembic giữ dữ liệu, lượt thuê và cách ly cũ. Chuyển quyền từ
khách cần chứng minh quyền giữ phiên và xác nhận. Chỉ bootstrap hoặc thao tác
xác thực tường minh thiết lập thông tin xác thực. Khi đổi phiên, Web kết thúc
kết nối cũ và đối soát kết quả chưa rõ bằng lượt đọc phiên có giới hạn.
[Xác thực và migration](auth-and-migrations.md)

Đọc và điều khiển có vòng đời riêng. `X-Control-Client` và kết nối sự kiện mang
định danh tab tạm thời. Run gắn định danh với phiên hiện tại. Tab quan sát chỉ
đọc trạng thái đã được cấp quyền. Thu hồi phiên, hết hạn và mất kết nối tab
điều khiển dừng lần chạy tương ứng, rồi giải phóng an toàn hoặc cách ly.
Worker kiểm tra lại phiên trước lệnh phần cứng. Lượt thuê có thời hạn cố
định. Chủ sở hữu được gửi Stop qua đường điều khiển riêng. Độ trễ Stop cần
đo trong môi trường cụ thể.

DTO công khai của trạm loại tài nguyên định tuyến riêng và kế hoạch thực
thi. Tuyến có kiểu sinh OpenAPI và liên kết thao tác mà không cần khởi động
dịch vụ. Luồng sự kiện có phiên bản, giới hạn, định danh luồng, số thứ tự và
tín hiệu đồng bộ lại. Create/Run/Stop giữ định danh thao tác bền vững theo
chủ sở hữu. ACK Run khác với hoàn thành đo. ACK Stop cần giải phóng an toàn.
Khóa quan sát đang chờ được lưu theo danh tính với giới hạn. Tải lại và kết
nối lại chỉ khôi phục khả năng quan sát, đọc kết quả theo khóa cũ.
[Quan sát đang chờ](pending-observations.md)

Sinh viên thấy bài đã công bố với các trường công khai. Chính sách mặc định
`observed_only` công bố kết quả kiểm tra, đánh giá và số đo quan sát được.
Thiết kế, ánh xạ nút, profile và đáp án tham chiếu giữ riêng. Dạng xem HTTP,
khôi phục thao tác và mọi snapshot sự kiện áp dụng cùng quy tắc. Tác giả hoặc
Admin xem bằng chứng được cấp quyền. Giảng viên có thể chọn `detailed` tường
minh. Chính sách công bố độc lập với kiểm tra và an toàn.

## Mô phỏng, giao diện và kết quả

Trong bản đang chọn, bộ kiểm tra cấu trúc và miền tín hiệu kiểm tra
`CircuitGraph` 1.0/1.1/1.2. `SimulationDispatcher` dùng `VirtualExecutionPlan`
và bộ mô phỏng sự kiện rời rạc Python với thứ tự xác định, phụ thuộc net và
trễ lan truyền. Các mô hình gồm logic số và tập DC/linh kiện vật lý giới hạn.
Miền của cổng do danh mục và namespace `signal_domains` có phiên bản khai báo.
Linh kiện chưa rõ giữ miền chưa rõ. `MIXED` chỉ biểu diễn miền hỗn hợp.
Namespace tương lai có thể lưu, còn thực thi cần adapter. Bộ mô phỏng tương
tự, SPICE và hỗn hợp trả trạng thái chưa khả dụng có kiểu và không bật
`virtual_analog`. [Miền tín hiệu và mô phỏng](signal-domains-and-simulation.md)

Kết quả gồm trạng thái, quyết định, an toàn, cấu trúc, chức năng, mẫu số, bản
thu, mốc thời gian, cảnh báo/lỗi và quan sát. Giao diện hiện riêng SAFETY,
TOPOLOGY và FUNCTION. Bản thu lớn dùng khung nhị phân có phiên bản, định danh,
kênh thiết bị đo, tốc độ và số mẫu, thời điểm và mã hóa. Chẩn đoán có giới
hạn có thể dùng JSON.

SQL và `experiment.updated` giữ `CaptureMetadata`. `FilesystemCaptureStore`
lưu nội dung NCAP v1 bất biến theo thao tác nguyên tử trong
`CIRNET_CAPTURE_DIR`, mặc định `.runtime/captures`. Chủ sở hữu tải hoặc loại
bỏ qua GET/DELETE `/api/captures/{capture_id}/payload`. NCAP v1 giữ thứ tự,
thời điểm chính xác và `0`/`1`/`X`. Codec v2 có `INT16`, `UINT16`,
`FLOAT32`, thứ tự kênh, thời gian hữu tỉ theo clock, hiệu chuẩn, clipping,
thế hệ, khoảng trống hoặc dải không hợp lệ và điều kiện kết thúc. Fixture
tổng hợp xác minh giải mã và trình bày. Runtime chưa tạo bản thu lấy mẫu và
chưa có nguồn mạng v2 mặc định. Đường bao min/max phục vụ hiển thị và giữ dữ
liệu thô cho việc đánh giá thời gian. [Định dạng bản thu](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/capture/README.md)

Migration 0005 lập chỉ mục bản thu đã chốt độc lập với thế hệ thí nghiệm.
Quyền sở hữu đến từ thí nghiệm cha. Đọc, băm và xóa byte diễn ra ngoài khóa
điều khiển và giao dịch. Đường đọc kiểm tra lại quyền và trạng thái khả dụng
trước khi trả dữ liệu. Loại bỏ đánh dấu nội dung không khả dụng và ghi kiểm
toán trong một giao dịch trước khi xóa tệp. Lỗi xóa được giữ để thử lại. Lượt
thuê đang chạy hoặc bị cách ly bảo vệ bản thu. Hạn mức mặc định là 256 MiB
và 4.096 tệp cho một API ghi. Lệnh bảo trì áp hạn lưu 30 ngày theo lô. Giá
trị 0 tắt hết hạn và vẫn thử lại việc xóa tồn. Stop và giải phóng giữ bản thu
lịch sử. Kiểm tra chức năng dùng nội dung thô. Signal Monitor chia sẻ hoặc
hủy lượt tải theo quyền. Dọn dẹp an toàn khi khởi động chạy trước khi chuyển
nội dung cũ lưu cùng JSON. [Danh mục bản thu](capture-catalog.md)

`ReadCapture` qua Hardware RPC dùng NCAP có giới hạn trong
`OperationReply.capture_payload`, tách khỏi `result_json`. Phản hồi 100.000 sự
kiện nằm trong giới hạn nhận 4 MiB mặc định, kể cả khi tên tín hiệu dài. API
từ chối dữ liệu nhị phân hoặc mô tả không hợp lệ.

Inspector hiện lỗi an toàn, số lượng linh kiện, khác biệt chân/net, độ tin
cậy phân giải và đối chiếu tín hiệu hoặc bảng chân trị khi chính sách cho
phép. `X` khác với không có phản hồi. Chỉ trường hợp đã thử mới có thời
điểm hoặc đầu ra tương ứng. Vị trí vật lý chưa rõ giữ nguyên trạng thái.
Scope hiện `NO WAVEFORM DATA` khi chưa có bản thu. Trình xem tương tự hiển
thị được bằng chứng NCAP v2 đã cung cấp, còn runtime đang chọn tạo bản thu
số NCAP v1. [Thiết bị đo trên bàn làm việc](https://github.com/cirnetlab/cirnet-interface/blob/master/docs/vi/guides/workbench.md)

`assessment_policy` điều khiển đánh giá và báo cáo. `STRICT_TOPOLOGY` chấm
cấu trúc và vẫn hiển thị chức năng. `FUNCTIONAL_ONLY` chấm hành vi quan sát
và giữ chẩn đoán cấu trúc. `TOPOLOGY_AND_FUNCTION` xét cả hai. Chính sách
đánh giá độc lập với quyết định cấp nguồn.

## Năng lực và FPGA

`StationCapabilities` công bố `virtual_digital`, `virtual_analog`,
`physical_digital`, `physical_analog_routing`, `physical_execution_slots`,
`topology_scan_supported`, `safety_gate_supported`, `guarded_run_supported`,
`component_resolution_modes`, `instrument_capabilities`, định tuyến và tài
nguyên, cùng các phiên bản độc lập `hardware_rpc_version`,
`fpga_protocol_version`, `firmware_version`, `hardware_profile_version`.

`instrument_capabilities` là nguồn quyết định năng lực thiết bị đo khi chạy.
Logic Analyzer, Scope và Generator khai báo số kênh và
`runtime_reconfiguration_supported`. Có 0 kênh nghĩa là chưa khả dụng. Số
kênh cấp cao và `instruments` chỉnh độc lập đã bỏ trước khi công bố Lab 1.0.
Các tag protobuf cũ được dành riêng. Trạm ảo cơ sở có Logic Analyzer 4,
Scope 0, Generator 0. Trạm vật lý mặc định có 0 kênh. Giới hạn sóng, tần số,
biên độ và offset tùy chọn đến từ profile và do compiler, driver và giao
diện thực thi khi có.

`GeneratorConfiguration` ban đầu được kiểm tra trong kế hoạch trước khi cấp
nguồn. Thay đổi khi chạy cần `RUNNING`, hỗ trợ cấu hình lại, chủ sở hữu, lượt
thuê đang hoạt động và chưa cách ly, kênh được cấp, an toàn mới và giới hạn
profile. API ghi và kiểm tra lại revision vòng đời cùng thế hệ lượt thuê
quanh thao tác từ xa. Trạm vật lý kiểm tra lại trạng thái và an toàn. Stop
ghi yêu cầu hủy trước khi chờ ACK cấu hình của lần chạy. Capabilities, cấu
hình và Stop từ xa chạy ngoài khóa trạng thái toàn cục. Giữ suất đến khi xác
nhận an toàn hoặc cách ly. Generator chưa khả dụng báo hỗ trợ cấu hình lại
là false. Điều khiển clock/trigger khi chạy là `NOT_IMPLEMENTED`.
[Cô lập điều khiển và chỉ mục runtime](control-isolation-and-runtime-index.md)

Web kiểm tra và chốt cấu hình thu, clock, Generator và vector thử trước
Create. Dữ liệu nhập sai chặn gửi và được giữ theo danh tính. Cấu hình
trigger/clock phần cứng chưa hỗ trợ trả lỗi rõ ràng. Xem trước duty cycle
chỉ chạy cục bộ. `InstrumentControlAccess` mô tả cấp phát, phiên, tab và lượt
thuê. Lệnh Generator phân biệt `REQUESTED`, `ACCEPTED`, `APPLIED` do driver
xác nhận. Khi chưa biết kết quả, giữ khóa qua tải lại hoặc mất kết nối để
đọc đối soát hoặc Stop. ACK cuối là bằng chứng bất biến, độc lập với bản
nháp và tín hiệu đầu ra hiện tại.

## Không gian làm việc Web và lưu trữ

Dự án và tài liệu mạch có thao tác theo chủ sở hữu, phân trang theo khóa,
revision bất biến và ghi compare-and-swap. ID tài liệu máy chủ khác ID
`CircuitGraph`; Save As giữ ID thiết kế. Kho lưu giữ metadata, bộ nhớ, dây
và cách gắn của Graph 1.0/1.1/1.2. Khả năng biểu diễn số của trình duyệt
được kiểm tra riêng. Tuyến cũ trả `UNSUPPORTED_DOCUMENT_VERSION` cho tài liệu
1.2. Tuyến mới dùng chung sở hữu, CAS và revision bất biến. Create khóa đúng
revision của đồ thị, bài tập đã công bố và cấu hình. Hàng rào phiên trong
giao dịch tuần tự hóa ghi với thu hồi và nhận quyền khách. Giảng viên sửa
nháp và công bố revision riêng. Dạng xem của sinh viên giữ kín đáp án tham
chiếu. [Dự án và revision](projects-and-revisions.md) · [Công bố bài tập](assignments-and-publication.md)

Lõi tài liệu, lịch sử, tuần tự hóa và bộ điều khiển ứng dụng độc lập với
framework và mạng. Cổng composition tách phụ thuộc vòng giữa store chạy và
store thiết bị đo. Cảnh tách picking, phiên cử chỉ và sở hữu tài nguyên mà
giữ canvas đang gắn. Mô hình GLB dùng bộ cung cấp chung, giới hạn và kiểm
tra toàn vẹn. Bản nháp khôi phục phân vùng theo danh tính. ACK lưu cũ giữ
nguyên thay đổi mới hơn. Export độc lập với Save.

Một kết nối ứng dụng đối soát lịch sử được cấp quyền, snapshot đang chạy và
hàng đợi sau hello, mất sự kiện, reset hoặc kết nối lại. Polling chờ lượt
trước kết thúc và hỗ trợ hủy, giãn khoảng cách thử lại. Chọn lịch sử chỉ
phục vụ quan sát. Mất phản hồi Create/Run được đối soát bằng khóa bền vững
ban đầu. Khi đăng xuất hoặc đổi danh tính, Web xóa trạng thái riêng và hủy
lượt đọc cũ ngay, trong khi vẫn giữ vòng đời workspace.

Mục tiêu Scope và Generator có hai kênh mỗi thiết bị. ADC/DAC chưa khả dụng
giữ cờ false. Số breadboard đến từ profile. EP4CE6E22C8N là nguyên mẫu không
SDRAM, với các ranh giới reset/trạng thái an toàn, điều khiển, quét, ngõ kích
có bảo vệ, định tuyến, clock và liên động lỗi. Mini PC dùng `FpgaTransport`
cho serial/USB-SPI và có thể mở rộng USB3/Ethernet. Giao thức logic độc lập
với phương tiện truyền.

Gói FPGA đã chọn có máy trạng thái điều khiển trừu tượng và giao diện khung.
Truyền thông, thu nhận và thực thi vật lý chưa khả dụng. Bao logic
`1.0-scaffold` và sơ đồ thanh ghi `1.0-reserved` là hợp đồng của khung.
Tổng hợp, timing và an toàn điện cần bằng chứng riêng.
[Đối chiếu hợp đồng FPGA](fpga-contract-conformance.md)

Mục tiêu tương lai EP4CE10E22C8N có SDRAM ngoài, Logic Analyzer, Scope hai
kênh với ADC/AFE, Generator hai kênh với DAC/tầng ra, điều phối SDRAM dùng
chung, trigger, mốc thời gian và CDC tường minh. Sơ đồ chân, sơ đồ chuyển
mạch/bảo vệ, linh kiện, timing và thông số điện là `TBD_BY_HARDWARE_DESIGN`.

## Ranh giới phát hành nhiều repo hiện tại

[Sơ đồ repo](system.md#ranh-giới-hệ-thống) xác định chủ sở hữu mã nguồn.
[Khóa phát hành](../../../integration/release-set.json) chọn hệ thống và
Interface `0.1.4`, API, Contracts, Simulator, Hardware và khung FPGA `0.1.2`.
Tệp ghi chính xác artifact và khóa công cụ DEV độc lập. CircuitGraph,
Hardware RPC, NCAP và giao thức FPGA có phiên bản riêng.

Contracts sở hữu schema, danh mục, định dạng truyền và sinh SDK. Đăng ký
FastAPI của API Python đang chọn cung cấp OpenAPI. Kiểm tra tích hợp dùng
artifact đã cài và kiểm tra hành vi truyền thực tế. Remote Rust, Contracts
Rust, Hardware Rust và tiến trình C++ có bằng chứng ứng viên riêng.
[Trạng thái chuyển đổi native](native-migration-status.md) ghi tổ hợp được
chấp nhận và các bước triển khai, phát hành còn mở.
[Sử dụng Contracts](../api/contracts-consumer.md) · [Phát hành và khôi phục](../operations/release-and-rollback.md)

## Lịch sử chuyển đổi

Xem quyết định, phiên bản theo giai đoạn và kết quả trong [sổ Lab-First](../../en/history/lab-first-migration-ledger.md),
[hồ sơ phát hành M6](../../en/history/verification/2026-10-27-multi-repo-migration-m6.md)
và [hồ sơ gốc khi tách repo](https://github.com/cirnetlab/cirnet-remote/blob/13a35145b6d15644c7be10d95a5410bf69e11867/docs/ARCHITECTURE.md#historical-extraction-stage-ownership).

## Quy tắc xác minh

Theo [AGENTS.md](../../../AGENTS.md) và [hướng dẫn xác minh](../contributing/verification.md).
Ảnh chụp, video, trace và chẩn đoán thô tạm thời nằm ngoài mọi repo và
worktree. [Mục lục lịch sử](../history/index.md) dẫn đến hồ sơ theo ngày và
phạm vi tương ứng.
