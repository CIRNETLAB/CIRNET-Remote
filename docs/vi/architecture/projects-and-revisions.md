# Dự án riêng tư và phiên bản tài liệu mạch

[English](../../en/architecture/projects-and-revisions.md) · [Tài liệu gốc đầy đủ](../../architecture/projects-and-revisions.md)

Mỗi dự án thuộc một chủ thể có định danh bền vững. Vai trò Giảng viên và Admin không cấp quyền truy cập dự án của chủ thể khác. `project_id` và `document_id` định danh bản ghi trên máy chủ, còn đồ thị giữ `circuit_id` riêng. Create, Save, Open và Save As giữ nội dung Graph 1.0, 1.1 và 1.2 được hỗ trợ, gồm metadata, liên kết, ảnh bộ nhớ, thuộc tính chân và hình dạng dây. Kiểm tra lưu trữ xác nhận cấu trúc tài liệu. Khả năng biểu diễn của trình biên tập, kiểm tra để chạy và xác minh dây vật lý là các bước riêng.

## Lưu, quản lý phiên bản và xóa

Các thao tác cũ giữ cấu trúc 1.0. API tài liệu `/api/v2` nhận cụm linh kiện mềm và mô tả vật lý tự do rõ ràng của Graph 1.2. Trình biên tập chọn v2 trước khi ghi tài liệu 1.2. Có thể đọc lại sau `UNSUPPORTED_DOCUMENT_VERSION`, nhưng không gửi lại thao tác ghi. Lệnh lưu gửi `base_revision`, `name` và `graph`. Giao dịch kiểm tra lại quyền của phiên, chủ sở hữu, việc tài liệu còn hiệu lực và phiên bản cơ sở rồi thêm một phiên bản bất biến. Phiên bản cơ sở cũ trả HTTP 409 `REVISION_CONFLICT` và `current_revision`. ACK mang phiên bản và ETag tương ứng, chỉ áp dụng cho trạng thái bản nháp đã gửi. Các sửa đổi cục bộ sau đó vẫn chưa lưu. Save As tạo tài liệu mới trên máy chủ.

Danh sách lọc theo chủ sở hữu và phân trang theo khóa. Giới hạn mặc định là 50, khoảng cho phép 1–100, với cursor dạng opaque. Đồ thị có giới hạn 2.000.000 byte UTF-8. Khi xóa, hệ thống kiểm tra phiên bản cơ sở và ghi dấu xóa. Xóa dự án cũng ẩn các tài liệu của nó. Yêu cầu thêm tài liệu đồng thời vẫn phải thấy dự án cha còn hiệu lực. Phiên bản bất biến và tham chiếu của thí nghiệm được giữ sau khi xóa. Nhận dữ liệu khách đã xác nhận chuyển dự án cùng các bản ghi đủ điều kiện. `saved_by` và định danh kiểm toán lịch sử vẫn được giữ.

## Thực thi và khôi phục

Thí nghiệm chốt tài liệu và phiên bản đã lưu thuộc quyền sở hữu, đồ thị trực tiếp hoặc ngữ cảnh bài thực hành, cùng cấu hình đã tiếp nhận. Không thể kết hợp tài liệu đã lưu với một đồ thị trực tiếp ghi đè. Tham chiếu công khai phân biệt `INLINE_GRAPH`, `SAVED_DOCUMENT` và `ASSIGNMENT_CONTEXT`. Luồng vật lý dựa vào kết quả quét và kiểm tra an toàn để xác định dây đã quan sát.

Xuất JSON là thao tác tệp cục bộ. Lưu lên máy chủ, xuất, lịch sử và checkpoint dùng đồ thị đã soạn. Tiếp điểm tức thời đang giữ chỉ đổi đầu vào trực tiếp cho preview, đồng thời giữ giá trị `pressed` đã soạn và việc trường này có xuất hiện hay không. Tài liệu không bị đánh dấu đã sửa. Giá trị `pressed=true` được nhập vẫn là dữ liệu đã soạn sau khi nhấn và nhả.

Khôi phục tách bản nháp theo chủ thể và xem liên kết máy chủ đã lưu là chưa được xác minh. Bản nháp khôi phục cần Open hoặc Save có đối chiếu phiên bản và quyền sở hữu trước khi có thể cung cấp tham chiếu chạy đã được xác nhận. Phản hồi lưu cập nhật đúng bản nháp đã gửi. Sổ liên kết giữ tối đa 128 liên kết bản nháp đang dùng và từ chối liên kết tiếp theo thay vì loại một liên kết. Xóa trên máy chủ gỡ các liên kết tương ứng và giữ nội dung cục bộ.

Migration `0003_projects` theo sau `0002_auth` và thêm các bảng dự án, tài liệu, phiên bản và tham chiếu thí nghiệm. Bản ghi lịch sử giữ nội dung gốc. Nâng cấp và quay lui cần cặp bản sao lưu cơ sở dữ liệu và capture đã xác minh. Dùng gate PostgreSQL với cơ sở dữ liệu thật, cô lập để kiểm migration, khóa và sao lưu/khôi phục. Xem [nâng cấp cơ sở dữ liệu](auth-and-migrations.md).
