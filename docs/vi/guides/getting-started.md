# Chạy CIRNET Remote cục bộ

[English](../../en/guides/getting-started.md) · [Mục lục](../index.md)

CIRNET Remote vận hành phòng thí nghiệm điện tử qua trình duyệt. Trình khởi
chạy Windows dùng đúng [khóa phát hành](../../../integration/release-set.json)
của hệ thống và khởi động ba tiến trình theo thứ tự. Hardware Service lắng nghe
tại `127.0.0.1:50051`, Remote API tại `127.0.0.1:8000` và CIRNET-Interface tại
`127.0.0.1:5173`. Trình duyệt dùng origin của Interface và proxy API của nó.

Hệ thống đã chọn là **0.1.4**. Interface dùng **0.1.4**. API, Contracts,
Simulator, Hardware và scaffold mã nguồn FPGA dùng **0.1.2**. Scaffold khai báo
`physicalAvailable=false`. Dùng trình khởi chạy để mô phỏng cục bộ.

## Khởi động và dừng trên Windows

Cài Git, Windows PowerShell 5.1, Python 3.14 trở lên cùng pip và venv, và
Node.js 26 LTS cùng npm. Mở lại terminal sau khi thay đổi `PATH` và xác nhận
`node --version` bắt đầu bằng `v26.`. Mở
[run-cirnet.bat](../../../run-cirnet.bat) hoặc chạy từ thư mục gốc của repo.

Menu nhận số hoặc `clean`, `doctor`, `start` và `exit`. Chọn **3** để chạy. Lần
đầu sẽ tải và xác minh các gói đã khóa nên có thể mất vài phút. Khi sẵn sàng,
trình khởi chạy mở `http://127.0.0.1:5173`. Giữ terminal mở. Console hiển thị
thông báo bằng tiếng Anh.

```powershell
.\run-cirnet.bat start
.\run-cirnet.bat -NoBrowser
.\run-cirnet.bat -Check
.\run-cirnet.bat stop
.\run-cirnet.bat doctor
.\run-cirnet.bat clean -Preview
.\run-cirnet.bat clean
.\run-cirnet.bat -NoColor
.\run-cirnet.bat start -NoAnimation
.\run-cirnet.bat doctor -NoColor
```

Hành động và cờ khởi chạy được chỉ định sẽ bỏ qua menu. `-NoBrowser` chạy các
dịch vụ mà không mở trình duyệt. `-Check` kiểm tra dịch vụ thật rồi tự dừng.
Khi khởi động thông thường, nhấn **Esc** trong terminal lúc đang kiểm tra độ
sẵn sàng hoặc lúc đang chạy để dừng và quay lại menu. Chọn **3** để chạy lại.
Thiết lập lần đầu hoàn tất trước khi kiểm tra độ sẵn sàng. **Enter**, **Ctrl+C**
và lệnh `stop` từ terminal khác sẽ dừng phiên rồi thoát. Trình khởi chạy in
đường dẫn tuyệt đối đến phiên nhật ký riêng ở ngoài repo.

SQLite phát triển và dữ liệu thu tín hiệu nằm trong `%USERPROFILE%\CIRNET-Dev`
hoặc thư mục ngoài repo do `CIRNET_DEV_HOME` chọn. Bảo toàn dữ liệu khi sửa
môi trường chạy. Trình khởi chạy kiểm tra phiên bản Python tối thiểu cho cả
trình thông dịch gốc và `.venv-0.1.4` dành cho bản phát hành. Nếu venv dùng
trình thông dịch cũ, làm theo hướng dẫn của Doctor cho chính venv đó.

`-NoColor` tắt màu và hiệu ứng động. `-NoAnimation` giữ màu được hỗ trợ và tắt
hiệu ứng động. Chỉ định riêng một trong hai cờ sẽ mở menu. Khi chuyển hướng
đầu ra, dùng `NO_COLOR=1`, `TERM=dumb` hoặc console thiếu tính năng, kết quả
hiển thị dạng văn bản thường. Chuyển hướng đầu vào tắt hiệu ứng động. Đổi
kích thước terminal khi đang có chỉ báo xoay sẽ chuyển sang dòng tĩnh.

## Chẩn đoán và dọn dẹp

Doctor báo công cụ khuyến nghị, môi trường chạy, cache phát hành và các cổng
`50051`, `8000` và `5173`. Các trạng thái gồm `INSTALLED`, `MISSING`,
`INCOMPATIBLE` và `NOT VERIFIED` kèm cách xử lý. `READY FOR LOCAL SIMULATION`
yêu cầu đủ công cụ và môi trường chạy đã cài, đã xác minh. Trên máy mới, hãy
cài công cụ bắt buộc, dùng `start` để thiết lập rồi chạy lại Doctor. Doctor
kiểm tra cục bộ và in báo cáo ra console. Phát triển FPGA dùng quy trình
`pyslang`, Icarus Verilog và `vvp` đã khóa do CIRNET-FPGA sở hữu.

Clean xem trước danh sách cho phép và yêu cầu xác nhận. `-DryRun` và `-WhatIf`
là bí danh của `-Preview`. Dùng `clean -Yes` khi chủ động dọn không tương tác.
Báo cáo có số mục Deleted, Skipped và Failed, đường dẫn, số tệp và dung lượng.
Danh sách cho phép gồm `.pyc` có thẻ CPython trong các vị trí `__pycache__`
được nhận diện, ba tệp cache pytest và năm tệp egg-info chuẩn của setuptools
trong Remote. Clean giữ thư mục cache trống và bỏ qua đầu ra không nhận diện.
Nó bảo vệ mã nguồn, Git, tài liệu, dependency, venv, SQLite, dữ liệu thu tín
hiệu, artifact phát hành và cache bộ cấp phát DEV. Trình khởi chạy hoặc dịch
vụ liên quan đang hoạt động sẽ chặn dọn dẹp.

## Phát triển và xác minh

Để cài bộ phát hành rõ ràng, xác minh trong môi trường cô lập hoặc lên kế hoạch
triển khai, xem [phát hành và khôi phục](../operations/release-and-rollback.md).
Để kiểm thử trình duyệt thật và PostgreSQL, xem
[xác minh](../contributing/verification.md). Hướng dẫn phát triển API chi tiết
nằm trong [tài liệu checkout API](../api/application.md). Trình khởi chạy dùng
API từ checkout này, module Hardware đã cài và sản
phẩm Interface đã giải nén. Môi trường sản xuất dùng wheel đã xác minh và gói
Interface tĩnh được chọn.

Môi trường hiện tại tuân theo Web-first, Safety-gated và Lab-First. Trình duyệt
không điều khiển trực tiếp giao vận FPGA. Bằng chứng phần mềm đã phát hành, mẫu
triển khai và kết quả phần cứng thật có tiêu chí nghiệm thu riêng. Xem
[kiến trúc hệ thống](../architecture/system.md) và [lịch sử](../history/index.md).
