# Soạn thảo và công bố bài thực hành

[English](../../en/architecture/assignments-and-publication.md) · [Tài liệu gốc đầy đủ](../../architecture/assignments-and-publication.md)

Mỗi bài thực hành có bản soạn thảo hiện tại và một phiên bản công bố được chọn riêng. Giảng viên có thể sửa bản nháp của mình trong khi sinh viên tiếp tục xem và sử dụng phiên bản đã công bố. Sinh viên không được truy cập các API soạn thảo. Quản trị viên chỉ truy cập bài của người khác theo quyền rõ ràng, có ghi nhật ký kiểm toán.

## Soạn thảo và công bố

`AssignmentAuthoringDocument` 1.0 bao bọc `AssignmentDefinition` cùng chủ sở hữu, thời điểm, số phiên bản soạn thảo và trạng thái công bố. Định danh bài được giữ qua các lần lưu. Danh sách tại `/api/assignment-documents` phân trang theo khóa và có giới hạn. Lệnh lưu gửi `{base_revision, definition}`, còn lệnh công bố gửi `{base_revision, published, feedback_policy?}` đến API công bố của bài. Nếu phiên bản cơ sở đã cũ, máy chủ trả HTTP 409 `REVISION_CONFLICT` cùng `current_revision`. Bản nháp chưa lưu vẫn còn ở máy khách. Dữ liệu được kiểm tra theo lược đồ và giới hạn dung lượng trước khi ghi. Giao dịch ghi kiểm tra lại phiên, vai trò và quyền sở hữu.

Mỗi lần lưu hoặc công bố thành công tạo một phiên bản bất biến, trong giới hạn số nguyên an toàn của hợp đồng. Ví dụ, tạo bài sinh phiên bản 1, công bố chọn phiên bản 2, rồi sửa nháp tạo phiên bản 3 trong khi phiên bản 2 vẫn được công bố. Lần công bố tiếp theo chọn phiên bản 4. Hủy công bố tăng phiên bản hiện tại và bỏ lựa chọn công bố. Bản nháp có thể còn đầu nối chưa phân giải. Luồng thực thi vẫn phân giải và kiểm tra chúng trước khi chấp nhận chạy.

## Phiên bản API và tiếp nhận yêu cầu chạy

`/api/v2/assignment-documents` và `/api/v2/assignments` dùng chung quy tắc sở hữu, công bố và ẩn dữ liệu với API 1.0. Hai API này nhận định nghĩa 2.0 có tham chiếu Graph 1.2. Trình biên tập chọn v2 khi gắn tham chiếu 1.2. Thao tác cũ từ chối định nghĩa V2 được chọn với `UNSUPPORTED_DOCUMENT_VERSION`. Lệnh công bố cũ tuần tự hóa việc chọn bản lưu hiện tại. Máy khách mới gửi phiên bản cơ sở.

Sinh viên thấy tiêu đề đã công bố, chính sách đánh giá và các trường công khai của đầu nối. Mạch tham chiếu, đáp án, cấu hình giảng viên và ánh xạ vật lý vẫn riêng tư kể cả khi bật phản hồi chi tiết. Hệ thống xác định định nghĩa bất biến trước khi biên dịch rồi kiểm tra lại trong giao dịch tạo thí nghiệm và thao tác. Hủy công bố đồng thời khiến yêu cầu bị từ chối. Nếu lựa chọn phiên bản thay đổi, máy chủ trả `ASSIGNMENT_CHANGED`. Bản chụp riêng lưu ngữ cảnh chấm của lần chạy. Thay đổi chính sách phản hồi có chủ đích áp dụng cho các bản chiếu HTTP, khôi phục thao tác và sự kiện của lần chạy cũ, đồng thời giữ nguyên quan sát và ngữ cảnh chấm đã lưu.

Migration `0004_assignments` theo sau `0003_projects`, gán phiên bản 1 cho nội dung cũ và chọn phiên bản đó cho bài đã công bố, đồng thời giữ JSON gốc. Khi khôi phục, dùng bản sao lưu cơ sở dữ liệu và capture tương ứng. Xem [dự án riêng tư](projects-and-revisions.md) và [xác thực và nâng cấp cơ sở dữ liệu](auth-and-migrations.md).
