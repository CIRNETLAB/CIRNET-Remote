# Viết và duy trì tài liệu CIRNET

[English](../../en/contributing/writing-documentation.md) · [Mục lục](../index.md)

Tuân theo [chỉ dẫn repo](../../../AGENTS.md) áp dụng. Dùng cùng đường dẫn
tương đối trong `docs/en/` và `docs/vi/`, rồi cập nhật cả hai trang trong
cùng thay đổi. Giữ `README.md` gốc bằng tiếng Anh và liên kết cả hai mục lục.
Đặt tài liệu hệ thống trong Remote và tài liệu tính năng ở repo sở hữu mã
nguồn. Repo khác có thể tóm tắt ngắn và
liên kết đến repo sở hữu.

## Vai trò của tài liệu

| Vị trí | Mục đích |
| --- | --- |
| `README.md` gốc | Giới thiệu repo và dẫn đến mục lục hiện hành. |
| `docs/en/` và `docs/vi/` | Duy trì hướng dẫn tiếng Anh hiện hành và bản tiếng Việt tương ứng. Codex bắt đầu từ mục lục tiếng Anh. |
| README cạnh mã nguồn | Mô tả thành phần hoặc package tại chỗ và dẫn đến cặp hướng dẫn. |
| Biên bản verification, migration và archive | Giữ kết quả, revision, định danh artifact và giới hạn của từng lượt đã ghi. |

Chọn một nơi sở hữu cho mỗi quy trình hiện hành. Các tóm tắt ở nơi khác
dẫn về đó. Xem [kiến trúc hệ thống](../architecture/system.md) để tìm repo
phù hợp và nguồn có thẩm quyền.

Dùng một ngôn ngữ diễn giải trong mỗi tệp. Giữ nguyên định danh API, lệnh
CLI, đường dẫn, biến môi trường, phiên bản và mã nguồn giữa hai bản. Giữ
đầy đủ yêu cầu, ví dụ, giới hạn, cảnh báo và trạng thái khả năng. Chỉ tạo
`guides/`, `api/`, `architecture/`, `contributing/`, `operations/` và
`history/` khi có nội dung. Dùng `lowercase-with-dashes.md`, một H1, phân
cấp tiêu đề rõ ràng và ghi ngôn ngữ cho khối lệnh. Dùng văn bản liên kết
diễn tả đích và ưu tiên trang cùng ngôn ngữ khi có bản tương ứng.

Giữ kế hoạch triển khai và bản nháp thiết kế ngoài Git, trong thư mục
`.superpowers/` được bỏ qua hoặc bên ngoài checkout. Sau khi triển khai,
ghi các quyết định đã chốt và kết quả đã xác minh vào cặp trang Anh–Việt
tương ứng.

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
