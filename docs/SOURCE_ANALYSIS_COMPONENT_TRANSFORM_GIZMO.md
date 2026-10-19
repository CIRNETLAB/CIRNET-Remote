# Phân tích Component Transform Gizmo — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

> Báo cáo này ghi nhận lần triển khai gizmo ban đầu. Tinh chỉnh mới nhất về menu, núm Y chạy theo góc xoay và Power Supply dáng đứng hai núm/hai cọc nằm trong [SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md](SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md). Bằng chứng kiểm thử bên dưới là lịch sử của lần triển khai trước.

## Hiện trạng và nguyên nhân

`CircuitWorkspace3D.vue` trước đây giữ toolbar Perspective/Zoom/Reset/Snap ngay trên canvas và dòng tên tool/hướng dẫn ở đáy workspace. `SimulationStatusBar.vue` chỉ chứa trạng thái vận hành. Reset đưa camera về gốc, nên không thể đảm bảo nhìn thấy mạch có các component ở xa.

`useCircuitEditor.ts` đã tách preview khỏi graph: Move kéo trên mặt phẳng ngang qua điểm raycast, giữ Y, thả chuột mới ghi command. `SceneManager.ts` dựng models theo ID, named port và wire từ graph. Đây là nền tảng cho gizmo: thêm tương tác vào scene mà không đưa Three.js object vào Pinia hoặc dùng mesh làm electrical truth.

Power Supply trước đây là box cùng một tấm tối ở mặt trên. Catalog đã xác định đây là visual-only, không có port điện. Thay đổi model không cần tạo nguồn vật lý, giả lập số đo hoặc sửa API/hardware contract.

## Phân chia trách nhiệm mới

| File | Trách nhiệm |
|---|---|
| `three/ComponentTransformGizmo.ts` | Một Group tái sử dụng, bốn handle, ray targets, hover/active color, camera-relative scale và chọn vị trí cạnh model |
| `three/SceneManager.ts` | Cập nhật gizmo trong RAF; pick gizmo riêng; preview rotation/move, rebuild dây; fit bounds toàn mạch |
| `composables/useCircuitEditor.ts` | Pointer capture, gesture draft/ID, snap, preview, rollback và một command khi thả |
| `stores/workspace.ts` | Snap, magnification, fit-request counter; không giữ camera/mesh/GPU resource |
| `SimulationStatusBar.vue` | Toolbar góc phải với tên/mô tả công cụ và trạng thái enabled/disabled |
| `CircuitWorkspace3D.vue` | DOM/canvas lifecycle, quan sát vùng cửa sổ/navigator cần tránh; bỏ Perspective/tool hint |
| `three/PowerSupplyModel.ts` | Geometry vỏ máy, panel texture nguyên bản, núm, cọc, vents, chân và vít |

## Thuật toán thao tác

Gizmo có handle X, Z, diamond kéo tự do X/Z và cung xoay Y. Nó được raycast trước graph geometry để thao tác handle không bị hiểu thành pan, Rotate-click hay Delete-click. Vùng bắt chuột rộng hơn nét vẽ; hover/active chuyển sang xanh ngọc nhẹ. Không có Delete, Confirm hoặc Check trên gizmo.

Pointer xuống lưu ID, draft, pose ban đầu, điểm neo và tâm gizmo. Gesture chỉ chạy sau ngưỡng 4 CSS px, chỉ nhận pointer đã capture và khóa OrbitControls. Translation tính delta giữa hai giao điểm ray với mặt phẳng ngang qua gizmo, cộng vào pose ban đầu. X giữ nguyên Z, Z giữ nguyên X; cả hai giữ Y. Diamond áp dụng snap/docking hiện có; kéo trực tiếp thân model vẫn chỉ được phép khi chọn Move.

Rotation dùng `atan2(-deltaZ, deltaX)` quanh tâm cung điều khiển để khớp chiều xoay Y của Three.js. Delta góc được unwrap qua ±π rồi cộng vào góc ban đầu. Snap bật làm tròn về 15°; tắt cho góc liên tục. Tâm/offset điều khiển được khóa trong gesture để cung không nhảy vị trí khi bounding footprint đổi.

Trong lúc kéo, scene pose và named port/wire geometry cập nhật ngay; graph/history chưa đổi. Thả chuột gọi đúng một `moveModule` hoặc `rotateModule` sau khi kiểm tra draft. Escape, pointer cancel/lost capture, đổi selection/tool/graph, hidden tab/context loss và unmount phục hồi pose từ graph, bỏ preview và nhả capture. No-op không tạo history; Undo/Redo dùng snapshot circuit hiện có.

## Vị trí và kích thước gizmo

Một đơn vị handle tương ứng khoảng 42 CSS px theo độ sâu camera: `2 × depth × tan(FOV/2) / (viewportHeight × zoom) × 42`. Tính lại khi resize, zoom, orbit và cả khi đang kéo object gần/xa camera. Góc nhìn vẫn làm mặt phẳng X/Z bị foreshorten tự nhiên.

Các ứng viên nằm trước/phải/trái/sau object theo hướng camera, với vài khoảng cách dự phòng. Footprint được xoay theo pose thật; score ưu tiên gần object, ở trong viewport, tránh housing lân cận và vùng DOM của Component Info/instrument/navigator. Iterable models được materialize trước khi chấm điểm để mọi ứng viên đều xét đầy đủ các hàng xóm. Cảnh quá chật vẫn dùng ứng viên có score tốt nhất; đây không phải solver collision vật lý.

Snap breadboard từng dùng rounded quarter-turn để hoán đổi width/depth. Gizmo cho phép 30°/15° nên cách đó có thể gây overlap. Broad-phase mới dùng `W = |cosθ|w + |sinθ|d`, `D = |sinθ|w + |cosθ|d`. Đây là AABB bảo thủ: docking ở góc xiên không khẳng định hai khớp vật lý ăn khớp chính xác.

## Định nghĩa công cụ view

| Công cụ | Hành vi |
|---|---|
| Zoom In / Zoom Out | Đổi magnification 10%, giới hạn 50–200%; wheel vẫn dolly camera |
| Zoom To View Entire Circuit | Union bounds models và wires, dùng bounding sphere/FOV/aspect để fit, giữ hướng nhìn, về magnification 100%; mạch trống disable |
| Workspace Object Snap | Placement/movement theo bước 0.5, docking breadboard khi kéo tự do, rotation gizmo theo 15°; không tạo kết nối điện |

Fit không tính grid hoặc gizmo là circuit geometry. Far plane và giới hạn dolly được mở rộng khi circuit lớn. Toolbar nằm sát phải Status Bar và wrap khi cần; tên/mô tả có trong aria/title. Dòng tên Select/Wire/Move/Rotate đã bỏ; chỉ còn thông báo ngắn trong lúc placement và hướng dẫn cho accessibility.

## Power Supply và boundary

Model giữ catalog dimensions và zero-port contract. Vỏ rounded metal, bezel tối, mặt máy in nhãn, bốn núm có rãnh/index, cọc đỏ/xanh/đen, công tắc, vents, vít và chân. Màn hình hiển thị dấu chưa có số đo và `OUTPUT OFF · VISUAL MODEL`; không lấy 30V/5A/150W trong ảnh tham khảo làm dữ liệu vận hành. Gold contour chỉ nhấn vỏ/bezel, tránh vẽ vòng vàng quanh từng núm/cọc. Artwork SVG trong ribbon/Info vẫn là tài sản supplied đã chuẩn bị.

## Kiểm chứng

`npm test` cuối: **79/79 PASS**; Python frontend/docs/context **17/17 PASS** ở UTF-8 mode. Browser evidence được ghi trong [báo cáo](verification/2026-10-09-component-transform-gizmo-browser.md). Tests dùng camera/raycast/editor/Pinia thật, chỉ thay DOM/GPU boundary; kiểm tra constrained move, live endpoints, one Undo, cancel, rotation, fit, hover/disposal, single-use iterator, scale khi kéo và vùng cửa sổ cần tránh. Review độc lập phát hiện hai lỗi iterator/active scale; cả hai có regression RED→GREEN.

Production bundling bị sandbox EPERM ở `realpath src/main.ts`; không khẳng định build PASS. Không thêm dependency, thay electrical contract, import hardware driver, commit/push/deploy hoặc chạy hosted CI.
