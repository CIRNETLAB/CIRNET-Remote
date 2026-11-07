# Tên mã nguồn và tương thích cũ của CIRNET

[English](../../en/operations/namespace-compatibility.md) · [Triển khai](deployment.md)

Mã nguồn hiện hành dùng namespace repo `cirnetlab/cirnet-*`. Bảng ghi tên sản
phẩm trong bản phát hành đang chọn.

| Sản phẩm | Gói hoặc artifact | Định danh khi chạy |
| --- | --- | --- |
| Remote API | `cirnet-api` | `app` |
| Contracts | `cirnet-contracts` | `contracts` |
| Simulator | `cirnet-simulator` | `cirnet_sim` |
| Hardware | `cirnet-hardware-service` | `hardware_service` |
| Interface | `@cirnet/web`, `cirnet-interface` | SDK npm Contracts công khai |
| FPGA | `cirnet-fpga-scaffold` | Module RTL chuẩn `cirnet_*` |
| Bộ cấp phát DEV độc lập | `cirnet-artifact-paths` | `cirnet_artifact_paths` |

Hệ thống 0.1.4 chọn SDK `@cirnet/contracts` và bộ cấp phát
`@cirnet/artifact-paths` qua [khóa phát hành](../../../integration/release-set.json).
Interface import trực tiếp bằng định danh đã phát hành. Simulator và DEV giữ
bí danh import. FPGA giữ wrapper tên module cũ cho fixture RTL. Trình khởi
chạy Windows dùng môi trường ảo riêng cho hệ thống 0.1.4 và dùng lại đường
dẫn cơ sở dữ liệu và bản thu của nhà phát triển.

## Cấu hình và định danh giao thức

`CIRNET_*` ưu tiên hơn bí danh `NETCIRCUIT_*` tương ứng, kể cả khi giá trị
chuẩn rỗng. Bootstrap và launcher đồng bộ hai cách viết cho tiến trình con
chạy công cụ cũ đã khóa. Biến và secret CI hiện hành dùng tên chuẩn rồi
thử tên cũ đã cấp. [Quyền tải artifact CI](ci-artifact-access.md)

API đang chọn phát `cirnet_session` và `netcircuit_session` với cùng thông tin
xác thực bất khả kiến. API đọc cookie cũ khi thiếu cookie chuẩn. API 0.1.1
bất biến chỉ phát `netcircuit_session`. Kiểm thử trình duyệt nhận đúng các
bí danh này và kiểm tra thuộc tính riêng tư, bảo mật của mỗi cookie có mặt.
Header CSRF chuẩn là `X-CIRNET-CSRF`. API vẫn nhận `X-CSRF-Token` cũ. Interface
gửi cả hai. Yêu cầu bản thu ưu tiên `application/vnd.cirnet.capture; version=1`
và nhận media type cũ với cùng kiểm tra phiên bản và giới hạn. API đang
chọn tự nhận là `cirnet-api` tại `GET /api/health`. Consumer vẫn nhận định
danh cũ `netcircuit-api`. Bí danh URI schema và tài nguyên cho phép phân giải
tài liệu lịch sử ngoại tuyến. [Adapter tương thích Python](../../../services/api/app/compatibility.py) · [API ứng dụng](../api/application.md)

API Python đang chọn mặc định dùng `cirnet.db` và dùng `netcircuit.db` sẵn có
khi thiếu tệp chuẩn. Cấu hình cơ sở dữ liệu và bản thu tường minh tiếp tục
chọn kho hiện có. Ứng viên Rust mặc định dùng trực tiếp
`sqlite:///./cirnet.db`. Đặt `CIRNET_DATABASE_URL` tường minh khi xác minh
trên bản sao dữ liệu hiện có. [Cấu hình ứng viên Rust](../../../native/src/config.rs)

Khôi phục trình duyệt đọc định dạng cũ, chuyển
bản nháp vào IndexedDB tên chuẩn trong một giao dịch, giữ cơ sở dữ liệu cũ
và xuất hồ sơ chuẩn. Quan sát đang chờ giữ đồng bộ với tab cũ. Quá trình
chuyển đổi giữ định danh dữ liệu và thao tác, không phát lại lệnh chạy.

<a id="existing-deployments"></a>

## Máy đang triển khai

Template mới dùng `/opt/cirnet`, `/etc/cirnet/cirnet.env`, `/var/lib/cirnet`,
tài khoản dịch vụ `cirnet`, unit `cirnet-*.service` và `cirnet-*.timer`, cùng
`deployment/nginx/cirnet.conf`. Metadata cài đặt của từng unit khai báo bí
danh `netcircuit-*` tương ứng. Quản trị viên thực hiện việc đổi dịch vụ,
tài khoản, quyền, tên cơ sở dữ liệu và thư mục trên máy đích.

Trước khi cài unit mới, sao lưu cặp cơ sở dữ liệu và kho bản thu, rồi rà
soát đường dẫn cấu hình và quyền tài khoản. Giữ URL và đường dẫn đang dùng
trừ khi thực hiện chuyển dữ liệu tường minh đã xác minh. Kiểm tra tệp môi
trường mới với đúng các giá trị đó. Tên `NETCIRCUIT_*` vẫn đọc được, còn giá
trị chuẩn tường minh được ưu tiên. Unit lấy cấu hình bản thu từ tệp môi
trường bắt buộc để giữ đường dẫn cũ đã chọn.

Dừng và tắt unit cũ trong thời gian bảo trì trước khi cài hoặc bật unit mới
và bí danh. Chỉ khởi động một bộ điều phối API và một Hardware Service.
Nạp lại và kiểm tra cấu hình trình quản lý dịch vụ và proxy trước khi chạy.
Cài đặt trên máy đích, TLS và kiểm tra vật lý cần nghiệm thu riêng.
[Hướng dẫn production](deployment.md)

## Artifact đã phát hành và bằng chứng

`integration/release-set.json` chọn bản 0.1.4 với digest chính xác và tên
repo chữ thường. `scripts/install_release.py` nhận họ phát hành này và
bản build cục bộ tương ứng đã xác minh. Các bản trước giữ tag gốc để tra
cứu lịch sử.

[Mục lục lịch sử](../history/index.md) dẫn đến tên gốc và bằng chứng phát
hành đã ghi. Bí danh biến môi trường và dịch vụ trong hướng dẫn này áp
dụng cho máy đang triển khai và dữ liệu người dùng.
