# Phân tích source và triển khai Phase 2 — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

## Kết luận kiến trúc

**Bổ sung UX hiện hành:** lỗi chuột trái pan/kéo model và XYZ tĩnh đã được phân tích riêng trong [SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md](SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md). Báo cáo Phase 2 dưới đây giữ nội dung lịch sử; theo yêu cầu mới nhất, chỉ Move kéo model trực tiếp, Select chỉ chọn. Kéo nền pan XZ, chuột phải orbit và gizmo theo camera, với các nút điều hướng cạnh XYZ.

Shell Phase 1, transport typed và sáu Pinia store được giữ. Phase 2 bổ sung editor theo metadata, một lớp command cập nhật Circuit Graph, scene biểu diễn graph và bộ điều khiển tương tác. Workflow vẫn ở `/`; không dùng router để chọn công cụ hoặc chuyển lab. Không có import driver/hardware vào frontend.

## Các khoảng trống đã xác định trong source trước khi sửa

| Source cũ | Vấn đề | Cách xử lý |
|---|---|---|
| SceneManager | Chỉ grid/camera/render coalesced; chưa có model, lights, picking hoặc điều khiển camera | Models/wires, ambient/directional lights, plane picking, OrbitControls và lifecycle |
| circuit store | History chỉ New/Open/rename/draft; chỉnh graph trực tiếp dễ bỏ qua validation/history | Command có kiểm tra trước mutation, một snapshot mỗi thao tác, invalidate validation |
| workspace store/tool rail | Tool state và preview chưa có hành vi | Placement, selection, wire selection, pending port, snap, gesture bridge |
| ribbon | Artwork và metadata preview; memory chỉ mở shell | Drag/drop hoặc click để arm placement; Info riêng; memory là module |
| Inspector/Hex Editor | Chỉ project/station/console; memory disabled | Editor tọa độ/rotation/parameters, nối/ngắt dây bằng bàn phím, memory image thật trong graph |
| device-library | 74HC08 chỉ có starter function; breadboard node_map null | Catalog functional ports có boundary rõ; không suy đoán pin vật lý từ hình ảnh |
| simulator/API | AND helper độc lập; API chỉ structural validation/stations/events | Giữ Run/Step/acquisition unavailable; Phase 2 không tạo kết quả đo giả |

## Luồng dữ liệu và ownership

```text
device-library/editor/components.json
  -> sync_editor_catalog.py -> src/data/editorCatalog.json
Ribbon / Inspector / canvas pointer
  -> circuit commands -> graph + history + stale-validation invalidation
  -> SceneManager reconciliation by module ID
  -> models + named-port anchors + wire projection
```

`ComponentModel` dựng primitive theo render style metadata, có decorative contact instancing và label texture. Logical ports có màu theo direction và ray/DOM picking, không phải chân IC vật lý. Unknown imported type có fallback model, properties giữ nguyên; unknown port vẫn nằm trong Inspector nhưng không được dựng anchor giả.

`useCircuitEditor` chỉ preview geometry khi kéo. Release commit một move command; Escape, pointer cancel/lost capture, draft/graph/tool đổi đều hủy preview. Source/destination ID không thay đổi theo position/rotation. Delete cascade wire; Undo phục hồi cả module và wire. Overlap và snap không tạo kết nối. Global Escape xử lý cả focus ribbon/port, trong khi floating-window Escape vẫn đóng cửa sổ.

Scene/renderer/OrbitControls ở ngoài Pinia. Resize zero, tab hidden và context loss ngừng frame; restore redraw graph. Unmount hủy frame/listeners/observer/controls; dispose geometry/material/texture và InstancedMesh instance buffers. Ghost tái sử dụng khi di chuyển cùng loại, dispose khi hủy hoặc đổi loại.

## Phạm vi model

17 types: Breadboard, Board, Power supply visual; Resistor, Capacitor; Push button, Toggle switch, 4-bit DIP switch, Clock; LED, single 7-segment, 8-bit display, Probe; 74HC08; generic 8-bit Adder, 8×8 Multiplier; Generic byte Memory.

Thông số passive/clock là cấu hình yêu cầu cho local model, không phải rating phần cứng. Digital state/DIP value lưu trong properties và cập nhật hình ảnh cấu hình. LED/segment/display không giả lập tín hiệu trước Phase 3. Adder/Multiplier chỉ chuẩn bị abstraction bus/port, không chọn part number. Active, controller, notation và dual/quad segment chưa có contract nên các entry đó vẫn chỉ preview metadata.

Memory image v1.0 có word_bits=8, depth 1–256, bytes 0–255 và độ dài bằng depth; instance mới có 32 byte 0 được khởi tạo rõ ràng. Apply/Load/Save là dữ liệu cục bộ, Undo/Redo đi qua graph history. Không phải SDRAM vật lý hoặc capture. Load bất đồng bộ kiểm tra lại draft/selection trước khi ghi.

## Contract và tương thích

Graph vẫn schema 1.0. Thêm typed optional `rotation` (schema module trước đó đã cho phép extra fields), mô tả rõ yaw quanh Y. `position` dùng world X/Y/Z; work surface là XZ. Schema không biến đổi root/connection contract. Import có kiểm tra uniqueness ID, reference tồn tại, finite geometry và memory image; unknown types/port names được giữ để không mất dữ liệu legacy.

Frontend chặn duplicate wire, output-output/input-input, width mismatch, thêm driver vào cùng input. Đây là kiểm tra cấu trúc editor; không thay thế voltage/power/contention/net/timing validation của backend. Passive `inout` cần bước phân tích net ở Phase 3/4. Structural API vẫn có thể trả valid cho graph chưa được xác nhận điện.

## Quyết định và chi phí

- Giữ scene render theo nhu cầu: model chưa animate, OrbitControls không damping. Mỗi camera/graph/gesture change được coalesce vào RAF; không chạy vòng simulation giả. Phase 3 cần animation scheduling khi có dữ liệu thật.
- Chọn primitive procedural thay vì đưa ảnh SVG thành electrical model: artwork supplied tiếp tục ở ribbon/info; geometry có thể thay thế độc lập sau này.
- Catalog functional ports riêng với datasheet metadata: tránh invented package pins; Phase 3 cần adapter rõ sang evaluator, đặc biệt 74HC08 starter hiện chỉ là helper một gate.
- Bộ nhớ generic giới hạn cục bộ 256 byte: đủ contract/editor initial data, không mô tả capacity hay timing SDRAM V1.
- Session-local history/file behavior giữ nguyên; server persistence, full simulation, electrical validation và hardware execution là phase tiếp theo.

## Bằng chứng

Xem `DEV_LOG.md` và `verification/2026-10-09-interactive-workspace-browser.md` cho số test/build/browser cuối cùng. Lỗi GPU instancing và Escape đã được review độc lập, tái hiện RED rồi sửa; không nhận thành công chỉ từ report reviewer.
