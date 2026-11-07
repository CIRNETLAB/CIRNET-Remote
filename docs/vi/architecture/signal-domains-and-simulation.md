# Miền tín hiệu và mô phỏng cục bộ

[English](../../en/architecture/signal-domains-and-simulation.md) · [Mục lục](../index.md)

`contracts/design-models/signal-domains.schema.json` định nghĩa `SignalDomain`,
`SignalPortDefinition`, namespace có phiên bản cho từng instance và các kiểu yêu
cầu, kết quả, lỗi mô phỏng. Các miền gồm `DIGITAL`, `ANALOG`, `POWER`,
`GROUND`, `CLOCK` và `MIXED`. Chúng mô tả ý định thiết kế và không cấp quyền
định tuyến phần cứng, cấp nguồn, dùng kênh đo hoặc khả năng của bộ giải.

Thư viện linh kiện quản lý khai báo miền. Cổng chức năng được khai báo trong
`device-library/editor/components.json`, còn chân vật lý nằm trong
`device-library/parts/physical-parts.json`. Bảng ánh xạ `legacyPorts` giữ các
khái niệm cũ của bộ thực thi như AND/NOT và INPUT/OUTPUT mà không đưa chúng
vào bảng chọn linh kiện. Lệnh `python -m contracts.codegen.sync_editor_catalog`
kiểm tra các nguồn này và sinh các bản `signal-port-catalog.json` tương ứng
cho Python và trình duyệt, cùng các snapshot của linh kiện và trình biên tập.
Catalog sinh ra ghi nhận các mô hình mà bộ thực thi cục bộ đã triển khai.
Bộ thực thi vẫn kiểm tra và biên dịch toàn bộ thiết kế.

## Tính tương thích của tài liệu đã lưu

CircuitGraph 1.0 và 1.1 giữ nguyên schema và cách biểu diễn. Đọc, lưu, phân loại
hay thực thi đều giữ nguyên miền, phiên bản đồ thị, ID và metadata chưa biết
của mô-đun cũ. Mô-đun có thể khai báo rõ namespace sau.

```json
{"signal_domains":{"version":"1.0","ports":{"OUT":"CLOCK"}}}
```

Namespace 1.0 có cấu trúc đóng và kiểm tra ID cổng cùng giá trị enum. Cổng đã
biết giữ khai báo trong catalog, đồng thời không được bổ sung cổng không tồn
tại. Khai báo của linh kiện chưa biết được giữ như metadata do người dùng soạn,
không tạo ra mô hình. Kiểu nhập chưa biết và chưa có khai báo miền vẫn được
xem là chưa biết. Các ranh giới hợp đồng và tệp trong Python lẫn trình duyệt
từ chối metadata sai định dạng của namespace đã biết. Phiên bản namespace
tương lai vẫn lưu được cả các trường chưa biết, còn thực thi trả
`UNSUPPORTED_SIGNAL_DOMAIN_VERSION`. Muốn hỗ trợ phiên bản tương lai cần
migration hoặc adapter thực thi riêng.

## Tương thích kết nối và chọn mô hình

Python `contracts.signal_domains` và phía trình duyệt `electrical/signalDomains.ts`
dùng cùng catalog được sinh và fixture đối chiếu. Kết nối trực tiếp cần miền
trùng nhau hoặc cặp CLOCK/DIGITAL đã quy định. Miền chưa biết không tương
thích. MIXED không khớp tùy ý với miền khác. Tiếp điểm breadboard giữ miền
của mạch được nối. Tên, tọa độ, màu và khoảng cách giữa các mesh không tự tạo
ra hành vi điện.

Kết quả phân loại gồm DIGITAL, DC_DIGITAL, ANALOG, MIXED và UNKNOWN. POWER
và GROUND là hạ tầng, vì vậy chúng không biến một IC số thành yêu cầu cho
bộ giải tương tự. Kiểu chưa biết vẫn là UNKNOWN kể cả khi được chú thích
DIGITAL. Kiểu đã biết trong catalog nhưng chưa có mô hình vẫn giữ kết quả
phân loại miền và xuất hiện trong `unsupported_components`.

Adapter DC có giới hạn chỉ hỗ trợ các profile `dc-source`, `hc08-powered`,
`resistor-dc`, `led-dc` và `contact-switch` đã khai báo. Adapter kết nối cho
phép các mạch nguồn, điện trở, LED và HC08 đã được hỗ trợ. Nó kiểm tra tham
chiếu nguồn cục bộ, cực tính, dải nguồn, đầu vào thả nổi và cấu trúc liên kết.
Đây là các mô hình xấp xỉ tĩnh phục vụ học tập. Thu mẫu tín hiệu tương tự nằm
ngoài phạm vi. Vector kiểm thử số không thể ghi đè đầu nguồn DC. Chế độ xem
trước DC có thể hiển thị linh kiện UNSUPPORTED và giá trị chưa biết mà vẫn giữ
đúng trạng thái chưa thực thi hành vi của chúng.

## Ranh giới thực thi

`cirnet_sim.dispatch.SimulationDispatcher` nhận kiểu `SimulationRequest` hoặc
kiểu bổ sung `SimulationRequestV2` được sinh tự động. Kiểu thứ hai dùng
schema yêu cầu 2.0, có Graph 1.2. Bộ điều phối trả kiểu `SimulationResult` hoặc
`SimulationErrorResult` được sinh tự động. Luồng số và DC dùng bộ máy sự kiện
hiện có. SPICEAdapter và MixedSignalCoordinator nhận cùng yêu cầu có kiểu rồi
trả `ANALOG_UNAVAILABLE` hoặc `MIXED_SIGNAL_UNAVAILABLE`, không tạo bản thu hay
dữ liệu mẫu giả. Lời gọi trực tiếp kiểu cũ không định kiểu vẫn báo RuntimeError.
Mô hình số chưa hỗ trợ trả lỗi có kiểu. Các endpoint Run và phân tích công khai
hiện tại giữ nguyên.

Bản phát hành đang chọn dùng provider mặc định `legacy` từ
`cirnet_sim.backends`. Tên import trước đây `netcircuit_sim.backends`
vẫn là bí danh. Provider legacy chuyển biên dịch, chạy và xem trước tới
bộ máy Python và ranh giới xem trước. Cấu hình API và trạm ảo chốt
`CIRNET_SIMULATION_BACKEND` lúc khởi tạo. Kế hoạch đã tuần tự hóa giữ
ID backend, phiên bản adapter, định dạng kế hoạch và payload của provider
để worker dùng đúng định danh. Provider chưa biết, bị thiếu hoặc không
khớp sẽ báo lỗi tường minh.

Mã nguồn Simulator còn hỗ trợ worker số `cpp` khi chủ động cấu hình
executable và digest khớp. Xem
[hướng dẫn backend Simulator](https://github.com/cirnetlab/cirnet-simulator/blob/master/docs/vi/backends.md)
để thiết lập provider và [trạng thái chuyển đổi](native-migration-status.md)
để tra các tổ hợp artifact đã xác minh.

Tên dành trước `ngspice` báo chưa khả dụng, với 0 khả năng thực thi
hoặc sử dụng thiết bị đo. [Đề xuất SPICE](native-migration.md#core-spice-tương-lai-dựa-trên-ngspice)
bao gồm ánh xạ đồ thị/netlist, nguồn gốc mô hình và bản build, hợp đồng
kết quả và kiểm tra vòng đời trong tương lai. Xác minh, phân loại và lưu
tài liệu vẫn khả dụng độc lập với khả năng bộ giải.

Biên bản thiết kế trước đây. [phân tích và thiết kế](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/specs/2026-10-27-simulator-backends-design.md).

VirtualHardwareStation tiếp nhận CircuitGraph 1.0/1.1/1.2 được hỗ trợ qua ranh
giới provider, rồi thực thi qua vòng đời Lab, RPC, worker tiến trình có giới
hạn và kho bản thu. Trạm vật lý tiếp tục dựa vào cấu trúc quan sát được,
chính sách, kế hoạch và thẩm quyền an toàn riêng. Đồ thị trình biên tập không
thay thế thẩm quyền đó. Khả năng mặc định của legacy chỉ có mô phỏng số trên
trạm ảo. Mã hóa tín hiệu số NCAP v1 đã có được giữ nguyên.

`CaptureConfiguration.max_events` cho phép lập lịch tối đa 1.000.000 sự kiện,
độc lập với giới hạn 100.000 mẫu của bản thu số. Tham số này giới hạn số sự
kiện trong hàng đợi của bộ máy. Bản thu nhỏ vẫn dùng được ngân sách lập lịch
lớn hơn. Nếu số thay đổi quan sát vượt giới hạn của bản thu, bộ máy báo
`CAPTURE_LIMIT` và không trả bản thu một phần. Hardware Service ánh xạ lỗi
thực thi này thành `UNEXECUTABLE`. Hợp đồng bản thu đã khóa không đổi và dữ
liệu không bị cắt bớt.

Kiểm thử bao gồm các ca namespace và phân loại dùng chung giữa Python và
trình duyệt, metadata cũ bất biến, lỗi chưa khả dụng có kiểu, hồi quy mô
phỏng và bản thu NCAP thực từ REST → RPC cục bộ → worker. Các ca bản thu dùng
schema 1.1 và kiểm tra HC08 có hoặc không có nguồn, cùng mạch LED DC có giới
hạn.

Xem [danh mục bản thu](capture-catalog.md) và
[an toàn phòng lab vật lý](physical-lab-safety.md).
