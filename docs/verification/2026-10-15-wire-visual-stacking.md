# Tinned terminals, constant-diameter wire và stacking — 2026-10-15

> Audit status — 2026-10-19: this is historical evidence. The image files named below were already absent from the supplied repository at baseline `0cc66f8`; this audit did not inspect or recreate them. Recorded measurements and results are preserved. New verification outputs follow [the shared guide](../VERIFICATION.md) and stay outside the repository.

Thực thi brief `8bc71255/Pasted text.txt` trên working tree sạch tại `a7210e6`. Phạm vi frontend/Three.js Wire. Giữ vị trí WireOptions ở góc trên bên phải và không khôi phục scene inventory đã bỏ trong commit đó. Không thay backend, contracts, simulator, hardware/FPGA, CircuitGraph schema, electrical resolver, topology/socket/housing/model geometry hoặc zoom/pan/placement/Gizmo/ViewCube.

## Root cause

1. Tube dùng `radiusLimit` để giảm cross-section tại góc ngắn: dây bị teo, nhất là đoạn sát terminal. Sweep qua curvature nhỏ hơn tube radius còn có thể gập mặt vào trong.
2. Conductor nâu chỉ bắt đầu tại logical contact và overlap `.003` theo hướng lên insulation; không có phần inserted xuống dưới contact. Preview opacity `.85` làm thấy xuyên vỏ.
3. Segment feedback là một tube vàng đường kính 1.25× vỏ, che dây. Snap full contact pitch hạn chế lane.
4. Layer đã có trong v1 nhưng chỉ clamp vài điểm thấp, không lift đều world/module anchors; chưa có auto overlap assignment, manual stack UI hoặc inverse transform khi lưu edit. Dùng layer number đơn thuần còn bỏ sót different base heights và route dốc.

## Terminal và vật liệu

`WireTerminals.ts` giữ shared capped cylinder/material. Conductor màu bạc `#c4cbd2`, metalness `.86`, roughness `.29`, emissive zero. Core radius `.22 × diameter`, nhỏ hơn insulation radius `.5 × diameter`.

Ba vùng cho breadboard:

```text
inserted tip = electrical position − lead direction × insertionDepth
electrical contact (giữ nguyên)
visible conductor → insulation junction
hidden overlap inside insulation
```

Insertion depth `min(diameter × 1.2, contactPitch × .65)`: với diameter `.052` và pitch `.13`, inserted tip thấp hơn contact `.0624`. Hidden overlap riêng `min(diameter × .12, .006)` để kín cap. Không dùng overlap làm insertion. Visible contact trim tối đa `.042`, thích ứng đoạn đầu; free trim tối đa `.065` thay vì `.04`. Draft quá ngắn giới hạn trim để còn insulated body.

Layer lift áp dụng cả insulation junctions: higher wires không để đoạn vỏ gần đầu cắm nằm xuyên dây dưới. Metal vẫn kéo về exact electrical anchor và cắm xuống dưới anchor. Với stacked logical ports, metal lead nối fixed port với elevated body; cap kín ở chỗ đổi hướng. Copper/tinned geometry và inserted tip không thành electrical endpoint.

Committed/preview insulation đều fully opaque, roughness `.62`, metalness zero. Preview `transparent=false`, `opacity=1`, không thấy lõi bên trong vỏ. Radial segments tăng từ 10 lên 16; đã benchmark CPU với 300 wires.

## Corner giữ nguyên đường kính

Cross-section radius luôn `diameter / 2`, không còn `radiusLimit` hoặc taper transition. Normal sweep dùng tangent circular fillet; trim giới hạn theo hai đoạn, dành ít nhất 10% run giữa hai fillet. Parallel-transport frames giữ normals qua corner 3D.

Nếu radius centerline không đủ cho full tube radius, hoặc intentional antiparallel return, builder nối các full-radius capped sweeps bằng rounded capsule junction. Primitive overlap chỉ ở khớp thiết kế, bị opaque outer surfaces che; không sweep ring qua frame đảo chiều, không tạo spike hoặc co dây. Đây là fallback render cho short corner, không dịch/xóa user anchors. Không CatmullRom/overshoot. Intentional crossings/returns vẫn giữ nguyên.

Nếu inner arc span nhỏ hơn Float32 spacing ở tọa độ hiện tại, dùng cùng safe joint; regression tại X=20/100 tránh zero-area faces khi move board xa origin. Geometry, pick polyline và envelope dùng cùng sampler. Góc đủ chỗ vẫn dùng cung tròn mượt, không thay đường kính ở endpoint transition hay giữa dây.

## Snap và visual layering

Board routing grid = `contactPitch / 4`, origin theo topology; current pitch `.13` cho routing step `.0325`. Contact identity/position không đổi. FREE vẫn nối trực tiếp các user anchors; Alt bypass snap. Outside-board grid hiện có giữ nguyên.

`wireStacking.ts` chỉ xử lý visual routes:

1. Solve named endpoints/user anchors; project editable centerline segments xuống XZ.
2. Broad-phase bounds và segment distance/intersection detect crossing, collinear/near-collinear overlap, hoặc distance nhỏ hơn sum radii + `.012` visual clearance.
3. NEW wire không conflict → layer 0; conflict → bắt đầu ở `max(conflicting layers)+1`.
4. Kiểm tra local body envelopes từ chính sampler/terminal trim để clearance theo Y thực, không chỉ theo layer counter. Envelope xét tilted-cylinder support `r / cos(slope)`, finite end caps, circular corners và full-radius joints. So sánh endpoint/intersection/interior pairs của projected overlaps; short vertical spans dùng finite bounds. Nếu nominal level còn chạm route có base height khác hoặc quá dốc, nâng đến level đủ khoảng hở. Ordinary same-path wires giữ 0/1/2.

Step theo layer = maximum render diameter hiện có trong scene + `.012`; các diameter khác nhau không xuyên nhau ở các level liền nhau. Local body clearance guard dùng `.003` trong phạm vi projected body; đó là khoảng hở nhỏ sau khi xét tilt/caps, không thay radial diameter. Không offset X/Z hoặc dùng renderOrder giả để stacking. Khi SceneManager/renderer solve, world và module user anchors lift đồng đều; edit trừ đúng layer offset trước khi lưu. Drag plane đi qua actual picked bend/segment height, không flatten custom elevated anchors.

`WireVisual.version` vẫn 1; chỉ dùng `layer` đã có. Legacy không có layer hiểu là zero và không tự rewrite khi Open. Layering không quyết định electrical nets; endpoint resolver tiếp tục là authority.

## UI và thao tác

WireOptions thêm compact Stack Down/Up/Top và “Layer N” khi chọn wire. Down min 0; Up +1; Top đặt trên conflicting routes. No-op Down/Top không thêm history. Nếu target bị chiếm, reorder các wire cần thiết trong cùng một existing `commitGraph` command. Cascade kiểm tra cả conflict set của dây bị chuyển chỗ, không chỉ dây đang chọn. Các dây/metadata không cần đổi giữ nguyên. Một Undo/Redo khôi phục cả order.

“Select next overlapping wire” cycle deterministic qua cả wire bị che. Scene picking ưu tiên actual upper tube surface; wire đã chọn bên dưới vẫn có edit handles/gold outline. Bend dots giữ radius khoảng 3.5 CSS px. Hover segment dùng `wire-segment-hover-line` mảnh; không còn `wire-segment-highlight` thick cylinder. Không thêm DOM/RAF cho mỗi wire.

RMB toggle/undo corner, FREE/ORTHOGONAL/AUTO, Esc/Backspace/Delete, captured gestures và source/destination semantics giữ nguyên. Auto stacking xảy ra khi hoàn tất NEW wire; sửa route hiện có giữ layer người dùng chọn, có thể dùng Top để xử lý overlap mới.

## Files

| Phần | Files |
| --- | --- |
| Render | `apps/web/src/three/WireGeometry.ts`, `WireTerminals.ts`, `WireLayer.ts`; `apps/web/src/wires/wireAppearance.ts` |
| Routing/stacking | `apps/web/src/wires/wireRouting.ts`, `wireRouteEditing.ts`, **`wireStacking.ts` mới** |
| Controller/scene | `apps/web/src/composables/useWireRouting.ts`, `apps/web/src/three/SceneManager.ts` |
| UI | `apps/web/src/components/workbench/WireOptions.vue`, `CircuitWorkspace3D.vue` |
| Tests | `apps/web/tests/wire-geometry.test.ts`, `wire-layer.test.ts`, `wire-routing.test.ts`, `wire-interaction.test.ts`, `wire-options.test.ts`, **`wire-stacking.test.ts` mới** |
| Docs | `apps/web/README.md`, báo cáo và CPU previews này |

Đã đọc `wireVisual.ts`, workspace store và các wire tests khác; giữ metadata fallback, default FREE, graph/store/electrical architecture hiện có.

## Verification

- Final `npm.cmd test`: **382/382 PASS**, no fail/skipped/cancelled, 24.41 s; có vue-tsc tests. Baseline 366, thêm 16 regression; cập nhật assertion cũ chỉ ở behavior chủ động đổi (deep tip, thin overlay, fine snap).
- New checks: inserted silver/capped pin, emissive zero, longer free pin, opaque preview, constant radius qua tight corner/end transitions, whole insulation Y separation, thicker legacy wire, XZ crossing/overlap/close lanes, auto0/1/2, uppermost picking/underlying cycle, Up/Down/Top/no-op/history/files/net invariance.
- Repeated gestures: các test 50 FREE/ORTHOGONAL bend/segment/pin-adjacent edits tiếp tục PASS; thêm 50 elevated-layer bend edits giữ baseY, two user anchors, endpoint/nets và finite/nonzero/nonfold mesh. Save/Open/Undo/Redo/v1/future file preservation coverage giữ nguyên.
- Review độc lập read-only phát hiện cascade conflict và different base heights. Cả hai reproduced RED rồi GREEN; thêm steep same-path regression và translated Float32 regression. Không gọi re-review hoặc browser. Forty angle/offset geometry probes cuối không có failure.
- Existing interaction/scene/topology/model lifecycle/camera-relative placement/Gizmo/ViewCube/Move/Rotate/zoom/pan/Physical Lab UI tests PASS.
- `npm.cmd run build`: typecheck PASS, Vite chuẩn vẫn **EPERM realpath** tại `apps/web/src/main.ts`, cùng giới hạn môi trường ở baseline.
- Adapter invocation `node --input-type=module -e 'import {build} from "vite"; await build({resolve:{preserveSymlinks:true}});'`: **PASS**, 177 modules, 4.08 s. Không đổi package/Vite config; advisory chunk >500 kB vẫn có.
- CPU probe 300 AUTO wires, 10 warmups +50 samples: dense picking median **6.213 ms**, p95 **6.486 ms**; background **0.615/1.428 ms**; auto stacking **2.027/5.595 ms**. Sau một wire preview change, **299 unrelated body geometries được reuse**, graph serialization không đổi. Body mesh count 296,000 triangles; terminal cylinder/material shared. Đây là synthetic CPU benchmark, không phải FPS/GPU/browser evidence.
- Final `git diff --check`: PASS. Logs/probes: ignored `.superpowers/sdd/2026-10-15-wire-visual-stack/`.

## Visual inspection và giới hạn

Hai ảnh dưới là software rasterization từ actual production housing/socket/body/tinned-metal triangles và camera matrices. Đã kiểm tra TOP/OBLIQUE: purple nằm trên shared red path, orange layer 2 crossing, free preview green đặc, silver inserted leads, uniform coat và bo góc. Hidden ancestors/gizmos được loại đúng. Không có PBR reflections, texture labels, GPU shadows/AA hoặc native browser interactions trong ảnh; chưa xác minh WebGL appearance/performance vì browser access chưa được cấp lại.

TOP — actual mesh CPU preview (historical image reference: `2026-10-15-wire-stack-top-cpu.png`; absent at audit baseline).

OBLIQUE — actual mesh CPU preview (historical image reference: `2026-10-15-wire-stack-oblique-cpu.png`; absent at audit baseline).

Short/sub-precision corners dùng capsule fallback thay vì một continuous smooth fillet không thể chứa full tube radius. Intentional self-crossings/returns được giữ; primitive joints không phải Boolean solid union. Stacking là conservative visual-envelope routing, không phải physics/collision simulator cho mọi housing/component; metal leads vẫn đi về fixed endpoints và có thể cùng vị trí tại shared contact. Largest scene diameter cho layer spacing có tính conservative; imported unusually thick wires có thể làm các tầng cao hơn. Route edits không tự đổi layer; Top/manual controls xử lý order khi cần. Build chuẩn còn bị native realpath permission; browser/GPU QA chưa thực hiện. Source/tests/docs giữ trong working tree.
