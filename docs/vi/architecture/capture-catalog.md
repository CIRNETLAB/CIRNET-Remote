# Định danh và dọn dẹp capture đã lưu

[English](../../en/architecture/capture-catalog.md) · [Mục lục](../index.md)

Migration `0005_captures` theo sau `0004_assignments`. Định nghĩa lược đồ đã chốt nằm trong `app/migrations/schema_v0005.py`. Migration không nhập metadata bảng có thể thay đổi của phiên bản hiện tại. Migration thêm `lab_captures` với chỉ mục theo tuổi của payload còn khả dụng và trạng thái chờ dọn dẹp, cùng khóa ngoại đến thí nghiệm sở hữu. Mỗi hàng lưu định danh capture, JSON metadata, thời điểm tạo, trạng thái khả dụng và trạng thái dọn dẹp. Mẫu nằm trong payload NCAP bên ngoài cơ sở dữ liệu. Một thí nghiệm có thể có nhiều thế hệ capture bất biến.

Quyền sở hữu capture lấy bằng phép nối với `lab_experiments.owner_id`. Không có trường chủ sở hữu thứ hai có thể bị lệch sau khi xác nhận nhận dữ liệu khách. Vai trò Giảng viên hoặc Admin không cấp quyền đọc capture riêng của chủ thể khác.

Migration nhận metadata đã niêm phong có tham chiếu payload, số byte dương và định danh SHA-256, hoặc bản ghi metadata không khả dụng có kích thước bằng 0. Migration bỏ qua mảng mẫu nằm trực tiếp trong JSON và bản ghi lịch sử chưa niêm phong. JSON gốc, dữ liệu cũ nằm trực tiếp trong JSON, tệp payload, lease và trạng thái cách ly vẫn được giữ. Định danh capture lịch sử trùng nhau làm migration thất bại. Capture lịch sử chưa niêm phong nằm nguyên trong bản ghi cũ và cần chính sách khôi phục rõ ràng trước khi đi qua API payload đã niêm phong.

## Nâng cấp và quay lui

Dừng tiến trình ghi và giữ cặp bản sao lưu cơ sở dữ liệu và payload tương ứng trước khi nâng cấp. Diễn tập SQLite bằng API sao lưu và `PRAGMA integrity_check`. Diễn tập PostgreSQL bằng `pg_dump` thật và khôi phục vào schema hoặc cơ sở dữ liệu riêng thuộc phiên kiểm thử. Trước khi chuyển đổi, kiểm tra số bản ghi catalog cùng JSON và trạng thái lease đã giữ. Khi quay lui, khôi phục cơ sở dữ liệu và bản sao payload tương ứng đã xác minh. Migration từ chối hạ phiên bản theo cách phá hủy dữ liệu. Kiểm thử tự động chạy trên cả hai hệ cơ sở dữ liệu thật, gồm sao lưu, khôi phục PostgreSQL và quan hệ khóa giữa các giao dịch.

## Niêm phong và ngừng cung cấp capture

Khi lưu thí nghiệm, hệ thống chèn capture hiện tại đã niêm phong vào catalog trong cùng giao dịch SQL. Định danh đã có không thể đổi metadata định danh đã niêm phong hoặc chuyển sang thí nghiệm khác. Định danh đã ngừng cung cấp không thể khả dụng trở lại. Thay capture hiện tại vẫn giữ các thế hệ cũ trong catalog.

`Repository.retire_capture` kiểm tra quyền của phiên hiện tại khi có thông tin phiên, khóa thí nghiệm cha và đọc lại chủ sở hữu, trạng thái kết thúc và việc không còn lease, kể cả lease cách ly. Thao tác đánh dấu metadata không khả dụng, xóa tham chiếu, mã băm và kích thước payload, rồi commit `cleanup_pending=true` trước khi truy cập hệ tệp. Nếu đúng capture đó vẫn là bản hiện tại, giao dịch cũng cập nhật JSON thí nghiệm và tăng phiên bản. Xóa một thế hệ cũ không thể thay thế capture hiện tại. Nếu hết số phiên bản có thể dùng, toàn bộ thao tác quay lui. Mỗi lần thay đổi ghi lý do vào nhật ký kiểm toán trong cùng giao dịch. Lệnh xóa do phiên xác thực ghi chủ thể thực tế. Bảo trì ghi tác nhân là null.

Sau đó, tác vụ dọn dẹp có thể xóa payload thuộc quyền quản lý và đánh dấu đã hoàn tất. Nếu thao tác tệp thất bại, dấu xóa và cờ chờ dọn dẹp được giữ để thử lại có chủ đích. Máy khách không thể đọc payload đã bị ngừng cung cấp dù việc xóa tệp thất bại. Lặp lại thao tác ngừng cung cấp cho cùng kết quả và giữ trạng thái chờ. Giao dịch SQL không kéo dài qua việc đọc, băm, xóa hoặc thử lại trên hệ tệp. Truy vấn lưu giữ có giới hạn chỉ chọn capture khả dụng đã quá hạn và mục chờ dọn dẹp, loại các thí nghiệm chưa kết thúc hoặc còn lease. Hàng rào trên hàng cha cũng ngăn yêu cầu đặt chỗ cạnh tranh tạo lease mới sau khi capture của thí nghiệm kết thúc đã ngừng cung cấp.

Đặt thời gian lưu giữ bằng 0 sẽ tắt hết hạn theo tuổi và tiếp tục thử lại các mục chờ dọn dẹp. Capture khả dụng có mốc thời gian metadata bằng 0 không bị tính là hết hạn.
