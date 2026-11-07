# Triển khai production trên Linux Mini PC

[English](../../en/operations/deployment.md) · [Hướng dẫn triển khai gốc](../../../deployment/README.md) · [Kiến trúc Lab-First](../architecture/system.md)

Các mẫu Linux, Nginx và systemd mô tả máy đích dự kiến. Các lượt kiểm thử cục bộ theo ngày kiểm tra bất biến cấu hình, luồng phần mềm và migration cơ sở dữ liệu. Thu bằng chứng TLS, tường lửa, trình quản lý dịch vụ, năng lực và phần cứng trên máy đích thực tế. [Danh sách kiểm tra Mini PC](mini-pc.md) · [Báo cáo phát hành cục bộ 0.1.4](../../en/history/verification/2026-11-05-cirnet-release-0.1.4.md) · [Kết quả PostgreSQL ở Giai đoạn 0 native](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

## Chọn và cài môi trường chạy

Dùng [khóa bản phát hành hệ thống](../../../integration/release-set.json). Tệp chọn hệ thống và Interface `0.1.4`, API, Contracts, Simulator, Hardware và khung FPGA `0.1.2`, cùng các phiên bản DEV độc lập. Xác minh tên tệp, revision nguồn và SHA-256 của từng gói đã chọn. Kho mã hiện tại dùng `cirnetlab/cirnet-*`. Gói đã phát hành giữ nguyên byte và mã nguồn đã ghi khi build. Giữ riêng các ứng viên mới build cùng phiên bản với gói đang được chọn. [Cài bản phát hành và quay lui](release-and-rollback.md)

| Đích | Thành phần đã chọn |
| --- | --- |
| `/opt/cirnet/venv-api` | Wheel Contracts, Simulator và API, cùng phụ thuộc khi chạy |
| `/opt/cirnet/venv-hardware` | Wheel Contracts, Simulator và Hardware Service, cùng phụ thuộc khi chạy |
| `/opt/cirnet/web` | Gói Interface tĩnh, gồm `/models`, cùng origin với `/api/` và `/ws/` |

Cài wheel API đã chọn cho production. Build API từ mã nguồn thuộc quy trình kiểm chứng hoặc chuẩn bị ứng viên phát hành riêng. Chọn gói của bên sản xuất độc lập cho Hardware, Contracts, Simulator và Interface. Production chạy gói đã cài và tệp tĩnh. Giữ gói Web đã duyệt trước đó và bộ tương thích tương ứng để quay lui. [Ranh giới tiêu thụ Contracts](../api/contracts-consumer.md)

Chạy một tiến trình API với một worker Uvicorn. Bộ điều phối FIFO, trung tâm sự kiện và hạn mức thư mục hoạt động trong từng tiến trình. Nhân bản API cần thiết kế điều phối và quyền sở hữu phân tán riêng. `CIRNET_SIMULATION_WORKERS` giới hạn số tác vụ mô phỏng trong tiến trình con, độc lập với số phiên HTTP. Trạm vật lý dùng số suất đã công bố và trạng thái chưa khả dụng mặc định.

## Cấu hình tài khoản dịch vụ và origin

Dùng [mẫu môi trường production](../../../deployment/cirnet.production.env.example), [mẫu Nginx](../../../deployment/nginx/cirnet.conf) và [các unit systemd](../../../deployment/systemd). Tạo tài khoản hệ điều hành `cirnet`, vai trò PostgreSQL và cơ sở dữ liệu riêng. Lưu cấu hình production đã duyệt vào `/etc/cirnet/cirnet.env` với quyền truy cập hạn chế. Mẫu dùng socket PostgreSQL cục bộ và yêu cầu đã cấp quyền xác thực peer. Với cơ sở dữ liệu từ xa, cấu hình kết nối TLS có xác thực tường minh. [Mẫu phát triển ở thư mục gốc](../../../.env.example) mô tả cấu hình phát triển cục bộ. Giữ thông tin xác thực trong môi trường hạn chế quyền, ngoài tệp Git và nhật ký.

Biến chuẩn `CIRNET_*` được ưu tiên hơn tên tương thích `NETCIRCUIT_*`. Các unit khai báo bí danh cài đặt `netcircuit-*` cũ. Với máy đang triển khai, rà soát tường minh cấu hình, dịch vụ và đường dẫn dữ liệu trước khi đổi tên. Bí danh chỉ thay đổi cách phân giải tên dịch vụ. Di chuyển dữ liệu là thao tác vận hành riêng. [Triển khai hiện có](../../en/operations/namespace-compatibility.md#existing-deployments)

Đặt `CIRNET_ENV=production`, `CIRNET_ALLOW_GUEST=false`, origin HTTPS tường minh trong `CIRNET_TRUSTED_ORIGINS`, `CIRNET_DATABASE_URL` trỏ đến PostgreSQL và `CIRNET_CAPTURE_DIR` là đường dẫn tuyệt đối trên kho lưu trữ bền vững. Môi trường chưa biết, origin sai, chế độ khách hoặc SQLite trong production làm cấu hình thất bại. Cookie phiên có HttpOnly, SameSite=Lax và Secure trong production. Thao tác ghi cần mã CSRF của phiên hiện tại và Origin tin cậy khớp chính xác. WebSocket kiểm quyền bằng cookie và Origin đó. Hết hạn hoặc thu hồi phiên kết thúc vòng đời điều khiển tương ứng.

Với SQLite lưu trên đĩa cục bộ, `CIRNET_SQLITE_ROLLBACK_JOURNAL=persist` tái sử dụng tệp rollback journal và đặt `synchronous=FULL` trên từng kết nối. Dùng tùy chọn này với database đang ở chế độ DELETE, TRUNCATE hoặc PERSIST. Bảo vệ tệp `-journal` như database và để SQLite quản lý tệp này. Khôi phục theo [quy trình sao lưu SQLite](../architecture/auth-and-migrations.md) và bỏ tùy chọn trước khi mở lại với cấu hình kết nối mặc định. [Các chế độ journal của SQLite](https://sqlite.org/pragma.html#pragma_journal_mode)

Đặt `CIRNET_SIMULATION_BACKEND=legacy` trong môi trường dùng chung của API và Hardware để giữ mô phỏng số và DC giới hạn hiện tại. Hai dịch vụ đọc backend khi khởi động. Khởi động lại cả hai sau khi đổi. `ngspice` là lựa chọn dành trước, chưa khả dụng trong Simulator `0.1.2`. Kiểm tra và lưu tài liệu vẫn dùng được, còn xem trước và thực thi không tạo bản thu. Giá trị chưa biết hoặc rỗng làm cấu hình thất bại. Thay đổi backend chỉ đổi cách điều phối mô phỏng. Quyền quyết định an toàn vật lý vẫn thuộc vòng đời trạm. [Miền tín hiệu và mô phỏng](../architecture/signal-domains-and-simulation.md)

## Giới hạn Nginx, HTTP và thời gian thực

Thay `lab.example.invalid` và đường dẫn chứng thư, cấp chứng thư thật rồi chạy `nginx -t` trên máy đích trước khi bật cấu hình. HTTP chuyển hướng đến origin HTTPS đã chọn. Phục vụ trình duyệt, `/api/` và `/ws/` trên origin đó. API lắng nghe ở `127.0.0.1:8000`, RPC ở `127.0.0.1:50051`. Nginx chỉ chuyển tiếp route API và WebSocket. Origin, WebSocket Upgrade, cookie và header CSRF/điều khiển được giữ qua proxy. API chỉ tin header chuyển tiếp từ loopback. Proxy giới hạn 4 MiB để chứa tài liệu 2.000.000 byte trong bao JSON. Yêu cầu API vượt dung lượng nhận phản hồi lỗi JSON HTTP 400 đã cố định.

Ứng dụng đếm byte thực tế trước khi phân tích JSON, kể cả truyền chunked và `Content-Length` thiếu hoặc sai. Mặc định là 4 MiB thông thường, 16 KiB dưới `/api/auth/`, 64 cấp lồng nhau, 2.000.000 token khi quét cấu trúc và 10 giây để nhận thân yêu cầu. Dấu ngoặc nhọn trong chuỗi được tính là nội dung chuỗi. JSON dùng UTF-8, có thể có BOM UTF-8. UTF-8 lỗi, NUL thô và UTF-16/32 bị từ chối trước khi phân tích. Bao lỗi HTTP 400 dùng `REQUEST_TOO_LARGE`, `REQUEST_COMPLEXITY_EXCEEDED`, `INVALID_REQUEST_FRAMING` hoặc `REQUEST_TIMEOUT`. Các biến cấu hình là `CIRNET_REQUEST_MAX_BYTES`, `CIRNET_AUTH_REQUEST_MAX_BYTES`, `CIRNET_REQUEST_JSON_MAX_DEPTH`, `CIRNET_REQUEST_JSON_MAX_TOKENS` và `CIRNET_REQUEST_BODY_SECONDS`. Giới hạn chung phải cho phép ít nhất 2.000.000 byte. Giữ giới hạn Nginx đồng bộ khi tăng mức của ứng dụng. [Cấu hình ứng dụng](../../../services/api/app/config.py)

Mặc định thời gian thực có 512 đăng ký mỗi tiến trình, 16 mỗi chủ sở hữu và 8 mỗi phiên, với một tác vụ xả hàng chờ được lập lịch cho mỗi đăng ký. Mỗi bước giữ tối đa 128 sự kiện trong hàng đợi hoặc đang vào. Giới hạn byte lưu là 1 MiB mỗi đăng ký, 512 KiB mỗi sự kiện và 16 MiB mỗi tiến trình, gồm phần dành cho đồng bộ lại. Khi tràn, ứng dụng gửi `resync.required` có phiên bản và giữ thứ tự trong phạm vi tương ứng. Bắt tay, gửi và dọn dẹp được bảo vệ khỏi hủy đều có thời hạn năm giây. Thông điệp đến giới hạn 120 mỗi phút, 64 KiB, độ sâu 32 và 2.048 token khi quét cấu trúc. Phản hồi chẩn đoán kiểu echo cũ giới hạn 1 KiB và không mang quyền ra lệnh. Vượt hạn mức đăng ký/thông điệp đóng với mã 4429. Hết thời hạn bắt tay đóng với mã 4408. Điều khiển chỉ khả dụng sau hello giao thức và ảnh chụp trạng thái HTTP mới trong đúng phạm vi.

Cấu hình giới hạn đăng ký và thời hạn bằng `CIRNET_WEBSOCKET_MAX_SUBSCRIPTIONS`, `CIRNET_WEBSOCKET_MAX_PER_OWNER`, `CIRNET_WEBSOCKET_MAX_PER_SESSION`, `CIRNET_WEBSOCKET_HANDSHAKE_SECONDS`, `CIRNET_WEBSOCKET_SEND_SECONDS` và `CIRNET_WEBSOCKET_CLEANUP_SECONDS`. Giữ `--ws-max-size 65536 --ws-max-queue 4` trong Uvicorn để giới hạn tiếp nhận ở lớp giao thức trước kiểm tra của ứng dụng. [Triển khai WebSocket](../../../services/api/app/websocket/events.py) · [Unit API](../../../deployment/systemd/cirnet-api.service)

## Migration, quản trị viên và khởi động

Trước khi nâng cấp, ngừng nhận Run mới, hoàn tất dọn dẹp an toàn hoặc giữ cách ly, rồi sao lưu cơ sở dữ liệu và thư mục bản thu cùng manifest phát hành tương ứng. Diễn tập khôi phục trong môi trường cô lập. Xác nhận quyền sở hữu, digest bản thu, quyền giữ trạm, cách ly và việc trong hàng đợi sau khôi phục trước khi cấp quyền điều khiển Hardware cho một bộ điều phối. Ngăn phát lại Start chưa rõ kết quả. [Cài bản phát hành và quay lui](release-and-rollback.md)

Chạy bằng trình thông dịch API đã cài và cấu hình production của tài khoản dịch vụ.

```sh
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username initial_admin --display-name 'Administrator'
```

CLI quản trị viên hỏi mật khẩu. Quy trình cấp phát có thể dùng biến một lần `CIRNET_BOOTSTRAP_PASSWORD` rồi xóa trước khi khởi động máy chủ. Tài khoản và mật khẩu được cấp tường minh. Migration HEAD là `0007_auth_maintenance`, sau `0006_experiment_runtime`. Nâng cấp cơ sở dữ liệu đã ở HEAD không thay đổi dữ liệu. Migration giữ lịch sử thí nghiệm, quyền giữ trạm và phiên, tuân theo quy tắc chủ sở hữu cũ và vẫn yêu cầu giải phóng an toàn hoặc cách ly khi khôi phục sau khởi động lại. Các kiểm tra sao lưu/khôi phục PostgreSQL và tranh chấp giữa kết nối độc lập có bằng chứng theo ngày riêng. Người vận hành quay lui bằng cách khôi phục đúng cặp cơ sở dữ liệu và bản thu. [Xác thực và migration](../architecture/auth-and-migrations.md)

[Unit API](../../../deployment/systemd/cirnet-api.service) kiểm tra migration HEAD trước khi chạy và dùng `/var/lib/cirnet`. [Unit Hardware](../../../deployment/systemd/cirnet-hardware.service) chỉ bind RPC trên loopback. Cài unit sau khi duyệt cấu hình và kiểm tra trên máy đích dự kiến. Nhật ký JSON có cấu trúc liên kết ID yêu cầu, thí nghiệm, thao tác và bản thu, loại trừ bí mật phiên, thông tin xác thực, dữ liệu riêng và tuyến vật lý. Unit tắt nhật ký truy cập thô của Uvicorn. Duyệt riêng nhật ký proxy và truy cập bổ sung. Thao tác khôi phục và thay đổi mang tính hủy dữ liệu giữ bản ghi kiểm toán trong cơ sở dữ liệu.

## Lưu giữ và bảo trì bản thu

Giữ bản thu trên kho lưu trữ bền vững do tài khoản dịch vụ sở hữu. Giới hạn thư mục mặc định là 268.435.456 byte và 4.096 tệp `.ncap` cho một tiến trình API ghi. Ghi nguyên tử bảo toàn ID đã niêm phong và các byte tương ứng. Cơ sở dữ liệu và sự kiện vòng đời giữ siêu dữ liệu. Payload NCAP v1 qua HTTP/RPC theo quyền sở hữu mang mẫu nhị phân. Đọc, băm và xóa chạy ngoài khóa điều khiển thí nghiệm. Lỗi kho lưu trữ được báo tường minh và không sinh dạng sóng giả. [Danh mục bản thu](../architecture/capture-catalog.md)

Mặc định lưu 30 ngày, áp dụng khi gọi hoặc lập lịch. Xem kết quả chạy thử trước khi áp dụng lô có giới hạn.

```sh
python -m app.capture_maintenance --limit 100 --dry-run
python -m app.capture_maintenance --limit 100
```

[Unit chạy một lần](../../../deployment/systemd/cirnet-capture-maintenance.service) và [timer hằng giờ](../../../deployment/systemd/cirnet-capture-maintenance.timer) là tùy chọn, chạy bảo trì bản thu có giới hạn riêng với khởi tạo phần cứng và khôi phục. Một lô chỉ loại bỏ bằng chứng đã kết thúc, không còn quyền giữ trạm. Bản thu đang hoạt động và bị cách ly được bảo vệ. Đánh dấu siêu dữ liệu không khả dụng và ghi kiểm toán trước khi xóa tệp. Dọn dẹp thất bại giữ trạng thái chờ và trả mã thoát khác 0. `CIRNET_CAPTURE_RETENTION_SECONDS=0` tắt hết hạn nhưng vẫn thử lại dọn dẹp đang chờ. Stop, giải phóng và hết hạn giữ trạm bảo toàn bản thu cũ và quyền đọc của chủ sở hữu đã được cấp quyền.

Sao lưu siêu dữ liệu danh mục cùng nội dung. Lỗi giữa lúc công bố payload và ghi nhận siêu dữ liệu có thể để lại tệp chưa được tham chiếu. Hạn mức thư mục vẫn tính tệp đó. Điều tra bằng ảnh chụp cơ sở dữ liệu nhất quán khi các tiến trình ghi đã dừng. Lệnh bảo trì chỉ loại bỏ mục đã lập chỉ mục. Bản ghi đánh dấu xóa và kiểm toán của siêu dữ liệu vẫn được giữ. Lưu trữ dài hạn cơ sở dữ liệu là chính sách vận hành riêng. Scope/Generator vật lý và bộ giải tương tự/hỗn hợp đầy đủ chỉ khả dụng khi có bộ tạo dữ liệu hoặc adapter đã kiểm chứng. [An toàn phòng thí nghiệm vật lý](../architecture/physical-lab-safety.md) · [Biên bản kiểm chứng Web/Contracts lịch sử](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-web-contracts.md)
