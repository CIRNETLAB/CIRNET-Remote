# CRUMB Wire Tool — thiết kế để review

Ngày: 2026-10-14. Trạng thái: người dùng đã duyệt thiết kế ngày 2026-10-14; đã triển khai, automated verification và review hoàn tất; browser smoke chưa kiểm tra do quyền mở browser bị từ chối.

## Mục tiêu và quyết định đã xác nhận

Người dùng câu jumper trực tiếp trên lỗ Breadboard hoặc port: chọn màu → click đầu thứ nhất → rê dây → click để thêm nhiều điểm bẻ → click đầu thứ hai để commit. Sau đó có thể kéo điểm bẻ/segment, thêm/xóa điểm bẻ, đổi màu và mode mà hai endpoint điện không đổi.

Giữ CircuitGraph là source of truth, scene là projection, giữ Undo/Redo, Save/Open, Gizmo, placement preview, ViewCube, Workspace camera và Physical Lab contracts. Tọa độ, overlap, bend point và màu không quyết định connectivity.

Người dùng đã xác nhận power rail **liên tục hết mỗi hàng**, kể cả qua khoảng trống ở giữa hình học. Đây là topology của editor/simulator, không phải chứng nhận topology hay routing của station vật lý.

Theo source hiện tại, Breadboard 100 là thanh bus hai hàng × 50 lỗ, không phải mini terminal board. Thiết kế giữ hình dạng/layout đó.

## Source đã kiểm tra và baseline

Các luồng đã đối chiếu: BreadboardSockets, BreadboardHousing, ComponentModel, SceneManager, WireLayer, useCircuitEditor, circuit/workspace stores, circuit types/schema/file parser, catalog nguồn/generated, Inspector/ToolRail/CircuitWorkspace3D, interaction/scene/reconciliation/camera/resource/history tests, VirtualCompiler và ranh giới resolver/compiler Physical Lab.

Baseline frontend: `npm.cmd test` — 279 pass, 0 fail; `npm.cmd run build` — pass. Build có cảnh báo kích thước bundle sẵn có. Baseline Python: 52 test pass ở circuit schema/API validation/topology resolution/simulator events; 1 test lỗi fixture temp ngoài workspace, chạy lại riêng với `--basetemp` trong workspace thì pass. Tổng 53 test liên quan đã pass, không sửa source để chạy lại.

Hiện trạng quan trọng:

- Socket positions chỉ là `[x,z]`; InstancedMesh không có contact lookup. SceneManager bỏ `instanceId` và trả về module.
- Breadboard catalog có `ports: []`, `visualOnly: true`; connectPorts chỉ chấp nhận logical ports.
- WireLayer dựng một quadratic Bézier cao, cache theo hai endpoint; không có route preview hoặc handle.
- Click trống bắt đầu pan và click-release xóa pending port. Right-click chưa hủy wire draft.
- VirtualCompiler bỏ qua Breadboard và chỉ nhận edge output → input trực tiếp. Physical TopologyResolver xử lý detected evidence riêng.

## Lựa chọn kiến trúc

Chọn mở rộng tương thích CircuitGraph 1.0: typed endpoint resolver ở runtime, endpoint string có discriminator cho contact, WireVisual nằm trong metadata. Cách này giữ file/API/RPC và logical wiring hiện tại.

Phương án schema mới với endpoint object và wire entity riêng sẽ biểu đạt trực tiếp hơn nhưng yêu cầu migration file, API và mọi consumer; không cần thiết cho phạm vi này. Về render, chọn tube/polyline buffer nhẹ, thay vì Line2 cần xử lý độ dày theo màn hình; tube phù hợp jumper có tiết diện và đoạn cắm xuống socket. Cả hai đều tránh DOM cho mỗi dây.

## 1. BreadboardTopology dùng chung

Canonical data: `contracts/design-models/breadboards.json`, chứa profile versioned, kích thước/pitch/deck height và danh sách contact tường minh. Mỗi contact có `contactId`, `localPosition`, `nodeId`; instance order cũng nằm trong dữ liệu đó. Không có bước nhóm electrical node theo khoảng cách.

`scripts/sync_breadboard_topologies.py` tạo bản frontend JSON và hỗ trợ `--check`; Python đọc canonical data thông qua contracts package. Một bộ dữ liệu quyết định cả vị trí socket, instance lookup và intrinsic node membership. Cấu hình package-data phải bao gồm thư mục mới.

`apps/web/src/electrical/BreadboardTopology.ts` là API thuần: lookup profile/module type, contact ID, instance index, node groups. Geometry và resolver dùng API này. Giữ ordering của socket hiện tại để tránh thay đổi geometry ngoài yêu cầu.

| Module type | Contact layout | Số contact | Intrinsic nodes |
| --- | --- | ---: | ---: |
| BREADBOARD | 63 cột × A–J; 4 hàng rail × 50 | 830 | 126 terminal + 4 rail = 130 |
| BREADBOARD_630 | 63 cột × A–J | 630 | 126 terminal |
| BREADBOARD_100 | 2 hàng rail × 50 | 100 | 2 rail |

IDs đề xuất:

- Contact `terminal:A:01` … `terminal:J:63`.
- Node `terminal:AE:01` và `terminal:FJ:01`: mỗi node đúng 5 lỗ cùng cột; không nối qua rãnh hoặc sang cột khác.
- Contact rail `rail:top-positive:01` … `:50`, tương tự top-negative, bottom-positive, bottom-negative. Bản 100 dùng positive/negative.
- Node rail `rail:top-positive`, v.v.; không tách node vì khoảng trống hình học.
- Identity toàn cục là module ID + local contact/node ID. Các board instance không tự nối với nhau khi docking.

Pitch hiện tại 0.13 được giữ. Contact anchor ở throat của socket, local Y 0.309; mặt artwork/deck trên cùng local Y 0.330. Housing và socket vẫn có hình recess và contour hiện tại.

Catalog thêm capability/topologyRef riêng cho Breadboard; không tạo hàng trăm LogicalPort và không đưa contact vào FPGA resource map. Giữ `ports: []`. Cập nhật mô tả editor để phân biệt topology ảo với physical metadata chưa xác nhận; không điền giả `physical_contacts`, hardware `electrical_node_map` hoặc `routing_channels`.

## 2. Electrical endpoints và WireVisual

Các kiểu runtime tách biệt:

```ts
type ElectricalEndpoint =
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'contact'; moduleId: string; contactId: string }

type WireControlPoint =
  | { space: 'world'; position: { x: number; y: number; z: number } }
  | { space: 'module'; moduleId: string; position: { x: number; y: number; z: number } }

interface WireVisual {
  version: 1
  color: string
  routeMode: 'FREE' | 'ORTHOGONAL' | 'AUTO'
  controlPoints: WireControlPoint[]
  thickness: number // diameter, in existing scene units
  height?: number  // clearance above the supporting deck
  layer?: number
}
```

Persist nguyên schema 1.0:

```json
{
  "source": "BB1.contact:terminal:A:01",
  "destination": "U1.A1",
  "metadata": {
    "wireVisual": {
      "version": 1,
      "color": "#d8493f",
      "routeMode": "ORTHOGONAL",
      "controlPoints": [
        {"space": "module", "moduleId": "BB1", "position": {"x": -3.51, "y": 0.36, "z": -0.195}}
      ],
      "thickness": 0.036,
      "height": 0.03
    }
  }
}
```

`sourceEndpoint`/`destinationEndpoint` là hai endpoint được resolver parse từ `source`/`destination`; không lưu hai bản identity có thể lệch nhau. Contact encoding có đúng một dấu chấm để tương thích schema. Port string cũ `SW1.OUT` không đổi. Không dùng instance index hoặc tọa độ trong endpoint string.

WireVisual không có quyền thay đổi endpoint, direction, node ID hoặc simulation. Mọi command update visual nhận connection key và visual patch; không nhận endpoint thay thế. Unknown metadata ở các namespace khác được giữ.

File parser validate WireVisual version đã biết: enum, finite coordinates, màu hex, thickness dương, anchor module tồn tại, các số height/layer hợp lệ. Không đặt giới hạn bend nhỏ tùy tiện; 2 MB file limit hiện tại là giới hạn lưu. Version visual chưa hỗ trợ được giữ nguyên và render fallback an toàn, không diễn giải như connectivity. File cũ thiếu visual dùng AUTO và màu mặc định.

## 3. Net resolution cho authoring và simulation

Resolver thuần đăng ký component terminals và Breadboard contacts. Union theo thứ tự:

1. Intrinsic contact groups của từng module Breadboard.
2. Explicit jumper edges contact ↔ contact.
3. Explicit component-port ↔ contact và logical-port edges.

Không union các port trong cùng component với nhau; không suy ra pin insertion từ overlap. Resistor/IC nằm trên board chỉ có điện khi có explicit graph connection.

Resolver có thể đăng ký lazy các contact được tham chiếu và representative của intrinsic node tương ứng: không cần mở rộng mọi contact của hàng nghìn board chưa nối dây. Đại diện net và thứ tự lower deterministic, độc lập với thứ tự module/edge.

Frontend giữ quy tắc logical port wiring hiện tại: canonical output/input ordering, kiểm tra width, duplicate edge và driver. Contact là passive terminal, không có direction giả. Breadboard contact chỉ nối scalar port (width 1); bus cần adapter hiện có/tương lai. Dùng resolved nets để phát hiện driver conflict qua các lỗ khác nhau cùng strip hoặc rail. Floating contact/input nets được lưu; không bịa nguồn cho rail màu đỏ/xanh.

`connectEndpoints(first, second, visual)` hỗ trợ các cặp endpoint. `connectPorts` là wrapper tương thích. Nếu canonical hóa làm đổi thứ tự hai đầu, đảo controlPoints trong cùng command để hình dạng không đổi. Chọn lại đầu thứ nhất không commit; báo trạng thái để chọn endpoint khác hoặc hủy. Endpoint lỗi/duplicate giữ draft để sửa.

VirtualCompiler dùng resolver Python trên cùng topology data và lower mỗi resolved net thành DigitalNet với một output driver và các supported input terminals. Không có driver thì input giữ X. Nhiều driver, unknown contact và unsupported executable components vẫn trả lỗi rõ ràng. Metadata, pose và route không tham gia compile.

Capture/assignment aliases hiện vẫn là supported logical port IDs; không tự tạo capture/drive endpoint cho hàng trăm contact. Physical TopologyResolver, infrastructure routing, execution policy, safety/capability schemas và guarded execution tiếp tục dùng detected nodes/station profiles. Không cấp editor contact ID cho allocate_routes hoặc FPGA GPIO.

## 4. Socket picking và feedback

Housing và socket InstancedMesh đều nhận contact list của topology. Mesh lưu topology/profile reference và mảng instance contact IDs. `instanceId → contactId` là lookup chính xác, không tìm nearest hole.

Trong Wire mode, `pickEndpoint` phân loại logical port hoặc visible socket contact trước body selection. Chỉ cho pick endpoint thực sự nhìn thấy; không xuyên housing/component che phía trước. Invisible wire pick margin không được chặn contact socket hợp lệ. Ngoài Wire mode, click socket vẫn chọn/move board như hiện tại.

Một reusable Three.js contact halo/highlight và endpoint marker dùng cho hover/start/selection. Nếu dùng instance color, khởi tạo base colors đúng và chỉ reset/update instance liên quan. Không DOM cho các socket hoặc bend/segment handles. DOM port buttons hiện tại tiếp tục dùng cùng connect/draft API; không nhân chúng cho Breadboard.

Trong drawing, ưu tiên zoom-area đặc biệt → endpoint → route placement. Gizmo module không cướp click endpoint. Trong editing, ưu tiên selected bend handle → endpoint marker → selected segment → wire/body. Feedback dùng màu/palette và viền gold vừa phải, theo GUI hiện tại. Wire hit margin được kiểm tra theo CSS pixels tại segment/depth thực tế, không chỉ camera target depth; renderer vẫn chỉ dùng Three.js geometry.

## 5. Drawing và route solving

Wire defaults nằm trong workspace store: color, mode (mặc định AUTO), snap. Draft nằm ngoài CircuitGraph, gồm first endpoint, clicked control points, cursor/hover endpoint và coordinate frame. Không pointer capture giữa các click.

Click đầu bắt đầu draft. Khi rê, scene preview có path đầy đủ từ đầu → tất cả bends → cursor; nếu hover endpoint hợp lệ thì tail kết thúc ở anchor endpoint đó. Click vùng board không phải lỗ, vùng trống hoặc workspace surface tạo bend trên routing plane; không pan và không commit. Click endpoint hợp lệ kết thúc cả connection + visual trong một history entry. Click vào body che khuất/không có projection plane hợp lệ không tạo bend xuyên vật thể.

- FREE: nối thẳng theo thứ tự control points.
- ORTHOGONAL: dùng X/Z của routing frame (board local axes khi đang route trên board), chèn góc Manhattan 90° theo axis ưu tiên từ hướng đoạn trước; đoạn đầu luôn X trước Z. Không đổi axis ưu tiên theo so sánh độ dài gây lật góc khi Move đi qua đường chéo. Preview và committed path dùng cùng solver. Đoạn cắm/transition Y được xử lý riêng.
- AUTO: đường gọn deterministic, thấp và ưu tiên Manhattan trên Breadboard; luôn đi qua explicit user bends. Không tự đổi user bends theo camera hoặc scene sync.

Snap trên board dùng pitch 0.13 và origin của topology ở local coordinates; ngoài board dùng grid nhỏ 0.065. Alt tạm bỏ snap. Modifier không làm đổi endpoint identity. Có tolerance bỏ điểm trùng/segment độ dài 0, không làm mất bend có ý nghĩa.

Esc/right-click hủy toàn draft và preview, không history; right-button pointerdown phải bị consume trước OrbitControls khi đang draft/edit. Delete/Backspace khi drawing bỏ bend cuối; nếu chưa có bend thì giữ đầu dây và hướng dẫn Esc để hủy. Cùng phím khi đang chọn bend của committed wire chỉ xóa bend. Khi chỉ chọn cả wire thì Delete giữ hành vi disconnect hiện tại.

Camera orbit/pan/zoom vẫn theo mapping hiện tại ngoài thao tác route. Zoom-area, tool switch, placement, draft switch, Undo/Open, mất context/visibility hoặc explicit editor.cancel hủy transient wire state và khôi phục từ graph, theo lifecycle đang có.

## 6. Chỉnh wire đã commit

Chọn wire hiển thị reusable handles chỉ cho wire đó, gồm endpoints được khóa, bends và segment hover. Wire options có palette red/blue/green/yellow/orange/purple/black/white cùng route mode; dùng UI nhỏ cùng phong cách hiện có, không dựng GUI riêng cho từng dây.

- Kéo bend: pointer capture; project vào routing plane/frame; áp dụng snap/Alt; preview visual thuần; release commit một lần.
- Kéo segment: FREE tịnh tiến hai knot của segment; ORTHOGONAL kéo vuông góc segment. Nếu segment sát endpoint thì chèn knot chuyển tiếp để giữ endpoint và pin lead cố định.
- Double-click segment hoặc action Add bend: chèn điểm ở projected hit theo đúng segment order; ORTHOGONAL tạo elbow cần thiết.
- Chọn bend rồi Delete/Backspace hoặc Remove bend: xóa visual point; solver vẫn nối hai endpoint.
- Đổi màu hoặc mode: một command visual. Chọn màu trước vẽ chỉ đổi workspace default, không history; đổi trong draft cập nhật preview, chưa commit.

Solver trả segment/handle indices và ownership về control points, không dùng mesh vertex index làm persisted identity. AUTO/ORTHOGONAL có góc suy ra: chọn wire không mutate graph; lần edit đầu materialize solved interior knots vào draft để chỉnh đúng đoạn nhìn thấy. Chỉ commit khi hoàn tất edit. Chuyển mode giữ endpoint và control point ordering.

WireEditGesture lưu pointer owner, active draft/circuit revision, connection key, initial visual và edited draft. Chỉ owning pointer có quyền move/release/cancel. Gesture phải được clear trước releasePointerCapture; watcher selection phân biệt wire gesture với module gesture. Esc/lost capture rollback visual và không history. Delete wire hoặc đổi graph giữa drag vô hiệu hóa commit cũ.

## 7. Move/Rotate và route anchors

Endpoint position luôn do resolver contact/port local anchor → current model.localToWorld. Không lưu lại electrical identity từ ray intersection.

Bends route trên board lưu module-local point của board đó; bends ngoài board lưu world point. Primary routing frame chọn board đầu tiên trong hai endpoint, hoặc board sở hữu bend đầu nếu cả hai đầu là logical port; nếu không có board thì dùng world X/Z. Chuyển mỗi bend qua world rồi qua primary frame để solve; không trộn tọa độ local của các board khác nhau. Cùng board Move/Rotate biến đổi các bends và hai endpoint cùng một rigid transform, giữ hình dạng. Hai board khác nhau: mỗi board-local bend theo board sở hữu, world bends giữ nguyên, solver tính lại các đoạn chuyển tiếp đến endpoint; không dồn mọi điểm về nearest hole. Component Move/Rotate giữ endpoint local anchor, các đoạn nối cập nhật deterministic.

Wire incidence cache bao gồm cả endpoint owners và module owners của control points. Route trên board thứ ba vẫn cập nhật khi board đó di chuyển. Nếu xóa support module không phải endpoint owner, cùng command convert những local bends thành world coordinates theo pose cuối trước xóa; nếu xóa endpoint owner, wire bị xóa như hiện tại. Không để dangling visual anchor.

Preview model move/rotation thay đổi scene pose và wire projection, không graph. Commit pose ghi một history entry; board-local points không cần rewrite mỗi pointermove. Cancel sync lại graph-derived pose/path.

## 8. Render và hiệu năng

Breadboard route center mặc định cách mặt local Y 0.330 khoảng 0.030, diameter 0.036; đáy dây cao hơn deck. Hai đầu contact có đoạn pin thẳng ngắn xuống throat Y 0.309. Điểm bẻ giữ đoạn thẳng và góc rõ, bo ngắn, bán kính bị chặn bởi độ dài hai đoạn kề. Không quadratic Bézier nâng cao toàn dây.

Tách pure route solver khỏi geometry builder. Geometry gồm polyline straights và corner fillets với 6 radial sides, số sample tăng theo góc/độ dài cần thiết. Một mesh và pick polyline cho mỗi wire; handles/endpoint markers là shared hoặc instanced resources cho selection hiện tại.

Cache theo endpoint poses + resolved routing points + thickness/height/layer. Color-only update chỉ đổi material/base color, không rebuild geometry. Selection/hover dùng emissive/outline để giữ màu jumper thấy được; legacy wire không có visual có thể giữ màu gold khi selected nhằm tương thích phong cách cũ.

Giữ incident-only reconciliation và stable wire/material identities. Coalesce heavy preview geometry update theo render frame; không dựng lại tất cả wire khi một bend hoặc module thay đổi. Dispose geometry thay thế, pick buffers, preview, handle resources và instance buffers đúng lifecycle. Không thêm animation render loop khi idle.

Wire options UI được đưa vào obstacle collection hiện có để Gizmo không nằm sau panel. Không đổi camera math, viewport, placement hysteresis hoặc ViewCube contracts.

## 9. Những file cần thay đổi

| Phần | File chính |
| --- | --- |
| Canonical topology | contracts/design-models/breadboards.json; contracts loader; pyproject.toml; scripts/sync_breadboard_topologies.py; frontend generated JSON |
| Electrical frontend | electrical/BreadboardTopology.ts, endpoints.ts, nets.ts; types/circuit.ts; editorCatalog.ts |
| Geometry/picking | BreadboardSockets.ts; BreadboardHousing.ts; ComponentModel.ts; SceneManager.ts |
| Routing/render | pure wire route utilities; WireLayer.ts |
| Commands/history/file | stores/circuit.ts; stores/workspace.ts; services/files/circuitFile.ts |
| UX | useCircuitEditor.ts; ToolRail/wire options; CircuitWorkspace3D.vue; InspectorWindow.vue; ribbon descriptions |
| Simulation | netcircuit_sim/nets.py; engine.py; contracts topology loader |
| Provenance/docs | device-library/editor/components.json + generated catalog; device-library/README.md; editor usage/source analysis docs |

Không đổi Physical Lab schema, detected topology resolver, hardware allocations hoặc FPGA protocol để hỗ trợ wire authoring. API structural validation/schema 1.0 được giữ; regression tests xác nhận metadata mới đi qua nguyên vẹn.

## 10. Acceptance tests

| Nhóm | Evidence cần có |
| --- | --- |
| Topology | Đúng 830/630/100 contact; unique stable IDs; mỗi terminal node 5 contact; rail liên tục; không nối rãnh/cột/board instances; canonical/generated parity |
| Instance picking | Exact instanceId→contactId; invalid index không fallback gần nhất; hole hover đúng; Move/Rotate/model rebuild giữ identity; không pick xuyên occluder; Select socket vẫn chọn board |
| Connectivity | Contact↔contact, port↔contact, logical wiring cũ; reversed endpoints; intrinsic union; scalar/bus rule; driver conflict qua nhiều lỗ; invalid contact/duplicate atomic rejection |
| Drawing | Nhiều empty clicks thêm bends; live path đúng; valid endpoint commit; invalid endpoint giữ draft; không pan khi routing; AUTO/FREE/ORTHOGONAL deterministic; snap/Alt |
| Editing | Bend/segment drag; add/remove bend; protected endpoint pin leads; color/mode; owning pointer; cancel/foreign release; electrical signature không đổi |
| Transform | Board-local route cùng board rigidly Move/Rotate, kể cả yaw không phải 90°; hai board/component endpoints; support board thứ ba; delete support convert anchor; cancel pose restores path |
| History/file | Creation/drag/add/remove/color mỗi action một entry; pointermoves và draft bends zero entries; no-op zero; Undo/Redo; Save/Open cũ/mới; unknown metadata; malformed visual rejected atomically |
| Render/resources | Route thấp trên deck và short pin leads; slight corner rounding; metadata changes invalidate đúng cache; color-only không rebuild; unrelated buffers giữ nguyên; preview/handles disposed; hundreds of wires bounded object count |
| Simulation | Switch→board→gate→board→LED tương đương direct graph; rail/strip intrinsic conduction; floating X; multiple-driver rejection; mọi visual edits/Move/Rotate không đổi plan/capture |
| Physical boundary | Editor contacts không thành physical routes/GPIO; detected evidence/capability allocation tests và ConfigureVirtualCircuit hardware rejection giữ nguyên |
| Regression | Toàn bộ frontend interaction/scene/camera/resource/file tests, simulator/API/hardware tests, schema/provenance checks và production build |

Thay test hiện có về blank click xóa pending wire chỉ trong trường hợp wire draft active; giữ pan/clear-selection contract cho Select và Wire idle. Browser smoke test thực tế phải thao tác click socket, multi-bend, drag segment, màu, board rotation, Undo và Save/Open; dùng overhead và oblique view để kiểm tra deck clearance và occlusion.

## Ranh giới triển khai và review

Thiết kế này chưa thay đổi production code. Bước tiếp theo sau review thiết kế là implementation plan chia theo topology/net resolver → scene picking → route/render → interaction/history/UI → simulator/regressions, rồi triển khai và kiểm chứng. Không tự merge/push nhánh refactor.
