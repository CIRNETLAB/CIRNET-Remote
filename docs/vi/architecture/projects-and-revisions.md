# Dự án riêng tư và phiên bản tài liệu mạch

[English](../../en/architecture/projects-and-revisions.md) · [Tài liệu](../index.md)

API dự án và tài liệu công khai là phiên bản 1.0 tại `contracts/public/projects.schema.json`. Bộ công cụ hợp đồng cung cấp cấu trúc, mô hình Python, DTO trình duyệt, trình kiểm tra runtime, OpenAPI và liên kết thao tác. Mỗi dự án thuộc một chủ thể có định danh bền vững. Vai trò Giảng viên và Admin không mặc nhiên cấp quyền truy cập dự án của chủ thể khác.

## Định danh tài liệu và phiên bản đồ thị

`project_id` định danh dự án trên máy chủ. `document_id` định danh tài liệu trên máy chủ. Đồ thị giữ `circuit_id` nhúng, còn tên tài liệu máy chủ tách khỏi siêu dữ liệu đồ thị đã nhập. Create, Save, Open và Save As giữ Graph 1.0, 1.1 và 1.2 được hỗ trợ, gồm phần mở rộng, siêu dữ liệu, liên kết lắp và tiếp điểm, ảnh bộ nhớ, thuộc tính chân và hình dạng dây. Kiểm tra lưu trữ xác nhận cấu trúc. Khả năng biểu diễn của trình biên tập, quyền thực thi và tính đúng của dây nối vật lý được kiểm tra riêng.

Schema và tuyến công khai ban đầu giữ cấu trúc cũ đã chốt. `contracts/public/placement.schema.json` bổ sung cùng thao tác tài liệu `/api/v2` nhận `AnySupportedCircuitGraph`, gồm cụm lắp linh hoạt 1.2 và bộ mô tả vật lý tự do tường minh. Thao tác đọc, liệt kê và lưu cũ chọn tài liệu 1.2 trả `UNSUPPORTED_DOCUMENT_VERSION`. Web chọn v2 trước khi ghi và chỉ thử đọc lại sau đúng lỗi đó. Không phát lại thao tác ghi. Xem [hợp đồng lắp đặt linh hoạt](https://github.com/CIRNETLAB/CIRNET-Contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md).

## Lưu, liệt kê và xóa

Dự án và tài liệu có phiên bản và các mốc thời gian. Lệnh lưu gửi `base_revision`, `name` và `graph` chuẩn. Cơ sở dữ liệu chỉ cập nhật hàng hiện tại khi khớp chủ sở hữu, định danh, trạng thái còn hiệu lực và phiên bản cơ sở. Cùng giao dịch chèn phiên bản đồ thị bất biến mới. Phiên bản cơ sở đã cũ trả HTTP 409 `REVISION_CONFLICT` cùng `current_revision`. Lần lưu sai hoặc xung đột giữ nguyên đồ thị và phiên bản trước đó.

Phản hồi thành công mang phiên bản và ETag tương ứng. Máy khách gắn xác nhận với phiên bản bản nháp cục bộ đã gửi. Thay đổi trong lúc lưu vẫn chưa được lưu. Save As tạo tài liệu mới trên máy chủ từ đồ thị hiện tại.

Danh sách dự án và mạch áp dụng phạm vi chủ sở hữu và phân trang theo khóa có giới hạn với `limit` 1–100, mặc định 50, cùng `cursor` không diễn giải. Cursor đánh dấu vị trí điều hướng. Quyền sở hữu được kiểm tra độc lập. Giới hạn lưu đồ thị là 2.000.000 byte UTF-8, khớp giới hạn tệp của trình biên tập.

Khi xóa, cần phiên bản cơ sở khớp và hệ thống ghi dấu xóa. Xóa dự án cũng ẩn tài liệu của nó. Phiên bản đồ thị bất biến và tham chiếu thí nghiệm vẫn được giữ, bảo toàn bằng chứng lịch sử và lần chạy đã tiếp nhận. Khi chèn mạch mới, hệ thống kiểm tra dự án cha một cách nguyên tử. PostgreSQL còn khóa hàng cha đang hiệu lực để ngăn xóa đồng thời. Quyền ghi được kiểm tra lại trong giao dịch sau bước xác thực dữ liệu để lần ghi đang chờ của khách không thể hoàn tất sau khi nhận dữ liệu khách hoặc thu hồi phiên.

Nhận dữ liệu khách đã xác nhận chuyển quyền sở hữu dự án một cách nguyên tử cùng thí nghiệm và định danh thao tác. Quyền sở hữu tài liệu theo khóa ngoại ghép dự án cha/chủ sở hữu. `saved_by` và bản ghi kiểm toán lịch sử giữ định danh tác giả. Việc nhận dữ liệu không lấy dữ liệu của khách khác hoặc bản ghi cũ không có chủ.

Xem [tuyến API dự án](../../../services/api/app/api/projects.py) và [dịch vụ dự án](../../../services/api/app/services/projects.py).

## Tiếp nhận thí nghiệm

Tiếp nhận có thể dùng cặp tài liệu đã lưu và phiên bản thuộc quyền sở hữu hoặc đồ thị trực tiếp. Không thể kết hợp cặp đã lưu với đồ thị trực tiếp ghi đè. Máy chủ chốt đồ thị, cấu hình và ngữ cảnh bài thực hành. Tham chiếu tài liệu đã lưu được chèn nguyên tử khi tạo thí nghiệm. DTO tham chiếu tài liệu công khai chứa chế độ thực thi và phân biệt `INLINE_GRAPH`, `SAVED_DOCUMENT` và `ASSIGNMENT_CONTEXT`.

Bản chụp bài thực hành hoặc ngữ cảnh vật lý là tham chiếu thiết kế. Bước quét Lab-First xác định dây đã quan sát, còn các bước an toàn và khả năng thực thi vẫn quyết định việc chạy. Xem [công bố bài thực hành](assignments-and-publication.md).

## Nội dung đã soạn và khôi phục

Nhập và xuất JSON là thao tác tệp cục bộ. Xuất không xác nhận đã lưu trên máy chủ. Khôi phục cục bộ dùng kho trình duyệt riêng có phiên bản, phân vùng theo chủ thể. Kho lưu nội dung đang soạn. Thông tin xác thực, phê duyệt và quyền thực thi phần cứng nằm ngoài kho này.

Bộ máy tài liệu dùng cùng một bản chiếu nội dung đã soạn cho lịch sử, xuất, nhân bản qua clipboard, ghi máy chủ, điểm lưu khôi phục và tham chiếu tài liệu đã lưu. Tiếp điểm tức thời đang giữ phủ đầu vào `pressed` trực tiếp mà vẫn giữ giá trị đã soạn ban đầu và việc trường này có bị bỏ qua hay không. Đầu vào tăng thế hệ đồ thị trực tiếp để xem trước và kiểm tra. Thế hệ nội dung đã soạn và trạng thái chưa lưu giữ nguyên. Nhả, chuyển tài liệu, xóa, Undo/Redo và đặt lại chủ thể bỏ phạm vi đầu vào đã giữ. Giá trị `pressed=true` bền vững được nhập vẫn là dữ liệu đã soạn sau một lần nhấn và nhả.

Siêu dữ liệu lưu thuộc từng bản nháp cục bộ của chủ thể hiện tại. Chuyển từ bản nháp máy chủ sang bản nháp tạm rồi quay lại giữ liên kết và phiên bản cơ sở đã xác nhận của bản nháp máy chủ. Xác nhận hoặc xung đột lưu đang chờ cập nhật đúng bản nháp gốc kể cả khi bản nháp khác đang mở. Nó không thể đánh dấu bản nháp khác đã lưu. Sổ liên kết giữ tối đa 128 liên kết bản nháp máy chủ đang dùng và từ chối tường minh liên kết tiếp theo thay vì loại một liên kết đang mở. Bản nháp đã bỏ được dọn khỏi sổ.

Khi chuyển chủ thể, chụp mọi bản khôi phục nội dung đã soạn và liên kết của từng bản nháp, sau đó xóa đồng bộ tài liệu và siêu dữ liệu trước khi chờ lưu trữ. Xóa từ xa đã xác nhận gỡ mọi liên kết bản nháp khớp và giữ nội dung cục bộ.

Khôi phục lưu liên kết riêng cho từng bản nháp và xem chúng là tham chiếu máy chủ chưa được tin cậy. Bản nháp đã khôi phục ở trạng thái chưa lưu. Phải Save bằng CAS hoặc Open trên máy chủ, có xác thực và kiểm tra chủ sở hữu, để xác nhận hiện hành trước khi cung cấp tham chiếu thực thi đã lưu. Khôi phục không cấp lại quyền phiên hay phần cứng và không phát lại lần lưu đang chờ.

## Migration, sao lưu và kiểm chứng

Migration `0003_projects` theo sau `0002_auth`. Schema bất biến định nghĩa dự án, tài liệu mạch, phiên bản đã lưu và tham chiếu thí nghiệm. Schema có khóa ngoại chủ sở hữu, dự án cha và bản chụp, ràng buộc duy nhất, chỉ mục và phiên bản `BIGINT` theo miền số nguyên an toàn đã khai báo. SQLite vẫn dùng cho phát triển và kiểm thử. PostgreSQL dùng cho sản xuất. Migration thêm bảng mà không ghi lại thí nghiệm, bài thực hành, thao tác, phiên, bản thu hoặc quyền thuê trạm cách ly cũ. Bản ghi cũ vẫn đọc được và không nhận tham chiếu tài liệu tự tạo.

Trước khi triển khai, dừng tiến trình ghi, tạo bản sao lưu đã xác minh và diễn tập nâng cấp trên cơ sở dữ liệu khôi phục riêng. Diễn tập dùng API sao lưu SQLite giữ dữ liệu W3, chạy `PRAGMA integrity_check`, nâng cấp bản sao và xác minh bản gốc vẫn ở phiên bản trước đó. Với PostgreSQL, dùng `pg_dump` và khôi phục riêng trước khi chuyển. Hạ cấp phá hủy dữ liệu bị tắt. Khi khôi phục, dùng cơ sở dữ liệu đã xác minh và tệp bản thu tương ứng trong lúc tiến trình ghi vẫn dừng.

Cổng kiểm tra migration và cạnh tranh ghi PostgreSQL cần máy chủ đang chạy. Chỉ biên dịch DDL ngoại tuyến không đáp ứng cổng này. Đặt riêng `CIRNET_TEST_POSTGRES_URL` tới cơ sở dữ liệu dùng một lần, rồi đưa công cụ khách PostgreSQL vào PATH hoặc chọn bằng `CIRNET_TEST_PG_BIN`. Chạy cổng kiểm tra tường minh.

~~~console
python -m pytest -q services/api/tests/postgres_cases.py
~~~

Thiếu cấu hình cơ sở dữ liệu làm cổng kiểm tra thất bại. Mỗi ca tạo schema ngẫu nhiên `cirnet_test_w34_<uuid>` và chỉ xóa schema đã đăng ký đó. Bộ kiểm thử diễn tập khôi phục thật bằng `pg_dump`/`psql` vào schema thử riêng, nâng cấp chuỗi migration lịch sử, kiểm tra CAS giữa các tiến trình ghi độc lập và khóa ngoại phiên bản, đồng thời quan sát phụ thuộc khóa PostgreSQL khi nhận dữ liệu khách, tiếp nhận thí nghiệm và xóa dự án cha. Diễn tập triển khai vẫn cần cơ sở dữ liệu khôi phục riêng và bản sao lưu bản thu tương ứng.

Xem [migration dự án](../../../services/api/app/migrations/versions/0003_projects.py), [ca kiểm tra PostgreSQL](../../../services/api/tests/postgres_cases.py) và [xác thực và nâng cấp cơ sở dữ liệu](auth-and-migrations.md).
