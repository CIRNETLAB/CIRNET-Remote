# Phân tích thuật toán điều hướng workspace — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

## Phạm vi và kết luận

**Quy tắc hiện hành theo yêu cầu mới nhất:** chỉ button Move cho phép nắm kéo trực tiếp breadboard và mọi model khác. Select chỉ chọn; kéo trên model trong Select không pan camera, không preview và không ghi history. Kéo nền để pan, chuột phải orbit và XYZ theo camera được giữ. [Bằng chứng cập nhật](verification/2026-10-09-move-tool-browser.md).

Rà soát cấu trúc monorepo, các tầng runtime và luồng dữ liệu từ thao tác chuột đến graph/render, đối chiếu với source, contract, test và hai ảnh người dùng cung cấp. Ảnh mô tả trục XYZ tĩnh và khung View controls cũ; yêu cầu thực thi là nội dung người dùng viết. Các lỗi nằm trong frontend camera/interaction bridge, không phải simulator, API hoặc FPGA. Không sửa contract điện, device-library hoặc driver để giải quyết thao tác camera.

| Tầng đã đối chiếu | Thuật toán/trách nhiệm hiện có | Liên quan đến lỗi UX |
|---|---|---|
| `apps/web/src/App.vue`, router, SingleWorkspaceShell | Một shell tại `/`, redirect legacy; bootstrap draft, transport lifecycle | Router không điều khiển lab hoặc camera |
| Ribbon, ToolRail, Inspector, FloatingWindow | Chọn tool/placement; edit thuộc tính; focus/drag cửa sổ tách với canvas | Chỉ Move kéo model trực tiếp; Select chỉ chọn; form/window không bị nhận làm thao tác canvas |
| `useCircuitEditor.ts` | Ray picking, transient selection/placement, pointer capture, preview rồi commit | Nơi quyết định click/move/pan và ranh giới Undo |
| `SceneManager.ts`, `ComponentModel.ts` | Scene reconciliation theo ID/signature; pose, anchors, wires, picking, camera/RAF và GPU lifecycle | Camera độc lập logical graph; gizmo phải đọc camera thực |
| `stores/circuit.ts`, file/memory services | Validate trước mutation, snapshot giới hạn 50, invalidate validation; import/export giữ metadata | Pan không ghi history; move chỉ ghi một lệnh và giữ endpoints |
| Sáu stores, typed API/WebSocket | UI/graph/station/instrument phân tách; requests tập trung, reconnect exponential backoff và refresh guard | Trạng thái kết nối không quyết định tương tác camera cục bộ |
| `device-library`, graph/memory contracts | Functional ports/metadata; structures không có electrical ports; memory byte image riêng | Breadboard geometry và vị trí không tạo net/chân phần cứng |
| FastAPI | Parse Pydantic/schema 1.0, structural validate, station descriptors, WebSocket hello/echo | Chưa đánh giá toàn bộ mạch điện; không nhận pointer/camera |
| Hardware Service | Virtual state/input adapter; physical adapter yêu cầu driver thật; gRPC handler-free scaffold | Không có driver gọi từ frontend; không fallback hardware sang simulation |
| Simulator / FPGA | AND2/74HC08 gate helper, waveform validation; RTL top chỉ placeholder reset/clock LED | Chưa có engine chạy graph/acquisition; không liên quan orbit/pan |
| Tests/CI/deployment | Runtime frontend tests + vue-tsc/build, Python boundary/contract tests; Nginx/systemd deployment scaffold | Kiểm chứng bằng hành vi; hosted CI cần push, không suy ra từ build local |

## Nguyên nhân của bản điều hướng trước đó (lịch sử)

1. OrbitControls cấu hình `LEFT: null`, còn editor gặp nền trống thì clearSelection rồi return. Không tầng nào xử lý kéo trái để pan.
2. Editor chỉ tạo MoveGesture khi `workspace.tool === 'move'`. Bản sửa điều hướng trước đã mở cả Select theo yêu cầu kéo trực tiếp ban đầu. Yêu cầu mới nhất khôi phục điều kiện Move-only có chủ đích; picking, plane, preview, history và cancel đã sửa vẫn được giữ.
3. SVG XYZ dùng tọa độ line/polygon và CSS label cố định. OrbitControls đổi camera và render scene, nhưng không có phép chiếu orientation cho SVG, nên trục đứng yên.
4. Các nút orbit/pan ở `<details class="view-options">` riêng, xa trục. Pan forward/back cũ dùng world Z cố định, gây cảm giác sai hướng sau orbit.
5. Review phát hiện điều kiện nền Y=0 còn chặn kéo model khi camera thấp: ray chọn được thân LED phía trên camera nhưng giao điểm ground nằm phía sau camera. Không thể yêu cầu ground intersection cho mọi model drag.

Browser baseline tái hiện Select kéo breadboard không đổi và SVG giữ nguyên sau Orbit right. Test hồi quy tái hiện các lỗi trước bản sửa. Trường hợp camera thấp cũng có test RED riêng.

## Phân luồng pointer và lịch sử

```text
left pointerdown
  placement armed -> place command
  named port + Wire -> connect/pending port
  wire -> select/unwire
  model + Rotate/Delete/Scope/Probe -> action của tool
  model + Select -> select only; no move gesture
  model + Move -> pending move gesture
  empty surface -> pending pan gesture

pointermove vượt 4 CSS px -> preview model hoặc camera pan
pointerup cùng pointer ID -> commit một move, hoặc kết thúc pan
Escape/cancel/lost capture/tool/graph/hidden/context loss -> hủy preview
```

Threshold tránh click/jitter vô tình snap một vị trí import chưa nằm trên grid. Pointer capture nhận cả move/up ngoài canvas. Hoàn tất phải xóa gesture trước release capture để lostpointercapture không hủy move đã commit. Chỉ pointer đang nắm gesture được cập nhật/kết thúc nó. Trong lúc kéo trái, OrbitControls/wheel được khóa; trạng thái khóa và suspend đều được xét khi mở lại camera input.

Pan giữ selection và pending wire để người dùng có thể đi tìm cổng khác; click nền không kéo mới clearSelection. Wire/Rotate/Delete vẫn giữ ý nghĩa click riêng. Muốn kéo trực tiếp model phải chọn Move. Chuyển Move sang Select khi đang kéo hủy preview, nhả capture và không commit. Hint và grab cursor chỉ quảng bá kéo model khi Move đang active. Quy tắc này áp dụng cho kéo chuột; chỉnh tọa độ trong Inspector và phím mũi tên giữ hành vi hiện có.

## Pan theo điểm đang nắm

Chuyển tọa độ CSS con trỏ sang NDC, raycast với mặt phẳng XZ (`Y=0`). Lưu giao điểm ban đầu `A`. Mỗi lần pointermove, ray hiện tại cho giao điểm `B`; tính `delta = A - B`, đặt `delta.y = 0`, cộng cùng delta vào camera.position và OrbitControls.target.

Vì camera và target cùng dịch, góc nhìn/khoảng cách/độ cao không đổi, và điểm A tiếp tục nằm dưới con trỏ. Cách này hỗ trợ kéo chéo, mọi vị trí trong viewport, các góc orbit và zoom khác nhau; không biến pixel thành world unit bằng hệ số tùy ý. Không snap camera và không ghi Circuit Graph/Undo.

Nút pan dùng vector right của camera chiếu xuống XZ và vector forward vuông góc với right trong XZ. Vì vậy left/right/forward/back theo hướng đang nhìn, thay vì world Z cố định. Middle-button pan vẫn do OrbitControls xử lý.

## Kéo model trên mặt phẳng tương tác

Picking trả cả module ID và điểm hit trong world space. Lưu mặt phẳng ngang tại `Y=hit.point.y`; ray đầu/cuối intersect với mặt phẳng này. Offset XZ giữa vị trí module và điểm nắm được giữ trong gesture. Apply snap cho X/Z, giữ Y của module; rotation/properties/endpoints không đổi.

Giải pháp này giữ điểm nắm ổn định trên thân mô hình và xử lý trường hợp camera thấp không giao được ground Y=0. Trong preview, chỉ Three.js group và wire geometry đổi. Release gọi `circuit.moveModule` đúng một lần. Cancel reconcile lại pose từ graph. Wires luôn dựng lại từ named-port anchors của module; không đổi source/destination hoặc tạo electrical contact từ overlap.

## XYZ theo camera và cụm điều hướng

Ba basis thế giới vẫn là X=(1,0,0), Y=(0,1,0), Z=(0,0,1). Với quaternion camera `q`, hướng trong camera space là `q⁻¹ * basis`; SVG lấy `(x, -y)` vì screen Y đi xuống. Component lưu cả depth để vẽ trục xa trước trục gần. Nhãn/mũi tên đi cùng hướng, trục gần vuông góc màn hình biểu diễn bằng điểm.

Camera change request một frame thông qua OrbitControls `change`. Sau render, cùng callback cập nhật DOM-port projection và các axis direction. Gizmo vì vậy theo right-button orbit, nút Orbit, Reset và các thay đổi camera qua cùng một nguồn. Translation/zoom không làm đổi orientation. Không có RAF thứ hai và không đặt Three.js resources trong Pinia.

`WorkspaceNavigator.vue` có sáu nút SVG stroke cục bộ, title/aria-label rõ và hỗ trợ focus/bàn phím. Nằm sát XYZ ở góc dưới phải, không còn View controls. Root/SVG/gaps có pointer-events:none; chỉ button nhận sự kiện để phần gizmo thụ động không che thao tác canvas. Artwork supplied trong ribbon/info được giữ nguyên.

## Kiểm chứng và giới hạn của bằng chứng

Chi tiết hiện hành ở [Move-only browser report](verification/2026-10-09-move-tool-browser.md) và [DEV_LOG](DEV_LOG.md); [báo cáo điều hướng trước](verification/2026-10-09-workspace-navigation-browser.md) được giữ làm lịch sử. Tests dùng composable thật trong Vue lifecycle với Pinia, SceneManager/picking/camera thật, chỉ thay DOM host/GPU boundary. Test Select với breadboard/LED xác nhận geometry, graph, camera, capture và history không bị kéo; các test Move giữ preview/commit/cancel. Có test integration phát pointer sequence chuột phải qua OrbitControls thật và đọc orientation ở render callback.

Công cụ browser automation hiện chỉ hỗ trợ native drag chuột trái. Browser cập nhật kiểm chứng Select kéo không đổi breadboard, cùng thao tác trong Move đổi vị trí và một Undo khôi phục. Pan và nút orbit được kiểm chứng trong bản điều hướng trước; chuột phải được kiểm chứng bằng integration test nêu trên, không tuyên bố đã tự động right-drag native trên browser. Multitouch không nằm trong yêu cầu này. Simulation/execution/acquisition vẫn thuộc phase tiếp theo.
