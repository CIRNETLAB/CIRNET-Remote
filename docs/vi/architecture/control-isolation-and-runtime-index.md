# Cô lập điều khiển của bộ lập lịch và chỉ mục thực thi

[English](../../en/architecture/control-isolation-and-runtime-index.md) · [Tài liệu gốc đầy đủ](../../architecture/control-isolation-and-runtime-index.md)

Triển khai được hỗ trợ chạy một tiến trình API lập lịch. Bản ghi đặt chỗ trong cơ sở dữ liệu bảo đảm mỗi trạm và slot chỉ được cấp một lần. Điều phối FIFO và quyền quản lý lần chạy nằm trong tiến trình đó.

## Đặt chỗ và Stop an toàn

Bộ quản lý giữ khóa trạng thái khi đổi hàng đợi, trạng thái và chỗ đặt. Bộ quản lý đọc phiên bản của đầu hàng, nhả khóa để lấy khả năng của trạm từ xa, rồi kiểm tra lại đầu hàng, phiên bản, phiên, trạng thái cách ly và slot trống. Mỗi chỗ đặt nhận một thế hệ định danh. Mỗi trạm có một bộ điều phối giữ thứ tự FIFO. Yêu cầu đồng thời lên lịch lượt điều phối kế tiếp trong khi RPC đang chạy.

Các thao tác thiết bị đang hoạt động được tuần tự hóa theo từng lần chạy. RPC lấy khả năng, cấu hình và Stop chạy ngoài khóa trạng thái của bộ quản lý. Cấu hình kiểm tra chủ sở hữu, phiên, tab, trạng thái, phiên bản, thế hệ, lease và tài nguyên đã cấp trước khi gửi và sau khi nhận phản hồi. Stop ghi nhận hủy và `STOPPING` trước khi chờ lệnh điều khiển của lần chạy đó. Phản hồi cấu hình đến muộn không thể thành `APPLIED` sau khi hủy hoặc thu hồi quyền. Worker hoàn tất sau khi cấu hình đang xử lý kết thúc và giữ lease cùng slot cho đến khi có kết quả dọn dẹp thật. Dọn dẹp vật lý cần `accepted=true` và `hardware_applied=true`. Thất bại khiến trạm bị cách ly.

Các lượt xử lý hết hạn, ngắt kết nối, tắt hệ thống và thu hồi phiên ghi nhận hủy cho mọi lần chạy liên quan trước khi lên lịch dọn dẹp. Nhóm Stop riêng có bốn worker và tối đa 16 định danh đang xử lý. Lượt quét thử lấy khóa lần chạy ngay. Nếu khóa bận, vòng giám sát kế tiếp sẽ thử lại. Các yêu cầu trùng hoặc đã được xác nhận bị loại. ACK trong sổ theo dõi điều phối vẫn để worker chịu trách nhiệm dọn dẹp cuối cùng.

## Khôi phục và đọc theo chỉ mục

Migration `0006_experiment_runtime` thêm `lab_experiment_runtime`. Migration bổ sung dữ liệu theo khóa, mỗi lô 100 hàng, và giữ JSON lịch sử, mã chủ sở hữu, thứ tự, capture, thao tác, tham chiếu và lease. Trạng thái thực thi và metadata hàng đợi cập nhật cùng nội dung thí nghiệm trong một giao dịch. Quyền sở hữu đọc từ hàng thí nghiệm nên chỉ có một nguồn quyền khi nhận dữ liệu khách.

Tiếp nhận yêu cầu dùng truy vấn tồn tại có chỉ mục. Các lượt quét đọc trường vô hướng của bản ghi hoạt động theo lô tối đa 100. Khi khởi động, hệ thống xử lý lease trước, sau đó chuyển capture cũ đang chờ và xử lý hàng đợi theo lô 100 hàng. Mỗi lượt khôi phục có trần 10.000 bản ghi. Nếu vượt trần, hệ thống trả `RECOVERY_LIMIT_EXCEEDED` và giữ hàng đợi đã lưu để xem xét trước khi chạy lại công việc vượt giới hạn. Tiếp nhận Run dùng cửa sổ một giây, tối đa 4.096 mục giới hạn tần suất, và từ chối mục mới nếu bảng đang đầy.

Máy khách hiện tại dùng `/api/experiments/history` và `/api/experiments/active`, giới hạn trang và lọc theo chủ sở hữu. API danh sách cũ giữ hình dạng đầy đủ để tương thích. Khi nâng cấp, dừng tiến trình ghi và giữ cặp bản sao cơ sở dữ liệu và capture tương ứng. Kiểm tra nội dung lịch sử và kế hoạch truy vấn chỉ mục trên bản đã khôi phục. Bằng chứng WC20 có ngày trong tài liệu gốc ghi nhận hành vi phần mềm. Thời hạn Stop trên thiết bị thật cần phép đo riêng. Xem [an toàn phòng thí nghiệm vật lý](physical-lab-safety.md).
