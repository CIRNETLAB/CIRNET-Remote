# Đặt linh kiện và cụm gắn linh hoạt

[English](../../en/architecture/component-placement.md) · [Mạch và phòng thí nghiệm vật lý](../api/circuit-and-physical-lab.md)

Trang này giải thích hình học và lưu trữ cách gắn giữa Interface, Contracts và
Remote.

`CircuitGraph` là nguồn dữ liệu thiết kế. Liên kết tiếp điểm xác định kết nối
điện. Giao nhau của thân hoặc chân dẫn không tạo net. Giới hạn cơ khí khi
soạn thảo có phiên bản riêng. Thông số và phép đo linh kiện thật thuộc phạm
vi phần cứng. Phân giải danh tính, khả năng thực thi và kiểm tra an toàn
Lab-First độc lập với hình học thiết kế.

## Thao tác đặt linh kiện

Chọn Resistor, Capacitor, Diode, Zener Diode hoặc LED để mở bản nháp thuộc
tính. Chọn một lỗ chính xác cho chân thứ nhất theo mô tả linh kiện, rồi chọn
lỗ thứ hai trên cùng breadboard. Chỉ lần chọn hợp lệ thứ hai mới tạo module
và một mục Undo. Kéo thả HTML chỉ chọn chân đầu tiên. Add mở bản nháp riêng.

Xem trước chân thứ hai chọn hình học tự động `axial-standing`,
`axial-horizontal` hoặc `radial-upright` theo profile đã khóa và khoảng cách
chính xác giữa hai tiếp điểm. Cụm mới dùng hình học tự động. Escape hủy thao
tác. Một lần nhấp phải ngắn trước khi chọn chân đầu cũng hủy. Khoảng cách
sai hoặc lỗ đã dùng giữ bản nháp và hiện lỗi. Người dùng vẫn quyết định lỗ
đích. Xem trước hợp lệ gần nhất mờ đi khi đích hiện tại không hợp lệ.

Chọn cụm để hiện tay nắm tiếp điểm. Kéo một tiếp điểm giữ chân còn lại cố
định và dựng lại toàn bộ thân, chân dẫn trên cùng bo để xem trước. Nhả tay
kiểm tra toàn bộ phương án trước khi ghi một lệnh. Hủy, mất pointer capture,
đổi tài liệu hoặc danh tính hoàn tác xem trước và trả khóa camera. Move và
gizmo X/Z/xoay di chuyển cả cụm. Khi bật Snap, bước dịch theo khoảng lỗ bo
đỡ và mọi tiếp điểm sau biến đổi phải trùng lỗ đã khai báo. Copy/paste biến
đổi tư thế và mọi điểm điều khiển chân dẫn.

Cách đặt cứng cho DIP, switch và thiết bị bàn đo vẫn dùng được. BJT ba chân
và buzzer dùng mô tả cứng nằm ngoài bộ giải linh hoạt hai chân. Quy ước
chân thuộc mô tả thiết kế. Việc quét phần cứng xác định danh tính và thứ tự
chân riêng.

## Lưu trữ và tương thích

Graph 1.0/1.1 và `MountBinding` cứng v1 vẫn đọc được theo schema cũ. Cụm
mới dùng Graph **1.2** và `FlexibleMountV2` với các trường sau.

- `kind: breadboard-flexible`, `version: 2`, `geometryRevision: 2`.
- `routing: {version: 1, mode: automatic, template}`.
- ID và revision bo, linh kiện, vỏ và profile cơ khí.
- Một tư thế tâm thân theo hệ tọa độ bo, góc Euler **YXZ** theo độ.
- Đúng hai liên kết chân–tiếp điểm ổn định và hình học xác định cho từng chân.

`FlexibleMountV1` đã lưu dùng `version: 1`, `geometryRevision: 1`, tư thế uốn
tay và tối đa tám điểm điều khiển mỗi chân. Mở hoặc lưu thông thường giữ
nguyên biểu diễn. Gắn lại điểm neo hoặc **Rebuild component geometry** có thể
chọn hình học tự động mới sau khi kiểm tra bản xem trước.

Chỉ dữ liệu thiết kế được tuần tự hóa. Kích thước profile theo mm và vị trí
đồ thị dùng tỷ lệ thế giới hiện tại. Bộ giải dựng đường từ điểm ra khỏi
thân qua đoạn thẳng hướng ra, điểm điều khiển, đoạn cắm dọc rồi tới tiếp
điểm. Sau đó kiểm tra chiều dài, bán kính uốn, tọa độ hữu hạn, khoảng hở
với bo và va chạm 3D giữa thân, chân dẫn. Renderer tạo cung tròn liên tục với
đường kính chân cố định. Fixture chung TS/Python gồm ca hợp lệ, không hợp lệ
và ca tiếp xúc đúng biên.

`contracts/design-models/flexible-mechanics.json` giữ giới hạn bất biến theo
revision. Mô tả hiện tại và lịch sử được tìm đúng định danh và revision của
linh kiện, vỏ. Thay đổi giới hạn cần revision hoặc migration mới. Dữ liệu cũ
`leadForm`, `leadLengthMm`, `bodyLiftMm` vẫn hiển thị được.
`convertModuleToFlexible` và `migrate_legacy_mount` là thao tác chuyển đổi
tường minh giữ ID, thuộc tính và tiếp điểm. Import thường giữ biểu diễn đã
lưu. Module vật lý tự do có thể khóa `physicalDescriptor` trong Graph 1.2.
Module cũ thiếu marker dùng mô tả sớm nhất và giữ nguyên dữ liệu.

Cụm linh hoạt thuộc bo. Xóa bo xóa cụm và cạnh liên quan trong cùng lệnh có
thể Undo. Gắn cứng giữ hành vi tháo rời hiện có. Cụm linh hoạt cần hệ tọa độ
bo và không thể tháo sang dạng thiếu hệ tọa độ đó.

`/api/v2` hỗ trợ Graph 1.2 cho tài liệu, kiểm tra, xem trước và tạo thí
nghiệm. Tuyến v1 trả `422 UNSUPPORTED_DOCUMENT_VERSION` khi đọc tài liệu đã
lưu không hỗ trợ. Web chọn v2 trước khi ghi. Đường đọc thử v2 khi nhận đúng
mã phiên bản đó. CAS, snapshot thực thi bất biến và bản khôi phục cục bộ
giữ nguyên dữ liệu linh hoạt. Run, Stop và đọc kết quả dùng thao tác hiện
có. Bài tập chọn định nghĩa 2.0 khi chép tham chiếu Graph 1.2. Các ranh giới
V2 giữ công bố, phân quyền, khóa revision bất biến và cách chấm. Định nghĩa
1.0 và schema phản hồi cũ giữ nguyên.

## Giá trị thiết kế và hiển thị

Mô tả mới dùng cùng các ID cũ. Danh mục chuẩn cung cấp tên hiển thị, ánh xạ
Add, enum loại, đơn vị và kiểm tra màu. Đổi loại tụ ánh xạ một-một
A/B ↔ PLUS/MINUS, gồm các đầu dây hiện có, trong một lệnh đã kiểm tra.
Thuộc tính chưa biết và định mức nâng cao được giữ qua sửa và lưu lại.
Ô nhập đơn vị kỹ thuật giữ giá trị số thực đã nhập.

Mô hình điện trở và LED được hỗ trợ dùng giá trị từng linh kiện, gồm Vf/Imax
của LED. Diode phi tuyến, quá độ tụ, BJT và buzzer chưa khả dụng. Màu LED đổi
vỏ và hình thu nhỏ. Phát sáng cần kết quả thực thi.

Bộ giải, bộ điều khiển, adapter con trỏ và adapter renderer tách riêng. Chỉ
mục lỗ đã dùng và thân linh kiện lưu đệm theo danh tính mảng module bất biến.
Hover gộp theo khung hình. Hình học chân thay thế được cấp phát trước khi
đổi và hình học cũ do renderer sở hữu được giải phóng sau đó. Điểm đích chân,
nhãn, dây, xem trước và hình thu nhỏ cùng dùng vị trí đầu tiếp điểm. Hình
thu nhỏ dùng cache giới hạn và renderer chung với khóa hình học, profile,
màu.

Interface sở hữu bản nháp hai lần chọn và xử lý con trỏ. Interface và
Contracts kiểm tra hình học theo hợp đồng cơ khí và lưu trữ chung.
[Bộ điều khiển bản nháp](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/src/editor/FlexiblePlacementController.ts) · [Adapter con trỏ](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/src/composables/useFlexibleAuthoring.ts) · [Hình học TypeScript](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/src/electrical/flexibleGeometry.ts) · [Hình học Python](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/flexible_mounting.py) · [Hợp đồng gắn linh hoạt](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/design-models/flexible-placement.md)

Dùng [hướng dẫn xác minh](../contributing/verification.md) cho lượt kiểm tra
mới. Lưu ảnh chụp và bảng ảnh chẩn đoán ngoài các repo. Dùng tư liệu tham
chiếu để đối chiếu và ghi kết quả thực tế riêng.
