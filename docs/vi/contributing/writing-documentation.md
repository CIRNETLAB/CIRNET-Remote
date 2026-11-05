# Viết và duy trì tài liệu CIRNET

[English](../../en/contributing/writing-documentation.md) · [Mục lục](../index.md)

Tuân theo [chỉ dẫn repo](../../../AGENTS.md) áp dụng. Bắt đầu từ trang tiếng
Anh hiện hành trong `docs/en/`. Dùng cùng đường dẫn tương đối trong `docs/vi/`
và cập nhật bản tiếng Việt trong cùng thay đổi. Giữ `README.md` gốc bằng
tiếng Anh và liên kết cả hai mục lục. Đặt tài liệu hệ thống trong Remote và
tài liệu tính năng ở repo sở hữu mã nguồn. Repo khác có thể tóm tắt ngắn và
liên kết đến repo sở hữu.

Dùng một ngôn ngữ diễn giải trong mỗi tệp. Giữ nguyên định danh API, lệnh
CLI, đường dẫn, biến môi trường, phiên bản và mã nguồn giữa hai bản. Giữ
đầy đủ yêu cầu, ví dụ, giới hạn, cảnh báo và trạng thái khả năng. Chỉ tạo
`guides/`, `api/`, `architecture/`, `contributing/`, `operations/` và
`history/` khi có nội dung. Dùng `lowercase-with-dashes.md`, một H1, phân
cấp tiêu đề rõ ràng và ghi ngôn ngữ cho khối lệnh. Dùng văn bản liên kết
diễn tả đích và ưu tiên trang cùng ngôn ngữ khi có bản tương ứng.

Mục lục lịch sử dẫn đến bản gốc có ngày và nêu rõ ngôn ngữ, phạm vi. Giữ
đường dẫn bắt buộc, đầu vào được bảo vệ bằng hash hoặc marker, baseline và
bằng chứng. Trước khi dời hoặc bỏ một tài liệu thông thường, rà soát các tham
chiếu từ Markdown, code, test, CI, build và đóng gói. Xin quyết định theo yêu
cầu rồi cập nhật tham chiếu. Việc chưa thấy liên kết đến một tệp chưa đủ để
kết luận có thể bỏ tệp đó.

Trước khi bàn giao, đối chiếu từng cặp đã đổi và kiểm tra chữ hoa/thường,
anchor tiêu đề, liên kết chuyển ngôn ngữ, ảnh và đích chéo repo. Chạy
[gate tài liệu](verification.md#kiểm-tra-thay-đổi-tài-liệu). Ghi rõ các cặp
còn thiếu hoặc chưa đầy đủ. Xem [quy chuẩn tài liệu Node.js](https://github.com/nodejs/node/blob/main/doc/README.md)
để tham khảo cấu trúc và cách trình bày ví dụ.
