# Soạn thảo, công bố và tương thích bài thực hành

[English](../../en/architecture/assignments-and-publication.md) · [Tài liệu](../index.md)

Mỗi bài thực hành có phiên bản soạn thảo hiện tại và một phiên bản công bố được chọn riêng. Giảng viên có thể sửa bản nháp của mình trong khi sinh viên tiếp tục xem và sử dụng bản đã công bố.

## Soạn thảo và công bố

API soạn thảo chuẩn là `contracts/public/assignments.schema.json`, phiên bản 1.0. `AssignmentAuthoringDocument` bao bọc `AssignmentDefinition` hiện có cùng chủ sở hữu, các mốc thời gian, phiên bản hiện tại, trạng thái công bố và phiên bản đã công bố. Mô hình được sinh, trình phân tích runtime, OpenAPI và liên kết thao tác dùng chung các định nghĩa này. Định danh bài không đổi qua các lần lưu.

Giảng viên soạn bài của mình. Quản trị viên chỉ truy cập bài của tác giả khác theo quyền tường minh. Việc đọc, sửa, công bố và tiếp nhận thí nghiệm đều được kiểm toán. Sinh viên không được dùng các endpoint soạn thảo. Kiểm tra schema và giới hạn byte diễn ra trước thao tác ghi. Trong giao dịch, hàng rào phiên dùng chung của cơ sở dữ liệu kiểm tra lại phiên, vai trò hiện tại và chủ sở hữu. Chỉ kiểm tra ở middleware khi nhận yêu cầu chưa đủ để cấp quyền cho lần ghi bị trì hoãn.

`/api/assignment-documents` hỗ trợ tạo và liệt kê theo khóa với giới hạn. Đường dẫn `/{assignment_id}` của nó hỗ trợ đọc và lưu. Lệnh lưu gửi `{base_revision, definition}`. Đường dẫn `/{assignment_id}/publication` nhận `{base_revision, published, feedback_policy?}`. Nếu phiên bản cơ sở đã cũ, máy chủ trả HTTP 409 `REVISION_CONFLICT` cùng `current_revision` và giữ bản nháp chưa lưu ở máy khách. Phiên bản không được vượt số nguyên an toàn tối đa của hợp đồng.

Mỗi lần lưu hoặc công bố thành công tăng phiên bản soạn thảo và giữ một bản chụp định nghĩa bất biến. Tạo bài sinh phiên bản 1. Công bố sinh và chọn phiên bản 2. Sửa nháp sinh phiên bản 3 trong khi phiên bản 2 vẫn dùng được cho sinh viên. Lần công bố tiếp theo chọn phiên bản 4. Hủy công bố tăng phiên bản hiện tại và xóa lựa chọn công bố. Bản nháp chưa xong không thay định nghĩa thực thi đã công bố. Điểm cuối trong bản nháp có thể chưa được phân giải khi soạn. Luồng thực thi vẫn dùng các bước phân giải và kiểm tra an toàn Lab-First.

Xem [tuyến API bài thực hành](../../../services/api/app/api/assignments.py) và [dịch vụ soạn thảo](../../../services/api/app/services/assignments.py).

## Dạng xem API cũ và có phiên bản

`contracts/public/assignments-v2.schema.json` bổ sung `AssignmentDefinitionV2` 2.0 với tham chiếu Graph 1.2. `/api/v2/assignment-documents` và `/api/v2/assignments` dùng lại quy tắc sở hữu, phiên bản bất biến, công bố bằng so sánh rồi cập nhật (CAS) và ẩn dữ liệu. Web chọn v2 khi gắn tham chiếu 1.2. Mở hoặc lưu định nghĩa cũ giữ nguyên phiên bản. Thao tác đọc và ghi cũ từ chối định nghĩa V2 được chọn với `UNSUPPORTED_DOCUMENT_VERSION` trước khi thay đổi. Xem [hợp đồng lắp đặt linh hoạt](https://github.com/CIRNETLAB/CIRNET-Contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md).

Cấu trúc phản hồi đã chốt của `GET /api/assignments` và `GET /api/assignments/{id}` vẫn là `AssignmentView` 1.0. Sinh viên chỉ nhận tiêu đề đã công bố, chính sách đánh giá và các trường công khai của điểm cuối. Thiết kế tham chiếu, đáp án dự kiến, hồ sơ giảng viên và ánh xạ điểm cuối vật lý vẫn riêng tư kể cả khi bật phản hồi chi tiết. Bên gọi có quyền nhận dạng xem giảng viên cũ. Máy khách soạn thảo có phiên bản dùng lớp bao để lấy siêu dữ liệu phiên bản và định nghĩa nháp.

Ứng dụng trước khi có xác thực trả định nghĩa thô. Dạng xem đã xác thực theo vai trò thay cách công khai đó và giữ nguyên định nghĩa đã lưu. Tuyến tạo và công bố cũ dùng cùng dịch vụ soạn thảo và trả cấu trúc phản hồi ban đầu. Yêu cầu công bố cũ không có phiên bản cơ sở. Dịch vụ tuần tự hóa việc công bố bản lưu hiện tại trong giao dịch và không thể ghi đè định nghĩa. Máy khách mới dùng CAS công bố tường minh.

## Tiếp nhận thí nghiệm và phản hồi

Bước tiếp nhận xác định định nghĩa và phiên bản bất biến được chọn trước khi biên dịch. Giao dịch thêm thí nghiệm và thao tác kiểm tra lại khả năng truy cập và đúng lựa chọn đó. Hủy công bố đồng thời khiến yêu cầu bị từ chối. Lựa chọn phiên bản thay đổi trả `ASSIGNMENT_CHANGED`. API không thay định nghĩa mới sau khi đã biên dịch định nghĩa cũ. Sửa bản nháp mới chưa công bố vẫn cho phép sinh viên dùng bản công bố hiện có.

`_assignment_reference` và `_assignment_snapshot` riêng tư giữ phiên bản đã tiếp nhận và ngữ cảnh chấm. DTO tham chiếu tài liệu công khai đã chốt vẫn không chứa đáp án. Thay đổi chính sách phản hồi tường minh của giảng viên áp dụng cho dạng xem HTTP, khôi phục thao tác và thời gian thực của thí nghiệm trước đây. Ngữ cảnh chấm bất biến đầy đủ và quan sát vẫn được lưu. Khả năng truy cập bản công bố kiểm soát yêu cầu tiếp nhận mới. Quyền sở hữu và quyền điều khiển vẫn do cơ chế cấp quyền của chính thí nghiệm quyết định.

## Migration và khôi phục phiên bản

Migration `0004_assignments` theo sau `0003_projects`. Các bảng đã chốt thêm phiên bản bất biến và khóa ngoại trì hoãn cho lựa chọn hiện tại và công bố, cùng chỉ mục lịch sử thí nghiệm theo chủ sở hữu và số thứ tự. Payload và chính sách truy cập hiện có trở thành phiên bản 1. Bài đã công bố trước đây chọn phiên bản 1. Migration giữ JSON lịch sử, không chuẩn hóa hay xóa. Các lần nhập tin cậy qua repository sau migration khởi tạo cùng siêu dữ liệu. Dự án, bản thu, thao tác, quyền thuê trạm và bản chụp thí nghiệm riêng tư hiện có vẫn được giữ.

Hạ cấp phá hủy dữ liệu bị tắt. Dừng tiến trình ghi và khôi phục từ cặp bản sao lưu cơ sở dữ liệu và bản thu đã xác minh. Diễn tập sao lưu SQLite và khôi phục bằng PostgreSQL `pg_dump`/`psql` thật kiểm tra nâng cấp trên bản sao và giữ phiên bản cơ sở dữ liệu gốc.

Xem [migration bài thực hành](../../../services/api/app/migrations/versions/0004_assignments.py), [dự án riêng tư và phiên bản](projects-and-revisions.md) và [xác thực và nâng cấp cơ sở dữ liệu](auth-and-migrations.md).
