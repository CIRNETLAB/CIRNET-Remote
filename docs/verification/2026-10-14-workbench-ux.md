# Workbench UX — jumper, close-up zoom và pan trên model

Thực thi yêu cầu trong Pasted text.txt ngày 2026-10-14, trên working tree sau commit `0850a72`. Phạm vi chỉ frontend/Three.js. Không thay Backend, Contracts, Simulator, Hardware Service, FPGA protocol, CircuitGraph schema hoặc electrical identity. Báo cáo này cập nhật workflow Wire hiện hành; các kế hoạch wire trước đó là hồ sơ lịch sử.

## Nguyên nhân

- WireGeometry dùng 6 cạnh radial và góc quadratic ít sample; dây mảnh và mặt ống lộ góc. Selection chủ yếu dựa vào emissive/recolor, thiếu silhouette rõ trên dây đã có màu.
- Wire controller thêm bend bằng left-click vùng trống, còn right-click/contextmenu hủy draft. Palette có 8 nút vuông.
- Giới hạn zoom 200% lặp ở workspace, scene, OrbitControls và status bar; camera near 0.1 không phù hợp inspect gần.
- Select chỉ bắt đầu pan khi không hit model; panGrab dùng plane Y=0 nên điểm grab trên mặt cao không bám cursor.
- Rà soát phát hiện hai vấn đề phụ: fillet ở lead cắm ngắn có bán kính nhỏ hơn bán kính ống, làm gập mặt; dolly chỉ xét component meshes nên có thể lọt vào tube sau Zoom To Area.

## Thay đổi

### Jumper và interaction

Ống dùng 10 radial segments. Các góc dùng cung tròn tiếp tuyến, bán kính tối đa 0.065, giới hạn theo chiều dài đoạn để không overshoot. Lead giáp endpoint chỉ có một góc nên dành tối đa 90% chiều dài cho elbow; đoạn nội bộ dành tối đa 45% ở mỗi phía. Geometry tránh fillet nhỏ hơn 1.1 lần bán kính ống để không gập mặt. Điểm đầu/cuối vẫn giữ đúng contact/port.

Đường dây nằm thấp theo topology/deck, có đoạn cắm xuống contact. Độ dày render tối thiểu 0.052 áp dụng cả legacy, không ghi lại metadata cũ. Draft mới dùng thickness 0.052 và height 0.04. Material matte, roughness 0.78; màu dây không đổi khi select. Hai outline vàng dùng chung cho hover/selection hiện tại; bend/endpoint markers vẫn instanced.

Workflow: **chọn màu → left-click đầu → right-click các corner → left-click endpoint cuối**. Left-click trống chỉ cập nhật preview. Contextmenu không thêm bend lần hai và không hủy draft. Esc hủy; Backspace/Delete bỏ bend cuối; Alt bỏ snap. Draft chỉ khóa RIGHT orbit, wheel vẫn hoạt động. Canvas xử lý pointerdown/contextmenu ở capture phase trước OrbitControls. Palette chuyển thành 10 màu tròn, có focus/pressed feedback và chuyển phím routing về controller khi palette giữ focus; phím của native route select vẫn độc lập.

Giữ drag bend/segment, double-click/add/remove, màu/mode, endpoint priority và commit history. Visual preview không tạo command mỗi pointermove. Tube surface raycast bổ sung centerline picking khi zoom cao; chỉnh segment trên phần tube nhìn thấy map về segment gần nhất, vẫn loại trừ insertion lead bị pin. Không thêm bend vào electrical endpoints/nodes.

### Camera và Select pan

`workbenchViewport.ts` là nguồn chung cho 50–1000%, default 100%, step 10 và camera clipping. Toolbar/store/wheel/OrbitControls dùng cùng range. Zoom là dolly theo target; model world pose/scale không đổi. Near tối đa 0.005 và giảm theo khoảng cách tới target, với floor 0.00001. Fit/Area tiếp tục lập reference 100%; Area nhỏ có reference floor 0.0004 để mức 1000% vẫn nằm ngoài near plane.

Inward dolly raycast đường di chuyển tới bề mặt component và committed tube, giữ clearance theo khoảng cách mới. Camera báo zoom thực tế nếu bị chặn. Zoom To Area lấy bề mặt tube thật làm focus thay vì tâm route; do đó inspect dây ở 1000% vẫn ở ngoài ống và pick/edit được. Giữ quaternion/navigation conventions và camera-relative initial placement hiện tại.

Select pointerdown trên model tạo pending select/pan; vượt 4 px thì pan, release dưới ngưỡng thì select. Plane đi qua `hit.point.y`; camera và target dịch cùng delta XZ, giữ zoom/heading. Module không di chuyển và không tạo history. Zoom Area, wire editing, gizmo, supply controls, placement và Move giữ ưu tiên hiện có. Release kiểm tra graph/draft identity để không chọn model thuộc draft cũ.

### Cache và lifecycle

Mỗi wire giữ tube và pick polyline; route/effective diameter quyết định geometry signature. Color-only changes không rebuild. Drawing preview cũng cache signature; bursts coalesce về route cuối trong frame. Outline dùng tối đa hai mesh, handle instancing chỉ cho selection hiện tại. Geometry/material bị thay hoặc xóa được dispose; không thêm DOM cho wire/contact và không thêm RAF loop.

## Files

| Nhóm | Files |
| --- | --- |
| Wire rendering/data | `apps/web/src/three/WireGeometry.ts`, `WireLayer.ts`; `apps/web/src/wires/wireAppearance.ts` (mới), `wireVisual.ts`, `wireRouting.ts` |
| Controller/camera | `apps/web/src/composables/useWireRouting.ts`, `useCircuitEditor.ts`; `apps/web/src/three/SceneManager.ts` |
| Shared zoom | `apps/web/src/config/workbenchViewport.ts` (mới); `apps/web/src/stores/workspace.ts` |
| UI | `apps/web/src/components/workbench/WireOptions.vue`, `CircuitWorkspace3D.vue`, `SimulationStatusBar.vue`; `apps/web/src/style.css` |
| Tests | `apps/web/tests/wire-geometry.test.ts`, `zoom-controls.test.ts` (mới); `camera-navigation.test.ts`, `interaction.test.ts`, `scene-reconciliation.test.ts`, `wire-interaction.test.ts`, `wire-layer.test.ts`, `wire-options.test.ts`, `workbench.test.ts` |
| Docs | `apps/web/README.md`, báo cáo này |

## Verification

- `npm.cmd test`: **340/340 PASS**, không skipped/cancelled, bao gồm typecheck tests. Baseline 327; thêm 13 regression và cập nhật các assertion phản ánh workflow/zoom/selection đã chủ động đổi.
- Coverage mới: 1000% toolbar/native wheel; near và exact socket pick; model phủ viewport vẫn pan; grabbed elevated surface bám cursor; click release select; 1–3 right-click corner và contextmenu suppression; atomic Undo; Esc/Backspace; native right orbit/wheel gating; palette keys; circular/no-overshoot geometry; không gập mặt cho lead legacy/new; repeated tiny Area → 1000%; visible tube select/edit; golden overlay reuse/disposal; preview buffer reuse; status-bar +/- và reference.
- Existing Move/Rotate/Gizmo/camera-relative placement/ViewCube/navigation/Fit/Area/history/Save/Open/electrical-net tests tiếp tục PASS. Visual edits không thay endpoint/net; graph metadata cũ không bị mutate khi tăng minimum diameter render.
- `npx.cmd vue-tsc --noEmit`: PASS.
- `npm.cmd run build`: typecheck PASS, Vite bị **EPERM realpath** tại `apps/web/src/main.ts`, cùng giới hạn môi trường đã tồn tại trước task.
- Production build bằng invocation adapter `node --input-type=module -e 'import {build} from "vite"; await build({resolve:{preserveSymlinks:true}});'`: **PASS**, 175 modules, 7.42 s. Không sửa Vite config/package để che lỗi. Vite vẫn có advisory chunk lớn (>500 kB).
- `git diff --check`: PASS.
- Review độc lập read-only: các phát hiện camera/tube, winding và high-zoom segment hit đã được sửa và recheck; không còn correctness finding. Probe review chạy in-memory, không sửa checkout hoặc mở browser.
- Probe CPU cuối với 300 AUTO wires, 20 warm-up + 100 picks: dense median **4.603 ms**, p95 **5.314 ms**; background median **0.395 ms**, p95 **0.586 ms**. Sync lại tái sử dụng cả 300 geometry; serialized graph không đổi. Đây là fixture tổng hợp trên CPU, không phải FPS/WebGL benchmark.

## Giới hạn

Chưa xác minh trực quan WebGL hoặc hiệu năng GPU/browser. Actual tube picking tăng chi phí CPU tại vùng nhiều dây; hiện dùng bounds/raycast chuẩn của Three.js, không có BVH mới. Guard chỉ dành cho inward dolly, không biến pan/orbit thành hệ collision vật lý. Corner nhỏ hơn kích thước ống dùng miter fallback thay vì cung tự gập; snap theo pitch thông thường vẫn có đủ khoảng trống để bo. Build chuẩn còn phụ thuộc việc xử lý EPERM/realpath của môi trường; adapter chỉ áp dụng lúc chạy build.
