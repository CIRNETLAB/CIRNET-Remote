# Báo cáo triển khai Component Placement / Component Info

Ngày nghiệm thu: **2026-10-18**. Branch: `refactor`; baseline bắt đầu: `bb0ceb1`.
Thay đổi được để **chưa commit**, theo yêu cầu người dùng tự commit. Không push,
merge, deploy hoặc reset repository. Bàn giao **chỉ file báo cáo**, không đóng gói ảnh/clip.

## Phạm vi và nguồn đối chiếu

Đã đọc toàn bộ `PROMPT_CODEX_Component_Placement_CRUMB_netCircuit.md`, authority
`docs/ARCHITECTURE.md` Lab-First v3.1, Contracts và các consumer hiện hành trước khi sửa.
Đã đối chiếu cả hai MP4 bằng Chromium decode: CRUMB dài 199,467 giây, netCircuit
151,967 giây; 180 khung hình lấy mẫu xuyên suốt giúp kiểm tra các tư thế và UI.
Không suy mã nội bộ hay chính xác nút chuột của CRUMB từ các khung hình.

## Đã triển khai thực tế

1. **Contracts và persistence:** thêm CircuitGraph 1.2 / `FlexibleMountV1`, profile
   cơ học revisioned, generated Python/TS/runtime validators và fixtures dùng chung.
   Giữ nguyên schema Graph 1.0/1.1, rigid mount v1 và compatibility baselines.
   Body-center pose 3D YXZ, contact bindings và controls đều board-local; không lưu
   world pose trùng lặp, Three.js object hoặc mesh. Client/server cùng kiểm tra finite,
   revision, stable pin, ownership, hole occupancy, bounds, bend radius và collision 3D.
2. **Placement thật:** palette/Add mở draft Info trước khi tạo instance; click đầu
   neo chân A/+, click thứ hai hợp lệ commit một command. HTML drop chỉ neo chân đầu.
   Right-click ngắn thêm bend, Backspace bỏ bend, Escape hủy; right-drag vẫn Orbit.
   Invalid giữ draft và diagnostic, không tự chọn lỗ khác. Solver bounded/deterministic
   cho axial nằm/đứng/nghiêng và radial đứng/nghiêng; kích thước thân/đường kính chân giữ nguyên.
3. **Chỉnh trực tiếp:** handle kéo riêng từng chân, giữ nguyên binding chân còn lại;
   handle nâng/nghiêng thân giữ contacts và controls. Move/gizmo riêng dịch cả assembly
   và revalidate exact contacts. Preview coalesce theo frame; commit một Undo; hủy,
   mất capture, đổi document/principal trả quyền camera và rollback giao dịch.
4. **Renderer thống nhất:** body rigid tách khỏi continuous lead sweep có bo góc;
   pin target, label, highlight, outline, wire endpoints, selection preview và thumbnail
   dùng resolved geometry. Cập nhật/dispose geometry có ownership, giữ shared thumbnail
   renderer/cache. Undo chuyển flexible về rigid rebuild đúng model và đầu dây.
5. **Document integration:** copy/paste, Move selection, move/rotate board, delete,
   Undo/Redo, Save/Open và recovery giữ đúng assembly/bonds/metadata. Legacy lead
   properties vẫn đọc/render; chỉ chuyển qua command migration xác định, có Undo.
6. **Generic UI và properties:** descriptor mới Resistor, Capacitor, Diode, Zener
   Diode, LED, Buzzer, Transistor; một palette Capacitor với Type. Exact legacy IDs
   vẫn tồn tại. Component Info xám than, preview vừa khung, field/unit ngắn, một Update
   xanh; bỏ Edit Leads và SKU/mô tả dài khỏi UI chính. Giữ advanced ratings và opaque
   properties; enum/color/schema validation đồng bộ, SI per-instance không làm tròn sai.
   Đổi subtype tụ map A/B ↔ PLUS/MINUS và wire endpoints trong một atomic command.
7. **API và assignment:** opt-in API V2 cho Graph 1.2 document/validate/preview/Create;
   AssignmentDefinition V2 và authoring/student/instructor V2 giữ CAS, immutable revisions,
   RBAC, publication, redaction và grading của W7. Legacy readers/mutations không tương
   thích nhận lỗi version rõ trước ghi dữ liệu. Mutation chọn đúng version trước gửi;
   fallback GET chỉ khi lỗi unsupported-version cụ thể, không replay mutation.
8. **Execution consumer:** resistor/LED model hiện có nhận giá trị instance, gồm LED
   Vf/Imax. Màu đổi vỏ/preview; chỉ kết quả thực thi làm LED phát sáng. Không giả solver
   diode nonlinear, transient capacitor, buzzer hay BJT; hardware identity, Safety Gate
   và physical analog capability giữ đúng authority hiện hành.

Các module/controller/adapter mới và quyết định chi tiết: [Component placement](../COMPONENT_PLACEMENT.md),
[canonical flexible mount](../../contracts/design-models/flexible-placement.md),
[implementation plan](../superpowers/plans/2026-10-17-crumb-component-placement.md).

## Migration và compatibility

- Import/save thông thường không tự chuyển Graph 1.0/1.1 sang flexible.
- `convertModuleToFlexible` / Python `migrate_legacy_mount` là thao tác rõ ràng,
  giữ IDs, contacts, properties, connections và unknown metadata; failure không mutate input.
- Flexible assembly thuộc board; xóa board xóa assembly mới và incident edges trong
  cùng một Undo. Rigid mount cũ giữ hành vi detach. Tooltip Delete mô tả cascade.
- Buzzer hiện có rigid descriptor; BJT ba chân, DIP/switch/bench tiếp tục strategy
  riêng, không đưa vào solver hai chân. Một flexible assembly V1 chỉ dùng một board.
- Gắn reference Graph 1.2 nâng assignment definition lên 2.0 rõ ràng; definition 1.0
  và các frozen public schemas không đổi. Không cần migration SQL mới.

## Kết quả kiểm chứng cuối

| Gate / lệnh | Kết quả thực tế |
|---|---|
| `.audit-runtime/Scripts/python.exe -m pytest -q` | **1070 passed, 1 skipped**, 250,20 giây |
| `cd apps/web; npm test` | **1117 passed, 0 failed**, 79,57 giây; gồm test typecheck |
| `cd apps/web; npm run build` | **PASS**; vue-tsc + Vite, 309 modules |
| `node scripts/e2e.mjs test --reporter=line --forbid-only --output=.test-build/placement-acceptance` | **18 passed**, 3,7 phút; API shutdown exit 0 |
| `npm run check:boundaries` | **PASS**, 201 source modules |
| `vue-tsc --noEmit -p tsconfig.e2e.json` | **PASS** |
| `scripts/generate_contracts.py --check` | **PASS** |
| `scripts/export_openapi.py --check` | **PASS** |
| `scripts/check_public_compatibility.py` | **PASS**, không sửa frozen anchors |
| `scripts/sync_editor_catalog.py --check` | **PASS**, 84 editor types / 63 physical parts |
| `scripts/check_context.py` và `git diff --check` | **PASS** |
| `scripts/check_contract_package.py` | **PASS**, bốn wheel sạch chạy ngoài checkout với Python `-I` |
| Graph 1.2 REST → hardware RPC → process simulator | **PASS**, capture thật, assignment grading và immutable reference revision |
| Independent code review | Bốn phát hiện đã xử lý; kiểm chứng độc lập 21 tests PASS, không còn finding high/medium |

Các full log nằm trong workspace, không đóng gói thêm artifact:
`.build/component-placement-python-final.log`, `.build/component-placement-node-final.log`,
`.build/component-placement-build-final.log`, `.build/package-check-35008.log`,
`apps/web/.test-build/placement-evidence/acceptance-e2e.log`.

E2E mới dùng native mouse/pointer events trên canvas thực, không gọi solver/store
để thay thế placement. Đã kiểm tra hai click/drop-first-only, draft property Update,
same-hole rejection, right-drag Orbit, bend thêm/bỏ và bend lưu được, Escape,
reanchor một chân, lift/tilt, assembly Move, Undo/Redo và real API Save/Reload.
Diode/Zener được đặt bằng chuột với span ngắn/vừa/dài, giữ A/K và nhiều tư thế.
Assignment V2 được create/reopen/update/publish qua UI thật, guest view không lộ reference.
Các ca auth/revocation, project CAS, IndexedDB isolation, API restart/lost ACK,
assessment và WebGL context recovery cũ cũng chạy trong bộ 18 ca.

Đã chạy capture đa góc TOP/FRONT/oblique/close-up ở 1280×720 và 1920×1080, kiểm tra
thumbnail/form và continuity tại close-up; đây là ứng dụng sau sửa, không phải video
đầu vào. Theo yêu cầu bàn giao cuối, **không đưa ảnh/clip vào gói báo cáo hoặc source**.

Các lỗi tìm thấy trong kiểm chứng và đã sửa có regression: radial electrolytic bị
ép thẳng; copy thêm nhầm rigid pose; Move mất mount variant; board-delete mất hình học;
Undo cache sai đầu dây; preview bỏ sót chiều va chạm lead/body; cancel giữ capture;
và ray-picking bị chính chân đang preview che lỗ khi reanchor. Các mock v1 cũ được
cập nhật để vẫn assert chính xác request version, revision và immutable body mới.

## Mức độ hoàn thành và giới hạn

Sáu nhóm implementation trong plan (Contracts, solver/controller, commands,
renderer/pointer, generic UI, integration/verification) đều **hoàn thành với gate qua**.
W0–W8 hiện hữu được bảo toàn qua full regression; đây là phần mở rộng placement,
không đánh dấu lại các phase lịch sử hoặc thay authority kiến trúc.

Một test FPGA skip vì máy không có Icarus/vvp; không sửa RTL/driver để che giới hạn.
Physical hardware chưa được kiểm chứng trong nhiệm vụ này. Diode nonlinear, transient
capacitor, buzzer/BJT execution vẫn unavailable đúng capability. Build có cảnh báo
bundle vượt 500 kB (main khoảng 4,97 MB / gzip 544 kB), không có build error. Không
có lint script riêng trong package; AST boundaries/typecheck là các static gate hiện có.
Các giới hạn môi trường ban đầu về localhost đã xử lý bằng run được cấp quyền ngoài
sandbox; các full kết quả nêu trên là run hoàn tất, không suy từ test chưa chạy.

## Nội dung commit đề xuất

```text
feat(workbench): add flexible placement, generic component editing and v2 contracts
```

## Danh sách file tạo/chỉnh sửa

Danh sách bên dưới lấy từ working tree so với baseline, gồm source, generated artifacts,
tests và tài liệu; không gồm runtime logs, input media hoặc ảnh/clip.

- `apps/web/e2e/flexible-assignment.spec.ts`
- `apps/web/e2e/flexible-placement.spec.ts`
- `apps/web/e2e/native-scene.ts`
- `apps/web/src/application/assignments/authoring.ts`
- `apps/web/src/application/experimentLifecycle.ts`
- `apps/web/src/application/projects/recovery.ts`
- `apps/web/src/application/projects/saveController.ts`
- `apps/web/src/components/windows/AssignmentWindow.vue`
- `apps/web/src/components/windows/ComponentInfoWindow.vue`
- `apps/web/src/components/windows/ComponentPropertiesForm.vue`
- `apps/web/src/components/windows/InspectorWindow.vue`
- `apps/web/src/components/windows/ProjectManagerWindow.vue`
- `apps/web/src/components/workbench/CircuitWorkspace3D.vue`
- `apps/web/src/components/workbench/ComponentRibbon.vue`
- `apps/web/src/components/workbench/ComponentThumbnail.vue`
- `apps/web/src/composables/useCircuitEditor.ts`
- `apps/web/src/composables/useFlexibleAuthoring.ts`
- `apps/web/src/contracts/generated/dto.ts`
- `apps/web/src/contracts/generated/operations.ts`
- `apps/web/src/contracts/generated/validators.d.ts`
- `apps/web/src/contracts/generated/validators.editor.d.ts`
- `apps/web/src/contracts/generated/validators.editor.js`
- `apps/web/src/contracts/generated/validators.js`
- `apps/web/src/contracts/generated/validators.structural.d.ts`
- `apps/web/src/contracts/generated/validators.structural.js`
- `apps/web/src/contracts/validation.ts`
- `apps/web/src/data/componentParameters.ts`
- `apps/web/src/data/componentProperties.ts`
- `apps/web/src/data/editorCatalog.json`
- `apps/web/src/data/editorCatalog.ts`
- `apps/web/src/data/editorParts.json`
- `apps/web/src/data/flexibleMechanics.json`
- `apps/web/src/data/partCatalog.ts`
- `apps/web/src/data/physicalParts.json`
- `apps/web/src/data/ribbon.ts`
- `apps/web/src/data/signalPortCatalog.json`
- `apps/web/src/domain/document/circuitFile.ts`
- `apps/web/src/domain/document/editorDocument.ts`
- `apps/web/src/domain/document/graphCommands.ts`
- `apps/web/src/domain/document/graphVersion.ts`
- `apps/web/src/editor/batchCommands.ts`
- `apps/web/src/editor/FlexiblePlacementController.ts`
- `apps/web/src/electrical/flexibleGeometry.ts`
- `apps/web/src/electrical/flexibleTransforms.ts`
- `apps/web/src/electrical/modulePose.ts`
- `apps/web/src/electrical/mounting.ts`
- `apps/web/src/electrical/reframeFlexibleMount.ts`
- `apps/web/src/electrical/signalDomains.ts`
- `apps/web/src/services/api/assignmentDocuments.ts`
- `apps/web/src/services/api/assignments.ts`
- `apps/web/src/services/api/circuits.ts`
- `apps/web/src/services/api/experiments.ts`
- `apps/web/src/services/api/projects.ts`
- `apps/web/src/stores/assignments.ts`
- `apps/web/src/stores/circuit.ts`
- `apps/web/src/stores/experiment.ts`
- `apps/web/src/stores/projects.ts`
- `apps/web/src/stores/workspace.ts`
- `apps/web/src/style.css`
- `apps/web/src/three/ComponentModel.ts`
- `apps/web/src/three/package/FlexiblePackageGeometry.ts`
- `apps/web/src/three/package/LeadGeometry.ts`
- `apps/web/src/three/package/PackageAppearance.ts`
- `apps/web/src/three/package/PackageLeads.ts`
- `apps/web/src/three/PackageModel.ts`
- `apps/web/src/three/PackagePinLabels.ts`
- `apps/web/src/three/PackageThumbnails.ts`
- `apps/web/src/three/SceneManager.ts`
- `apps/web/src/three/ScenePicking.ts`
- `apps/web/src/three/SelectionGhostRoutes.ts`
- `apps/web/src/three/SelectionPreview.ts`
- `apps/web/src/types/assignment.ts`
- `apps/web/src/types/circuit.ts`
- `apps/web/src/types/experiment.ts`
- `apps/web/src/types/projects.ts`
- `apps/web/tests/assignment-authoring.test.ts`
- `apps/web/tests/assignment-store.test.ts`
- `apps/web/tests/breadboard-docking.test.ts`
- `apps/web/tests/component-authoring.test.ts`
- `apps/web/tests/component-properties.test.ts`
- `apps/web/tests/electrical-nets.test.ts`
- `apps/web/tests/flexible-assignment-contracts.test.ts`
- `apps/web/tests/flexible-batch.test.ts`
- `apps/web/tests/flexible-commands.test.ts`
- `apps/web/tests/flexible-geometry.test.ts`
- `apps/web/tests/flexible-placement-controller.test.ts`
- `apps/web/tests/flexible-rendering.test.ts`
- `apps/web/tests/generic-component-authoring.test.ts`
- `apps/web/tests/generic-led-appearance.test.ts`
- `apps/web/tests/interaction.test.ts`
- `apps/web/tests/lab-first.test.ts`
- `apps/web/tests/lead-editing.test.ts`
- `apps/web/tests/lead-form-integration.test.ts`
- `apps/web/tests/package-leads.test.ts`
- `apps/web/tests/package-model.test.ts`
- `apps/web/tests/package-thumbnails.test.ts`
- `apps/web/tests/physical-catalog.test.ts`
- `apps/web/tests/physical-mounting.test.ts`
- `apps/web/tests/placement-api.test.ts`
- `apps/web/tests/selection-clipboard.test.ts`
- `apps/web/tests/selection-move.test.ts`
- `apps/web/tests/signal-domains.test.ts`
- `apps/web/tests/wire-context-interaction.test.ts`
- `contracts/api/openapi.json`
- `contracts/api/README.md`
- `contracts/boundary/models.py`
- `contracts/circuit-schema/circuit-v1.2.schema.json`
- `contracts/component_properties.py`
- `contracts/design_validation.py`
- `contracts/design-models/fixtures/flexible-mounting-parity.json`
- `contracts/design-models/flexible-mechanics.json`
- `contracts/design-models/flexible-mount.schema.json`
- `contracts/design-models/flexible-placement.md`
- `contracts/design-models/physical-parts.v1.json`
- `contracts/design-models/README.md`
- `contracts/design-models/signal-port-catalog.json`
- `contracts/execution_profiles.py`
- `contracts/fixtures/assignment-v2-conformance.json`
- `contracts/flexible_mounting.py`
- `contracts/manifest.json`
- `contracts/physical_mounting.py`
- `contracts/public/assignments-v2.schema.json`
- `contracts/public/placement.schema.json`
- `contracts/semantic_profiles.py`
- `contracts/signal_domains.py`
- `device-library/parts/physical-parts.json`
- `docs/CHANGELOG.md`
- `docs/CIRCUIT_SPEC.md`
- `docs/COMPONENT_PLACEMENT.md`
- `docs/DEV_LOG.md`
- `docs/superpowers/plans/2026-10-17-crumb-component-placement.md`
- `docs/verification/2026-10-18-component-placement.md`
- `scripts/check_contract_package.py`
- `scripts/sync_editor_catalog.py`
- `services/api/app/api/assignments.py`
- `services/api/app/api/experiments.py`
- `services/api/app/api/placement.py`
- `services/api/app/api/projects.py`
- `services/api/app/main.py`
- `services/api/app/services/assignments.py`
- `services/api/app/services/circuit_validator.py`
- `services/api/app/services/experiments.py`
- `services/api/app/services/projects.py`
- `services/api/tests/test_flexible_api.py`
- `services/api/tests/test_flexible_assignments.py`
- `services/hardware-service/hardware_service/station/virtual.py`
- `simulator/circuit-simulator/netcircuit_sim/analog.py`
- `simulator/circuit-simulator/netcircuit_sim/dispatch.py`
- `simulator/circuit-simulator/tests/test_physical_simulation.py`
- `tests/contracts/test_component_properties.py`
- `tests/contracts/test_flexible_assignment_contracts.py`
- `tests/contracts/test_flexible_mounting.py`
- `tests/contracts/test_installed_package_probe.py`
- `tests/frontend/test_physical_catalog.py`
- `tests/integration/test_virtual_lab_execution.py`
