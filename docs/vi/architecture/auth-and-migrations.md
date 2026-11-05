# Xác thực và nâng cấp cơ sở dữ liệu

[English](../../en/architecture/auth-and-migrations.md) · [API ứng dụng](../api/application.md) · [Triển khai production](../operations/deployment.md)

## Thông tin xác thực và đổi phiên

API dùng định danh chủ thể bền vững để xác định quyền sở hữu. Cookie chứa thông tin
xác thực dạng opaque, tách riêng với định danh chủ thể. Giá trị cookie mới có
256 bit ngẫu nhiên. Bảng `auth_sessions` chỉ lưu bản băm SHA-256. Định danh phiên
dùng để thu hồi phiên và giữ quyền điều khiển có thời hạn là một định danh riêng.
API dùng phiên bản khóa `argon2-cffi==25.1.0` để băm Argon2id, kiểm tra và băm lại
mật khẩu khi tham số thay đổi. Mật khẩu và thông tin xác thực từ cookie được giữ
ngoài DTO công khai, bản ghi kiểm toán và đối số dòng lệnh.

`GET /api/auth/session` khởi tạo phiên và trả token CSRF. Khi bật rõ chế độ khách
phát triển, phiên dùng chủ thể Guest với quyền Student. Khi tắt khách, yêu cầu này
tạo phiên chưa xác thực để cấp token CSRF cho đăng nhập. Mọi phương thức HTTP
có thể thay đổi trạng thái, kể cả đăng nhập và đăng xuất, cần `Origin` tin cậy
khớp chính xác và token CSRF của phiên. API 0.1.2 phát cùng một thông tin xác
thực qua `cirnet_session` và `netcircuit_session`. Khi đọc, API ưu tiên tên chuẩn
nếu có mặt. Gửi `X-CIRNET-CSRF`. Header cũ `X-CSRF-Token` vẫn được chấp nhận
khi thiếu header chuẩn. Cookie có HttpOnly, SameSite=Lax, Path=/, thời hạn hữu
hạn và cờ Secure trong production. Đăng nhập, đăng xuất, nhận dữ liệu khách và
thay đổi vai trò thu hồi phiên trước đó. WebSocket kiểm tra cùng cookie, Origin,
thời hạn và trạng thái thu hồi. `X-Control-Client` định danh tab giữ quyền điều
khiển, không dùng để xác thực.

Yêu cầu thông thường gửi cookie sai, hết hạn hoặc đã thu hồi nhận
`SESSION_EXPIRED` và không cài cookie thay thế. Yêu cầu khởi tạo tường minh
`GET /api/auth/session` cài và trả phiên mới trước đăng nhập hoặc phiên khách,
phù hợp với trạng thái thực tế. Danh tính đã xác thực trước đó không được giữ
trong phiên mới. Thao tác xác thực thành công tự cài thông tin xác thực đã đổi.
Vì vậy, yêu cầu đọc gửi cookie cũ hoặc không có cookie, nếu về muộn, không thể
ghi đè cookie của lượt đăng nhập thành công. Hệ thống nhận diện riêng việc đổi
cookie cũ còn hiệu lực qua khởi tạo phiên và chỉ giữ quyền sở hữu khách đã được
chứng minh. Giao diện Web đóng các kết nối từ xa cũ khi thực hiện thao tác xác
thực. Nếu đổi phiên thất bại hoặc chưa rõ kết quả, Web đối soát bằng một yêu cầu
chỉ đọc phiên và không gửi lại đăng nhập, claim hay Run.

Yêu cầu thông thường chỉ tra cứu thông tin xác thực hiện có. Health và OPTIONS
không kèm thông tin xác thực sẽ không tạo phiên hoặc bản ghi khách. Yêu cầu đọc
được bảo vệ thiếu thông tin xác thực trả `UNAUTHENTICATED`. Cookie cũ hết hiệu
lực vẫn áp dụng `SESSION_EXPIRED`, kể cả với health, và không cài cookie mới.
Lượt đọc dùng chứng cứ cũ dùng lại một ngữ cảnh nội bộ có thể thu hồi cho mỗi
chứng cứ. Chỉ khởi tạo phiên tường minh mới cấp thông tin xác thực. Mặc định mỗi
địa chỉ máy khách chỉ được cấp mới 30 lần trong 60 giây
(`CIRNET_BOOTSTRAP_LIMIT`). Dùng lại thông tin xác thực còn hiệu lực không tính
vào hạn mức này. Đăng nhập có hạn mức riêng theo địa chỉ và theo tài khoản.
Ngữ cảnh nội bộ cũ đã hết hạn hoặc bị thu hồi trả 401 cho yêu cầu đọc thông
thường, dù chứng cứ ban đầu có thể còn hạn lâu hơn. Hệ thống giữ trạng thái hết
hiệu lực của ngữ cảnh đó. Khởi tạo phiên tường minh vẫn có thể dùng chứng cứ sở
hữu còn hiệu lực để cấp thông tin xác thực opaque mới.

## Bảo trì phiên và Stop an toàn

Tiến trình giám sát của ứng dụng thực hiện tối đa một lô bảo trì mỗi phút, độc
lập với khóa điều phối. Một lô dùng chỉ mục để xóa tối đa 100 thông tin xác thực
có thời điểm hết hạn danh nghĩa cách hiện tại ít nhất một ngày, kể cả thông tin
đã thu hồi. Lô cũng xóa tối đa 100 bản ghi giới hạn tần suất cũ hơn một ngày.
`CIRNET_AUTH_RETENTION_SECONDS` và `CIRNET_AUTH_MAINTENANCE_BATCH` cấu hình thời
gian giữ và cỡ lô. Nếu một lô thất bại, lượt giám sát tiếp theo có thể thử lại.
Chủ thể, người dùng, quyền sở hữu, thao tác và bản ghi kiểm toán được giữ. Xóa
phiên không xóa bằng chứng hoặc tài liệu thuộc sở hữu.

Bản ghi ngữ cảnh đã hết hạn hoặc bị thu hồi tiếp tục làm hàng rào xác thực khi
chứng cứ cũ tương ứng còn hiệu lực, kể cả khi thời gian giữ là 0. Tác vụ chỉ đọc
tối đa một lô đã cấu hình gồm các hàng trường đơn cần xét và ID chứng cứ. Con
trỏ keyset theo thời điểm hết hạn và ID vượt qua các hàng được bảo vệ để tiếp
tục dọn những phiên hết hạn khác, rồi quay vòng cho lượt sau. Chủ thể được giữ.
Bảng giới hạn theo địa chỉ từ chối cấp mới khi đạt 10.000 hàng và chờ bảo trì.

Khi thu hồi nhiều phiên, hệ thống tiếp nhận yêu cầu hủy cho mọi lần chạy liên
quan trước khi gửi tác vụ dọn dẹp từ xa. Quét phiên hết hạn hoặc mất kết nối dùng
cùng bộ điều phối Stop có giới hạn bốn worker và tối đa 16 định danh đang chờ,
tách riêng với worker mô phỏng. Nếu thao tác cấu hình của một lần chạy đang tranh
chấp tài nguyên, tiến trình giám sát thử lại thay vì làm chậm Stop ở trạm khác.
Ghi nhận ACK của Stop chưa giải phóng quyền giữ trạm. Worker chỉ dọn xong khi có
kết quả chuyển về trạng thái an toàn thực sự.

## Cấu hình production và cấp tài khoản

Đặt `CIRNET_ALLOW_GUEST=false` trong production và khai báo
`CIRNET_TRUSTED_ORIGINS` bằng các origin HTTPS cụ thể. Production cũng yêu cầu
PostgreSQL. Tổ hợp production không an toàn không qua kiểm tra cấu hình. Chế độ
khách phát triển dành cho môi trường phát triển riêng. Quản trị viên phải được
cấp tường minh. `CIRNET_ENV` chỉ chấp nhận `development`, `test` hoặc
`production`. `CIRNET_ALLOW_GUEST` chỉ chấp nhận `true` hoặc `false`. Giá trị
viết sai làm khởi động thất bại và không chuyển sang chế độ phát triển ẩn danh.

Sau khi cài API, chạy migration và cấp quản trị viên từ terminal riêng.

```console
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username instructor-admin
```

Lệnh cấp quản trị viên hỏi mật khẩu và ẩn ký tự nhập. Quy trình triển khai cũng
có thể cấp bằng `CIRNET_BOOTSTRAP_PASSWORD`. Xóa biến đó sau khi cấp. Lệnh từ
chối khi đã có quản trị viên. Chỉ Admin đã xác thực mới được tạo tài khoản hoặc
đổi vai trò và trạng thái hoạt động. Hệ thống bảo vệ Admin còn hoạt động cuối
cùng khỏi bị vô hiệu hóa hoặc hạ vai trò. Các thay đổi này được ghi kiểm toán và
thu hồi mọi phiên bị ảnh hưởng. Hạn mức đăng nhập lưu trong cơ sở dữ liệu. Kiểm
soát tần suất thao tác ghi của ứng dụng xử lý riêng để cho phép Stop an toàn.

## Truy cập bài tập và thí nghiệm

Sinh viên thấy bản ghi `StudentAssignmentView` đã công bố. Dạng xem này loại bỏ
đồ thị tham chiếu, đáp án, cấu hình chân của giảng viên và ánh xạ điểm cuối riêng.
Giảng viên soạn, công bố và truy cập bài tập riêng của mình theo quyền giảng viên.
Quyền Admin được kiểm tra tường minh.
`AssignmentDefinition` nội bộ vẫn là đầu vào chuẩn của trình biên dịch. Dữ liệu
nhập trực tiếp vào kho giữ riêng tư cho đến khi được gán chủ sở hữu và công bố
tường minh. Khi tạo thí nghiệm, API kiểm tra quyền truy cập bài tập độc lập với
thao tác liệt kê. Phản hồi thí nghiệm mặc định là `observed_only`. Admin đang
hoạt động và giảng viên đang hoạt động sở hữu bài tập có thể xem bằng chứng chi
tiết của bản ghi họ được phép đọc. Người đọc khác cần chính sách `detailed` đã
lưu tường minh. Cả hai chính sách đều ẩn đáp án tham chiếu trong dạng xem bài tập
của sinh viên.

## Migration và quyền sở hữu cũ

Chuỗi Alembic hiện tại là `0001_legacy` → `0002_auth` → `0003_projects` →
`0004_assignments` → `0005_captures` → `0006_experiment_runtime` →
`0007_auth_maintenance`. Revision 0007 thêm chỉ mục thời điểm hết hạn, chủ thể
và cửa sổ giới hạn tần suất, đồng thời giữ nguyên thông tin xác thực và quyền sở
hữu. Trang này mô tả nền tảng danh tính. Các trang [dự án](projects-and-revisions.md),
[bài tập](assignments-and-publication.md) và [bản thu](capture-catalog.md) mô tả
các revision sau. Kho mới chạy cả chuỗi này thay cho `create_all` không có phiên
bản. Mốc ban đầu kiểm tra các cột cũ bắt buộc trước khi tiếp nhận cơ sở dữ liệu
hiện có và tạo các bảng lịch sử còn thiếu. Revision xác thực bổ sung danh tính,
phiên, siêu dữ liệu truy cập bài tập, bản ghi kiểm toán và giới hạn tần suất.
Migration giữ thứ tự thí nghiệm, payload JSON, thao tác, tham chiếu bản thu, hàng
giữ trạm, cờ cách ly và chuỗi chủ sở hữu cũ. Bảng xác thực và truy cập bài tập
mới có khóa ngoại. Các cột quyền sở hữu thí nghiệm và thao tác lịch sử được giữ
để nhập nội bộ tin cậy. Thao tác ghi HTTP đã xác thực luôn dùng ID chủ thể bền
vững.

Chủ sở hữu ẩn danh hiện có được chuyển thành chủ thể Guest. Cookie cũ còn hiệu
lực có thể được đổi một lần lấy phiên opaque mới chứng minh cùng quyền sở hữu
khách. Cookie hết hạn không thể dùng để nhận bản ghi lịch sử. Lượt đọc thông
thường theo quyền sở hữu cũ, kể cả nội dung bản thu, giữ bằng chứng đó và không
cài cookie thay thế. Các lượt đọc này dùng ngữ cảnh nội bộ có thể thu hồi để lần
kiểm quyền cuối vẫn có hiệu lực. Ngữ cảnh hết hạn chậm nhất cùng chứng cứ cũ.
Khi xác nhận claim, hệ thống thu hồi ngữ cảnh đó cùng các phiên khách khác.

Chỉ `GET /api/auth/session` tường minh mới sử dụng chứng cứ để cài thông tin xác
thực opaque. Cách này ngăn một lượt đọc cũ đến muộn ghi đè lượt đăng nhập mới.
Quyền đọc của chủ sở hữu và luồng xác nhận claim vẫn được giữ khi bỏ việc tự
động cài thông tin xác thực trong lượt đọc cũ thông thường. Đăng nhập giữ bằng
chứng quyền sở hữu mà chưa chuyển dữ liệu. Claim khách được xác nhận sẽ chuyển
thí nghiệm và khóa thao tác trong một giao dịch, từ chối nếu quyền giữ trạm đang
hoạt động hoặc bị cách ly hay có lần chạy đang hoạt động, hủy khi khóa thao tác
bị trùng, sau đó đổi phiên. Bài tập lịch sử được chuyển sang riêng tư dưới chủ
sở hữu `legacy-system` và cần gán chủ, công bố tường minh. Tài khoản đăng nhập
đầu tiên chỉ có quyền đối với dữ liệu được gán hợp lệ.

## Sao lưu, quay lui và kiểm chứng

Trước khi nâng cấp cơ sở dữ liệu đang triển khai, dừng các tiến trình API ghi và
tạo bản sao lưu đã xác minh. Với SQLite, dùng API sao lưu SQLite hoặc `.backup`
để sao lưu nhất quán. Mở bản sao và chạy `PRAGMA integrity_check`, rồi diễn tập
migration trên bản đó. Với PostgreSQL, dùng `pg_dump` và khôi phục vào cơ sở dữ
liệu riêng. Chạy migration và kiểm số lượng bản ghi, thao tác và quyền giữ trạm
trước khi chuyển đổi. Giữ tệp bản thu cùng siêu dữ liệu. Hạ phiên bản không cho
phép xóa danh tính. Để quay lui, giữ các tiến trình ghi ở trạng thái dừng và
khôi phục cơ sở dữ liệu trước nâng cấp cùng bản sao lưu bản thu tương ứng đã xác
minh.

[Bằng chứng phát hành ngày 2026-10-16](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-w8-release.md)
ghi migration/khởi động lại SQLite và 16 ca PostgreSQL 18.6 thực tế, gồm sao
lưu/khôi phục và các ca cạnh tranh giữa tiến trình ghi độc lập, kiểm quyền và
khôi phục. Kết quả lịch sử áp dụng cho đúng lần chạy đã ghi. Xác nhận triển khai
production cần bằng chứng trên máy đích. Gate PostgreSQL cần máy chủ thật và cô
lập, đồng thời phải báo thất bại rõ ràng khi thiếu máy chủ. Bản ghi chạy mới
tuân theo [quy định kiểm chứng](../../VERIFICATION.md).
[Triển khai xác thực](../../../services/api/app/services/auth.py) · [Tên tương thích](../../../services/api/app/compatibility.py)
