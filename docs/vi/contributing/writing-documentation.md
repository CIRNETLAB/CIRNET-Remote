# Viết và duy trì tài liệu CIRNET

[English](../../en/contributing/writing-documentation.md) · [Mục lục](../index.md)

Tuân theo [chỉ dẫn repo](../../../AGENTS.md) áp dụng. Dùng cùng đường dẫn
tương đối trong `docs/en/` và `docs/vi/`, rồi cập nhật cả hai trang trong
cùng thay đổi. Giữ `README.md` gốc bằng tiếng Anh và liên kết cả hai mục lục.
Đặt tài liệu hệ thống trong Remote và tài liệu tính năng ở repo sở hữu mã
nguồn. Repo khác có thể tóm tắt ngắn và
liên kết đến repo sở hữu.
Thư mục `docs/` chứa `en/`, `vi/` và `changelogs/`. Đặt hồ sơ lịch sử cần lưu
trong `history/` theo ngôn ngữ của hồ sơ và liệt kê trong cả hai mục lục.
Dẫn chiếu kế hoạch hoặc đặc tả đã được thay thế bằng revision Git cố định.

## Vai trò của tài liệu

| Vị trí | Mục đích |
| --- | --- |
| `README.md` gốc | Giới thiệu repo và dẫn đến mục lục hiện hành. |
| `docs/en/` và `docs/vi/` | Duy trì hướng dẫn tiếng Anh hiện hành và bản tiếng Việt tương ứng. Codex bắt đầu từ mục lục tiếng Anh. |
| [`docs/changelogs/`](../../changelogs/README.md) | Giữ một `CHANGELOG_V<major>.md` cho mỗi major đã phát hành, với các mục `vX.Y.Z` có liên kết và xếp theo thứ tự giảm dần. |
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

Tạo kế hoạch và đặc tả tương ứng cho mỗi công việc AI. Chỉ lưu kế hoạch trong
`.superpowers/plans/`. Chỉ lưu đặc tả, tiêu chí nghiệm thu và checklist tiến độ
trong `.superpowers/specs/`. Git bỏ qua các đường dẫn này trong checkout.
Dùng `- [ ]` cho việc còn mở và chỉ chuyển thành `- [x]` sau khi xác minh đã
hoàn tất. Sau khi xác minh, cập nhật cặp trang kỹ thuật Anh–Việt và changelog
tương ứng. Trang kiến trúc mô tả hành vi hệ thống và các quyết định kỹ thuật.
Biên bản xác minh theo ngày lưu bằng chứng.

Mỗi bản phát hành có tiêu đề SemVer, ngày có căn cứ và liên kết trong mục lục
của tệp major. Phân loại thay đổi đã xác minh theo Added, Changed, Fixed hoặc
Breaking Changes và bỏ các nhóm trống. Dẫn tag, commit hoặc mã nguồn và nêu
căn cứ ngày. Ghi thay đổi chưa phát hành trong mục Unreleased.

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
