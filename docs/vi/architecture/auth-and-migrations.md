# Xác thực và nâng cấp cơ sở dữ liệu

[English](../../en/architecture/auth-and-migrations.md) · [Tài liệu gốc đầy đủ](../../architecture/auth-and-migrations.md)

Định danh chủ thể được lưu bền vững để xác định quyền sở hữu. Cookie xác thực phiên bằng một thông tin xác thực riêng. Mã phiên là định danh khác, dùng để thu hồi phiên và quản lý quyền điều khiển có thời hạn. Cookie mới có 256 bit ngẫu nhiên và cơ sở dữ liệu chỉ lưu bản băm SHA-256. Mật khẩu dùng Argon2id. `X-Control-Client` định danh tab điều khiển.

## Phiên và vai trò

Chỉ yêu cầu `GET /api/auth/session` được gọi chủ đích mới tạo phiên khách hoặc phiên trước đăng nhập và trả token CSRF. Người truy cập production chưa xác thực nhận phiên trước đăng nhập. Các phương thức thay đổi trạng thái, gồm đăng nhập và đăng xuất, cần Origin tin cậy khớp chính xác và token CSRF tương ứng. API 0.1.2 phát cả `cirnet_session` và `netcircuit_session` với cùng thông tin xác thực, ưu tiên tên chuẩn khi đọc. API ưu tiên `X-CIRNET-CSRF` và chấp nhận `X-CSRF-Token` cũ. Cookie có HttpOnly, SameSite=Lax, Path=/ và Secure trong production. WebSocket kiểm tra cùng thông tin xác thực, Origin, thời hạn và trạng thái thu hồi.

Yêu cầu thông thường mang cookie hết hạn hoặc bị thu hồi trả `SESSION_EXPIRED` và không thay cookie. Yêu cầu đọc được bảo vệ mà thiếu thông tin xác thực trả `UNAUTHENTICATED`. Đăng nhập, đăng xuất và xác nhận nhận dữ liệu khách đều đổi thông tin xác thực. Thay đổi vai trò hoặc trạng thái hoạt động thu hồi các phiên liên quan. Phản hồi thông thường đến muộn không thể ghi đè kết quả đổi phiên đã thành công. Khi chưa rõ kết quả đổi phiên, trình duyệt đọc lại phiên mà không lặp lại thao tác. Bằng chứng sở hữu cũ còn hiệu lực chỉ được đổi qua yêu cầu khởi tạo phiên rõ ràng. Nhận dữ liệu khách đã xác nhận chuyển bản ghi sở hữu và khóa thao tác trong một giao dịch, đồng thời từ chối lease đang hoạt động, đang cách ly hoặc xung đột khóa.

Mặc định mỗi địa chỉ máy khách được tạo tối đa 30 phiên mới mỗi phút. Tác vụ bảo trì dùng các lô có chỉ mục và giữ chủ thể, nhật ký kiểm toán và dữ liệu sở hữu. Mặc định tác vụ giữ thông tin xác thực đã hết hạn một ngày, xử lý tối đa 100 thông tin xác thực và 100 bản ghi giới hạn tần suất cũ mỗi lượt, và giới hạn bảng theo địa chỉ ở 10.000 bản ghi. Bằng chứng cũ còn hiệu lực vẫn giữ hàng rào thu hồi. Chỉ Admin đã xác thực mới quản lý tài khoản. Admin đang hoạt động cuối cùng không thể bị vô hiệu hóa hoặc hạ vai trò.

## Triển khai và nâng cấp

Production yêu cầu PostgreSQL, `CIRNET_ALLOW_GUEST=false` và `CIRNET_TRUSTED_ORIGINS` khai báo HTTPS rõ ràng. Dùng trình thông dịch của môi trường API đã cài để chạy migration và tạo quản trị viên đầu tiên từ terminal riêng.

```console
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username instructor-admin
```

Lệnh hỏi mật khẩu trực tiếp. Xóa `CIRNET_BOOTSTRAP_PASSWORD` sau khi cấp phát qua biến môi trường. Chuỗi Alembic đi từ `0001_legacy` qua xác thực, dự án, bài thực hành, capture và chỉ mục thực thi đến `0007_auth_maintenance`. Dữ liệu lịch sử, quyền sở hữu, định danh thao tác và lease cách ly được giữ. Khi nâng cấp, dừng tiến trình ghi và xác minh cặp bản sao lưu cơ sở dữ liệu và capture tương ứng. Diễn tập SQLite bằng API sao lưu và kiểm tra toàn vẹn, còn PostgreSQL dùng bản dump khôi phục vào cơ sở dữ liệu riêng. Khi quay lui, khôi phục cả cặp. Kết quả PostgreSQL ngày 2026-10-16 thuộc lần chạy ghi trong tài liệu gốc. Xem [hướng dẫn API](../api/application.md).
