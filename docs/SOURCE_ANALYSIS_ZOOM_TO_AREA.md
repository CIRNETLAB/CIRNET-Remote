# Phân tích source và thuật toán Zoom To Area — 2026-10-11

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

## Kiến trúc và trạng thái thực tế

Project chia thành frontend Vue/TypeScript/Pinia/Three.js, API FastAPI, Hardware Service, simulator số, contracts, metadata linh kiện và FPGA scaffold. Phân tích này đối chiếu source điều hướng/editor hiện hành với các ranh giới toàn project và báo cáo `SOURCE_ANALYSIS_STABILITY_AUDIT.md`; tập trung sâu vào luồng bị thay đổi, không thay thế kiểm toán từng thuật toán phần cứng tương lai.

| Khối | Thuật toán / trách nhiệm hiện hành |
| --- | --- |
| App/router/SingleWorkspaceShell | Một workbench tại `/`; URL cũ chuyển về cùng workspace. |
| Circuit store và file services | Kiểm tra JSON/ID/ports/metadata trước import. Command sao chép graph, ghi snapshot; Undo/Redo bị giới hạn số bước và dung lượng. |
| Workspace/UI stores | Tool, selection, placement, pending port, snap, zoom; trạng thái cửa sổ/focus độc lập với dữ liệu điện. |
| SceneManager | Map theo module ID, model/wire projection, raycast, camera/OrbitControls, grid/gizmo/outline và RAF gộp theo nhu cầu. |
| ComponentModel và các factory | Hình học breadboard/instrument và pose từ metadata. Giao điểm hình học không tạo node điện. |
| WireLayer | Key theo cặp endpoint; cập nhật dây liên quan khi preview pose, giữ buffer dây không đổi. |
| useCircuitEditor | Một pointer capture; preview tách khỏi graph, release ghi một command; cancel khôi phục projection. Move mới kéo trực tiếp thân model. |
| API/WebSocket | REST typed, timeout/abort và structured errors; WS reconnect có backoff và chặn callback cũ. Backend xác thực cấu trúc graph, chưa chạy evaluator toàn mạch. |
| Hardware Station | Virtual có state/config/input cơ bản; physical yêu cầu driver và không giả thành công khi thiếu phần cứng. |
| Simulator | Kiểm tra mức logic 0/1, AND hai ngõ và mô hình gate 74HC08; chưa có engine event/timing toàn mạch. |
| FPGA | `top.v` hiện là placeholder status LED từ clock/reset; chưa có SPI/routing/SDRAM/acquisition. |

Zoom To Area thuộc điều hướng frontend. Không cần thay circuit schema, API, simulator hay giao thức FPGA.

## Luồng điều hướng trước thay đổi

`SimulationStatusBar` gọi action của `workspace`; `CircuitWorkspace3D` theo dõi zoom/Fit request và chuyển sang `SceneManager`. Wheel dùng OrbitControls, báo phần trăm về store qua `onZoomChange`.

```text
percent = referenceDistance / cameraDistanceToTarget * 100
cameraDistanceToTarget = referenceDistance * 100 / percent
```

Zoom In/Out và wheel dùng cùng khoảng 50–200%, FOV cố định, `camera.zoom = 1`. Pan dịch camera/target cùng nhau; Orbit thay hướng camera; Fit lấy bounds model/dây, giữ hướng nhìn và đặt khoảng cách mới làm mốc 100%. Root scale và graph pose không tham gia phép zoom.

## Giao diện và state mới

- Nút có icon khung/loupe nằm ngay bên phải Fit, `title`/`aria-label` là `Zoom To Area`; `aria-pressed` phản ánh chế độ đang bật.
- Ba tooltip cũ chỉ còn `Zoom In`, `Zoom Out`, `Zoom To View Entire Circuit`.
- `zoomAreaActive` là state tạm trong workspace store. Tool hiện hành và model selection được giữ; bật chế độ hủy placement/pending wire chưa hoàn tất.
- Canvas nhận focus, con trỏ crosshair và thông báo ngắn. Khung HTML/CSS có border dashed/fill mờ, không bắt pointer và không tạo Three.js resource.
- Editor xử lý chế độ vùng trước raycast gizmo/model: chọn vùng trên thân model, núm nguồn hoặc dây không kích hoạt Move/Rotate/Delete/Wire.
- Port DOM bị ẩn tạm trong chế độ này để pointer đến được canvas.

## Thuật toán chọn vùng và camera

1. Tọa độ client trừ origin canvas thành CSS pixel. Clamp cả hai đầu vào viewport; dùng min/max nên kéo ngược chiều vẫn đúng.
2. Capture pointer duy nhất; pointer khác không thay khung hoặc kết thúc gesture. Chưa dịch camera trong khi kéo.
3. Khi release, cập nhật điểm cuối; khung dưới 12 px ở một trong hai chiều bị bỏ qua, chế độ giữ bật để thử lại.
4. Raycast tâm khung để lấy độ sâu bề mặt model/dây. Nếu không có geometry hit, dùng giao điểm mặt phẳng XZ trong clipping range. Nếu vùng trống ở trên horizon, dùng mặt phẳng tiêu điểm hiện hành làm fallback hữu hạn.
5. Giữ vector hướng camera cũ. Mặt phẳng vuông góc hướng nhìn đi qua điểm focus cho tâm mới `C`; lấy khoảng sâu theo trục nhìn `d`.
6. Với viewport `W × H`, khung `w × h`, khoảng camera ban đầu là:

```text
s = max(w / W, h / H)
dBase = max(4 * camera.near, d * s)
target = C
cameraPosition = C + oldViewingDirection * dNew
```

7. Lấy thêm chín ray sample theo tâm/mép/góc của hình chữ nhật, ưu tiên bề mặt thật, ground rồi focal-plane fallback. Với mỗi điểm `P`, `v = P - C`, cần khoảng cách ít nhất:

```text
dPoint = dot(v, oldViewingDirection)
       + max(4 * near, abs(dot(v, cameraRight)) / tan(horizontalHalfFov),
                      abs(dot(v, cameraUp)) / tan(verticalHalfFov))
dNew = max(dBase, all dPoint) * 1.01
```

Khoảng này giữ cả mép gần trong khung khi ground có độ sâu thay đổi do góc camera thấp. Khoảng đệm 1% tránh mép chạm clipping vì làm tròn. Giữ aspect/FOV và mở rộng far plane nếu cần. Khung mới thành mốc 100%, giống Fit, nên wheel/toolbar tiếp tục reversible trong khoảng tương đối 50–200%.

Một bản đầu dùng độ sâu target cũ cho mọi vùng. Kiểm thử foreground `(450,500)..(550,600)` ở viewport 1000×700 cho thấy camera đi xuống dưới XZ và điểm được chọn ra ngoài màn hình. Dùng độ sâu tâm sửa được tâm nhưng vẫn cắt mép gần; regression với camera `(0,1,20)` đã tái hiện trường hợp đó. Source cuối kết hợp focus bề mặt với fit các điểm mép/góc. Vật thể có độ sâu khác nhau vẫn chịu phối cảnh bình thường: đây là điều hướng theo vùng nhìn, không biến ảnh phối cảnh thành hình phẳng hoặc chọn module để sửa graph. Sampling không phải phép chứng minh visibility của từng triangle trong một scene có geometry tùy ý.

Tính khung/camera và số sample là O(1). Raycast dùng scene picking hiện hành, chi phí phụ thuộc geometry scene và chỉ thực hiện khi release; không thêm vòng quét/command/history theo từng pointer move. Chỉ một ref hình chữ nhật và một gesture tồn tại; teardown giải phóng capture, mở lại OrbitControls và bỏ khung.

## Hủy thao tác và các ranh giới

Escape, chuột phải, contextmenu của tổ hợp nút chuột, bấm lại nút, đổi tool/placement/graph, resize, hidden tab, context loss, pointercancel hoặc capture loss bất thường đều hủy. Release bình thường của khung quá nhỏ không được coi là capture loss bất thường. Tab vẫn chuyển focus; phím sửa model không sửa graph trong chế độ chọn vùng.

`pointerUp` kiểm tra lại gesture sau `pointerMove`, vì viewport zero hoặc tọa độ không hợp lệ có thể đã hủy gesture. Bằng cách này release trễ không truy cập gesture đã xóa hoặc zoom nhầm.

Không sửa vị trí/rotation/properties, endpoint, circuit file, model scale hoặc Undo/Redo. Floating windows vẫn hoạt động theo ownership hiện hành.

## Source và kiểm chứng

Production changes: `SimulationStatusBar.vue`, `WorkbenchIcon.vue`, `CircuitWorkspace3D.vue`, `workspace.ts`, `useCircuitEditor.ts`, `SceneManager.ts`, `style.css`. Camera math và editor gesture được kiểm tra bằng implementation thật; chỉ DOM host/GPU boundary được thay trong test.

Các regression bao gồm focus foreground/model cao, fallback horizon, aspect/heading, clamp, kéo ngược, input invalid/scene inactive, wheel/toolbar sau framing, tool priority, graph/history invariants, foreign pointer, retry, hủy/contextmenu, zero viewport và focus Tab. Xem `verification/2026-10-11-zoom-to-area-browser.md` và DEV_LOG để biết kết quả thực sự chạy.
