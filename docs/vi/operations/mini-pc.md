# Rà soát triển khai trên Mini PC Linux

[English](../../en/operations/mini-pc.md) · [Mục lục](../index.md)

Máy đích dự kiến dùng Intel Xeon W-1370, RAM 16 GB và SSD 256 GB. Dùng
[mẫu triển khai sản xuất](deployment.md) như
bản thiết kế. Thu bằng chứng trên máy đích, trình quản lý dịch vụ, TLS và
phần cứng thực tế. Tuân theo [kiến trúc Lab-First](../architecture/system.md).

1. Tạo tài khoản dịch vụ riêng và cơ sở dữ liệu PostgreSQL. Diễn tập sao lưu
   và khôi phục đúng cặp cơ sở dữ liệu và capture.
2. Cài wheel đã xác minh trong hai môi trường riêng cho API và Hardware Service.
   Cài bundle Web đã chọn vào `/opt/cirnet/web`.
3. Rà soát mẫu môi trường sản xuất, HTTPS Origin chính xác, chứng chỉ và các
   đường dẫn dữ liệu tuyệt đối. Dùng xác thực sản xuất và PostgreSQL.
4. Chạy migration và kiểm tra HEAD. Khởi tạo quản trị viên một lần bằng chế
   độ tương tác trong môi trường API đã cài.
5. Kiểm tra đường dẫn và quyền Nginx, systemd trên máy đích trước khi bật dịch
   vụ. Giữ một worker API tại `127.0.0.1:8000` và RPC tại `127.0.0.1:50051`.
6. Kiểm tra đăng nhập, CSRF, thu hồi, kết nối lại WebSocket, CAS tài liệu,
   capture ảo thực tế, khởi động lại và cách ly an toàn trên máy đích.
7. Kiểm tra chính sách lưu giữ bằng lượt chạy thử có giới hạn trước khi bật
   bộ hẹn giờ. Theo dõi quota, tác vụ dọn còn chờ, tăng trưởng audit và các
   bản sao lưu tương ứng.
8. Lặp lại workload 50 phiên đã ghi trên máy đích trước khi công bố năng lực.
   Phiên HTTP, bốn worker ảo và slot vật lý là các đại lượng riêng.

Các mẫu chưa thêm driver vật lý, nguồn Scope/Generator thật hay bộ giải
SPICE/hỗn hợp đầy đủ. Web dùng giao diện sản phẩm thay cho điều khiển thanh
ghi, MUX hay driver FPGA. Giữ các khả năng chưa xác minh ở trạng thái không
khả dụng. Xem [bản rà soát máy đích gốc](../../../deployment/mini-pc/README.md)
bằng tiếng Anh để biết phạm vi nghiệm thu đã ghi.
