# CRUMB Wire Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Cho phép câu jumper qua contact/port, vẽ nhiều điểm bẻ và chỉnh route/màu sau khi commit, giữ nguyên electrical endpoints và các contracts hiện có.

**Architecture:** Dùng canonical BreadboardTopology chung cho frontend/simulator; endpoint resolver và net union độc lập với visual routing. CircuitGraph 1.0 lưu endpoint strings trong source/destination và WireVisual trong metadata.wireVisual. Pure routing/edit functions cung cấp path cho Three.js rendering và pointer gestures; graph commands chỉ commit ở ranh giới action.

**Tech Stack:** Vue 3, TypeScript, Pinia, Three.js hiện có; Python >=3.11, pytest và contracts package. Không thêm runtime dependency.

**Spec:** [Thiết kế đã duyệt](../specs/2026-10-14-crumb-wire-tool-design.md).

## Global Constraints

- Giữ CircuitGraph là source of truth, scene là projection, giữ Undo/Redo, Save/Open, Gizmo, placement preview, ViewCube, Workspace camera và Physical Lab contracts.
- Tọa độ, overlap, bend point và màu không quyết định connectivity.
- Power rail liên tục hết mỗi hàng, kể cả qua khoảng trống ở giữa hình học.
- BREADBOARD: 830 contacts / 130 intrinsic nodes; BREADBOARD_630: 630 / 126; BREADBOARD_100: thanh bus 100 / 2.
- Contact pitch 0.13; socket throat local Y 0.309; mặt deck/artwork local Y 0.330.
- Endpoint contact encoding: `BB1.contact:terminal:A:01`; logical encoding cũ: `SW1.OUT`; mỗi string có đúng một dấu chấm.
- WireVisual version 1; FREE/ORTHOGONAL/AUTO; default drawing mode AUTO; diameter 0.036; default deck clearance 0.030; 6 radial sides.
- Snap board-local pitch 0.13; workspace grid 0.065; Alt tạm bỏ snap.
- 2 MB file limit hiện tại là giới hạn lưu; không đặt giới hạn bend nhỏ tùy tiện.
- Không DOM cho các socket hoặc bend/segment handles; không animation loop khi idle.
- Không cấp editor contact ID cho allocate_routes hoặc FPGA GPIO.
- Không tự merge/push nhánh refactor.
- Reuse linked worktree hiện tại. `.git` đang chỉ đọc trong sandbox: lưu checkpoint bằng diff/tests, không thử commit/branch vượt quyền. Nếu môi trường sau này cho phép, commit theo checkpoint cuối mỗi task; không trộn user changes.

## Review Focus

1. Canonical output/input ordering đảo hai đầu nhưng route phải giữ hình dạng: Task 3 test đảo controlPoints cùng command.
2. Bends gắn với nhiều board có yaw bất kỳ: Task 4/6 test chuyển local→world→primary frame, giữ endpoints và không lật elbow theo độ dài.
3. Circuit/connection bị xóa hoặc thay revision trong lúc captured drag: Task 8 test stale release không commit vào wire được tạo lại có cùng endpoints.
4. Future WireVisual version/unknown metadata và file sát 2 MB: Task 3 test preserve/fallback/atomic rejection, giữ Save/Open limits.
5. Socket nhỏ sát wire/board bị occlude ở nhiều depth: Task 6 test endpoint priority, không pick xuyên vật thể, margin theo CSS pixels.

## File boundaries và thứ tự

| Task | File mới/chính | Trách nhiệm |
| --- | --- | --- |
| 1 | contracts/design-models/breadboards.json; contracts/breadboard_topology.py; sync script; electrical/BreadboardTopology.ts | Contact identity, node groups, local anchors và generated provenance |
| 2 | electrical/endpoints.ts; electrical/nets.ts | Resolve endpoints và union electrical nets, không import Three.js |
| 3 | wires/wireVisual.ts; electrical/modulePose.ts; types/circuit.ts; circuit store/file parser | Typed visual data, commands/history, persistence |
| 4 | wires/wireRouting.ts; wires/wireRouteEditing.ts | Pure route solving, snap, materialize/edit knots/segments |
| 5 | three/WireGeometry.ts; three/WireLayer.ts | Low jumper geometry, cache, preview, selection resources |
| 6 | three/BreadboardSockets.ts; BreadboardHousing.ts; ComponentModel.ts; SceneManager.ts | Instanced contact picking, live transforms và scene API |
| 7 | composables/useWireRouting.ts; useCircuitEditor.ts; workspace store | Click-click drawing, preview, cancellation, routing gestures |
| 8 | useWireRouting.ts; workbench/WireOptions.vue; CircuitWorkspace3D.vue; InspectorWindow.vue | Committed route editing và palette/mode UX |
| 9 | netcircuit_sim/nets.py; engine.py | Virtual compile qua intrinsic nodes/jumpers/terminals |
| 10 | integration/contract/resource/browser tests và usage/source-analysis docs | Kiểm chứng end-to-end và Physical Lab boundary |

Tasks 1→2→3→4 là foundation. Task 5 dùng 3/4; Task 6 dùng 1/2/5; Task 7 dùng 3/4/6; Task 8 dùng 7. Task 9 dùng 1 và thuật toán net của 2, có thể chạy độc lập với scene tasks sau khi interfaces đã cố định. Task 10 sau tất cả.

### Verification conventions

Frontend commands chạy tại `apps/web`: `npm.cmd test`, `npm.cmd run build`. Runner hiện bundle toàn bộ tests; không cần sửa test infrastructure để lọc.

Python commands chạy tại repository root bằng `& '.audit-runtime/Scripts/python.exe'` (runtime đã xác minh Python 3.12.14, có pytest/grpc_tools và các service dependencies). Mỗi pytest run dùng `--basetemp` là **đường dẫn mới, đã kiểm tra nằm trong** `.superpowers/crumb-wire/`; không dùng default temp ngoài workspace. Không tái sử dụng một basetemp chứa file cần giữ, vì pytest có thể dọn thư mục đó.

Set `NETCIRCUIT_DATABASE_URL` và `NETCIRCUIT_CAPTURE_DIR` sang thư mục verification riêng **trước pytest collection**, vì import app khởi tạo repository/capture store. Dùng `NETCIRCUIT_ENV=development`, `NETCIRCUIT_HARDWARE_MODE=simulation`, `NETCIRCUIT_SIMULATION_WORKERS=4`, `PYTHONUTF8=1`. TEMP/TMP của subprocess cũng nằm trong thư mục verification. PYTHONPATH gồm root, services/api, services/hardware-service, simulator/circuit-simulator; giữ pytest import mode mặc định. Chạy Python suite tuần tự, không xdist, vì một số RPC tests cùng codegen `contracts/generated`.

Checkpoint của task gồm red test evidence, green test evidence và diff chỉ của task. Không coi baseline tests là evidence cho code mới.

---

## Task 1: Canonical BreadboardTopology và provenance

**Files:**
- Create: `contracts/design-models/breadboards.json`, `contracts/breadboard_topology.py`, `scripts/sync_breadboard_topologies.py`.
- Create: `apps/web/src/data/breadboardTopologies.json`, `apps/web/src/electrical/BreadboardTopology.ts`.
- Modify: `pyproject.toml` package-data; `device-library/editor/components.json`; `apps/web/src/data/editorCatalog.json`; `apps/web/src/data/editorCatalog.ts`.
- Test: new `tests/contracts/test_breadboard_topology.py`, new `apps/web/tests/breadboard-topology.test.ts`, existing `tests/frontend/test_editor_catalog.py`.

**Interfaces:**
- `BreadboardContact = { contactId: string; localPosition: readonly [number, number, number]; nodeId: string }`.
- `BreadboardTopology = { id: string; version: 1; moduleTypes: readonly string[]; pitch: number; deckHeight: number; contacts: readonly BreadboardContact[] }`.
- TS: `getBreadboardTopology(type: string): BreadboardTopology | null`; `getBreadboardContact(type: string, contactId: string): BreadboardContact | null`; `contactFromInstance(type: string, instanceId: number): BreadboardContact | null`.
- Python: `get_breadboard_topology(module_type: str) -> Mapping | None`; `get_breadboard_contact(module_type: str, contact_id: str) -> Mapping | None`.
- Catalog: optional `breadboardTopologyRef?: string`, separate from LogicalPort/hardware metadata.

- [x] **1. Write failing topology/provenance tests.** Assert exact contact/node counts, finite positions, unique IDs, five-hole terminal membership, trench/column separation and rail continuity across holes 25/26. Assert board instances are not global nodes. Include exact instance order:

```ts
assert.equal(contactFromInstance('BREADBOARD', 0)?.contactId, 'terminal:A:01')
assert.equal(contactFromInstance('BREADBOARD', 629)?.contactId, 'terminal:J:63')
assert.equal(contactFromInstance('BREADBOARD', 630)?.contactId, 'rail:top-positive:01')
assert.equal(contactFromInstance('BREADBOARD', 730)?.contactId, 'rail:top-positive:26')
assert.equal(contactFromInstance('BREADBOARD', 829)?.contactId, 'rail:bottom-negative:50')
assert.equal(contactFromInstance('BREADBOARD', -1), null)
```

Also reject non-integer/NaN/out-of-range instance IDs. Verify 630 and 100 first/last contacts. Test canonical/frontend equality and catalog refs with empty logical ports.
- [x] **2. Run red.** `npm.cmd test`; Python pytest on `tests/contracts/test_breadboard_topology.py tests/frontend/test_editor_catalog.py`. Expected new topology API/data tests fail; record the relevant error.
- [x] **3. Add explicit canonical profiles.** Keep current column-major terminal order and half→group→hole→rail-row order; rail IDs count 01…50 across halves. Map A–E/F–J by declared nodeId. Include simulator alias `BREADBOARD_830` in the 830 profile without adding a duplicate palette component. Canonical JSON contains explicit contacts, not geometric connectivity inference.
- [x] **4. Implement lookup/loader and sync.** Cached lookup maps, immutable TS records, canonical data loaded from contracts package resources. Sync validates IDs/coordinates/node membership and supports `--check`; mismatch exits nonzero without rewriting. Add design-models JSON to package-data. Add catalog topology refs and regenerate existing catalog with `scripts/sync_editor_catalog.py`; do not populate physical station fields.
- [x] **5. Run green and checkpoint.** Both test sets pass; `scripts/sync_breadboard_topologies.py --check` passes. Inspect source/generated diff and package-data entries. Build contracts wheel with `pip wheel . --no-deps --no-build-isolation --wheel-dir <verification directory>/wheels`; inspect wheel ZIP for `contracts/design-models/breadboards.json` and test loader using that wheel rather than editable checkout. No new build dependency is needed. Suggested permitted-environment commit: `feat(wire): add explicit shared breadboard topology`.

## Task 2: Typed endpoint resolution và electrical net union

**Files:**
- Create: `apps/web/src/electrical/endpoints.ts`, `apps/web/src/electrical/nets.ts`.
- Modify: `apps/web/src/types/circuit.ts` for `ElectricalEndpoint`, `WireIdentity`, `Point3`.
- Test: new `apps/web/tests/electrical-nets.test.ts`.

**Interfaces:**
- `Point3 = { x: number; y: number; z: number }`; `WireIdentity = Pick<CircuitConnection, 'source' | 'destination'>`.
- `ElectricalEndpoint` is the port/contact discriminated union in the spec.
- `parseEndpoint(value: string): ElectricalEndpoint | null`; `formatEndpoint(endpoint: ElectricalEndpoint): string`.
- `ResolvedEndpoint = { endpoint: ElectricalEndpoint; serialized: string; module: CircuitModule; nodeKey: string; direction: LogicalPort['direction'] | null; width: number }`.
- `resolveEndpoint(modules: CircuitModule[], value: string): ResolvedEndpoint | null` consumes Task 1 and the current catalog. Contact direction is null.
- `ResolvedNet = { id: string; endpoints: string[]; drivers: string[]; inputs: string[]; width: number }`.
- `ElectricalNetResolution = { nets: ResolvedNet[]; endpointNetIds: Record<string, string>; unresolved: string[] }`.
- `resolveElectricalNets(graph: CircuitGraph): ElectricalNetResolution`.
- `assertConnectionAllowed(graph: CircuitGraph, first: string, second: string): WireIdentity & { reversed: boolean }` throws before graph mutation.

- [x] **1. Write failing resolver tests.** Build two board modules and a switch/LED; assert same-column A/E share a net, F/J share a different net, adjacent columns/boards remain separate, and declared rails are continuous. Add explicit jumper and port↔contact edges; reverse those edges and reorder module/connection arrays; resolved nets must be equivalent.

```ts
const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'net',
  modules: [{ id: 'BB', type: 'BREADBOARD' }, { id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'L', type: 'LED' }],
  connections: [{ source: 'S.OUT', destination: 'BB.contact:terminal:A:01' },
    { source: 'BB.contact:terminal:E:01', destination: 'L.IN' }] }
const result = resolveElectricalNets(graph)
assert.equal(result.endpointNetIds['S.OUT'], result.endpointNetIds['L.IN'])
assert.deepEqual(result.nets.find(net => net.drivers.includes('S.OUT'))?.inputs, ['L.IN'])
```

Test unknown contacts/module IDs, malformed strings, same exact endpoint, unordered duplicate edge, direct port direction/width rules, bus→contact rejection, and two drivers entering different contacts of one intrinsic node. Redundant contact jumper within an existing intrinsic net remains authorable.
- [x] **2. Run red.** `npm.cmd test` must fail in the new resolver tests/API imports.
- [x] **3. Implement parsing and union-find.** Use module ID + declared nodeId for contact node keys, module ID + portId for port keys, encoded without ambiguous concatenation. Register referenced contact/node representatives lazily. Never union component ports by module membership or geometry. Deterministic roots/output sorting; unresolved imported edges are reported, not converted into guessed terminals.
- [x] **4. Implement connection validation.** Preserve existing direct logical-port canonical ordering and scalar/bus widths. Resolve the candidate graph to detect hidden driver conflicts. New endpoints must resolve; existing unrelated unknown imported endpoints remain retained. Return `reversed` for the visual command layer.
- [x] **5. Run green and checkpoint.** All frontend tests pass; compare net output after pose/metadata changes and reordered input. Suggested commit: `feat(wire): resolve contact endpoints and intrinsic electrical nets`.

## Task 3: WireVisual commands, Undo/Redo và Save/Open

**Files:**
- Create: `apps/web/src/wires/wireVisual.ts`, `apps/web/src/electrical/modulePose.ts`.
- Modify: `apps/web/src/types/circuit.ts`, `apps/web/src/stores/circuit.ts`, `apps/web/src/services/files/circuitFile.ts`.
- Test: new `apps/web/tests/wire-visual.test.ts`; existing `editor.test.ts`, `workbench.test.ts`, `audit-file-lifecycle.test.ts`.

**Interfaces:**
- `WireRouteMode`, `WireControlPoint`, `WireVisual` exactly as spec; optional metadata typing retains arbitrary other namespaces.
- `wireKey(wire: WireIdentity): string` uses the ordered source/destination pair.
- `defaultWireVisual(): WireVisual`; `readWireVisual(connection: CircuitConnection): WireVisual` returns a normalized copy/fallback.
- `validateWireVisual(value: unknown, modules: CircuitModule[]): void` validates known version 1; unknown positive integer versions remain preserved with render fallback.
- `moduleLocalToWorld(point: Point3, module: CircuitModule): Point3`; `worldToModuleLocal(point: Point3, module: CircuitModule): Point3` normalize finite yaw before rotation.
- Store: `connectEndpoints(first: string, second: string, visual?: WireVisual): void`; retain `connectPorts(first, second): void` as wrapper; `updateWireVisual(wire: WireIdentity, visual: WireVisual): void` accepts no replacement endpoints.
- Existing `removeModule` converts support-only local bends to last world positions atomically before removing their module; endpoint-owner deletion removes the connection.

- [x] **1. Write failing command/round-trip tests.** Creation with two bends adds exactly one history entry; full visual survives export/import. Update color/route adds one entry and leaves source/destination/net signature unchanged; no-op adds none; Undo/Redo restores independent copies. Unknown metadata remains identical.

```ts
const store = useCircuitStore()
store.createDraft(); store.past = []
const a = store.placeModule('DIGITAL_SWITCH', { x: 0, y: 0, z: 0 })
const b = store.placeModule('LED', { x: 2, y: 0, z: 0 })
const visual = { ...defaultWireVisual(), routeMode: 'FREE' as const,
  controlPoints: [{ space: 'world' as const, position: { x: 1, y: 0.5, z: 1 } }] }
store.connectEndpoints(`${b}.IN`, `${a}.OUT`, visual)
assert.equal(store.graph!.connections[0].source, `${a}.OUT`)
assert.deepEqual(readWireVisual(store.graph!.connections[0]).controlPoints, [...visual.controlPoints].reverse())
```

Use at least two asymmetric bends in the actual reverse-order test to distinguish an incorrect no-op reversal. Test malformed enum/color/nonfinite coordinate/thickness/anchor, unknown visual version preservation, old files, near-2 MB export/import, and deletion of a supporting third board. Assert invalid edits/imports leave graph/history/saved state unchanged.
- [x] **2. Run red.** `npm.cmd test` fails on missing visual commands/validation behavior.
- [x] **3. Implement types and visual guards.** Known colors are six-digit hex; thickness finite >0; height finite >=0; layer nonnegative integer; every known-version local anchor exists. Preserve unknown metadata/version. Legacy default color remains `#71b3ce`; default diameter 0.036/mode AUTO. Module pose helpers agree with Three.js Y rotation and tolerate extreme finite yaw via modulo.
- [x] **4. Implement store commands and parser integration.** Validate all arguments before commitGraph. Connect one graph snapshot including visual; reverse controlPoints when endpoints normalize. Update only the visual namespace. Keep parser schema 1.0/top-level keys/file limits and legacy unknown-module retention. Validate known contact IDs on known Breadboard profiles; do not invent semantic ports for unknown imported types.
- [x] **5. Run green and checkpoint.** Full frontend suite passes. Confirm schema JSON/API models need no new top-level connection fields. Suggested commit: `feat(wire): persist visual routing with atomic history commands`.

## Task 4: Pure route solver, snap và bend/segment editing

**Files:**
- Create: `apps/web/src/wires/wireRouting.ts`, `apps/web/src/wires/wireRouteEditing.ts`.
- Test: new `apps/web/tests/wire-routing.test.ts`.

**Interfaces:**
- `WireRouteEndpoint = { endpoint: string; position: Point3; contactModuleId?: string }`.
- `WireRouteContext = { endpoint(value: string): WireRouteEndpoint | null; modulePose(id: string): CircuitModule | null }`; poses may be live scene previews.
- `RouteHandle = { index: number; position: Point3 }`; handle index refers to materialized interior knots, not mesh vertices.
- `RouteSegment = { index: number; start: Point3; end: Point3; fromHandle: number | null; toHandle: number | null; editable: boolean }`.
- `SolvedWireRoute = { points: Point3[]; handles: RouteHandle[]; segments: RouteSegment[]; frameModuleId: string | null; materializedControlPoints: WireControlPoint[] }`.
- `solveWireRoute(wire: WireIdentity, visual: WireVisual, context: WireRouteContext): SolvedWireRoute | null`.
- `snapWirePoint(point: Point3, module: CircuitModule | null, snap: boolean, bypass: boolean): WireControlPoint` uses board-local origin/pitch or world grid.
- Editing returns a new WireVisual: `materializeWireRoute(visual, route)`, `moveWireBend(visual, index, point: WireControlPoint)`, `insertWireBend(visual, route, segmentIndex, point: WireControlPoint)`, `removeWireBend(visual, index)`, `dragWireSegment(visual, route, segmentIndex, worldDelta: Point3, context)`.

- [x] **1. Write failing pure-route tests.** FREE goes through all bends in order. ORTHOGONAL horizontal segments have exactly one changing local X/Z coordinate; first diagonal expands X before Z. AUTO on Breadboard remains low, deterministic and passes explicit bends. Endpoints/pin lead coordinates are fixed and lead segments are not editable.

```ts
const interior = route.points.slice(1, -1)
assert.ok(interior.every(point => point.y >= 0.360 - 1e-6))
assert.equal(route.points[0].y, 0.309)
assert.equal(route.points.at(-1)!.y, 0.309)
assert.ok(route.segments.filter(s => s.editable).every(s =>
  Math.abs(s.start.x - s.end.x) < 1e-6 || Math.abs(s.start.z - s.end.z) < 1e-6))
```

Apply X/Z assertions in primary local frame for rotated boards. Add yaw 37°/90°/180°, two boards and third-board bends, different endpoint elevations, repeated/zero-length points, extreme finite poses, snap/Alt, and endpoint motion across the diagonal without elbow flipping. Editing tests move/add/remove bend and drag interior/endpoint-adjacent segments; every result preserves the supplied wire identity and pinned leads.
- [x] **2. Run red.** `npm.cmd test` fails in new solver/edit tests.
- [x] **3. Implement solving and projection.** Choose primary frame from first contact endpoint, then second, then first support board, otherwise world. Resolve each point through its own owner to world before solving in primary frame. Contact lead goes throat→deck clearance; no arch midpoint lift. Height/layer affect clearance consistently; thicker wires stay above deck. ORTHOGONAL first X then Z, subsequent elbow orientation follows preceding segment deterministically. Return semantic handles/segments before fillet geometry. If finite inputs overflow during composition, return null and retain graph data; never upload NaN/Infinity geometry or guess another endpoint.
- [x] **4. Implement visual editing functions.** Materialize solved interior route only into an edit draft; protected pin leads stay generated. FREE segment translation moves its two interior ends; ORTHOGONAL translation uses perpendicular delta in primary frame. Endpoint-adjacent drag inserts transition knots. Preserve anchor ownership when possible; derived knots inherit primary board frame or world. Add/remove operate on ordered visual knots, never endpoints or net data.
- [x] **5. Run green and checkpoint.** Tests prove immutable inputs and equality of net signatures before/after every edit. Suggested commit: `feat(wire): solve and edit free and orthogonal jumper routes`.

## Task 5: Low jumper geometry, reconciliation và preview resources

**Files:**
- Create: `apps/web/src/three/WireGeometry.ts`.
- Modify: `apps/web/src/three/WireLayer.ts`.
- Test: new `apps/web/tests/wire-layer.test.ts`; existing `scene-reconciliation.test.ts`, `resource-lifecycle.test.ts`.

**Interfaces:**
- `buildWireGeometry(route: SolvedWireRoute, diameter: number): BufferGeometry` rounds short corners without moving pinned endpoints; six radial sides.
- Retain `createWireLayer(endpointPosition: (endpoint: string) => Vector3 | null, routeContext?: WireRouteContext)` so existing scene integration compiles before Task 6.
- Retain `group`, `sync`, `updateModule`, `highlight`, `dispose`; add `previewVisual(wire: WireIdentity, visual: WireVisual | null): void`, `previewDrawing(wire: WireIdentity, visual: WireVisual, cursor: Point3 | null): void`, `clearDrawing(): void`, `flush(): void`, `route(wire: WireIdentity): SolvedWireRoute | null`.
- Add `hover(wire: WireIdentity | null): void`, `selectHandle(index: number | null): void`; handles/preview live in a separate transient group, keeping committed `group.children` as wire records.

- [x] **1. Write failing layer tests.** Assert low centerline/pin leads, rounded corners bounded by adjacent lengths, finite normals/buffers, multi-bend geometry and no arch. Color-only edit preserves geometry/material identity; route change replaces only that wire geometry; unrelated buffers remain. Check unknown endpoint remains in graph but has no mesh.
- [x] **2. Run red.** `npm.cmd test` shows the new rendering/cache/resource expectations failing.
- [x] **3. Implement geometry and style reconciliation.** Keep one mesh + pick path per committed wire, semantic route data separate from sampled geometry. Cache normalized route/pose/thickness/height/layer signature; update only material for color. Use mild emissive/outline hover/selection on explicit colored wires; preserve legacy gold selection behavior. Geometry chooses bounded corner samples, not a fixed dense sample count for every straight segment.
- [x] **4. Implement deferred previews and ownership.** updateModule/preview methods mark dirty records; flush coalesces latest visual/pose once per frame. sync of committed graph is immediately consistent. Incidence includes endpoint owners and control-point module IDs. Picking can flush pending previews before testing. Reuse handles for only the selected wire; clear/delete/dispose releases every preview/pick/handle buffer and cancels pending work.
- [x] **5. Run green and checkpoint.** For 300 committed wires, verify bounded object counts, one affected record/geometry update for a route edit, latest-only preview rebuild, unchanged sync allocates nothing, and all resources release on dispose. Existing scene tests that inspect previews must flush their controlled render frame before inspecting geometry; keep their original assertions. Suggested commit: `feat(wire): render efficient low polyline jumpers and previews`.

## Task 6: Topology sockets, exact picking và SceneManager integration

**Files:**
- Modify: `apps/web/src/three/BreadboardSockets.ts`, `BreadboardHousing.ts`, `ComponentModel.ts`, `SceneManager.ts`.
- Test: existing `apps/web/tests/scene.test.ts`, `scene-reconciliation.test.ts`; new `apps/web/tests/breadboard-picking.test.ts`.

**Interfaces:**
- Socket mesh instance list derives directly from BreadboardTopology; keep `userData.breadboardSockets` and add topology/profile + contactId array. Housing deck holes use those same positions.
- `EndpointPick = { kind: 'port' | 'contact'; id: string; endpoint: string; point: Vector3; contactId?: string }`.
- Scene add: `pickEndpoint(x: number, y: number): EndpointPick | null`, `hoverEndpoint(endpoint: string | null): void`.
- Extend `endpointPosition(endpoint: string): Vector3 | null`; existing generic `pick` keeps body behavior outside explicit endpoint picking.
- Scene add: `wireRoute(wire: WireIdentity): SolvedWireRoute | null`, `previewWireVisual(wire, visual: WireVisual | null): void`, `previewWireDrawing(wire, visual, cursor: Point3 | null): void`, `clearWireDrawing(): void`.
- `WireEditPick = { kind: 'bend'; wire: WireIdentity; index: number; point: Vector3 } | { kind: 'segment'; wire: WireIdentity; index: number; point: Vector3 }`.
- Scene add: `pickWireEdit(x, y, wire: WireIdentity): WireEditPick | null`, `wireRoutingPoint(x, y, frameModuleId: string | null, visual: WireVisual): Point3 | null`, `hoverWireEdit(hit: WireEditPick | null): void`.

- [x] **1. Write failing scene tests using real raycasts.** Project known socket centers, verify exact IDs and highlight after hover; repeat after translation/yaw and model rebuild. Reject invalid instance IDs without nearest lookup. Verify body picking still selects the board. Place an occluding component ahead of a socket; endpoint pick must return no hidden contact. A nearby invisible wire pick margin must not steal a visible contact.
- [x] **2. Run red.** `npm.cmd test` fails on missing endpoint/edit APIs or discarded instanceId.
- [x] **3. Thread topology through housing/model.** Replace duplicated position generation with topology contacts; compatibility wrapper may retain breadboardSocketPositions signature for existing callers/tests. Translate instance positions from contact anchors to existing socket geometry origin correctly; do not double-add throat Y. Extend anchor resolution through Task 2 and model.localToWorld. Shared contact marker sits at mouth height; clear old hover on sync/remove/dispose.
- [x] **4. Implement pick/projection/preview APIs.** Preserve physical occlusion with distance-sorted component hits. Use actual socket intersection.instanceId, then lookup contactId. Resolve wire edit handles/segments using CSS pixel distance at their real projected depth and exclude protected pin leads. Project board bends onto the routing plane, not ground Y=0; reject occluded invalid placement surfaces. Provide live pose context from model position/yaw to Task 4/5.
- [x] **5. Integrate frame flushing and verify green.** Flush dirty wire previews before render and pick. Test fixtures drive actual scheduled callbacks before inspecting preview geometry. Update thin-wire margin test to sample the rendered route instead of assuming the obsolete Bézier midpoint, retaining its four-pixel assertion. Verify incident-only Move/Rotate updates, arbitrary yaw, cancellation restoration, third-board support and clear/dispose. Suggested commit: `feat(wire): pick breadboard contacts and attach routes to live models`.

## Task 7: Click-click interactive drawing

**Files:**
- Create: `apps/web/src/composables/useWireRouting.ts`.
- Modify: `apps/web/src/composables/useCircuitEditor.ts`, `apps/web/src/stores/workspace.ts`, `apps/web/src/components/workbench/CircuitWorkspace3D.vue`.
- Test: new `apps/web/tests/wire-interaction.test.ts`; existing `interaction.test.ts`, `camera-navigation.test.ts`.

**Interfaces:**
- Workspace defaults: `wireColor: string` initially `#d8493f`; `wireRouteMode: WireRouteMode` initially AUTO; `selectedWireBend: number | null`. Existing pendingPort stays the UI mirror for first endpoint.
- `useWireRouting(canvas: Ref<HTMLCanvasElement | undefined>, manager: () => ReturnType<typeof createSceneManager> | undefined)` owns transient drawing/edit state and uses Pinia stores.
- Public controller: `connect(endpoint: string): void`, `pointerDown(event: PointerEvent): boolean`, `pointerMove(event: PointerEvent): boolean`, `pointerUp(event: PointerEvent): boolean`, `keydown(event: KeyboardEvent): boolean`, `contextMenu(event: MouseEvent): boolean`, `cancel(): void`, `lostPointerCapture(event: PointerEvent): boolean`, `pointerLeave(): void`.
- Boolean true means consumed; parent must not also pan/select/gizmo-edit. Expose computed `drawing`, `editing`, `hint` and `controlPoints` for feedback/tests; no persistent graph mutation from those refs.

- [x] **1. Write failing interaction tests on production scene/controller.** Wire→click A→pointerMove→blank click→blank click→click B produces one connection with multiple bends and one history entry. Preview includes every clicked bend plus cursor/hover endpoint; graph unchanged until commit. Test contact↔contact, logical↔contact and existing DOM logical-port connect path. Invalid destination preserves draft/error; first-endpoint repeat never commits.
- [x] **2. Run red.** `npm.cmd test` fails because blanks pan/clear the draft and there is no preview.
- [x] **3. Implement drawing state and event consumption.** Wire-active endpoint picking precedes component gizmo/body behavior, after special zoom-area/placement handling. Once drawing, empty valid surface clicks add snapped bends; no left pan. Wire idle keeps existing empty-surface pan/clear behavior. Logical DOM connect uses this same state machine. Tool transition cancellation must execute before starting a new draft in connect; avoid an asynchronous tool watcher canceling the endpoint just chosen.
- [x] **4. Implement cancellation/modifiers.** Esc/right-click clear drawing; consume right-button pointerdown before OrbitControls starts. Delete/Backspace pop last drawing bend, retain start when no bends remain. Alt bypasses snap only. Foreign pointers do not finish captured gestures. Tool/placement/zoom-area/graph/draft/context/visibility changes cancel transient state, release captures and restore graph visuals; ordinary hover updates highlight correctly.
- [x] **5. Run green and checkpoint.** Replace the old blank-click-pending-clear expectation only for active wire drawing. Keep Select/idle pan, placement, gizmo, zoom-area, ViewCube and normal right/middle camera mappings covered. Test bursts of no-button pointerMove: latest preview only, zero history, no DOM per contact/wire. Suggested commit: `feat(wire): draw multi-bend jumpers directly through contacts`.

## Task 8: Committed route editing và palette/mode UX

**Files:**
- Modify: `apps/web/src/composables/useWireRouting.ts`, `useCircuitEditor.ts`, `stores/workspace.ts`.
- Create: `apps/web/src/components/workbench/WireOptions.vue`.
- Modify: `CircuitWorkspace3D.vue`, `ToolRail.vue`, `apps/web/src/components/windows/InspectorWindow.vue`, `apps/web/src/data/ribbon.ts`.
- Test: `apps/web/tests/wire-interaction.test.ts`; new `apps/web/tests/wire-options.test.ts`; existing `interaction.test.ts`, `workbench.test.ts`.

**Interfaces:**
- Extend controller with `setColor(color: string): void`, `setRouteMode(mode: WireRouteMode): void`, `addBend(): void`, `removeSelectedBend(): void`, `doubleClick(event: MouseEvent): boolean`.
- `WireEditGesture` contains owner pointer, draft ID, graph/connection revision identity, initial visual, materialized draft, picked semantic handle/segment and initial world point. It lives inside the routing controller so module-selection watchers cannot confuse it with a module gesture.
- UI consumes controller methods; WireOptions is shown once when Wire mode or a selected wire is active, never once per wire. Add `.wire-options` to existing gizmo obstacle queries.

- [x] **1. Write failing editing tests.** Select wire without changing graph; drag each bend, drag interior and endpoint-adjacent segment, double-click/add bend, remove bend, change color/mode. Each finished edit records exactly one entry and preserves endpoints/net signature; pointerMove records none. Esc/lost capture/foreign release restores prior visual. Delete selected bend does not delete wire; Delete whole-wire selection disconnects with Undo.

```ts
const endpointsBefore = { source: wire.source, destination: wire.destination }
const steps = circuit.past.length
// Drive actual projected handle pointerDown, many pointerMove events, then pointerUp.
assert.deepEqual({ source: edited.source, destination: edited.destination }, endpointsBefore)
assert.equal(circuit.past.length, steps + 1)
assert.deepEqual(resolveElectricalNets(circuit.graph!).nets, electricalNetsBefore)
```

Test delete/recreate same connection while dragging; stale release cannot update it. Test supporting-board deletion, Undo during drag, mode switch during drawing, and changing color in a draft adds no history.
- [x] **2. Run red.** `npm.cmd test` fails on missing handles/edit/palette workflows.
- [x] **3. Implement captured edit lifecycle.** Materialize into transient draft, use Task 4 edit functions, preview via Task 6, commit once through updateWireVisual. Clear gesture before releasing capture. Recheck draft/graph revision/connection identity at release. Cancel edits when endpoint/anchor disappears; no fallback reconnect to another socket. All edit entrypoints share the immutable visual command path.
- [x] **4. Build compact existing-style options.** Eight labeled swatches: red `#d8493f`, blue `#397ec6`, green `#3a9d58`, yellow `#e2c444`, orange `#dc8737`, purple `#8656a8`, black `#24272a`, white `#e6e6de`. FREE/ORTHOGONAL/AUTO selector, Add bend/Remove bend when applicable; clear hover/selection and pinned endpoint feedback. Defaults change without history; selected-wire changes commit once. Keep English UI copy consistent with current app and include concise drawing/snap/cancel help. Inspector uses generalized endpoint selection without hundreds of contact options; actual hole selection stays on canvas.
- [x] **5. Run green and checkpoint.** Component runtime tests verify palette before/after drawing, keyboard labels, overlay obstacle registration and absence of per-wire DOM. Frontend tests/build pass; user bends survive mode changes/Save/Open. Suggested commit: `feat(wire): edit jumper bends segments and colors without reconnecting`.

## Task 9: Simulator net union và visual invariance

**Files:**
- Create: `simulator/circuit-simulator/netcircuit_sim/nets.py`, `simulator/circuit-simulator/tests/test_breadboard_nets.py`.
- Modify: `simulator/circuit-simulator/netcircuit_sim/engine.py`.
- Test: `simulator/circuit-simulator/tests/test_events.py`, `services/hardware-service/tests/test_virtual_execution.py`.

**Interfaces:**
- `resolve_design_nets(graph: dict, directions: dict[str, str]) -> tuple[tuple[str, tuple[str, ...]], ...]`; returns sorted (output driver, sorted inputs) pairs; raises ValueError for invalid endpoint/duplicate/multiple drivers.
- Uses Task 1 canonical loader; no Three.js/visual parser. Existing VirtualExecutionPlan fields and supported device models remain unchanged. VirtualCompiler translates ValueError to SimulationError('UNEXECUTABLE').
- Unconnected/floating supported inputs stay in directions and evaluate X; contacts do not enter directions/initial_sources/capture aliases as GPIO-like signals.

- [x] **1. Write failing Python tests.** Switch→A01 and E01→gate input compiles and captures identically to direct wiring. Add contact jumper to another strip/rail and reversed edge order. Terminal groups/rails/board instances match TS fixtures. Two drivers via different holes fail; invalid contact fails; no driver remains X; unknown executable component still fails.

```python
assert VirtualCompiler().compile(board_graph).nets == VirtualCompiler().compile(direct_graph).nets
assert run_plan(VirtualCompiler().compile(board_graph), config) == run_plan(VirtualCompiler().compile(direct_graph), config)
# Repeat after moving/rotating BB and replacing every metadata.wireVisual field.
```

Use existing graph/run helpers from test_events and explicit contact IDs in new fixtures. Include worker/VirtualHardwareStation apply→prepare→capture→reset with the board graph; allocation lists remain empty.
- [x] **2. Run red.** Python pytest on simulator tests plus `services/hardware-service/tests/test_virtual_execution.py` using fresh workspace basetemp. Expected current compiler rejects contact endpoints.
- [x] **3. Implement union/lowering.** Register all supported terminals from directions, referenced contact representatives from canonical topology, then explicit edges. Reject invalid/duplicate/self endpoints and conflicting drivers; keep floating nets. Lower one source to sorted input fanout; return no artificial sources for rails. Lazy contact registration keeps graph-limit work bounded. Preserve compiler module/device validation, event budgets, unconnected X and deterministic ordering.
- [x] **4. Integrate virtual compile only.** Stop treating Breadboard as an executable device but let its contacts resolve in nets. No change to hardware detected topology/allocations, physical execution policy, raw FPGA protocol or virtual capture alias contract. Confirm arbitrary visual metadata/pose has no effect on compiled plan/capture.
- [x] **5. Run green and checkpoint.** Simulator and virtual station tests pass, plus current API topology hardening tests. Suggested commit: `feat(sim): resolve breadboard intrinsic nodes and jumper nets`.

## Task 10: Contract/regression/browser verification và documentation

**Files:**
- Modify tests: `tests/contracts/test_circuit_schema.py`, `services/api/tests/test_circuit_validation.py`, `services/api/tests/test_topology_execution_hardening.py`, `services/api/tests/test_lab_lifecycle.py`, `services/hardware-service/tests/test_physical_station.py`, `services/hardware-service/tests/test_rpc_lifecycle.py`.
- Extend: frontend wire tests, `scene-reconciliation.test.ts`, `resource-lifecycle.test.ts`, `audit-file-lifecycle.test.ts`, `camera-navigation.test.ts`.
- Modify docs: `apps/web/README.md`, `device-library/README.md`, `docs/CIRCUIT_SPEC.md`, `docs/DEV_LOG.md`, `docs/CHANGELOG.md`.
- Create: `docs/SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md`, `docs/verification/2026-10-14-crumb-wire-tool.md`.

**Interfaces:** No new production contracts. Regression consumes Tasks 1–9. Physical station resource/node IDs remain advertised/detected values; editor contact strings cannot become routable aliases by appearance.

- [x] **1. Add boundary regressions and run red where new assertions expose a gap.** CircuitGraph 1.0 accepts contact endpoint strings + metadata.wireVisual and still rejects extra connection top-level fields/null metadata. Reuse `setup_manager`/`LabGateway`/`DeferredJobs` in test_lab_lifecycle: hardware experiment carrying editor contacts still uses observed N1/N2 bindings and r1/r2 allocations, never apply_circuit. Missing observed binding gives BLOCK_UNEXECUTABLE. Reuse `ProtectedTestDriver`/`station`/`plan` in test_physical_station: editor contact substituted for node_id or resource_id is rejected before driver prepare. Existing RPC server fixture rejects ConfigureVirtualCircuit on physical mode with UNEXECUTABLE even for a structurally valid contact graph. Add Save/Open→Undo/Redo→rotate→route edit and resource disposal scenarios.
- [x] **2. Close integration gaps only within approved scope.** Verify selected handle/draft cancels on context loss/visibility/resize/ViewCube and late file imports cannot revive stale edits. Fix the responsible implementation task and rerun its red/green checks; do not weaken assertions or broaden simulator models.
- [x] **3. Run the full verification matrix once implementation is stable.** At root using the isolated environment above: `scripts/generate_hardware_rpc.py`, topology sync `--check`, editor catalog provenance test, `scripts/check_context.py`, `scripts/sync_lab_contracts.py --check`, then `-m pytest -q tests services/api/tests services/hardware-service/tests simulator/circuit-simulator/tests --basetemp <fresh verified workspace path>`. At apps/web: `npm.cmd test`, `npm.cmd run build`. Required result: exit 0, no failed/error tests; report skips and existing warnings. Runtime presently has no iverilog/vvp, so a documented FPGA behavioral skip is not proof of RTL verification; no FPGA implementation change belongs to this feature.
- [ ] **4. Run real browser smoke test (permission denied; omitted per user decision).** Start local web app through the existing runtime, verify overhead and oblique views: all three board variants; color first; socket hover; multiple blank bends; endpoint commit; FREE/ORTHOGONAL; bend/segment drag; add/remove; color after; same/different board Move/Rotate; cancel/snap modifier; Undo/Redo; actual Save/Open. Test logical port wiring, placement/gizmo, ViewCube/camera and 300 wires. Record screenshots and actual observations; no synthetic screenshot evidence. No requirement to launch visible native helper windows.
- [x] **5. Update docs and self-check completeness.** Usage explains endpoint vs visual data, continuous rails, default 100 bus strip, explicit component connections and controls. Source analysis records final APIs, simulator limits and unchanged Physical Lab boundary. Verification records exact commands/results and browser evidence, including existing warnings. Checklist every spec acceptance row against a concrete test/evidence path. Suggested permitted-environment commit: `test(wire): verify crumb workflow and preserve lab contracts`.
- [x] **6. Final review and handoff.** One fresh reviewer reported three Important findings; all have RED→GREEN regressions and the final full suite/build passes. Browser evidence remains unavailable as recorded above. Leave work reviewable in this worktree; no merge/push.

## Spec coverage / self-review

Topology/contact identity: Tasks 1/2/6. Data separation and legacy schema/file compatibility: Tasks 2/3/10. All route modes/snap/preview: Tasks 4/5/7. Committed edit/color/history: Tasks 3/4/8. Move/Rotate/support ownership: Tasks 3/4/5/6. Low render and hundreds-of-wires lifecycle: Tasks 5/6/10. Intrinsic/jumper/terminal union and Physical Lab boundary: Tasks 2/9/10. Every review-focus condition has a named task/test. API names in each dependent task use the Interfaces blocks above.

## Execution handoff

User đã duyệt kế hoạch và chọn Native; implementation, automated verification và một fresh review hoàn tất. Ba Important findings đã có test RED→GREEN trong một lượt sửa cuối; frontend309 PASS, Python367 PASS/1 tool skip; browser smoke bị từ chối quyền. Giữ source/diff và evidence trong refactor để user review; không merge/push. Không tạo chat hoặc dispatch re-review mới.
