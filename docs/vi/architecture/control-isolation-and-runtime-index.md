# Cô lập điều khiển của bộ lập lịch và chỉ mục thực thi

[English](../../en/architecture/control-isolation-and-runtime-index.md)

Bộ lập lịch tiếp tục xử lý yêu cầu hủy và hàng đợi trong khi một lần chạy đang chờ RPC. Chỉ mục thực thi giúp bộ lập lịch truy vấn công việc đang hoạt động với giới hạn rõ ràng. Cả hai cơ chế đã được triển khai. [Bằng chứng điều khiển WC20](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-wc20-control.md) ghi phạm vi đã kiểm chứng tại thời điểm báo cáo.

## Đặt chỗ và Stop an toàn

Triển khai được hỗ trợ chạy một tiến trình API lập lịch. Bản ghi đặt chỗ trong cơ sở dữ liệu bảo đảm mỗi slot của một trạm chỉ được cấp một lần. Quyền sở hữu lịch chạy và thứ tự FIFO nằm trong tiến trình đó.

Bộ quản lý giữ khóa trạng thái khi thay đổi hàng đợi, trạng thái hoặc chỗ đặt. Nó đọc phiên bản ở đầu hàng đợi, nhả khóa để gọi lấy khả năng trạm, rồi kiểm tra lại đầu hàng, phiên bản, phiên, trạng thái cách ly và các slot đang dùng trước khi đặt chỗ. Mỗi chỗ đặt nhận một thế hệ. Mỗi trạm có một bộ điều phối. Yêu cầu đồng thời lên lịch lượt điều phối tiếp theo mà không phải đợi RPC đang chạy. Thứ tự FIFO, quy tắc khi giảm sức chứa và quy tắc cách ly vẫn được thực thi.

Các thao tác thiết bị đang hoạt động được tuần tự hóa theo từng lần chạy bằng khóa được giữ qua tham chiếu yếu. RPC lấy khả năng, cấu hình và Stop chạy ngoài khóa trạng thái của bộ quản lý. Stop ghi nhận hủy và `STOPPING` trước, rồi chỉ đợi lệnh điều khiển của lần chạy đó. Cấu hình kiểm tra chủ sở hữu, phiên, tab, trạng thái, phiên bản, thế hệ, lease và tài nguyên đã cấp trước khi gửi và sau khi nhận phản hồi. Phản hồi muộn không thể thành `APPLIED` sau khi thu hồi quyền hoặc hủy. Stop cuối của worker chờ cấu hình đang thực hiện và giữ slot đến khi việc dọn dẹp thực sự được xác nhận. Hardware yêu cầu `accepted=true` và `hardware_applied=true`. Thiếu xác nhận khiến trạm bị cách ly. Đưa Stop vào hàng đợi chưa phải là hoàn tất an toàn. Thời hạn ở gateway theo ngân sách RPC đã cấu hình. Thời hạn tắt thiết bị vật lý cần bằng chứng đo trên thiết bị, ngoài các ca thử luồng cục bộ.

Các lượt quét hết hạn, mất kết nối, tắt hệ thống và thu hồi nhiều phiên tiếp nhận yêu cầu hủy cho mọi bản ghi liên quan trong chỉ mục trước khi gửi lệnh dọn dẹp từ xa. Nhóm Stop riêng có bốn worker và tối đa 16 định danh đang chờ xử lý, độc lập với worker mô phỏng. Lượt quét thử lấy khóa điều khiển lần chạy ngay. Nếu cấu hình đang giữ khóa, lần chạy ở `STOPPING` và vòng giám sát kế tiếp sẽ thử lại. Bộ điều phối loại trùng định danh đang chờ và yêu cầu đã được xác nhận. Khi hết sức chứa, nó giữ yêu cầu hủy mà không làm hàng đợi thực thi lớn thêm. Yêu cầu đã được xác nhận ngăn gửi Stop trùng, nhưng chưa giải phóng slot hoặc xác nhận hoàn tất an toàn. Worker hoàn tất theo quy tắc nhận ACK thật hoặc cách ly. Stop do người dùng yêu cầu vẫn tuần tự với lần chạy đó. Các lượt quét và thu hồi không liên quan vẫn có thể tiếp tục.

## Khôi phục và đọc theo chỉ mục

Migration Alembic tiến `0006_experiment_runtime` thêm bản chiếu quan hệ `lab_experiment_runtime`. Nó bổ sung bản ghi lịch sử theo khóa, mỗi lô 100 hàng, giữ JSON payload gốc, mã chủ sở hữu, thứ tự, capture, thao tác, tham chiếu tài liệu và lease. Khi repository ghi dữ liệu, trạng thái, cờ hoạt động, phiên và tab, trạm, thứ tự hàng đợi và cờ capture cũ cập nhật cùng payload trong một giao dịch. Quyền sở hữu được lấy qua phép nối với hàng thí nghiệm gốc để tránh trường chủ sở hữu trùng bị lệch khi nhận dữ liệu khách.

Tiếp nhận yêu cầu dùng `EXISTS`. Lượt quét hết hạn, mất kết nối và tắt hệ thống đọc các trường vô hướng của bản ghi hoạt động qua chỉ mục theo lô tối đa 100 mà không nạp đồ thị của thí nghiệm đã kết thúc. Khi khởi động, hệ thống chỉ đọc mục chuyển capture trong JSON còn chờ và bản ghi đang xếp hàng, theo lô 100. Dọn lease điện trước, cũng theo lô 100. Mỗi lượt khôi phục capture cũ hoặc hàng đợi có trần 10.000 bản ghi. Khi vượt trần, khởi động báo `RECOVERY_LIMIT_EXCEEDED` trước khi chạy lại công việc xếp hàng vượt ngưỡng và giữ hàng đợi đã lưu để người vận hành xem xét. Giới hạn tài nguyên khởi động này bảo toàn lịch sử. Chuyển capture từ JSON ra tệp có thể tiếp tục sau gián đoạn vì mỗi hàng chuyển xong được commit riêng.

Mục giới hạn tần suất Run hết hạn sau cửa sổ tiếp nhận một giây, và bảng có trần 4.096 mục. Khi đầy, hệ thống từ chối mục mới và giữ mọi mục chưa hết hạn để ngăn lách giới hạn. Khóa lần chạy không dùng và mục bộ điều phối hoặc hàng đợi rỗng được dọn.

Trình duyệt dùng hai tuyến giới hạn trang theo chủ sở hữu, `/api/experiments/history` với 1–100 hàng và `/api/experiments/active` với 100 hàng cùng cursor. Tuyến danh sách cũ giữ mảng lịch sử đầy đủ để tương thích. Giám sát và khôi phục Web hiện tại dùng các tuyến có giới hạn. Giữ phản hồi cũ đầy đủ. Tích hợp mới phải dùng tuyến phân trang. Gỡ cấu trúc cũ cần quyết định tương thích có phiên bản riêng.

## Nâng cấp và quay lui

Dừng tiến trình ghi và xác minh bản sao lưu cơ sở dữ liệu cùng capture tương ứng trước khi nâng cấp. Diễn tập chuỗi migration tiến trên cơ sở dữ liệu đã khôi phục. Đối chiếu số bản ghi, số lease, payload lịch sử được giữ nguyên và kế hoạch truy vấn có chỉ mục đối với bản ghi hoạt động trước khi chuyển đổi. Khi hạ phiên bản, khôi phục cặp bản sao tương ứng. Kế hoạch truy vấn PostgreSQL và các ca `pg_dump` và khôi phục thật là gate phát hành rõ ràng, độc lập với kiểm thử SQLite.

Xem [mã nguồn bộ lập lịch](../../../services/api/app/services/experiments.py), [migration chỉ mục thực thi](../../../services/api/app/migrations/versions/0006_experiment_runtime.py), [an toàn phòng thí nghiệm vật lý](physical-lab-safety.md) và [xác thực và nâng cấp cơ sở dữ liệu](auth-and-migrations.md).
