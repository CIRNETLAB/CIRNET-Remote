# Phân tích source và thuật toán panel — 2026-10-11

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

Phiên bản hiện hành: drawer overlay trượt bằng transform trên viewport cố định; resize thủ công đã được xóa hoàn toàn. Components cố định96 px; Tools66 px, hoặc54 px khi workbench rộng không quá560 px. Bằng chứng hiện hành: `verification/2026-10-11-fixed-drawers.md`. Thuật toán graph và resize viewport thực vẫn giữ nguyên.

## Drawer hiện hành: nguyên nhân và thuật toán

Đọc kỹ ToolRail, ComponentRibbon, CircuitWorkspace3D, frameTasks, SceneManager, ui và CSS cùng shell/editor/windows. Video19,87 giây được xem qua các mốc cách2 giây; model đổi kích thước khi Ribbon xuất hiện/biến mất. Frame probe tái hiện: flex đổi canvas box ngay, RO→RAF→scene mới cập nhật buffer sau; dù setSize và draw đã cùng frame, CSS vẫn stretch buffer cũ trước frame đó. Một lần đóng Ribbon có3 frame lệch tỷ lệ.

Shell giữ vùng giữa title/status; workbench-body và workspace-stage phủ tuyệt đối inset0. Hai root panel cũng absolute, không phân bổ diện tích flex. Root giữ kích thước cố định để nội dung vẫn mounted và transform phần trăm có cơ sở ổn định. Chỉ inner drawer và nút cạnh trượt bằng translate3d,200 ms cubic-bezier(.22,1,.36,1); không animate width/height. Tools theo vị trí dưới Ribbon bằng translateY và cập nhật chiều cao nội dung một lần, không tác động stage/canvas. Không tái tạo renderer/scene/model/wire.

`ui` giữ một nguồn target: cờ đóng/mở. `componentOverlayHeight` luôn96; `toolsOverlayWidth` chỉ phụ thuộc breakpoint workbench560 px (54/66); không đo DOM để khởi tạo, không lưu preference hay cung cấp action resize drawer. `drawerInsets` trả top/left panel mở, độc lập viewport WebGL. Window clamp lấy inset làm min x/y và phần khả dụng làm max kích thước; mở panel hoặc đổi viewport/breakpoint chỉ bound theo luồng hiện có, đóng không kéo cửa sổ về gốc. Setter kích thước viewport/workbench vẫn bỏ qua input không hữu hạn/kích thước trùng. Component Info/inventory dùng CSS safe area.

`useDrawerMotion` chỉ sở hữu lifecycle occupancy, không sao chép target hay chạy timer/RAF animation. Đóng: inert/aria-hidden ngay, giữ visibility/obstacle đến hết transform. Mở: occupancy true ngay. CSS tự đảo chiều từ transform đang nội suy. End event chỉ nhận transform của chính drawer, bỏ completion cũ khi animation thay thế còn chạy. Post-flush getAnimations kiểm tra một lần sau commit để xử lý expand→collapse cùng frame: DOM không đổi nên không có end event. Reduced-motion đổi giữa chừng vẫn settle; listener media được giải phóng khi dispose. Nhánh resizing đã bị loại bỏ. Nội dung đã đóng vẫn mounted nhưng visibility-hidden, không nhận focus/pointer; toggle nằm ngoài vùng inert.

Gizmo chỉ đo Component Info, windows và navigator khi cache dirty. Panel occupied dùng hình chữ nhật quét đầy đủ theo kích thước đã biết, không đo vị trí drawer mỗi frame. Nút Components có corridor top36; nút Tools đóng có corridor x4–32 quanh giữa workspace đến giữa workspace+96/2, cộng margin14 px. Nhờ vậy cache không lệch khi nút còn trượt dù panel của nó đóng. Một MutationObserver cục bộ theo đúng hai occupancy attribute invalidates cache lúc drawer đóng xong; watchers target/size/windows/content cùng gộp request vào render hiện hành.

```text
menu toggle → target/inset + CSS transform → compositor slide → settle occupancy
             (canvas, buffer, camera và viewport không đổi)

viewport thật đổi → RO contentRect → RAF deduplicate → cancel gesture/resize
                → projection + ui viewport/window bounds → setSize + draw cùng frame
```

frameTasks và SceneManager được phân tích nhưng không cần sửa: deduplicate viewport/buffer, coalesce RAF và buffer/draw ordering đã đúng. Drawer bỏ nguyên nhân gọi chúng khi menu trượt. Scope Escape kiểm tra opener inert, trả focus về toggle ngoài drawer. Palette vẫn neo theo family/scroll/resize, đóng khi Ribbon đóng.

Cleanup hiện hành xóa handle/separator, pointer/keyboard gesture, state/getter/setter resize, composable và test resize, CSS handle/is-resizing cùng class has-size luôn bật. Height auto của family button được giữ nguyên trong rule chính. Tests giữ collapse, graph/editing state, viewport identity, rapid/same-frame reversal, occupancy, reduced-motion/disposal; bổ sung responsive boundary và floating-window safe-area. Frontend181/181, build135 modules và Python97/97 PASS. API composable mới được kiểm tra FAIL trước cleanup vì còn bắt buộc argument resizing. Browser sampling9 lần đảo hai drawer giữ1280×629 CSS,1600×786 buffer, không gọi canvas RO/setSize/viewport/cancel, không lệch aspect hay đổi view/projection matrices/graph. Reduced-motion, Scope bounds và viewport560/561/320 px đã kiểm tra; review độc lập không có finding.

## Báo cáo lịch sử

Các bản flex collapse, opacity-only và overlay còn resize thủ công đã được thay thế. Bằng chứng cũ được giữ trong các báo cáo verification/2026-10-11-resizable-panels-browser.md, verification/2026-10-11-panel-resize-performance.md và verification/2026-10-11-overlay-drawers.md; chúng không mô tả API drawer hiện hành.
