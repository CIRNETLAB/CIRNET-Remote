# Phân tích selection, breadboard và Component Info — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

Historical refinement: phần LineSegments 1px, socket trang trí và Info theo preview bên dưới đã được thay thế bởi [Technical Workbench](SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md): viền 2px Medium Gold, cavity thật, selection-only Info và adaptive grid. Giữ bản này để đối chiếu nguyên nhân và quá trình kiểm chứng.

## Yêu cầu hiện hành

Ảnh thứ tư và cuối là tham khảo về bố cục giới thiệu/Add và nét vàng quanh thân mô hình. Không sao chép thương hiệu, artwork hoặc giao diện phần mềm tham khảo. Dùng artwork SVG đã có trong project và ngôn ngữ giao diện workbench hiện tại: màu tối ổn định, chữ dễ đọc, đường phân cách gọn, không glow/glass quanh panel.

Mọi mô hình được chọn hoặc kéo trong Move có viền vàng mảnh theo hình học. Component Info nằm góc trên phải, chỉ có ảnh, tên, giới thiệu và Add +; bỏ card Delete/Rotate/Properties/Info & Pinout. Add chuẩn bị đặt cùng loại; chỉ click mặt phẳng mới thêm vào graph. Select chỉ chọn, Move mới kéo trực tiếp.

## Đối chiếu các tầng source

| Tầng | Trách nhiệm và kết luận |
|---|---|
| App/router/shell | Một workbench, URL compatibility; không quyết định selection hoặc camera |
| Ribbon/Workspace/Info/Inspector | Ribbon cung cấp loại và artwork; Workspace xử lý con trỏ; Info giới thiệu/arm placement; Inspector giữ editor/validation |
| `useCircuitEditor` | Picking → chọn ID → preview hoặc action → commit; threshold/capture/cancel và Move-only vẫn dùng luồng hiện có |
| `SceneManager`/`ComponentModel` | Graph được reconcile thành models/wires; scene sở hữu pose/camera/render/resources, không tạo electrical truth |
| Circuit/workspace/ui stores | Circuit giữ graph/history; workspace giữ selection/placement/tool; ui giữ một entry Component Info và trạng thái cửa sổ |
| Catalog/file/memory services | Định nghĩa loại/ports/configuration và import guards; housing/artwork không xác nhận pinout hoặc hardware |
| Typed API/WebSocket, API/hardware/simulator | Validation/discovery/events và execution boundaries không cần đổi để sửa selection. Frontend tiếp tục không import driver; simulator/acquisition thuộc phase sau |

Phân tích runtime/camera/graph rộng hơn được giữ ở [workspace navigation](SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md) và [Phase 2](SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md). Bản này tập trung thuật toán và UX thay đổi mới nhất.

## Nguyên nhân

`SceneManager.createSelectionOutline(size)` cũ dựng 12 Mesh BoxGeometry với độ dày 0.038 world units, vật liệu emissive mạnh, quanh một hộp kích thước catalog. Cách này không theo ngàm/notch, độ dày thay đổi theo zoom và tạo cảm giác khung bao thô. `highlight()` còn đổi emissive thân, trong đó kiểm tra breadboard bằng tên type chữ thường không khớp catalog chữ hoa.

Breadboard cũ là một hộp phẳng, decal texture và các tab/notch giả bằng hộp riêng. Khe IC chỉ được vẽ trên texture. Card selection gộp vị trí/kích thước/capacity với thao tác và dùng world units như cm; logic capacity kiểm tra type chữ thường dẫn đến Breadboard 830 hiển thị 0 Ports. Info riêng lại dump metadata dài và mở ở vị trí cửa sổ mặc định, làm trùng hai bề mặt thông tin.

## Housing và nét chọn

`BreadboardHousing` dựng footprint dạng Shape với tab một phía và notch đối diện. Base và deck dùng ExtrudeGeometry với bevel nhẹ. Deck có các slot thực: khe IC ở terminal boards, đường tách rail ở 830; base tạo đáy khe. ShapeGeometry của decal dùng cùng footprint/holes và UV theo X/Z để không phủ kín slot. Contacts giữ một InstancedMesh với 830/630/100 instance như trước. Canonical size và thuật toán docking không đổi; các ngàm là chi tiết hình học.

`SelectionOutline` tạo một LineSegments vàng nhẹ, opacity 0.86, depth-test và không ghi depth. Breadboard dùng cùng footprint, nên nét chạy theo các ngàm/notch. Các mô hình khác chỉ lấy surface của housing; không bao Sprite, logical ports, socket instances hoặc band trang trí. Triangle positions được weld qua seam UV/normal; mỗi cạnh lưu các face kề, normal và center.

Với camera chuyển về local model, face hướng về camera khi `normal · (camera - center) > 0`. Cạnh thuộc silhouette khi face kề đổi dấu, hoặc là boundary có face nhìn thấy; cạnh gấp nhìn thấy được giữ khi góc face vượt 35°. Nét của mô hình cong vì vậy theo orbit thay vì chỉ có các vòng tròn tĩnh. Topology tính một lần khi tạo outline; local view signature tránh tính lại khi camera/pose không đổi. Cập nhật nằm trong callback render đang có, không thêm RAF loop/postprocessing/dependency.

Outline là con của model: preview position và yaw rotation áp dụng cho cả thân/viền. Body materials giữ nguyên. Outline `ignorePick`, không che raycast của editor. Trước rebuild/remove model, detach và dispose outline cũ; tạo mới theo hình học mới thay vì gắn lại geometry đã dispose. Unmount vẫn giải phóng scene, instance buffers và renderer.

Các vòng màu resistor là lớp sơn cùng bán kính thân, dùng polygon depth offset để tránh nhấp nháy mặt đồng phẳng. Chúng không nhô ra che viền housing; regression raycast giảm số điểm viền bị che từ 44 xuống 0. Phần giới thiệu fallback cũng phân biệt model catalog hợp lệ như Board với entry import chưa có contract.

## Component Info và Add

`FloatingWindowManager` render một ComponentInfoWindow riêng, dùng chung `ui.windows` nhưng anchored bằng CSS phía trên navigator; các instrument/Inspector/Hex Editor vẫn dùng FloatingWindow có drag. Không còn action card trong CircuitWorkspace3D. Một entry Info được dùng lại cho selection và ribbon preview, nên không có hai khung giới thiệu trùng nhau.

Type ưu tiên selected module, sau đó previewType; definition/name/artwork được lấy từ catalog và ribbon hiện có. Giới thiệu breadboard ngắn gọn; không dump metadata, không dựng giả pinout/dimensions/capacity. Automatic `openWindow(..., { activate: false })` không tăng focus activation; canvas vẫn nắm pointer trong Move. Ribbon Info explicit tăng activation và focus header. Close/Escape từ panel trả focus về canvas.

Add kiểm tra `getDefinition(type)` rồi `workspace.armPlacement(type)`, chưa gọi circuit command. Graph/history chỉ đổi qua `placeModule` khi click mặt phẳng; right click/Escape hủy theo luồng đã có. Unknown/future entries giữ preview và Add disabled. Rotate/Delete/coordinate edits vẫn thuộc tools/keyboard/Inspector.

## Kiểm chứng

Test mới đã RED cho khung Mesh thô, thiếu geometry khe, tái sử dụng outline đã dispose, thiếu passive Info, silhouette cong không đổi theo camera và vòng màu che viền resistor; sau sửa đều GREEN. Test dùng Three.js/Pinia/composable production, chỉ thay DOM host/GPU boundary. Bản cuối có **62/62 npm tests PASS**, **17/17 documentation/frontend/context checks PASS**. [Browser report](verification/2026-10-09-component-information-browser.md) ghi Add → đặt, Move/Undo, Select không kéo, Info theo LED/breadboard/Board và desktop layout. Build trước các chỉnh nhỏ cuối đã PASS; lượt cuối qua TypeScript nhưng Vite bị sandbox chặn `realpath` với EPERM, sau khi quyền build ngoài sandbox bị người dùng từ chối. Vì vậy chưa xác nhận bundle production của bản cuối. Không thay electrical contracts hoặc tuyên bố hosted CI/hardware execution đã chạy.
