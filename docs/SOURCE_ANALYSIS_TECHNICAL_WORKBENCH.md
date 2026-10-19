# Phân tích Technical Workbench — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

## Yêu cầu và nguyên nhân

Bản cập nhật này thay thế phần viền mảnh, lỗ trang trí và Info theo preview trong [phân tích selection trước](SOURCE_ANALYSIS_SELECTION_AND_COMPONENT_INFO.md). Người dùng yêu cầu viền Medium Gold 2 px rõ hơn, lỗ breadboard có chiều sâu, ngàm tương thích, ảnh không tràn, Info chỉ hiện cho model đang chọn và grid ít cạnh tranh thị giác.

- LineSegments/LineBasicMaterial dùng nét WebGL mặc định, gần 1 px và khó thấy trên nhựa sáng.
- Socket BoxGeometry cũ cao 0.012, tâm tại `h + 0.021`: mặt trên thấp hơn decal kín tại `h + 0.030`. Người dùng chỉ nhìn thấy các ô được vẽ trên texture, không nhìn được vào khoang.
- Preview bị xoay bằng CSS trong khung thấp; bounding box sau transform vượt vùng artwork.
- Info fallback sang previewType và cửa sổ không đóng khi selected model biến mất, nên hiện panel rỗng/unsupported khi không chọn.
- GridHelper có các đường cùng độ dày, ít phân cấp và không fade/giảm chi tiết theo khoảng cách.
- Bevel mở rộng 0.008 ra ngoài catalog bounds, khiến hai board đã docking chồng 0.016 ở mép thẳng, ngoài vùng ngàm.

## Viền Medium Gold

`SelectionOutline` giữ thuật toán silhouette/visible crease theo camera và footprint breadboard, nhưng render bằng LineSegments2 + LineSegmentsGeometry + LineMaterial có `linewidth: 2`, `worldUnits: false`, màu `#d4af37`, opacity 1. Resolution cập nhật từ kích thước CSS canvas trong callback render hiện có; nét không dày lên theo world scale/zoom. Không thêm glow hoặc postprocessing.

Các cạnh động dùng một interleaved buffer cấp phát khi tạo selection, chỉ cập nhật endpoint/instanceCount khi camera/pose thay đổi. Stroke là con model nên di chuyển/xoay cùng thân. Raycast của stroke bị vô hiệu hóa để không che picking. Material/geometry được giải phóng khi bỏ chọn, rebuild hoặc unmount. Màu thân, graph và Move-only gesture không đổi.

## Breadboard có lỗ thật

`BreadboardSockets` tạo một nguồn tọa độ chung cho cả perforation và instanced cavity: 630 lỗ terminal, 200 lỗ rail trên 830; 100 lỗ trên rail strip. `BreadboardHousing` thêm các square Paths vào deck Shape. ExtrudeGeometry và ShapeGeometry decal đều có cùng lỗ, nên không có mặt nhựa/decal kín che miệng lỗ.

Một InstancedMesh cho mỗi board render khoang dùng chung: miệng rộng 0.074, thành vát xuống họng rộng 0.048, thành đứng và đáy tối tại `h - 0.070`. Miệng ở `h + 0.030`, do đó chiều sâu visual là 0.100 world units. Vertex colors và normals phân biệt thành nhựa, cạnh vát và đáy; lighting tạo chiều sâu khi orbit. Texture chỉ giữ chữ, số, rail markings và seams; không vẽ ô socket giả nữa.

Housing giữ ba key dùng chung cho 830/630/100, thêm độ hở vào female notch. BevelOffset -0.008 giữ bevel bên trong footprint, nên hai mép thẳng docking theo catalog không chồng nhau. Canonical dimensions, magnetic docking, contact instance counts và electrical ports không đổi. Phải xoay các dải về hướng ngàm phù hợp khi lắp; không tự sửa rotation trong graph để ép khớp.

Đây là cavity hình học trang trí. Chưa có contact-to-node map, wiring qua lỗ hoặc mô phỏng pin cắm vật lý.

## Info và không gian làm việc

Info chỉ lấy type từ selected model còn tồn tại trong graph. Watch selected ID đóng entry khi bỏ chọn, chọn wire, bắt đầu placement hoặc xóa model; template cũng kiểm tra selected object. Click chọn model vẫn mở panel thụ động, giữ canvas focus/pointer capture. Add + bỏ chọn và arm placement; chỉ surface click mới thêm graph/history. Ribbon Info chỉ bật khi entry tương ứng model đang chọn; model chưa hỗ trợ báo trạng thái chưa khả dụng thay vì dựng Info rỗng.

Artwork dùng object-fit contain, padding và overflow hidden, không transform. Caption WORKSPACE/project name trên canvas và CSS liên quan được bỏ; tên circuit vẫn nằm trên file bar. Inventory tận dụng vùng trên trái đã trống.

## Adaptive Technical Workbench Grid

`TechnicalGrid` là một shader plane XZ trên nền xanh đen. Lattice bám tọa độ world: minor step 0.5, major step 2.5 (mỗi 5 ô), trục X/Z nhẹ. Shader dùng fwidth để giữ nét theo pixel và chống alias; minor tối/mảnh hơn major, không emissive/glow.

Minor visibility giảm theo projected pixels của ô tại view target, camera FOV/zoom và chiều cao canvas. Bộ lọc derivative tiếp tục làm minor biến mất ở vùng nhìn xa/horizon. Major giữ spacing cố định. Distance fade theo camera và vùng focus pha alpha về nền; focus theo selected model hoặc camera target. Plane theo pan nhưng dùng world coordinates, nên không trượt lattice hoặc đổi snap/electrical state.

Grid update nằm trong RAF coalesced hiện có, không tạo render loop mới. Grid bỏ qua picking, depth-test với models, không ghi depth; disposal dùng lifecycle chung. Việc giảm chi tiết visual không đổi snap step của editor.

## Kiểm chứng

Sáu regression test mới đã RED trước sửa: stroke 2 px, cavity center, Info đóng theo selection, adaptive minor suppression, độ hở keys và mép bevel không chồng. Final `npm test`: **68/68 PASS**, gồm TypeScript và các test graph/history/Move-only/API/WebSocket hiện có. [Browser report](verification/2026-10-09-technical-workbench-browser.md) ghi artwork bounds, Add/selection, ghép board, orbit/zoom, grid xa và bốn viewport desktop.

`npm run build` qua bước TypeScript nhưng Vite bị sandbox chặn realpath với EPERM. Quyết định từ chối build ngoài sandbox ở lượt trước được giữ; không xin lại hoặc xác nhận bundle production của bản này. Không tuyên bố hosted CI/hardware execution đã chạy.
