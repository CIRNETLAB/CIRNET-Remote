# Audit Markdown và chính sách artifact — 2026-10-19

Baseline: `0cc66f8`, branch `refactor`, linked worktree hiện tại. Git status và staged diff ban đầu sạch. Làm trực tiếp trên working tree; không chạy lại prompt/checklist cũ, không stage/commit/push, không xóa/di chuyển Markdown hay artifact cũ.

## Phạm vi và kế hoạch đã thực hiện

Yêu cầu người dùng là authority cho đợt bảo trì này: đối chiếu toàn bộ Markdown với source/Contracts/tests/config, giữ provenance và lịch sử; chỉ sửa ngoài Markdown những helper/config/test/CI cần cho chính sách artifact. Không đổi chức năng sản phẩm, Contracts/schema, Backend runtime hay FPGA. Thay đổi Python server chỉ thuộc test harness.

1. Chốt inventory Git, tài liệu và file visual trên ổ đĩa trước verification; phân công kiểm tra tài liệu hiện hành và lịch sử độc lập.
2. Sửa canonical docs, source map/index và status; thêm root agent rules trỏ một guide verification dùng chung.
3. Dùng một Node allocator cross-platform, Python bridge gọi chính allocator đó; chuyển mọi diagnostic writer được tìm thấy sang external output. Giữ product authoring outputs và compiled caches đúng vai trò.
4. Bổ sung regression checks cho canonical/symlink/worktree/cleanup, staged artifacts, Markdown links/case/anchors; review độc lập và sửa findings.
5. Chạy các gate thực tế, chụp/xem UI ngoài repo, so baseline vật lý cả ignored files, giữ riêng các đề nghị xử lý ảnh cũ.


## Bảng phân loại đầy đủ

Đã đọc và đối chiếu **156/156** Markdown ban đầu: **71 KEEP, 81 UPDATE, 4 NEEDS_REVIEW, 0 DELETE_CANDIDATE**. `UPDATE` đã sửa trực tiếp; hai tài liệu được sửa chú thích nhưng giữ `NEEDS_REVIEW` do hardware/proposal chưa closure. Không kết luận bỏ tài liệu vì ngày cũ hoặc không có inbound link.

| Đường dẫn tương đối root | Phân loại | Vai trò | Lý do / source evidence |
| --- | --- | --- | --- |
| `README.md` | UPDATE | Onboarding song ngữ hiện hành | Bổ sung Graph 1.2, API v2, index/policy; sửa ba process; phân biệt W0–W8 lịch sử. Source: `contracts/circuit-schema/circuit-v1.2.schema.json`, `services/api/app/api/placement.py`, `apps/web/scripts/e2e.mjs`, `scripts/check_release.py`. |
| `apps/web/README.md` | UPDATE | Setup, UI, lifecycle hiện hành | Sửa e2e count cũ, output repo cũ, Select-pan/Component Info/Component-Run/status, catalog và zoom. Source: `package.json`, `playwright.config.ts`, `scripts/e2e.mjs`, `src/composables/useCircuitEditor.ts`, `src/components/windows/ComponentInfoWindow.vue`, `src/components/workbench/WorkbenchRibbon.vue`, `SimulationStatusBar.vue`, `src/data/ribbon.ts`, `src/three/ViewportNavigation.ts`, `src/config/workbenchViewport.ts` (các đường dẫn ngắn thuộc `apps/web/`). |
| `apps/web/public/models/function-generator-2ch/README.md` | UPDATE | Contract tài sản sản phẩm / export | Giữ GLB/PNG/SVG là product assets; thêm chính sách screenshot/trace kiểm tra ngoài repo. Source: `apps/web/scripts/export-function-generator.mjs`, `apps/web/src/three/FunctionGeneratorModel.ts`, `apps/web/tests/function-generator.test.ts`. |
| `apps/web/public/models/oscilloscope-2ch/README.md` | UPDATE | Contract tài sản sản phẩm / export | Giữ asset/budget/layout, thêm quy tắc ảnh chẩn đoán ngoài repo. Source: `apps/web/scripts/export-oscilloscope.mjs`, `apps/web/src/three/OscilloscopeModel.ts`, `apps/web/tests/instrument-chassis.test.ts`. |
| `contracts/README.md` | UPDATE | Toolchain/schema/package/release chính | Sửa log package-check và raw workload JSON sang external resolver, giữ lệnh release thật. Source: `scripts/check_contract_package.py`, `scripts/check_release.py`, `scripts/benchmark_web_sessions.py`, `scripts/artifact_paths.py`, `scripts/artifact-paths.mjs`, `contracts/manifest.json`. |
| `contracts/api/README.md` | UPDATE | Public route/DTO reference | Làm rõ legacy Graph1.0/1.1 và additive v2 Graph1.2, tránh đoạn dưới phủ định đầu file. Source: `services/api/app/api/placement.py`, `contracts/public/placement.schema.json`, `contracts/api/openapi.json`. |
| `contracts/assignment/README.md` | UPDATE | Legacy AssignmentDefinition 1.0 | Bổ sung liên kết additive AssignmentDefinitionV2 thay vì nói chỉ có 1.0. Source: `contracts/public/assignments-v2.schema.json`, `services/api/app/api/assignments.py`. |
| `contracts/capture/README.md` | KEEP | Authority NCAP v1/v2 | Hình dạng prefix/body, bounds, hash/quality và v2 chưa có runtime producer khớp code/fixtures. Source: `contracts/capture/layout.json`, `contracts/capture/ncap.schema.json`, `contracts/fixtures/capture/conformance.json`, `tests/contracts/test_capture_format.py`, `test_sampled_capture_semantics.py`. Không đổi synthetic goldens. |
| `contracts/circuit-schema/README.md` | UPDATE | Logical graph / legacy editor contract | Bổ sung hỗ trợ1.1/1.2 và liên kết mounting, giữ Phase2 như legacy. Source: `contracts/circuit-schema/circuit.schema.json` (enum1.0/1.1), `module.schema.json` (rigid mounting), `circuit-v1.2.schema.json`, `apps/web/src/electrical/mounting.ts`. |
| `contracts/compatibility/README.md` | KEEP | Chính sách supported unpublished anchors | Không thay baseline/marker; checker không có update mode. Source: `scripts/check_public_compatibility.py`, `contracts/compatibility/2026-10-16/baseline.json`, `public-wire-baseline.json`, `tests/contracts/test_public_compatibility.py`. |
| `contracts/design-models/README.md` | KEEP | Authority descriptor/properties/presentation | Đã dẫn flexible1.2, optional shape, migration và runtime-unavailable đúng boundary. Source: `contracts/component_properties.py`, `contracts/execution_profiles.py`, `contracts/design-models/package-shape.schema.json`, `apps/web/src/services/execution/presentation.ts`. |
| `contracts/design-models/flexible-placement.md` | KEEP | Authority flexible persistence/mechanics | Đã mô tả V1/V2, historical descriptors, explicit rebuild, v2 documents/assignments đúng source. Source: `contracts/flexible_mounting.py`, `contracts/rigid_leads.py`, `contracts/circuit-schema/circuit-v1.2.schema.json`, `apps/web/src/electrical/flexibleGeometry.ts`, `services/api/app/api/placement.py`, fixture parity/legacy được tham chiếu. |
| `contracts/fpga-protocol/commands.md` | KEEP | Logical scaffold command boundary | ID/state/guard là abstract control, không physical ABI. Source: `fpga/experiment-controller/rtl/top.v`, `contracts/fpga-protocol/control.schema.json`, `fpga/simulation/tb_lab_first_control.v`. |
| `contracts/fpga-protocol/packet-format.md` | KEEP | Transport envelope / NOT_IMPLEMENTED hardware | Đúng không có driver/framing vật lý; không suy ra chạy phần cứng. Source: `contracts/fpga-protocol/control.schema.json`, transport abstractions dưới `services/hardware-service/hardware_service`. |
| `contracts/fpga-protocol/register-map.md` | KEEP | Reserved conceptual domains | Không có địa chỉ/pin/timing, đúng scaffold handshake và instrument outputfalse. Source: `fpga/experiment-controller/rtl/top.v`, `fpga/instrument/rtl/top.v`, không có QSF/SDC production được cung cấp. |
| `contracts/fpga-protocol/versions.md` | UPDATE | Version-domain map | Sửa Graph chỉ1.0 và Assignment chỉ1.0 thành retained1.0/1.1 + additive1.2/V2; giữ RPC/scaffold độc lập. Source: `circuit-v1.2.schema.json`, `assignments-v2.schema.json`, `contracts/hardware/v2/rpc_v2.proto`. |
| `contracts/hardware/v2/README.md` | KEEP | RPC setup/binary capture boundary | Generate/shared ignored bindings, typed ownership và capture_payload khớp proto/client. Source: `contracts/hardware/v2/rpc_v2.proto`, `scripts/generate_hardware_rpc.py`, `services/api/app/services/hardware_client.py`. |
| `contracts/memory/README.md` | KEEP | Local memory fixture contract | Bounded byte image là config, không RAM hardware/solver đã có. Source: `contracts/memory/memory-image.schema.json`, `tests/contracts/test_memory_schema.py`, editor memory functions. |
| `contracts/physical-lab/README.md` | UPDATE | Frozen Lab1.0 authority map | Xóa khẳng định CircuitGraph vẫn chỉ1.0; giải thích graph/assignment version độc lập. Source: `contracts/physical-lab/lab.schema.json`, `contracts/circuit-schema/circuit-v1.2.schema.json`, `contracts/public/assignments-v2.schema.json`. |
| `deployment/README.md` | KEEP | Reviewable production templates | One API worker, production PostgreSQL/HTTPS/no guest, migration0005, retention khớp configuration/templates; target chưa verified rõ ràng. Source: `services/api/app/config.py`, `deployment/systemd/netcircuit-api.service`, `netcircuit-capture-maintenance.service`, `deployment/nginx/netcircuit.conf`, `services/api/app/capture_maintenance.py`. |
| `deployment/mini-pc/README.md` | KEEP | Target deployment checklist | Liên kết chính tồn tại; checklist không biến target thành deployment đã chạy. Source: production guide/templates, `NETCIRCUIT_SIMULATION_WORKERS` và capability slot source. |
| `device-library/README.md` | UPDATE | Canonical/generated catalog onboarding | Xóa current count19 cũ, bổ sung LABEL, current/historical/lean/domain projection và flexible1.2. Source: `device-library/editor/components.json`, `parts/physical-parts.json`, `scripts/sync_editor_catalog.py` (check thực tế86 editor/64 current physical). |
| `device-library/parts/README.md` | UPDATE | Part provenance/support và historical matrix | Giữ nguyên datasheet/pin matrix; xác định original selection không exhaustive current; sửa current55 và binding chỉ1.1. Source: registry64 current/114 historical descriptors, `scripts/sync_editor_catalog.py`, mounting schemas; không claim tái kiểm tra toàn bộ datasheet bên ngoài. |
| `docs/ARCHITECTURE.md` | UPDATE | Canonical current Lab-First authority | Đồng bộ Graph1.2/V2 persistence/dispatch và policy external artifacts; giữ safety/correctness/control marker. Source: `services/api/app/api/placement.py`, `contracts/public/assignments-v2.schema.json`, `services/hardware-service/hardware_service/station/virtual.py`, `simulator/circuit-simulator/netcircuit_sim/dispatch.py`. |
| `docs/CHANGELOG.md` | UPDATE | Hiện hành / ledger + lịch sử | Bổ sung chính sách artifact và những thay đổi Ribbon/camera đang có trong source; giữ nguyên các mục lịch sử. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/CIRCUIT_SPEC.md` | UPDATE | Current graph/physical/capture spec | Bổ sung automatic FlexibleMountV2/pinned descriptor; sửa v2 "no implemented payload" thành codec/fixtures có nhưng producer chưa có. Source: `contracts/design-models/flexible-mount-v1.1.schema.json`, `apps/web/src/electrical/flexibleGeometry.ts`, NCAP layout/schema/codecs/fixtures. |
| `docs/COMPONENT_PLACEMENT.md` | UPDATE | Current authoring guide | Thay chỉ dẫn bend/lift/tilt và V1-new-authoring đã lỗi thời bằng two-click automaticV2/contact re-anchor; giữ saved manualV1; source ownership/canonical link. Source: `apps/web/src/editor/FlexiblePlacementController.ts`, `src/composables/useFlexibleAuthoring.ts`, `src/electrical/flexibleGeometry.ts`, `contracts/flexible_mounting.py`. |
| `docs/CONTEXT.md` | UPDATE | Short architecture/AI context | Bổ sung Graph1.2/V2 và index/verification link; protected required markers giữ nguyên. Source: `scripts/check_context.py`, `tests/test_docs_baseline.py`, `tests/integration/test_context_integrity.py`, graph/v2 route source. |
| `docs/DEV_LOG.md` | UPDATE | Hiện hành / ledger + lịch sử | Frontmatter/handoff trước audit còn trỏ W8 và placement; chuyển sang nhiệm vụ hiện tại, dẫn báo cáo audit, bảo toàn mọi kết quả cũ. Source: `scripts/check_context.py`, `tests/test_docs_baseline.py`. |
| `docs/Hardware/net-Circuit-Remote_FPGA_Architecture_Lab-First_v2.md` | NEEDS_REVIEW | Đề xuất / review hardware | Proposal FPGA revision 2.1; RTL thực tế vẫn scaffold và transport unavailable. Thêm ngữ cảnh nguồn đầu vào lịch sử; cần review schema/ABI/điện độc lập. Source: `fpga/experiment-controller/rtl/top.v`, `contracts/fpga-protocol/versions.md`. |
| `docs/MIGRATION_LAB_FIRST.md` | UPDATE | Báo cáo / quyết định lịch sử | Ledger R/H/W là provenance, không phải ủy quyền chạy lại; thêm trạng thái lịch sử, giữ nguyên hashes/counts/phase rulings. Source: `tests/test_post_r7_provenance.py`, `.gitattributes`. |
| `docs/PHYSICAL_LAB_SAFETY.md` | KEEP | Electrical safety contract | Driver unavailable/safe fallback/fresh evidence/live generator guards và TBD limits vẫn đúng; không invent electrical proof. Source: `services/hardware-service/hardware_service/station/physical.py`, `services/api/app/services/execution_policy.py`, `topology_resolver.py`, `lab_compiler.py`, instrument validators. |
| `docs/POWER_SUPPLY_CONTROLS.md` | UPDATE | Vietnamese legacy POWER_SUPPLY guide + historical result | Tách legacy visual POWER_SUPPLY khỏi DC_SUPPLY; historical88/16-17 preserved; ảnh JPG được tham chiếu không có trong bàn giao, bỏ broken embed và ghi rõ chưa xem/không thay thế. Source: `apps/web/src/three/PowerSupplyModel.ts` (DC_SUPPLY voltage/current no-op), `src/components/windows/PowerSupplyWindow.vue`, filesystem/tracked inventory. |
| `docs/ROADMAP.md` | UPDATE | Implementation/target status map | Bổ sung implemented subsequent editor work; ghi R/H/W historical và VERIFIED cần command hiện tại; giữ R6 trướcR7 marker. Source: `WorkbenchRibbon.vue`, `ViewportNavigation.ts`, Graph1.2/schema/routes; docs/context tests. |
| `docs/SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md` | UPDATE | Phân tích source lịch sử | Phân tích drawer 96 px thuộc snapshot cũ; Ribbon/Run hiện nằm trong WorkbenchRibbon. Thêm phạm vi lịch sử. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md` | UPDATE | Phân tích source lịch sử | Giữ thuật toán/RED→GREEN gizmo ban đầu; note ngăn diễn giải “latest” năm 2026-10-09 thành trạng thái hiện tại. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md` | UPDATE | Phân tích source lịch sử | Bảo toàn phân tích topology/contact identity; wire solver/interaction đã được tinh chỉnh sau đó. Gắn lịch sử và authority hiện hành. Source: `apps/web/src/electrical/nets.ts`, `apps/web/tests/breadboard-topology.test.ts`. |
| `docs/SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md` | UPDATE | Phân tích source lịch sử | Phase 2 mô tả chưa có execution; hiện có lifecycle/virtual execution. Giữ các giới hạn đúng theo ngày, không dùng làm current source map. Source: `apps/web/src/domain/document/graphCommands.ts`, `apps/web/tests/interaction.test.ts`. |
| `docs/SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md` | UPDATE | Phân tích source lịch sử | Giữ lý do sửa menu/Y-grip/upright supply và build bị chặn khi đó; không biến build cũ thành gate hiện tại. Source: `apps/web/src/three/PowerSupplyModel.ts`, `apps/web/tests/instrument-launchers.test.ts`. |
| `docs/SOURCE_ANALYSIS_SELECTION_AND_COMPONENT_INFO.md` | UPDATE | Phân tích source lịch sử | Giữ provenance contour/Info; source nay dùng package/flexible workflows và nhiều lần refine. Đánh dấu snapshot. Source: `apps/web/src/three/SelectionOutline.ts`, `apps/web/src/components/windows/ComponentInfoWindow.vue`. |
| `docs/SOURCE_ANALYSIS_SINGLE_WORKSPACE.md` | UPDATE | Phân tích source lịch sử | Giữ chẩn đoán migration một workspace và nguồn icon; số test/Phase 3-next là dữ kiện lịch sử. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/SOURCE_ANALYSIS_STABILITY_AUDIT.md` | UPDATE | Phân tích source lịch sử | Các câu gRPC handler-free/simulator shell đã lỗi thời nếu coi hiện hành; ghi rõ lịch sử thay vì viết lại kết quả cũ. Source: `apps/web/src/three/SceneManager.ts`, `apps/web/tests/resource-lifecycle.test.ts`. |
| `docs/SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md` | UPDATE | Phân tích source lịch sử | Giữ nguyên cavity/grid/selection refinement; topology/contact và mounted rendering đã có ở source sau ngày báo cáo. Source: `apps/web/src/three/TechnicalGrid.ts`, `apps/web/tests/technical-grid.test.ts`. |
| `docs/SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md` | UPDATE | Phân tích source lịch sử | Move-only/Select/pan và FPGA placeholder trong báo cáo thuộc snapshot; focal point/framing mới nằm ở navigation hiện hành. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `docs/SOURCE_ANALYSIS_ZOOM_TO_AREA.md` | UPDATE | Phân tích source lịch sử | Giữ phân tích Area ban đầu; camera constraints/calibration đã đổi qua CameraFraming/ViewportNavigation. Source: `apps/web/src/three/CameraFraming.ts`, `apps/web/tests/camera-framing.test.ts`. |
| `docs/Web/net-Circuit-Remote_Architecture_v3_Lab-First.md` | KEEP | Proposal/audit đã superseded | Đã SUPERSEDED rõ ràng; giữ v2 residue và v3 proposal làm provenance, không dùng thay v3.1. Source: `services/api/app/services/lab_compiler.py`, `services/api/app/services/topology_resolver.py`. |
| `docs/Web/net-Circuit-Remote_Lab-First_Architecture_Audit_and_Restructure_Plan.md` | KEEP | Proposal/audit đã superseded | Đã ghi historical pre-migration; hiện compiler/resolver đã triển khai nhiều findings. Giữ rationale, không chạy lại plan. Source: `services/api/app/services/lab_compiler.py`, `services/api/app/services/topology_resolver.py`. |
| `docs/architecture/assignments-and-publication.md` | UPDATE | Current assignment persistence/authorization | Bổ sung explicit AssignmentDefinitionV2/APIv2/legacy rejection; giữ stable publication/CAS/redaction. Source: `contracts/public/assignments-v2.schema.json`, `services/api/app/api/assignments.py`, `services/api/tests/test_flexible_assignments.py`. |
| `docs/architecture/auth-and-migrations.md` | UPDATE | Current auth/migrations/operator recovery | Gắn historical16 PostgreSQL18.6 cases vào dated W8 link; không nhận là rerun hiện tại. Source: `services/api/app/config.py`, `services/api/app/services/auth.py`, migration chain, `services/api/tests/postgres_cases.py`, pinned Argon2 trong pyproject. |
| `docs/architecture/capture-catalog.md` | KEEP | Persistent capture/retention authority | Catalog join ownership, tombstone/audit-before-delete, pendingcleanup/lease guards khớp source. Source: `services/api/app/services/capture_repository.py`, `capture_maintenance.py`, `services/api/app/migrations/schema_v0005.py`, capture catalog/maintenance/migration tests. |
| `docs/architecture/projects-and-revisions.md` | UPDATE | Current owner/CAS/document persistence | Bổ sung supported1.2 và correct `contracts/public/placement.schema.json`/v2; no mutation replay. Source: `services/api/app/api/placement.py`, `services/api/app/services/projects.py`, `project_repository.py`, placement schema. |
| `docs/architecture/signal-domains-and-simulation.md` | UPDATE | Typed domains/dispatch authority | Bổ sung SimulationRequestV2/Graph1.2, giữ old graph immutability/model unavailability. Source: `simulator/circuit-simulator/netcircuit_sim/dispatch.py`, `services/hardware-service/hardware_service/station/virtual.py`, `contracts/signal_domains.py`. |
| `docs/archive/PROMPT_CODEX_net-Circuit-Remote_Lab-First_Refactor_R0-R7.md` | KEEP | Archive / provenance | Hash-locked historical prompt; tuyệt đối giữ bytes và đường dẫn. Test kiểm SHA-256 chính xác. Source: `tests/test_post_r7_provenance.py`, `.gitattributes`. |
| `docs/archive/PROMPT_CODEX_net-Circuit-Remote_Post-R7_Architecture_Hardening.md` | KEEP | Archive / provenance | Prompt hardening được ledger ghi hash nguồn; giữ nguyên bytes, không chạy checklist/commit cũ. Source: `services/api/app/services/lab_compiler.py`, `services/api/app/services/topology_resolver.py`. |
| `docs/archive/legacy-v1/2026-10-08-initial-repository-scaffold.md` | KEEP | Archive / provenance | Archive SUPERSEDED được context test kiểm sự tồn tại/marker; giữ scaffold/paths cũ làm lịch sử. Source: `tests/integration/test_context_integrity.py`, `apps/web/src/App.vue`. |
| `docs/archive/legacy-v1/2026-10-08-net-circuit-remote-architecture-design.md` | KEEP | Archive / provenance | Archive SUPERSEDED có marker bị test bảo vệ; Raspberry Pi/SQLite proposal không được phục hồi làm authority. Source: `tests/integration/test_context_integrity.py`, `apps/web/src/App.vue`. |
| `docs/archive/legacy-v1/2026-10-08-web-foundation-design.md` | KEEP | Archive / provenance | Archive thiết kế nhiều route đã có SUPERSEDED; App thực chỉ một workspace. Giữ lịch sử UI. Source: `tests/integration/test_context_integrity.py`, `apps/web/src/App.vue`. |
| `docs/archive/legacy-v1/2026-10-08-web-foundation.md` | KEEP | Archive / provenance | Archive implementation plan có execution record và transport provenance; giữ nguyên scope lịch sử. Source: `tests/integration/test_context_integrity.py`, `apps/web/src/App.vue`. |
| `docs/archive/legacy-v1/PROMPT_SINGLE_WORKSPACE_UI_AI.md` | KEEP | Archive / provenance | Prompt lịch sử có năm tên reference, hiện có đủ `assets/Image_sample/interface_1.png`…`interface_5.png`; giữ artwork gốc và next-phase theo ngày, không tự chạy lại prompt. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/archive/legacy-v1/SINGLE_WORKSPACE_DOCS_MANIFEST.md` | UPDATE | Archive / provenance | Manifest còn tên đường dẫn trước archive; thêm locator tới bản tồn tại, ghi rõ master prompt/ảnh thiếu ban đầu. Source: `tests/integration/test_context_integrity.py`, `apps/web/src/App.vue`. |
| `docs/component-visuals-authoring-verification.md` | UPDATE | Historical2026-10-15 implementation/verification | Giữ411/498/76/55, commands và browser denial nguyên ý; thêm snapshot/current-authority/external-output notice. Source: current registry86/64 chứng minh count lịch sử không còn current; source/tests đã tiến lên V2. |
| `docs/physical-components-verification.md` | UPDATE | Historical2026-10-15 first physical implementation | Giữ19/326/467 và browser NOT_VERIFIED; thêm historical snapshot/current flexible+registry/policy pointers. Source: current64 physical registry, flexible1.2/V2 source khác initial rigid version, fixture link tồn tại. |
| `docs/reviews/net-Circuit-Remote_FPGA_Contract_Review.md` | NEEDS_REVIEW | Đề xuất / review hardware | Review dựa vào attachment không có source tại lúc soạn; repo nay có contracts/RTL. Vẫn cần closure FPGA/ABI, không tuyên bố conformance. Source: `fpga/experiment-controller/rtl/top.v`, `contracts/fpga-protocol/versions.md`. |
| `docs/superpowers/plans/2026-10-09-component-transform-gizmo.md` | KEEP | Kế hoạch theo ngày / execution record | Kế hoạch gizmo có execution evidence và build acceptance chưa xác minh ở phiên cũ; giữ checkpoint không coi đó là lỗi source hiện tại. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/superpowers/plans/2026-10-09-interactive-workspace.md` | KEEP | Kế hoạch theo ngày / execution record | Kế hoạch Phase 2 IMPLEMENTED và ledger 43/43 là lịch sử; source graph commands/interaction tồn tại. Source: `apps/web/src/domain/document/graphCommands.ts`, `apps/web/tests/interaction.test.ts`. |
| `docs/superpowers/plans/2026-10-09-ribbon-gizmo-supply-refinement.md` | KEEP | Kế hoạch theo ngày / execution record | Checklist ribbon/Y-grip/supply hoàn thành; giữ lý do và regression, không dùng để thay Ribbon hiện tại. Source: `apps/web/src/three/PowerSupplyModel.ts`, `apps/web/tests/instrument-launchers.test.ts`. |
| `docs/superpowers/plans/2026-10-09-single-workspace-shell-migration.md` | KEEP | Kế hoạch theo ngày / execution record | Plan migration shell có asset provenance, focus/file boundaries và kết quả cũ; không có lý do xóa. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/superpowers/plans/2026-10-10-stability-audit.md` | KEEP | Kế hoạch theo ngày / execution record | Plan stability giữ lifecycle/async/CPU findings có test hiện hữu; không tự chạy lại checklist. Source: `apps/web/src/three/SceneManager.ts`, `apps/web/tests/resource-lifecycle.test.ts`. |
| `docs/superpowers/plans/2026-10-14-crumb-wire-tool.md` | KEEP | Kế hoạch theo ngày / execution record | Browser smoke unchecked do quyết định quyền của phiên cũ; bảo toàn acceptance gap, không tự đánh dấu xong từ report khác. Source: `apps/web/src/wires/wireRouting.ts`, `apps/web/tests/wire-routing.test.ts`. |
| `docs/superpowers/plans/2026-10-15-compact-wire-routing.md` | KEEP | Kế hoạch theo ngày / execution record | Kế hoạch compact layout có bước semantic-vs-derived route rõ; hiện wireLayout/tests giữ cấu trúc đó. Source: `apps/web/src/wires/wireLayout.ts`, `apps/web/tests/wire-layout.test.ts`. |
| `docs/superpowers/plans/2026-10-15-component-visuals-properties.md` | NEEDS_REVIEW | Kế hoạch theo ngày / execution record | Visual screenshots còn unchecked trong plan gốc; giữ task/evidence và giới hạn. Cần chủ sở hữu quyết định closure riêng, không suy từ ảnh khác. Source: `device-library/parts/physical-parts.json`, `apps/web/tests/component-properties.test.ts`. |
| `docs/superpowers/plans/2026-10-15-physical-components.md` | NEEDS_REVIEW | Kế hoạch theo ngày / execution record | Top/oblique/close acceptance còn unchecked do browser bị từ chối; không xóa plan chưa đóng, không tự cấp quyền hồi tố. Source: `contracts/physical_mounting.py`, `tests/contracts/test_physical_mounting.py`. |
| `docs/superpowers/plans/2026-10-15-unified-editor-commands.md` | KEEP | Kế hoạch theo ngày / execution record | Plan unified commands có batching/history/context-menu constraints được source/tests thể hiện; giữ provenance. Source: `apps/web/src/editor/batchCommands.ts`, `apps/web/tests/unified-commands-interaction.test.ts`. |
| `docs/superpowers/plans/2026-10-16-component-palette-performance.md` | KEEP | Kế hoạch theo ngày / execution record | Plan palette có đo CPU và measurement boundaries riêng với GPU; giữ liên kết benchmark thay vì nhân bản kết quả. Source: `apps/web/src/data/componentSearch.ts`, `apps/web/src/three/PackageThumbnails.ts`. |
| `docs/superpowers/plans/2026-10-16-web-contracts.md` | KEEP | Kế hoạch theo ngày / execution record | Plan W0–W8 đã có ledger/checkpoint; contracts/toolchain hiện tồn tại. Giữ Git blockers theo ngày. Source: `contracts/registry.py`, `contracts/manifest.json`. |
| `docs/superpowers/plans/2026-10-17-crumb-component-placement.md` | KEEP | Kế hoạch theo ngày / execution record | Plan Graph1.2/flexible authoring đã triển khai; giữ tasks/review/compatibility để truy nguyên. Source: `apps/web/src/editor/FlexiblePlacementController.ts`, `apps/web/tests/flexible-placement-controller.test.ts`. |
| `docs/superpowers/plans/2026-10-18-component-mechanics.md` | KEEP | Kế hoạch theo ngày / execution record | Plan mechanics bảo vệ historical descriptors, explicit rebuild và rollback; current contracts/tests thể hiện các nhánh đó. Source: `contracts/flexible_mounting.py`, `apps/web/tests/component-mechanics-catalog.test.ts`. |
| `docs/superpowers/plans/2026-10-18-contacts-wires-label.md` | KEEP | Kế hoạch theo ngày / execution record | Plan Contacts/Label/deep insertion giữ version migration và pin semantics; current models/tests hiện hữu. Source: `apps/web/src/three/package/SwitchPackageModels.ts`, `apps/web/tests/contact-package-models.test.ts`. |
| `docs/superpowers/plans/2026-10-18-sealed-package-models.md` | KEEP | Kế hoạch theo ngày / execution record | Plan sealed packages có descriptor/feedthrough/solid constraints; giữ acceptance lineage. Source: `apps/web/src/three/package/SealedPackageShapes.ts`, `apps/web/tests/package-feedthrough.test.ts`. |
| `docs/superpowers/plans/2026-10-19-ribbon-shell.md` | KEEP | Kế hoạch theo ngày / execution record | Plan Ribbon có user spec, shared commands và execution record; giữ lịch sử native baseline. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/superpowers/plans/2026-10-19-unified-camera-navigation.md` | UPDATE | Kế hoạch theo ngày / execution record | Plan camera đã hoàn thành nhưng chỉ dẫn output .test-build cần giới hạn lịch sử; chuyển mọi rerun tới external policy. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `docs/superpowers/specs/2026-10-09-interactive-workspace-design.md` | KEEP | Thiết kế được duyệt theo ngày | Spec Phase2 được phê duyệt; source đã tiến xa hơn execution boundary của phiên 09-10. Giữ spec theo ngày. Source: `apps/web/src/domain/document/graphCommands.ts`, `apps/web/tests/interaction.test.ts`. |
| `docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md` | UPDATE | Thiết kế được duyệt theo ngày | Spec shell giữ tầm nhìn roadmap; sửa locator “Replaces” sang archived design thật và giữ tên gốc. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/superpowers/specs/2026-10-14-crumb-wire-tool-design.md` | KEEP | Thiết kế được duyệt theo ngày | Spec Wire đã ghi approved/implemented và browser NOT_VERIFIED; bảo toàn design/review boundary. Source: `apps/web/src/wires/wireRouting.ts`, `apps/web/tests/wire-routing.test.ts`. |
| `docs/superpowers/specs/2026-10-15-compact-wire-routing-design.md` | KEEP | Thiết kế được duyệt theo ngày | Spec compact route giữ semantic/derived distinction và CPU-vs-GPU limitation; không có proof mới để sửa nội dung. Source: `apps/web/src/wires/wireLayout.ts`, `apps/web/tests/wire-layout.test.ts`. |
| `docs/verification/2026-10-09-component-information-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ 62-test/build-unverified/native observations; ảnh .jpg đã thiếu ở baseline, bỏ embed hỏng và giữ tên. Source: `apps/web/src/three/SelectionOutline.ts`, `apps/web/src/components/windows/ComponentInfoWindow.vue`. |
| `docs/verification/2026-10-09-component-transform-gizmo-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ 79-test và build EPERM lịch sử; hai ảnh chưa được bàn giao, không tạo ảnh thay thế. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/verification/2026-10-09-interactive-workspace-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ 43-test/JSON saved-design evidence; ảnh missing được ghi rõ, JSON hiện hữu vẫn liên kết. Source: `apps/web/src/domain/document/graphCommands.ts`, `apps/web/tests/interaction.test.ts`. |
| `docs/verification/2026-10-09-move-tool-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ native Move-only/Undo case theo ngày; ảnh missing không phải do policy mới. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `docs/verification/2026-10-09-ribbon-gizmo-supply-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ native menu/gizmo/socket checks và JSON measurements; ba ảnh missing được giữ dạng tên. Source: `apps/web/src/three/PowerSupplyModel.ts`, `apps/web/tests/instrument-launchers.test.ts`. |
| `docs/verification/2026-10-09-single-workspace-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ shell-only browser baseline và asset history; ảnh missing được nêu, không nhận là ảnh đã xem hôm nay. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/verification/2026-10-09-technical-workbench-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ contour/cavity/grid measurements; hai ảnh đã thiếu, không nâng historical report thành current verification. Source: `apps/web/src/three/TechnicalGrid.ts`, `apps/web/tests/technical-grid.test.ts`. |
| `docs/verification/2026-10-09-workspace-navigation-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ Select-drag superseded report và link Move-only; ảnh thiếu được tách khỏi evidence đã chạy. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `docs/verification/2026-10-10-stability-audit-browser.md` | KEEP | Báo cáo / quyết định lịch sử | Báo cáo đã có ngày, external screenshot path và runtime limitations; giữ nguyên historical observations, không kiểm lại URL cũ. Source: `apps/web/src/three/SceneManager.ts`, `apps/web/tests/resource-lifecycle.test.ts`. |
| `docs/verification/2026-10-11-collapsible-toolbars-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ browser toggle/responsive evidence cũ; hai PNG thiếu từ baseline, ghi nhận rõ. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/verification/2026-10-11-fixed-drawers.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ fixed-drawer dimensions và checks theo ngày; hai JPG không được bàn giao. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/verification/2026-10-11-overlay-drawers.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ frame/timing/geometry results; links expanded/collapsed thiếu được chuyển thành tên lịch sử. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/verification/2026-10-11-panel-resize-performance.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ phép đo performance và note probe tạm; hai PNG thiếu không thể làm visual sign-off hiện tại. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/verification/2026-10-11-resizable-panels-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ implementation resize lịch sử đã superseded bởi fixed drawers; hai PNG thiếu được ghi rõ. Source: `apps/web/src/stores/ui.ts`, `apps/web/tests/drawerMotion.test.ts`. |
| `docs/verification/2026-10-11-zoom-to-area-browser.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ Area interaction/responsive gate cũ; PNG thiếu từ nguồn bàn giao, không thay số đo. Source: `apps/web/src/three/CameraFraming.ts`, `apps/web/tests/camera-framing.test.ts`. |
| `docs/verification/2026-10-12-instrument-gui.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ controls preview/unavailable and old build/tests; Scope/Monitor JPG thiếu được ghi rõ. Source: `apps/web/src/components/windows/GeneratorWindow.vue`, `apps/web/tests/instrument-windows.test.ts`. |
| `docs/verification/2026-10-12-placement-follow.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ anchor-idle implementation đã bị sticky thay thế; năm ảnh thiếu được tách khỏi current behavior. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/verification/2026-10-12-placement-ghost-gizmo.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ ghost/anchor evidence cũ và compatibility; ảnh thiếu được giữ dưới dạng filename. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/verification/2026-10-12-placement-sticky-gizmo.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ follow hysteresis/atomic placement tests và bốn model observations; năm ảnh thiếu được nêu, counts giữ nguyên. Source: `apps/web/src/three/ComponentTransformGizmo.ts`, `apps/web/tests/transform-gizmo.test.ts`. |
| `docs/verification/2026-10-12-supply-generator-launchers.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ launchers-only preview/graph contracts và window checks; hai ảnh thiếu từ baseline. Source: `apps/web/src/three/PowerSupplyModel.ts`, `apps/web/tests/instrument-launchers.test.ts`. |
| `docs/verification/2026-10-13-lab-first-final.md` | KEEP | Báo cáo / quyết định lịch sử | R0–R7 ledger cũ còn anonymous auth/retention limits thuộc ngày13; báo cáo có phase/date rõ, không dùng làm current limits. Source: `services/api/app/services/lab_compiler.py`, `services/api/app/services/topology_resolver.py`. |
| `docs/verification/2026-10-13-lab-first-r6.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ virtual AND/probe capture test counts; hai PNG thiếu được ghi rõ. Không coi đó là xác nhận physical hardware. Source: `services/api/app/services/lab_compiler.py`, `services/api/app/services/topology_resolver.py`. |
| `docs/verification/2026-10-13-post-r7-hardening.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ H0–H6 provenance/final matrix, RPC100k/uncertainty regressions và explicit physical exclusions. Source: `tests/test_post_r7_provenance.py`, `.gitattributes`. |
| `docs/verification/2026-10-14-breadboard-mechanical-docking.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ real-mesh docking/CPU-only limitations; hai CPU preview thiếu từ baseline, không coi là GPU evidence. Source: `apps/web/src/geometry/breadboardDocking.ts`, `apps/web/tests/breadboard-docking.test.ts`. |
| `docs/verification/2026-10-14-crumb-wire-tool.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ automated geometry/raycast/300-wire results và browser denial đúng ngày; không thêm visual PASS. Source: `apps/web/src/wires/wireRouting.ts`, `apps/web/tests/wire-routing.test.ts`. |
| `docs/verification/2026-10-14-wire-path-refactor.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ semantic wire/copper refactor measurements; hai CPU image embeds hỏng chuyển thành filenames. Source: `apps/web/src/wires/wireRouting.ts`, `apps/web/tests/wire-routing.test.ts`. |
| `docs/verification/2026-10-14-workbench-ux.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ close-up zoom/Select-pan/jumper refinement theo ngày; current shared navigation mới có authority riêng. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `docs/verification/2026-10-15-compact-wire-routing.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ compact bundles/local crossing results; ba CPU images missing được ghi rõ, không thay GPU limitation. Source: `apps/web/src/wires/wireLayout.ts`, `apps/web/tests/wire-layout.test.ts`. |
| `docs/verification/2026-10-15-frontend-visual-regressions.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ DC source adapter/visual shading/search regression scope; không tái khẳng định fixture ratings. Source: `device-library/parts/physical-parts.json`, `apps/web/tests/component-properties.test.ts`. |
| `docs/verification/2026-10-15-gizmo-wire-context-tools.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ gizmo handles/clipboard successor validation và tool launcher boundaries; source/tests hiện tồn tại. Source: `apps/web/src/editor/batchCommands.ts`, `apps/web/tests/unified-commands-interaction.test.ts`. |
| `docs/verification/2026-10-15-placement-world-policy.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ mechanical-vs-camera-facing placement policy và 81-case measurement; source helper/tests còn hiện hữu. Source: `apps/web/src/geometry/placementRotation.ts`, `apps/web/tests/placement-rotation.test.ts`. |
| `docs/verification/2026-10-15-unified-editor-commands.md` | UPDATE | Báo cáo / quyết định lịch sử | Sửa 35 source/test links tuyệt đối thành tương đối có thật; giữ browser-denied và one-command history limitations. Source: `apps/web/src/editor/batchCommands.ts`, `apps/web/tests/unified-commands-interaction.test.ts`. |
| `docs/verification/2026-10-15-visual-ux-lead-editing.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ user-supplied video provenance và frontend-only lead appearance; không xem video mới hay đổi vật lý. Source: `apps/web/src/electrical/leadPath.ts`, `apps/web/tests/lead-editing.test.ts`. |
| `docs/verification/2026-10-15-wire-visual-stacking.md` | UPDATE | Báo cáo / quyết định lịch sử | Global stacking đã superseded compact routing; giữ diagnosis/tests lịch sử và ghi hai CPU ảnh missing. Source: `apps/web/src/wires/wireStacking.ts`, `apps/web/tests/wire-stacking.test.ts`. |
| `docs/verification/2026-10-16-acceptance-matrix.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ T01–T36/A01–A23 mapping và W8 counts theo ngày; current canonical source/tests vẫn là evidence implementation. Source: `contracts/registry.py`, `contracts/manifest.json`. |
| `docs/verification/2026-10-16-api-environment-refresh.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ môi trường stale Argon2 và repair audit; không sửa dependency/auto-install hoặc giả định .venv của phiên cũ hiện tồn tại. Source: `services/api/pyproject.toml`, `services/api/app/services/auth.py`. |
| `docs/verification/2026-10-16-component-palette-benchmark.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ mọi timing baseline; sửa reproduction sang output ngoài repo, không tự overwrite historical JSON/Markdown. Source: `apps/web/scripts/benchmark-component-palette.mjs`, `scripts/artifact-paths.mjs`. |
| `docs/verification/2026-10-16-component-palette-performance.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ scoped-search/visibility/thumbnail CPU measurements, browser limitations và independent review lineage. Source: `apps/web/src/data/componentSearch.ts`, `apps/web/src/three/PackageThumbnails.ts`. |
| `docs/verification/2026-10-16-contract-decisions.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ D01–D16 contract decisions làm ADR-like rationale; registry/profiles/current schema source là authority shapes. Source: `contracts/registry.py`, `contracts/manifest.json`. |
| `docs/verification/2026-10-16-github-actions-refactor.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ exact remote run links/failed counts và local fixes theo ngày; thêm note không tái dùng .test-build output paths. Source: `.github/workflows/backend.yml`, `tests/contracts/test_ci_pytest_imports.py`. |
| `docs/verification/2026-10-16-instrument-path-decision.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ channel/resource-specific instrument path ruling; native/shared guards hiện hữu, physical capability không được nâng. Source: `services/api/app/services/instrument_control.py`, `contracts/instrument_validation.py`. |
| `docs/verification/2026-10-16-source-inventory.md` | UPDATE | Báo cáo / quyết định lịch sử | Bổ sung historical snapshot note cho câu HEAD still/452files; không sửa số lượng hoặc giả vờ inventory cũ là hiện tại. Source: `scripts/check_release.py`, `tests/contracts/test_release_entrypoint.py`. |
| `docs/verification/2026-10-16-w1-contracts.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W1 generation/checkpoint kết quả712/shape toolchain và Git blocker theo ngày; không cập nhật lại kết quả. Source: `contracts/registry.py`, `contracts/manifest.json`. |
| `docs/verification/2026-10-16-w2-api-realtime.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W2 operation/realtime/instrument path checkpoint; current operations/events vẫn triển khai, lỗi cũ không tự tái diễn. Source: `services/api/app/services/operations.py`, `apps/web/tests/websocket-reconcile.test.ts`. |
| `docs/verification/2026-10-16-w3-auth-migrations.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W3 auth/migration evidence và race cases; migrations0001–0005 hiện tồn tại, không thay checkpoint. Source: `services/api/app/services/auth.py`, `services/api/app/migrations/versions/0002_auth.py`. |
| `docs/verification/2026-10-16-w4-projects.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W4 project/CAS/PostgreSQL evidence và private ownership; không coi local PostgreSQL cũ là service đang chạy. Source: `services/api/app/services/projects.py`, `apps/web/tests/project-save-controller.test.ts`. |
| `docs/verification/2026-10-16-w5-assets.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ delivered GLB/asset-provider provenance; hai model README/source là tài sản hợp lệ, không là output screenshot. Source: `apps/web/src/application/assets/AssetProvider.ts`, `apps/web/e2e/assets.spec.ts`. |
| `docs/verification/2026-10-16-w5-boundaries.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W5 caller-owned document/render/application boundaries và integrated gate results. Source: `apps/web/src/domain/document/editorDocument.ts`, `apps/web/tests/import-boundaries.test.ts`. |
| `docs/verification/2026-10-16-w6-remote-assignments.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W6 recovery without Start replay/publication/race evidence; source vẫn dùng durable operations. Source: `services/api/app/services/assignments.py`, `apps/web/src/application/experimentLifecycle.ts`. |
| `docs/verification/2026-10-16-w7-instruments-domains-capture.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W7 requested/applied ACK, domains/NCAP-retention gate; unsupported analog/physical vẫn hạn chế rõ. Source: `services/api/app/services/capture_repository.py`, `contracts/capture_codec.py`. |
| `docs/verification/2026-10-16-w8-release.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ W8 local counts/raw JSON/workload và failed attempts; thêm note commands artifact cũ chỉ là lịch sử. Source: `scripts/check_release.py`, `tests/contracts/test_release_entrypoint.py`. |
| `docs/verification/2026-10-16-web-contracts-handoff.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ handoff software/migration/counts; đổi benchmark reproduction sang default external, phân biệt Git state lịch sử với HEAD hiện tại. Source: `scripts/check_release.py`, `tests/contracts/test_release_entrypoint.py`. |
| `docs/verification/2026-10-16-web-contracts.md` | KEEP | Báo cáo / quyết định lịch sử | Giữ W0–W8 phase ledger và baseline metrics, source inventory/acceptance matrix refs; không dùng report làm nguồn sự thật thay source. Source: `contracts/registry.py`, `contracts/manifest.json`. |
| `docs/verification/2026-10-18-component-mechanics.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ automatic-template/legacy/rebuild evidence; .test-build image links là outputs cũ hiện hữu, note không chỉ dẫn tạo mới trong repo. Source: `contracts/flexible_mounting.py`, `apps/web/tests/component-mechanics-catalog.test.ts`. |
| `docs/verification/2026-10-18-component-placement.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ source inventory/1070Python/1117Web/18E2E theo ngày; .test-build command chỉ giữ như historical record. Source: `apps/web/src/editor/FlexiblePlacementController.ts`, `apps/web/tests/flexible-placement-controller.test.ts`. |
| `docs/verification/2026-10-18-contacts-wires-label.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ Contacts/Label/insertion versioning và native counts/video measurements; old ignored artifacts giữ nguyên chờ owner review. Source: `apps/web/src/three/package/SwitchPackageModels.ts`, `apps/web/tests/contact-package-models.test.ts`. |
| `docs/verification/2026-10-18-sealed-package-models.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ real mesh/closed feedthrough/shape counts và LED material iteration limits; old .test-build outputs không được tái tạo ở repo. Source: `apps/web/src/three/package/SealedPackageShapes.ts`, `apps/web/tests/package-feedthrough.test.ts`. |
| `docs/verification/2026-10-19-adaptive-depth.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ depth24-bit/math/native renderer samples và input revision limitations; old outputdirs không là current procedure. Source: `apps/web/src/three/SceneClipping.ts`, `apps/web/tests/scene-clipping.test.ts`. |
| `docs/verification/2026-10-19-ribbon-shell.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ actual native/layout/depth evidence và bảy trackedPNG; note historical output policy, chưa di chuyển hoặc xóa ảnh. Source: `apps/web/src/components/workbench/SingleWorkspaceShell.vue`, `apps/web/tests/header-ribbon.test.ts`. |
| `docs/verification/2026-10-19-unified-camera-navigation.md` | UPDATE | Báo cáo / quyết định lịch sử | Giữ anchoredzoom50–1000% correction/current source mapping và original gate limits; mark old in-repo outputs as provenance only. Source: `apps/web/src/three/ViewportNavigation.ts`, `apps/web/tests/unified-camera-navigation.test.ts`. |
| `fpga/README.md` | KEEP | FPGA scaffold overview | Rõ prototype/noSDRAM/future target/unverified electrical support. Source: control/instrument RTL, `fpga/constraints` và `fpga/quartus` không có fabricated target config. |
| `fpga/common/README.md` | KEEP | Intended reusable RTL module area | Chỉ future reusable modules; không claim module có sẵn. Source: directory hiện không chứa implemented common RTL. Không loại vì ít liên kết. |
| `fpga/constraints/README.md` | KEEP | Missing hardware input/constraints guardrail | Không có QSF/SDC giả; clock ticks abstract. Source: control RTL32-bit tick parameter và scaffold directories. |
| `fpga/experiment-controller/README.md` | KEEP | Control FSM/current limitation | SAFE→SCANNING→... state/permit/FAULT/RESET phù hợp actual top; NOT physical evidence. Source: `fpga/experiment-controller/rtl/top.v`, `fpga/simulation/tb_lab_first_control.v`, `tests/fpga/test_lab_first_control.py`. |
| `fpga/instrument/README.md` | KEEP | Future instrument boundary | Availability/capture/generator/SDRAM outputs đều constantfalse; exact parts/timing TBD. Source: `fpga/instrument/rtl/top.v`. |
| `fpga/quartus/README.md` | KEEP | Target synthesis status | Đúng NOT_VERIFIED no target QSF/pin/clock config; không xóa scaffold instructions. Source: workspace FPGA files và static/behavior tests. |
| `fpga/simulation/README.md` | KEEP | Abstract RTL verification commands | Icarus/vvp files và testbench marker đúng; POSIX output `/tmp` đã ngoài repo. Source: `fpga/simulation/tb_lab_first_control.v`, `tests/fpga/test_lab_first_control.py`, FPGA CI. Không claim đã chạy Icarus trong audit này. |
| `services/api/README.md` | UPDATE | Backend setup/source checkout/run guide | Bổ sung v2/policy/history distinction; runtime commands/installed dependencies/three-process path đối chiếu pyproject and main. Source: `services/api/pyproject.toml`, `app/config.py`, `app/api/placement.py`, `app/main.py`, root requirements/codegen. |
| `services/hardware-service/README.md` | KEEP | Local-only service/lifecycle/RPC setup | RPCv2/unavailable physical/simulation worker/current caps đúng source. Source: `hardware_service/station/physical.py`, `virtual.py`, models/server/handlers và shared RPC proto. |
| `simulator/circuit-simulator/README.md` | UPDATE | Simulator supported boundary/setup | Sửa graph chỉ1.0 và fixed four pool; bổ sung existing powered/DC subset, config worker và authority links. Source: `netcircuit_sim/dispatch.py`, `engine.py`, `analog.py`, `contracts/runtime_config.py`, virtual station. |
| `tests/end-to-end/README.md` | UPDATE | Browser suite locator | Giữ browser actual pipeline, thêm external diagnostic storage và dated evidence distinction. Source: `apps/web/e2e`, `apps/web/scripts/e2e.mjs`, `.github/workflows/browser-e2e.yml`, shared artifact helper/config. |

## ADD — bốn khoảng trống dùng chung

| File | Vai trò / bằng chứng |
| --- | --- |
| `AGENTS.md` | Quy tắc Codex ngắn ở root, dẫn index và guide; không sửa cấu hình Codex toàn cục. |
| `docs/README.md` | Index/source map và quy ước trạng thái, liên kết canonical thay vì sao chép tài liệu. |
| `docs/VERIFICATION.md` | Chính sách output, helper/CLI, workflow verification và archive dùng chung; đối chiếu scripts/config thực tế. |
| `docs/verification/2026-10-19-documentation-artifact-audit.md` | Báo cáo chính duy nhất của đợt audit, bảng đầy đủ, đề nghị xử lý và kết quả mới. |

Tổng sau bổ sung: **160 Markdown**. Không thấy Markdown project-managed trong `.github/`; vẫn đã kiểm tra các workflow ở đó. Không có tài liệu untracked liên quan ở baseline. Bỏ qua dependency/vendor, `.git`, `node_modules`, `.audit-runtime`, `.venv`/`venv`, `.build`, `.test-build`, `.runtime`, `.superpowers`, `dist`, `.vite`, Python caches và bản sao source/test scratch. Output cũ trong các thư mục ignored được kiểm kê vật lý riêng bên dưới.

## Markdown đề nghị xóa — chưa xóa

**Không có DELETE_CANDIDATE được xác nhận.** Mỗi file còn vai trò onboarding/contract/authority, provenance, lịch sử kết quả hoặc kế hoạch chưa hoàn tất; không tạo đề nghị xóa giả chỉ để có danh sách. Vì vậy không có replacement/migration/deletion precondition áp dụng hiện tại. Không xóa, đổi tên hoặc di chuyển Markdown.

Bốn `NEEDS_REVIEW` giữ nguyên vai trò chờ người phụ trách xác nhận closure: proposal kiến trúc hardware, contract review FPGA và hai kế hoạch component visuals/physical acceptance chưa đủ bằng chứng nghiệm thu gốc. Tài liệu thay thế cho authority hiện tại là `docs/ARCHITECTURE.md` và các contract/source được ghi trong từng dòng; giữ rationale, acceptance còn mở và số đo gốc trước mọi quyết định archive/xóa sau này.

## Bảo vệ lịch sử và bằng chứng thiếu

Hai archived prompt giữ nguyên bytes; `tests/test_post_r7_provenance.py` vẫn kiểm SHA-256 R0–R7, không sửa test để hợp thức hóa tài liệu. Các context/architecture/dev-log markers và hai legacy SUPERSEDED records vẫn được kiểm bởi tests cũ. LICENSE/NOTICE, ADR, onboarding và provenance không bị xóa/di chuyển; không tìm thấy LICENSE/NOTICE/ADR Markdown riêng cần thay thế trong inventory này.

50 liên kết ảnh thiếu ngay tại baseline (49 trong 24 historical reports, một JPG trong POWER_SUPPLY guide) được thay bằng tên ảnh gốc dạng văn bản và ghi rõ **nguồn bàn giao không có ảnh; chưa xem trong audit này**. Số đo và test count cũ được giữ. Đây khác với hai screenshot mới của phiên này: thực sự chụp/xem ngoài repo và chủ động không lưu lâu dài. Năm ảnh reference `assets/Image_sample/interface_1.png`…`interface_5.png` có sẵn và được giữ nguyên; không nhầm chúng với ảnh kiểm tra bị thiếu, không tuyên bố đã xem cả năm trong audit. Không tạo ảnh thay thế hoặc sửa bytes prompt hash-locked.

External URLs/datasheets được giữ làm provenance, không tải lại toàn bộ hoặc tuyên bố xác minh điện/hardware. Local paths/case/anchors được kiểm offline trên toàn bộ 160 file.

## Output ảnh/raw evidence cũ — chờ người dùng duyệt

Đây là **đề nghị cho file đã có trước phiên**, không phải file mới được sinh bởi audit. Không file nào bên dưới đã bị xóa, bỏ tracking, di chuyển hoặc cập nhật baseline. `.gitignore` không giải quyết được dữ liệu đã tracked.

### 11 file tracked tại baseline

Cả 11 file thuộc bằng chứng Ribbon trước chính sách. Tài liệu tham chiếu chính: `docs/verification/2026-10-19-ribbon-shell.md`; source nơi phát sinh trước đây: `apps/web/e2e/ribbon-shell.spec.ts`, `workspace-depth-navigation.spec.ts`, `depth-artifacts.spec.ts`. Manifest ngoại lệ chính sách chỉ bảo toàn đúng original Git hashes, không cho phép thay/sinh ảnh mới.

| Đường dẫn chính xác | Đề nghị / nội dung cần giữ | Tham chiếu / điều kiện và rủi ro |
| --- | --- | --- |
| `docs/verification/ribbon-shell/after-480-dpr1.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/after-component.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/after-error-message.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/after-file.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/after-long-message.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/after-run.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/before.png` | Ảnh output UI; đề nghị chuyển ra nơi lưu trữ do bạn chọn hoặc xóa sau duyệt. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/depth-evidence-summary.json` | Raw evidence/provenance; đề nghị chuyển ngoài repo, giữ tóm tắt số đo/hash/giới hạn trong Markdown. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/layout-evidence.json` | Raw evidence/provenance; đề nghị chuyển ngoài repo, giữ tóm tắt số đo/hash/giới hạn trong Markdown. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/navigation-evidence.json` | Raw evidence/provenance; đề nghị chuyển ngoài repo, giữ tóm tắt số đo/hash/giới hạn trong Markdown. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |
| `docs/verification/ribbon-shell/source-hashes.json` | Raw evidence/provenance; đề nghị chuyển ngoài repo, giữ tóm tắt số đo/hash/giới hạn trong Markdown. | Giữ original trước khi duyệt; cập nhật report Ribbon và manifest sau quyết định. Mất ảnh gốc làm giảm khả năng đối chiếu lịch sử; không thay bằng ảnh mới. |

Điều kiện trước mọi xử lý: người dùng chọn giữ/di chuyển/xóa từng nhóm và nơi lưu trữ bền vững nếu cần; bảo toàn thông tin cần thiết trong report, sửa links thành lời ghi trạng thái đúng; bỏ ngoại lệ manifest tương ứng khi file thực sự được xóa/chuyển. Không dùng `git rm --cached` để coi như đã giải quyết; không rewrite Git history.

### Năm raw JSON lịch sử ngoài Ribbon

| Đường dẫn chính xác | Đề nghị / nội dung cần giữ | Tham chiếu / điều kiện |
| --- | --- | --- |
| `docs/verification/2026-10-09-interactive-workspace.json` | Chuyển ngoài/xóa sau duyệt; giữ scenario và số đo lịch sử trong Markdown. | `docs/verification/2026-10-09-interactive-workspace-browser.md`; cập nhật locator/manifest sau quyết định. |
| `docs/verification/2026-10-09-ribbon-gizmo-layouts.json` | Raw layout evidence; giữ ý nghĩa các viewport/checks trước khi xử lý. | `docs/verification/2026-10-09-ribbon-gizmo-supply-browser.md`; chưa xóa. |
| `docs/verification/2026-10-16-component-palette-benchmark-baseline.json` | Baseline CPU/search input đang được tùy chọn `--reuse-baseline-search` dùng; NEEDS_REVIEW, phải giữ hoặc cấu hình input ngoài repo trước. | `apps/web/scripts/benchmark-component-palette.mjs`, benchmark Markdown; không làm mất khả năng tái dùng baseline. |
| `docs/verification/2026-10-16-component-palette-benchmark.json` | Raw CPU benchmark có provenance; chuyển ngoài sau khi bảo toàn đủ số liệu/rationale. | `docs/verification/2026-10-16-component-palette-benchmark.md`; không viết lại số đo bằng rerun. |
| `docs/verification/2026-10-16-w8-load.json` | Raw workload metrics; giữ kết quả/giới hạn và hardware NOT_VERIFIED trong Markdown. | `docs/verification/2026-10-16-w8-release.md`, handoff; cần người dùng duyệt nơi lưu trữ bền vững. |

Tổng tracked legacy evidence: **16 file = 7 PNG + 9 JSON**. Đây là đúng manifest pre-policy; không cho phép thêm captures mới. Hai instrument preview HTML và toàn bộ `assets/` là source/reference đầu vào, không phải danh sách output đề nghị xóa.

### Visual output ignored có sẵn trên ổ đĩa

Inventory baseline phát hiện **862** file visual-like trong `apps/web/.test-build`: 623 PNG, 194 JPEG, 28 WebM, 14 ZIP và 3 HTML. Ảnh/video/trace của các lần kiểm tra cũ là candidate đưa ngoài/xóa **sau duyệt**; các source snapshot ZIP hoặc HTML harness cần xác nhận vai trò input trước, không tự coi là output có thể xóa. Không có disk golden screenshot assertion (`toHaveScreenshot`/`toMatchSnapshot`) được tìm thấy trong scripts/tests quản lý; điều đó không đủ để kết luận ảnh reference của bạn vô dụng.

Bảng nhóm dưới đây dùng vị trí output và báo cáo/source liên quan làm provenance. Không tuyên bố đã xem/xác nhận chất lượng của toàn bộ ảnh cũ. Các Markdown lịch sử chứa lời nhắc `.test-build` đã được đánh dấu historical và trỏ guide hiện hành; không tạo link tạm thay thế.

| Nhóm đường dẫn dưới `apps/web/.test-build/` | Số file | Tham chiếu cần đối chiếu trước khi duyệt |
| --- | ---: | --- |
| `capacitor-native-evidence` | 37 | `docs/verification/2026-10-18-component-mechanics.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `component-mechanics-gallery` | 19 | `docs/verification/2026-10-18-component-mechanics.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `component-mechanics-rebuild` | 2 | `docs/verification/2026-10-18-component-mechanics.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `contacts-wires-gallery` | 17 | `docs/verification/2026-10-18-contacts-wires-label.md`; contacts/labels suites |
| `depth-artifacts` | 56 | `docs/verification/2026-10-19-adaptive-depth.md`; depth/workspace navigation suites |
| `depth-workspace-acceptance` | 20 | `docs/verification/2026-10-19-adaptive-depth.md`; depth/workspace navigation suites |
| `depth-workspace-playwright` | 25 | `docs/verification/2026-10-19-adaptive-depth.md`; depth/workspace navigation suites |
| `depth-workspace-playwright-final` | 2 | `docs/verification/2026-10-19-adaptive-depth.md`; depth/workspace navigation suites |
| `depth-workspace-playwright-navigation-final` | 13 | `docs/verification/2026-10-19-adaptive-depth.md`; depth/workspace navigation suites |
| `labels-contact-evidence` | 6 | `docs/verification/2026-10-18-contacts-wires-label.md`; contacts/labels suites |
| `led-optics-brightboard` | 8 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `led-optics-diagnostic` | 4 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `placement-acceptance` | 35 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-all-e2e` | 32 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-native-diagnose` | 3 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-native-families` | 3 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-native-final` | 36 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-native-interactions` | 3 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `placement-native-reanchor` | 1 | `docs/verification/2026-10-18-component-placement.md`; `apps/web/e2e/flexible-placement.spec.ts` |
| `ribbon-shell` | 14 | `docs/verification/2026-10-19-ribbon-shell.md`; `apps/web/e2e/ribbon-shell.spec.ts` |
| `sealed-model-gallery` | 25 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-alpha92-evidence` | 6 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-alpha98-evidence` | 3 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-gallery-interrupted-evidence` | 134 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-r49-evidence` | 21 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-regression-evidence` | 69 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-retry-evidence` | 49 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-native-surfaces-interrupted-evidence` | 70 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `sealed-surface-before` | 2 | `docs/verification/2026-10-18-sealed-package-models.md`; sealed-model suite; source captures cần giữ nếu còn làm reference |
| `unified-camera` | 138 | `docs/verification/2026-10-19-unified-camera-navigation.md`; `apps/web/e2e/unified-camera-framing.spec.ts` |
| `visual-before-src.zip` | 1 | NEEDS_REVIEW: source archive/HTML diagnostics hoặc harness; giữ trước khi xác nhận vai trò |
| `visual-regression.html` | 1 | NEEDS_REVIEW: source archive/HTML diagnostics hoặc harness; giữ trước khi xác nhận vai trò |
| `w8-second-red` | 7 | `docs/verification/2026-10-16-w8-release.md`; lab/project/graphics suites |

<details>
<summary>Danh sách đầy đủ 862 đường dẫn ignored cũ cần giữ nguyên/chờ duyệt</summary>

```text
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-compact-electrolytic.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-compact-electrolytic.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-e57667da50df16187bc16b79a72a32a5892042d1.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-compact-electrolytic-9f2ea880328a279689ed878d3a94ea3c55eee5f2.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-f9ae4b7c2470b7da466f5f1d8a45518299e1daf7.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-70c343d286cef291c00f12195cac0fe723fd83e6.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-c839ed49ad2f4d615a0a83841e7c55445b9e7ef1.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-8bf451727cbb89cdccedeb2dca6ff437b6270b71.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-compact-electrolytic-7c8529815cc73273afe3acd701d4c8b026991c04.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-a81e4c05d5489ca3481e7eef5ee0c9cc6f680009.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-138562294d1572bad9d4b3d5cd7fb7925c354a23.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-975295ac81b4ff481bd2d056602f948740faa2be.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-e8cef40bae1c509530aa8ed90a7a3874cd2f5beb.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-ea67809f68f61d9fcfd9c255972bee9fa96748af.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-82a26350fb88438b4ddf7595ef210c9e704a5b32.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-electrolytic-draft-9ce48460527464d3a317477dc7a66171c8db4ca0.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-24a9325bcba0ef7b69cfc1afde754065894019af.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-94a62a7686bde1bbaa45bbf3e31fdc57e215ff8d.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-0e751807d6daf8db0b909584055fc187a3c53d52.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-d839c4809a6c1aea84518f0573d9f62a9b538d11.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor_electrolytic-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/capacitor-native-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/ceramic-upright-ea3c51c6303e1f94a67f5f5a5bcae8e49091d7f2.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/diode-horizontal-d29168fb62c71cc0953c85c9048fa18e8ff2822f.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/diode-standing-25a0ed2e9d410ebaa3159e4b81af8361ac85edd2.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/electrolytic-upright-cc1dffd8998d46c6f96ef5e74b505214cfc0a61e.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/led-upright-886abca89fed5106bc443e8592b5665a3094480c.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/resistor-horizontal-923bc9e2fb3ff4953946da35d582353cad2749f8.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/resistor-standing-53eb0c9eabe63e0668bccf4a64522467c1ca03b5.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/zener-horizontal-e3f2ffac542e1de66f481aa28162f0baf4925e7a.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/zener-standing-656f6eca5278e39a92eb30b4a0f3fceeba407ea2.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/ceramic-upright.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-horizontal.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-standing.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/electrolytic-upright.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/led-upright.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-horizontal.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-standing.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/video.webm
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-horizontal.png
apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-standing.png
apps/web/.test-build/component-mechanics-rebuild/historical-rebuild-preview.png
apps/web/.test-build/component-mechanics-rebuild/historical-rebuilt-geometry.png
apps/web/.test-build/contacts-wires-gallery/buzzer-native-detail.png
apps/web/.test-build/contacts-wires-gallery/dip-native-detail.png
apps/web/.test-build/contacts-wires-gallery/dip-native-oblique.png
apps/web/.test-build/contacts-wires-gallery/double-native-detail.png
apps/web/.test-build/contacts-wires-gallery/double-native-final.png
apps/web/.test-build/contacts-wires-gallery/gallery-after-cycles.png
apps/web/.test-build/contacts-wires-gallery/gallery-before-cycles.png
apps/web/.test-build/contacts-wires-gallery/quad-native-detail.png
apps/web/.test-build/contacts-wires-gallery/quad-native-final.png
apps/web/.test-build/contacts-wires-gallery/single-native-detail.png
apps/web/.test-build/contacts-wires-gallery/single-native-final.png
apps/web/.test-build/contacts-wires-gallery/slide-native-detail.png
apps/web/.test-build/contacts-wires-gallery/slide-native-oblique.png
apps/web/.test-build/contacts-wires-gallery/tactile-native-detail.png
apps/web/.test-build/contacts-wires-gallery/wire-core-and-socket-floor-cutaway.png
apps/web/.test-build/contacts-wires-gallery/wire-terminal-tip-floor-and-insulation-annulus.png
apps/web/.test-build/contacts-wires-gallery/wire-terminal-unoccluded-native-final.png
apps/web/.test-build/depth-artifacts/after-BOARD-dpr1.png
apps/web/.test-build/depth-artifacts/after-DISPLAY-dpr1.png
apps/web/.test-build/depth-artifacts/after-DISPLAY-dpr2.png
apps/web/.test-build/depth-artifacts/after-DOUBLE-dpr1.png
apps/web/.test-build/depth-artifacts/after-DOUBLE-dpr2.png
apps/web/.test-build/depth-artifacts/after-GEN-dpr1.png
apps/web/.test-build/depth-artifacts/after-PSU-dpr1.png
apps/web/.test-build/depth-artifacts/after-QUAD-dpr1.png
apps/web/.test-build/depth-artifacts/after-QUAD-dpr2.png
apps/web/.test-build/depth-artifacts/after-SCOPE-dpr1.png
apps/web/.test-build/depth-artifacts/after-workspace-inspect-pose.png
apps/web/.test-build/depth-artifacts/before-DISPLAY.png
apps/web/.test-build/depth-artifacts/before-GEN.png
apps/web/.test-build/depth-artifacts/before-SCOPE.png
apps/web/.test-build/depth-artifacts/before-after-right-drag.png
apps/web/.test-build/depth-artifacts/before-workspace-1920/full-workspace-right-drag.png
apps/web/.test-build/depth-artifacts/before-workspace-1920/zoom-50-right-drag.png
apps/web/.test-build/depth-artifacts/before-workspace-1920/zoom-50.png
apps/web/.test-build/depth-artifacts/before-workspace/full-workspace-right-drag.png
apps/web/.test-build/depth-artifacts/before-workspace/zoom-50-right-drag.png
apps/web/.test-build/depth-artifacts/before-workspace/zoom-50.png
apps/web/.test-build/depth-artifacts/empty-grid-100.png
apps/web/.test-build/depth-artifacts/empty-grid-1000.png
apps/web/.test-build/depth-artifacts/empty-grid-50.png
apps/web/.test-build/depth-artifacts/final/after-BOARD-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-BOARD-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-DISPLAY-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-DISPLAY-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-DOUBLE-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-DOUBLE-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-GEN-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-GEN-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-PSU-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-PSU-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-QUAD-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-QUAD-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-SCOPE-dpr1.png
apps/web/.test-build/depth-artifacts/final/after-SCOPE-dpr2.png
apps/web/.test-build/depth-artifacts/final/after-workspace-inspect-pose.png
apps/web/.test-build/depth-artifacts/final/empty-grid-100.png
apps/web/.test-build/depth-artifacts/final/empty-grid-1000.png
apps/web/.test-build/depth-artifacts/final/empty-grid-50.png
apps/web/.test-build/depth-artifacts/final/grid-after.png
apps/web/.test-build/depth-artifacts/final/led-current-off.png
apps/web/.test-build/depth-artifacts/final/led-current-on.png
apps/web/.test-build/depth-artifacts/final/led-historical-off.png
apps/web/.test-build/depth-artifacts/final/led-historical-on.png
apps/web/.test-build/depth-artifacts/grid-after.png
apps/web/.test-build/depth-artifacts/grid-cutoff-before.png
apps/web/.test-build/depth-artifacts/led-current-off.png
apps/web/.test-build/depth-artifacts/led-current-on.png
apps/web/.test-build/depth-artifacts/led-historical-off.png
apps/web/.test-build/depth-artifacts/led-historical-on.png
apps/web/.test-build/depth-artifacts/reference-near-DISPLAY.png
apps/web/.test-build/depth-artifacts/reference-near-GEN.png
apps/web/.test-build/depth-artifacts/reference-near-SCOPE.png
apps/web/.test-build/depth-workspace-acceptance/empty-workspace-grid-after-model-move.png
apps/web/.test-build/depth-workspace-acceptance/empty-workspace-grid-before-placement.png
apps/web/.test-build/depth-workspace-acceptance/empty-workspace-grid-with-preview.png
apps/web/.test-build/depth-workspace-acceptance/empty-workspace-ground-placement.png
apps/web/.test-build/depth-workspace-acceptance/fit.png
apps/web/.test-build/depth-workspace-acceptance/home-reset.png
apps/web/.test-build/depth-workspace-acceptance/initial-crossing-fallback/zoom-1000-right-orbit.png
apps/web/.test-build/depth-workspace-acceptance/initial-crossing-fallback/zoom-1000.png
apps/web/.test-build/depth-workspace-acceptance/middle-pan.png
apps/web/.test-build/depth-workspace-acceptance/view-front.png
apps/web/.test-build/depth-workspace-acceptance/view-top-front-right.png
apps/web/.test-build/depth-workspace-acceptance/view-top.png
apps/web/.test-build/depth-workspace-acceptance/wire-drawn-and-edited.png
apps/web/.test-build/depth-workspace-acceptance/zoom-100-right-orbit.png
apps/web/.test-build/depth-workspace-acceptance/zoom-100.png
apps/web/.test-build/depth-workspace-acceptance/zoom-1000-right-orbit.png
apps/web/.test-build/depth-workspace-acceptance/zoom-1000.png
apps/web/.test-build/depth-workspace-acceptance/zoom-50-right-orbit.png
apps/web/.test-build/depth-workspace-acceptance/zoom-50.png
apps/web/.test-build/depth-workspace-acceptance/zoom-to-area.png
apps/web/.test-build/depth-workspace-playwright-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/test-failed-1.png
apps/web/.test-build/depth-workspace-playwright-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/trace.zip
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/fit-62a748056be3813c708952e4d02105b0f92a23c9.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/home-reset-4ef483de9793204fdd22caced13a1a34d7d9ab19.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/middle-pan-ac31063e3b155afe68bd6fba1bbbec46fa6c3023.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-front-d10aafbbaa7e285e389026fea48bed785cca9b5b.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-top-7b54aa916fbe5a1d34a1f6c21160e59e42b64517.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-top-front-right-bca41a30b8594e8bba60b3d57bcd4b337e13042c.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-100-182c5d7626a3f640c4a7b4dcebd3e15fa326a969.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-100-right-orbit-4550f36d42f03110f943c9b764a9ae60b1f0b812.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-1000-b427563808d816347a0638b8097d14d6a4ac9fa8.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-1000-right-orbit-63ada2b42c5e1c91c6c0d69167580607e736a86a.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-50-6a752dc33bf4e5394daf6622b0092399875fd194.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-50-right-orbit-729af14ef22a4a31f88e8a2a0b023bbe53123285.png
apps/web/.test-build/depth-workspace-playwright-navigation-final/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-to-area-39e7863f31ce9e8856f3bec7c12212b31c9f334e.png
apps/web/.test-build/depth-workspace-playwright/contacts-wires-gallery-nat-0a5ca-iffusers-and-package-bounds/attachments/double-native-final-28334fd8e8c2b95240274457f24b2534647f9b7b.png
apps/web/.test-build/depth-workspace-playwright/contacts-wires-gallery-nat-0a5ca-iffusers-and-package-bounds/attachments/quad-native-final-98724da5cac3894d15d7e26ed74eb38e8406d642.png
apps/web/.test-build/depth-workspace-playwright/contacts-wires-gallery-nat-0a5ca-iffusers-and-package-bounds/attachments/single-native-final-4657a17036f0411ecc95c2df3955f39f47610b2f.png
apps/web/.test-build/depth-workspace-playwright/contacts-wires-gallery-nat-0a5ca-iffusers-and-package-bounds/attachments/wire-terminal-unoccluded-native-final-9aab16184973f571b5be2003c7b366b02c441760.png
apps/web/.test-build/depth-workspace-playwright/flexible-placement-native--92847-ory-without-body-pose-tools/video.webm
apps/web/.test-build/depth-workspace-playwright/flexible-placement-native--c0d48--geometry-and-stale-handles/video.webm
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-2f68e-heir-actual-actuator-meshes/attachments/native-contact-controls-c66af18f7c120d0090f4c83baeeb7512fa7cf90d.png
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-2f68e-heir-actual-actuator-meshes/native-contact-controls.png
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-2f68e-heir-actual-actuator-meshes/video.webm
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-8e348-ain-history-and-persistence/attachments/native-label-edited-fe0f01bc8cab088c24e8985b8b9be454415213e4.png
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-8e348-ain-history-and-persistence/native-label-edited.png
apps/web/.test-build/depth-workspace-playwright/labels-contact-interaction-8e348-ain-history-and-persistence/video.webm
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/fit-62a748056be3813c708952e4d02105b0f92a23c9.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/home-reset-4ef483de9793204fdd22caced13a1a34d7d9ab19.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/middle-pan-ac31063e3b155afe68bd6fba1bbbec46fa6c3023.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-front-d10aafbbaa7e285e389026fea48bed785cca9b5b.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-top-7b54aa916fbe5a1d34a1f6c21160e59e42b64517.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/view-top-front-right-bca41a30b8594e8bba60b3d57bcd4b337e13042c.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-100-182c5d7626a3f640c4a7b4dcebd3e15fa326a969.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-100-right-orbit-4550f36d42f03110f943c9b764a9ae60b1f0b812.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-1000-b427563808d816347a0638b8097d14d6a4ac9fa8.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-1000-right-orbit-63ada2b42c5e1c91c6c0d69167580607e736a86a.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-50-6a752dc33bf4e5394daf6622b0092399875fd194.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-50-right-orbit-729af14ef22a4a31f88e8a2a0b023bbe53123285.png
apps/web/.test-build/depth-workspace-playwright/workspace-depth-navigation-11ee9--Orbit-pan-Fit-and-ViewCube/attachments/zoom-to-area-39e7863f31ce9e8856f3bec7c12212b31c9f334e.png
apps/web/.test-build/labels-contact-evidence/labels-contact-interaction-2f68e-heir-actual-actuator-meshes.webm
apps/web/.test-build/labels-contact-evidence/labels-contact-interaction-41182-es-without-moving-the-sheet.webm
apps/web/.test-build/labels-contact-evidence/labels-contact-interaction-8e348-ain-history-and-persistence.webm
apps/web/.test-build/labels-contact-evidence/native-contact-controls.png
apps/web/.test-build/labels-contact-evidence/native-label-detached.png
apps/web/.test-build/labels-contact-evidence/native-label-edited.png
apps/web/.test-build/led-optics-brightboard/alpha-095.png
apps/web/.test-build/led-optics-brightboard/alpha-097-no-shadow.png
apps/web/.test-build/led-optics-brightboard/alpha-097.png
apps/web/.test-build/led-optics-brightboard/alpha-098.png
apps/web/.test-build/led-optics-brightboard/alpha-099.png
apps/web/.test-build/led-optics-brightboard/ior-1.png
apps/web/.test-build/led-optics-brightboard/path-1mm.png
apps/web/.test-build/led-optics-brightboard/path-2.5mm.png
apps/web/.test-build/led-optics-diagnostic/alpha-092.png
apps/web/.test-build/led-optics-diagnostic/baseline.png
apps/web/.test-build/led-optics-diagnostic/clear-proof.png
apps/web/.test-build/led-optics-diagnostic/no-self-shadow.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-fc690545b0025696b55871793b067b486da8e4ed.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-d28c6fbe14af564d331fc5b490427d7df459cdfa.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-621a82ddd0b9406de1a77f123cea78af6dbd5b2e.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-ff1754fc6bc3fe0a22e6408746d4f834c2c58305.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-39f5f1c1dc7953a715e9b75e0817092402893e59.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-22950d9b55f3d19595db7b3a2ebdc671c41994b0.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-f9f992bd54f8f4e190a5606be5904892e96f720e.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-03e0c1adc247556d6f532b7f43374a566bd37286.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-2bb755d15fbd054732a76570f2990e4620019403.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-44f0830111b7a6c1e2f67b567eb270b5dfcd1adc.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-d7bc6e62a34605962f3de340c765e2d6b8ed95e8.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-22a7b8b72a1959533f5aef713e3e8430d62aba1d.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-1f2ba53f14623e246135ed1763e65f18bc45325f.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-9cddc3823f1a6da96cf7694608ed7fd4b7e49e0b.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-11b2a4410ca3b22fb3fe64a215fbc143ca09fce3.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/placement-acceptance/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/placement-acceptance/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/placement-acceptance/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/attachments/native-axial-families-and-authored-bend-1f8cc225f5d1ed3c0fa88f070331142ba5cf1bd3.png
apps/web/.test-build/placement-acceptance/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/native-axial-families-and-authored-bend.png
apps/web/.test-build/placement-acceptance/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/video.webm
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-30ff5eef5850768eaa52a415225389fa6324ac0c.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-4471e2435e404f4b527501af9b625a579b5188fb.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-8a7f5fd12abf2659d3d718c5b9451deec4ca601c.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-255ffa95ff78a7cf12cfb1bdd87738193571cac8.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-92eba26862c13432869f602e75de9a8796d561aa.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-53d1181fe4c7f18670d7671899c2ed541658c261.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-c26b750427218c7ef4a39f1a4cdf2ad65914c965.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-51b0d9d2b5744549cf33c10acac4a2a62b3304c0.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-2feabc6f32d9758b870b0971d8f4d7a63db8a355.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-670ab963846039355c9796bd92549cd8d8b3089b.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-0f6c24a588f90f91d3254d1da76b39f77178c95e.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-7d23b2c107a2b212ba5b47beae4b55a50547f3e2.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-1b3936d346fb79cfcb509f8e1be7832c525d7c89.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-b2f44a38a030b7ae31b188e15a30fe9f27e44f5f.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-97f932966430355c40ab9e60a5b68a58090f4d5d.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/placement-all-e2e/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/placement-all-e2e/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/placement-native-diagnose/flexible-placement-native--5c27f--and-persisted-undo-history/test-failed-1.png
apps/web/.test-build/placement-native-diagnose/flexible-placement-native--5c27f--and-persisted-undo-history/trace.zip
apps/web/.test-build/placement-native-diagnose/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/placement-native-families/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/attachments/native-axial-families-and-authored-bend-ae9597d3f0b7965011a935387eaaef487e37239f.png
apps/web/.test-build/placement-native-families/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/native-axial-families-and-authored-bend.png
apps/web/.test-build/placement-native-families/flexible-placement-native--e1169-e-preserve-stable-pin-bonds/video.webm
apps/web/.test-build/placement-native-final/flexible-assignment-actual-a38e5-ithout-replacing-the-canvas/test-failed-1.png
apps/web/.test-build/placement-native-final/flexible-assignment-actual-a38e5-ithout-replacing-the-canvas/trace.zip
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-a3432eea05b4b4b6e45ccaadbe8af880efc8ae48.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-78f76e50c91816da18f6c559a0c9e0e633865aaf.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-be8e64c9917d97c3bc962febd56d7d78caec6ed9.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-69e9e2226aaf5724b8dc628168ae316ff77ca621.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-269dec253d870c19d071653df89e3fe3fdd919ff.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-9257980863d61c20ef604673dae4798816c9054d.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-3fef419540685b6f065c8fdd5f29c2a92376e63d.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-a65eed8e94de7b6275b9a955536305d29df1b1e1.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-321f3ac9284302788af68174ee1a6f6af8d828a7.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-93cf40492c205f78244ea01b7590901a2c2c54de.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-b3c1bd2133e34d2cbd9473db11b84e63ecbd9a15.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-4b4029550407e98b3857d1a407319f8760755ac2.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-b0e11ba64757852091b8297c94fdc665068ad0fd.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-2c62252e06ca7aadee65e846366982288212d467.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-4a00423ac0978dca5588d1f353961e45bab2f7fa.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/placement-native-final/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/placement-native-final/flexible-placement-native--5c27f--and-persisted-undo-history/test-failed-1.png
apps/web/.test-build/placement-native-final/flexible-placement-native--5c27f--and-persisted-undo-history/trace.zip
apps/web/.test-build/placement-native-final/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/placement-native-interactions/flexible-placement-native--5c27f--and-persisted-undo-history/test-failed-1.png
apps/web/.test-build/placement-native-interactions/flexible-placement-native--5c27f--and-persisted-undo-history/trace.zip
apps/web/.test-build/placement-native-interactions/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/placement-native-reanchor/flexible-placement-native--5c27f--and-persisted-undo-history/video.webm
apps/web/.test-build/ribbon-shell/after-1280-dpr1.png
apps/web/.test-build/ribbon-shell/after-1280-dpr2.png
apps/web/.test-build/ribbon-shell/after-1440-dpr1.png
apps/web/.test-build/ribbon-shell/after-1440-dpr2.png
apps/web/.test-build/ribbon-shell/after-480-dpr1.png
apps/web/.test-build/ribbon-shell/after-480-dpr2.png
apps/web/.test-build/ribbon-shell/after-900-dpr1.png
apps/web/.test-build/ribbon-shell/after-900-dpr2.png
apps/web/.test-build/ribbon-shell/after-component.png
apps/web/.test-build/ribbon-shell/after-error-message.png
apps/web/.test-build/ribbon-shell/after-file.png
apps/web/.test-build/ribbon-shell/after-long-message.png
apps/web/.test-build/ribbon-shell/after-run.png
apps/web/.test-build/ribbon-shell/before.png
apps/web/.test-build/sealed-model-gallery/ceramic-upright-front.png
apps/web/.test-build/sealed-model-gallery/ceramic-upright-isometric.png
apps/web/.test-build/sealed-model-gallery/diode-horizontal-isometric.png
apps/web/.test-build/sealed-model-gallery/diode-horizontal-sealed-end.png
apps/web/.test-build/sealed-model-gallery/dip14-front.png
apps/web/.test-build/sealed-model-gallery/dip14-isometric.png
apps/web/.test-build/sealed-model-gallery/dip14-notch-detail.png
apps/web/.test-build/sealed-model-gallery/dip14-notch-end.png
apps/web/.test-build/sealed-model-gallery/dip14-top.png
apps/web/.test-build/sealed-model-gallery/electrolytic-upright-isometric.png
apps/web/.test-build/sealed-model-gallery/electrolytic-upright-value-left.png
apps/web/.test-build/sealed-model-gallery/electrolytic-upright-value-side.png
apps/web/.test-build/sealed-model-gallery/free-to92-rebuilt.png
apps/web/.test-build/sealed-model-gallery/led-upright-front.png
apps/web/.test-build/sealed-model-gallery/led-upright-isometric.png
apps/web/.test-build/sealed-model-gallery/led-upright-left.png
apps/web/.test-build/sealed-model-gallery/resistor-horizontal-isometric.png
apps/web/.test-build/sealed-model-gallery/resistor-horizontal-sealed-end.png
apps/web/.test-build/sealed-model-gallery/resistor-standing-isometric.png
apps/web/.test-build/sealed-model-gallery/rigid-dip14-rebuilt.png
apps/web/.test-build/sealed-model-gallery/to92-front.png
apps/web/.test-build/sealed-model-gallery/to92-isometric.png
apps/web/.test-build/sealed-model-gallery/to92-right.png
apps/web/.test-build/sealed-model-gallery/zener-horizontal-isometric.png
apps/web/.test-build/sealed-model-gallery/zener-horizontal-sealed-end.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/ceramic-upright-front-d03d640d25e59348fc0264bc68402ba8a4eaba9a.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/ceramic-upright-isometric-9592ef75bdec5ce34e967b92456c5bce68b67e08.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/electrolytic-upright-value-left-171cb66edf60a29eb93522bc622763e89a1907a6.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/led-upright-front-6872449abe8d218f0f5c34d13060fb2087e542de.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/led-upright-isometric-7a757bd52a7082c224fd0a4679a3661e008e2469.png
apps/web/.test-build/sealed-native-alpha92-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/led-upright-left-8d2457133b3a2a1361fdd177485a5e9f1915ec6b.png
apps/web/.test-build/sealed-native-alpha98-evidence/sealed-package-models-refi-3133a-rame-in-actual-native-views/attachments/led-upright-front-6872449abe8d218f0f5c34d13060fb2087e542de.png
apps/web/.test-build/sealed-native-alpha98-evidence/sealed-package-models-refi-3133a-rame-in-actual-native-views/attachments/led-upright-isometric-7a757bd52a7082c224fd0a4679a3661e008e2469.png
apps/web/.test-build/sealed-native-alpha98-evidence/sealed-package-models-refi-3133a-rame-in-actual-native-views/attachments/led-upright-left-8d2457133b3a2a1361fdd177485a5e9f1915ec6b.png
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/resources/088decc167bbc12fb95fb4b6a87cb9e26a73b27c.html
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291665514.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291673345.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291674416.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291674439.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291674840.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291675241.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291675609.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291675974.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291676408.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291676861.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291677372.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291677817.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291678530.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291690564.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291691621.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291691657.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291693838.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291694207.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291695088.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291696415.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291697143.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291697145.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291697147.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291697158.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698135.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698142.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698225.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698226.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698229.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698280.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698296.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698315.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291698324.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291699708.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701115.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701125.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701195.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701200.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701217.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701240.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701243.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701277.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291701283.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291702231.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291703598.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291703767.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291704682.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291705333.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291706114.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291706122.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291707056.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291708102.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291709101.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291709438.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291709907.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291710111.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291710867.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291711584.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291712450.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291712452.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291712473.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291712480.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291712481.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291713037.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291713039.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291713841.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714728.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714730.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714735.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714747.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714750.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291714757.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291715727.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291717137.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291718171.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291718179.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291719033.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291719737.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291720213.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291720696.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291721159.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291721612.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291722067.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291722910.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291723353.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291723817.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291724251.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291726386.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291726871.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291728460.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291729525.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291729550.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291730629.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733202.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733694.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733835.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733844.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733846.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733847.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291733848.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734372.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734387.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734424.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734442.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734460.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734477.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734491.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291734499.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291735494.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736944.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736958.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736960.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736963.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736964.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736965.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291736989.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291737703.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291738549.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291738622.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291738986.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291738995.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291739556.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291740888.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291741440.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291741975.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291742499.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291743061.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@d6fd8ca661925f71d6019394868348fe-1792291743638.jpeg
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-isometric-d3ba09c8bf3417f54efc232d1f5b7442cd60490a.png
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-sealed-end-97bf32e13cdaec21e7c0967039111d98b2178d53.png
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-isometric-752153db324ce20acdcc8e322e76926716d7dce5.png
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-sealed-end-a47e2980d0993ffd1ca93706eac85eb9e7650902.png
apps/web/.test-build/sealed-native-gallery-interrupted-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-standing-isometric-dd5c0173bdf23cefe1e03bdb77787cf0c1d2fcb8.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/attachments/free-to92-rebuilt-78a5e9c5d402b20f2e941f287dcee35634fb290e.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/attachments/rigid-dip14-rebuilt-a855538adb224f7a0a231bc850930f4b8aa25bc9.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/ceramic-upright-isometric-9592ef75bdec5ce34e967b92456c5bce68b67e08.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-isometric-d3ba09c8bf3417f54efc232d1f5b7442cd60490a.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-sealed-end-97bf32e13cdaec21e7c0967039111d98b2178d53.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/dip14-front-abef6bd59ad6972331e076adea3c8ea420f3184e.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/dip14-isometric-adb988a9aac3ffbdb791665dc72687737d8433b8.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/dip14-notch-detail-4602d913caae60351312e788225e152e93cf1096.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/dip14-notch-end-c7b1ca01d729c250e229a16d7e6f18cf36f0e95c.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/dip14-top-4827eace20ba39de9ba2b4d828c6266edc3f385e.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/electrolytic-upright-isometric-463536c22fb2e8d2d58cb66d276f4c45f2aa2aa5.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/electrolytic-upright-value-side-d99dd619a8ac00fdfed517447a9e117b0c77a73a.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/led-upright-isometric-7a757bd52a7082c224fd0a4679a3661e008e2469.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-isometric-752153db324ce20acdcc8e322e76926716d7dce5.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-sealed-end-a47e2980d0993ffd1ca93706eac85eb9e7650902.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-standing-isometric-dd5c0173bdf23cefe1e03bdb77787cf0c1d2fcb8.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/to92-front-efd37ca69155726970bbb2c8f702e3f4ce665b44.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/to92-isometric-20107d533d2968515d56be118471ab92782ac7ab.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/to92-right-b522c2d7143049ca445f232e7ed70017d582da60.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/zener-horizontal-isometric-8644e874f0b382a012e6f5e84316b2215fc90f83.png
apps/web/.test-build/sealed-native-r49-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/zener-horizontal-sealed-end-42e8d289f575acf00c6b6b0853db20e9698eaced.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/ceramic-upright-ca9b7e46666caa10c35b22ae33d5cce4e8e8eeb5.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/diode-horizontal-85038eecd2efb7b149ca14966ed86aa6c90262f8.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/diode-standing-9820daa17dbc0dbe3937f2a1e966ea9eef248936.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/electrolytic-upright-a5fd759d9ea747d782daa26631b9ab63b1bc705f.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/led-upright-28809598c91bb3c43862231c01fd17b9d79bd6ec.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/resistor-horizontal-2fc51bc00b65f7c09caef5389c52e6851a8e30c4.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/resistor-standing-11fd6675897325de03e1be6861df738c93035c7e.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/zener-horizontal-4306a325fd02591e6f8e87ddc15d5db56f0f9913.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/attachments/zener-standing-b4abb2d307003bd8034537ca992c9ca1f6fce409.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/ceramic-upright.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-horizontal.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-standing.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/electrolytic-upright.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/led-upright.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-horizontal.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-standing.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/video.webm
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-horizontal.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-standing.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-compact-electrolytic.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-compact-electrolytic.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-e57667da50df16187bc16b79a72a32a5892042d1.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-compact-electrolytic-9f2ea880328a279689ed878d3a94ea3c55eee5f2.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-f9ae4b7c2470b7da466f5f1d8a45518299e1daf7.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-70c343d286cef291c00f12195cac0fe723fd83e6.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-c839ed49ad2f4d615a0a83841e7c55445b9e7ef1.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-8bf451727cbb89cdccedeb2dca6ff437b6270b71.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-compact-electrolytic-7c8529815cc73273afe3acd701d4c8b026991c04.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-a81e4c05d5489ca3481e7eef5ee0c9cc6f680009.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-138562294d1572bad9d4b3d5cd7fb7925c354a23.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-975295ac81b4ff481bd2d056602f948740faa2be.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-e8cef40bae1c509530aa8ed90a7a3874cd2f5beb.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-ea67809f68f61d9fcfd9c255972bee9fa96748af.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-82a26350fb88438b4ddf7595ef210c9e704a5b32.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-24a9325bcba0ef7b69cfc1afde754065894019af.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-94a62a7686bde1bbaa45bbf3e31fdc57e215ff8d.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-0e751807d6daf8db0b909584055fc187a3c53d52.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-d839c4809a6c1aea84518f0573d9f62a9b538d11.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/trace.zip
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--246d2--preserving-saved-overrides/attachments/historical-rebuild-preview-951ae1ddd09e3e8a2d312769accc0de81605321f.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--246d2--preserving-saved-overrides/historical-rebuild-preview.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--246d2--preserving-saved-overrides/test-failed-1.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--246d2--preserving-saved-overrides/trace.zip
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--246d2--preserving-saved-overrides/video.webm
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--92847-ory-without-body-pose-tools/video.webm
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--c0d48--geometry-and-stale-handles/video.webm
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--c7ed7--bend-or-body-pose-controls/attachments/native-axial-families-and-authored-bend-900fbda613ed40d2d971b4690da87967985e7a93.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--c7ed7--bend-or-body-pose-controls/native-axial-families-and-authored-bend.png
apps/web/.test-build/sealed-native-regression-evidence/flexible-placement-native--c7ed7--bend-or-body-pose-controls/video.webm
apps/web/.test-build/sealed-native-regression-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/test-failed-1.png
apps/web/.test-build/sealed-native-regression-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/trace.zip
apps/web/.test-build/sealed-native-regression-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/test-failed-1.png
apps/web/.test-build/sealed-native-regression-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/trace.zip
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-closeup.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-compact-electrolytic.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-front.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top-front-right.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1280x720-top.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-closeup.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-compact-electrolytic.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-front.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top-front-right.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/1920x1080-top.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-closeup-e57667da50df16187bc16b79a72a32a5892042d1.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-compact-electrolytic-9f2ea880328a279689ed878d3a94ea3c55eee5f2.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-front-f9ae4b7c2470b7da466f5f1d8a45518299e1daf7.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-70c343d286cef291c00f12195cac0fe723fd83e6.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1280x720-top-front-right-c839ed49ad2f4d615a0a83841e7c55445b9e7ef1.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-closeup-8bf451727cbb89cdccedeb2dca6ff437b6270b71.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-compact-electrolytic-7c8529815cc73273afe3acd701d4c8b026991c04.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-front-a81e4c05d5489ca3481e7eef5ee0c9cc6f680009.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-138562294d1572bad9d4b3d5cd7fb7925c354a23.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/1920x1080-top-front-right-975295ac81b4ff481bd2d056602f948740faa2be.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-bjt-draft-e8cef40bae1c509530aa8ed90a7a3874cd2f5beb.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-buzzer-draft-ea67809f68f61d9fcfd9c255972bee9fa96748af.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-capacitor-draft-82a26350fb88438b4ddf7595ef210c9e704a5b32.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-diode-draft-24a9325bcba0ef7b69cfc1afde754065894019af.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-led-draft-94a62a7686bde1bbaa45bbf3e31fdc57e215ff8d.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-resistor-draft-0e751807d6daf8db0b909584055fc187a3c53d52.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/attachments/generic-zener-diode-draft-d839c4809a6c1aea84518f0573d9f62a9b538d11.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_bjt-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_buzzer-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_capacitor-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_diode-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_led-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_resistor-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/generic_zener_diode-draft.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-generic-3795b-ence-at-both-viewport-sizes/video.webm
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-native--246d2--preserving-saved-overrides/attachments/historical-rebuild-preview-951ae1ddd09e3e8a2d312769accc0de81605321f.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-native--246d2--preserving-saved-overrides/attachments/historical-rebuilt-geometry-4073f1e8332092f301cb8fb56ec66050fbe60ea3.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-native--246d2--preserving-saved-overrides/historical-rebuild-preview.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-native--246d2--preserving-saved-overrides/historical-rebuilt-geometry.png
apps/web/.test-build/sealed-native-retry-evidence/flexible-placement-native--246d2--preserving-saved-overrides/video.webm
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/attachments/free-to92-rebuilt-78a5e9c5d402b20f2e941f287dcee35634fb290e.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-nati-4d226-e-Undo-Redo-and-JSON-reload/attachments/rigid-dip14-rebuilt-a855538adb224f7a0a231bc850930f4b8aa25bc9.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-isometric-d3ba09c8bf3417f54efc232d1f5b7442cd60490a.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/diode-horizontal-sealed-end-97bf32e13cdaec21e7c0967039111d98b2178d53.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-isometric-752153db324ce20acdcc8e322e76926716d7dce5.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-horizontal-sealed-end-a47e2980d0993ffd1ca93706eac85eb9e7650902.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/resistor-standing-isometric-dd5c0173bdf23cefe1e03bdb77787cf0c1d2fcb8.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/attachments/zener-horizontal-isometric-8644e874f0b382a012e6f5e84316b2215fc90f83.png
apps/web/.test-build/sealed-native-retry-evidence/sealed-package-models-seal-49e0c-ly-and-molded-lead-closeups/trace.zip
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/resources/088decc167bbc12fb95fb4b6a87cb9e26a73b27c.html
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294067384.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294067394.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294086267.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294086268.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294088697.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294088931.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294089566.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294090164.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294090731.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294091509.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294093476.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294093936.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294095092.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294099170.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294099372.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294100368.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294100392.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294101856.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294102896.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294105184.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294105927.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294105976.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294105977.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294105990.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294106975.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294106981.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294106984.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294106986.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294106990.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294107036.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294107051.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294107055.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294107079.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294108158.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294108986.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294108999.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294110011.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294111624.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294112814.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294113584.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294113762.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294113922.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114141.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114377.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114545.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114665.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114671.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294114972.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115000.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115002.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115069.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115070.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115073.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115088.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294115094.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294116792.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294118421.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294118422.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294118423.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294118424.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294118425.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294119912.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294119916.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294121506.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294125634.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/.playwright-artifacts-0/traces/screencast/page@494d2b4f4aa118ef783a85800f359ea0-1792294126257.jpeg
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/ceramic-upright-front-d03d640d25e59348fc0264bc68402ba8a4eaba9a.png
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/ceramic-upright-isometric-9592ef75bdec5ce34e967b92456c5bce68b67e08.png
apps/web/.test-build/sealed-native-surfaces-interrupted-evidence/sealed-package-models-refi-7774c-d-readable-capacitor-values/attachments/electrolytic-upright-value-left-171cb66edf60a29eb93522bc622763e89a1907a6.png
apps/web/.test-build/sealed-surface-before/ceramic-upright-isometric.png
apps/web/.test-build/sealed-surface-before/led-upright-isometric.png
apps/web/.test-build/unified-camera/after/wide-dpr1-area-return-50.png
apps/web/.test-build/unified-camera/after/wide-dpr1-context-restored.png
apps/web/.test-build/unified-camera/after/wide-dpr1-empty-area-return-50.png
apps/web/.test-build/unified-camera/after/wide-dpr1-empty-center-area.png
apps/web/.test-build/unified-camera/after/wide-dpr1-fit-repeat.png
apps/web/.test-build/unified-camera/after/wide-dpr1-fit-separated.png
apps/web/.test-build/unified-camera/after/wide-dpr1-foreground-wire-area.png
apps/web/.test-build/unified-camera/after/wide-dpr1-home-translated-50.png
apps/web/.test-build/unified-camera/after/wide-dpr1-home-translated.png
apps/web/.test-build/unified-camera/after/wide-dpr1-native-right-orbit.png
apps/web/.test-build/unified-camera/after/wide-dpr1-partial-generator-area.png
apps/web/.test-build/unified-camera/after/wide-dpr1-peripheral-area.png
apps/web/.test-build/unified-camera/after/wide-dpr1-resized-fit.png
apps/web/.test-build/unified-camera/after/wide-dpr1-resized-readback.png
apps/web/.test-build/unified-camera/after/wide-dpr1-wheel-inspect.png
apps/web/.test-build/unified-camera/after/wide-dpr1-wheel-return-50.png
apps/web/.test-build/unified-camera/after/wide-dpr2-area-return-50.png
apps/web/.test-build/unified-camera/after/wide-dpr2-context-restored.png
apps/web/.test-build/unified-camera/after/wide-dpr2-empty-area-return-50.png
apps/web/.test-build/unified-camera/after/wide-dpr2-empty-center-area.png
apps/web/.test-build/unified-camera/after/wide-dpr2-fit-repeat.png
apps/web/.test-build/unified-camera/after/wide-dpr2-fit-separated.png
apps/web/.test-build/unified-camera/after/wide-dpr2-foreground-wire-area.png
apps/web/.test-build/unified-camera/after/wide-dpr2-home-translated-50.png
apps/web/.test-build/unified-camera/after/wide-dpr2-home-translated.png
apps/web/.test-build/unified-camera/after/wide-dpr2-native-right-orbit.png
apps/web/.test-build/unified-camera/after/wide-dpr2-partial-generator-area.png
apps/web/.test-build/unified-camera/after/wide-dpr2-peripheral-area.png
apps/web/.test-build/unified-camera/after/wide-dpr2-resized-fit.png
apps/web/.test-build/unified-camera/after/wide-dpr2-resized-readback.png
apps/web/.test-build/unified-camera/after/wide-dpr2-wheel-inspect.png
apps/web/.test-build/unified-camera/after/wide-dpr2-wheel-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-context-restored.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-empty-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-empty-center-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-fit-after-area-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-fit-repeat.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-fit-separated.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-foreground-wire-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-home-translated-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-home-translated.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-minus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-native-right-orbit.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-partial-generator-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-peripheral-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-plus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-resized-fit.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-resized-readback.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-wheel-inspect.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr1-wheel-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-context-restored.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-empty-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-empty-center-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-fit-after-area-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-fit-repeat.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-fit-separated.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-foreground-wire-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-home-translated-50.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-home-translated.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-minus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-native-right-orbit.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-partial-generator-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-peripheral-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-plus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-resized-fit.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-resized-readback.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-wheel-inspect.png
apps/web/.test-build/unified-camera/anchored-after/portrait-dpr2-wheel-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-context-restored.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-context-restored.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-empty-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-empty-center-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-fit-after-area-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-fit-repeat.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-fit-separated.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-foreground-wire-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-home-translated-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-home-translated.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-minus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-native-right-orbit.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-partial-generator-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-peripheral-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-plus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-resized-fit.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-resized-readback.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-wheel-inspect.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr1-wheel-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-context-restored.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-empty-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-empty-center-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-fit-after-area-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-fit-repeat.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-fit-separated.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-foreground-wire-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-home-translated-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-home-translated.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-minus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-native-right-orbit.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-partial-generator-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-peripheral-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-plus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-resized-fit.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-resized-readback.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-wheel-inspect.png
apps/web/.test-build/unified-camera/anchored-after/wide-dpr2-wheel-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-empty-area-return-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-empty-center-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-fit-after-area-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-fit-repeat.png
apps/web/.test-build/unified-camera/anchored-after/wide-fit-separated.png
apps/web/.test-build/unified-camera/anchored-after/wide-foreground-wire-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-home-translated-50.png
apps/web/.test-build/unified-camera/anchored-after/wide-home-translated.png
apps/web/.test-build/unified-camera/anchored-after/wide-minus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-native-right-orbit.png
apps/web/.test-build/unified-camera/anchored-after/wide-partial-generator-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-peripheral-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-plus-after-area.png
apps/web/.test-build/unified-camera/anchored-after/wide-resized-fit.png
apps/web/.test-build/unified-camera/anchored-after/wide-resized-readback.png
apps/web/.test-build/unified-camera/anchored-after/wide-wheel-inspect.png
apps/web/.test-build/unified-camera/anchored-after/wide-wheel-return-50.png
apps/web/.test-build/unified-camera/before/wide-area-return-50.png
apps/web/.test-build/unified-camera/before/wide-fit-repeat.png
apps/web/.test-build/unified-camera/before/wide-fit-separated.png
apps/web/.test-build/unified-camera/before/wide-home-translated-50.png
apps/web/.test-build/unified-camera/before/wide-home-translated.png
apps/web/.test-build/unified-camera/before/wide-peripheral-area.png
apps/web/.test-build/unified-camera/depth-grid-anchored/after-workspace-inspect-pose.png
apps/web/.test-build/unified-camera/depth-grid-anchored/empty-grid-100.png
apps/web/.test-build/unified-camera/depth-grid-anchored/empty-grid-1000.png
apps/web/.test-build/unified-camera/depth-grid-anchored/empty-grid-50.png
apps/web/.test-build/unified-camera/depth-grid-anchored/grid-after.png
apps/web/.test-build/visual-before-src.zip
apps/web/.test-build/visual-regression.html
apps/web/.test-build/w8-second-red/playwright/graphics-recovery-native-W-0a018--canvas-graph-history-or-UI/test-failed-1.png
apps/web/.test-build/w8-second-red/playwright/graphics-recovery-native-W-0a018--canvas-graph-history-or-UI/trace.zip
apps/web/.test-build/w8-second-red/playwright/lab-workflows-instructor-d-c4dd4-ve-local-answers-for-a-fork/test-failed-1.png
apps/web/.test-build/w8-second-red/playwright/lab-workflows-instructor-d-c4dd4-ve-local-answers-for-a-fork/test-failed-2.png
apps/web/.test-build/w8-second-red/playwright/lab-workflows-instructor-d-c4dd4-ve-local-answers-for-a-fork/trace.zip
apps/web/.test-build/w8-second-red/playwright/projects-actual-IndexedDB--80821-til-an-explicit-guest-claim/test-failed-1.png
apps/web/.test-build/w8-second-red/playwright/projects-actual-IndexedDB--80821-til-an-explicit-guest-claim/trace.zip
```

</details>

Ngoài nhóm trên và bảy PNG tracked, inventory có **527** file visual-like khác, gồm bảy PNG product assets trong `apps/web/public` và source/reference/provenance/cache copies ở `.build`/`.superpowers`. Những file này **không được đề nghị xóa tự động**: production exporter outputs, manufacturer/pinout references, upstream design artwork và input snapshot cần giữ hoặc review riêng. Không đổi logo/icon/SVG/texture/model/golden fixture. Không ignore rộng theo extension hoặc cả `docs/`.

## Thay đổi tooling và tài liệu chính

- `AGENTS.md` → `docs/VERIFICATION.md`: một chính sách chung; `docs/README.md`: index/source map. Tài liệu hiện hành sửa Graph1.2/AssignmentV2/automatic mounting/catalog/UI/navigation/output paths theo implementation; reports lịch sử giữ số liệu và trạng thái theo ngày.
- `scripts/artifact-paths.mjs` + `.d.mts`: một allocator/validator/cleanup dùng chung, OS-temp session mặc định, absolute external parent tùy chọn, canonical symlink và mọi worktree/Git directories. CLI `--validate`/`--cleanup`; không fallback vào source. `scripts/artifact_paths.py` chỉ bridge sang Node, không sao chép thuật toán path.
- Playwright config và bảy E2E explicit-output suites chuyển ảnh/JSON; failure screenshots/traces/reporters cũng external. CLI `--output` chỉ nhận output đã qua owned allocator. Backend E2E runtime/control files và Python load benchmark đi external, vẫn kiểm sở hữu và dừng backend đúng vòng đời.
- Palette benchmark xuất raw JSON và Markdown summary mới ngoài repo, không tự ghi đè số đo báo cáo 2026-10-16. Hai model exporter chỉ đổi temporary bundles; production GLB/PNG/SVG destinations giữ nguyên. Compiled source caches không được gắn nhãn screenshot/evidence.
- Package-check logs và release pytest scratch external; release optional load bỏ JSON output path trong docs. CI Browser/Contracts upload external output rồi cleanup session của job. Docs CI kiểm links/context/provenance và Git artifacts trên mọi thay đổi, kể cả staged và PR/commit diff.
- `scripts/check-verification-artifacts.mjs` dùng vị trí output/source-asset provenance và reviewed legacy hash manifest; chặn ảnh nhúng data URI/HTML output/raw metrics và index-only content. `.gitignore` chỉ bổ sung known generated directory names `playwright-report`, `test-results`, `blob-report`, không che assets/Markdown.
- `scripts/check_markdown.py` kiểm file/path case/decoded paths, heading/explicit anchors và inline/reference/shortcut links offline; không fetch external URLs. Regression tests mới ở Node và Python không đổi assertion sản phẩm.

## Verification mới của phiên audit

Thời điểm: **2026-10-19, UTC+07:00 (Asia/Saigon)**. Môi trường: Windows 10.0.26300 x64, Node v24.20.0, Python `.audit-runtime` 3.12, Playwright pinned1.64.1, native headless Chromium 1440×1000. Renderer browser dùng ANGLE/SwiftShader theo config, không phải bằng chứng physical GPU/hardware. Revision baseline0cc66f8 + working-tree changes nêu ở báo cáo.

| Trạng thái | Lệnh / kịch bản | Kết quả thực tế |
| --- | --- | --- |
| PASS | `python scripts/check_context.py` bằng `.audit-runtime` | Markers và current authority hợp lệ. |
| PASS | `python scripts/check_markdown.py` | 160 file, 0 lỗi local link/path/case/anchor; không fetch external URLs. |
| PASS | `node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs` | 5 tests; external writable output từ root và apps/web, unique sessions, repo/Git/symlink/traversal rejection, inherited session, cleanup ownership/neighbor preservation, worktree+index+commit detection, retained PNG/JSON hashes, approved artwork/fixtures/preview inputs và embedded data URI/HTML rejection. |
| PASS | 34 Python tests liên quan (lệnh đầy đủ dưới đây) | 34 passed18.45s: docs/context/provenance, links, Python bridge, package failure diagnostics, release plan, CI config và real backend harness. |
| PASS | `npm test` tại apps/web | 1384 passed, 0 failed; 155.35s. |
| PASS | `npm run check:boundaries` tại apps/web | AST boundaries, 236 source modules. |
| PASS | `npm run build` tại apps/web | vue-tsc + production build; Vite25.20s; có chunk-size advisory cũ, không đổi bundling sản phẩm. |
| PASS | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.e2e.json` tại apps/web | E2E/config TypeScript hợp lệ. |
| PASS | `npm run test:e2e -- depth-artifacts.spec.ts ribbon-shell.spec.ts --grep "technical grid remains visible\|Header order" --reporter=line` | 2 passed21.0s; actual API/SQLite/virtual Hardware Service khởi động và shutdown exit0. Screenshot thực sự tạo ở external owned session. |
| PASS | `node node_modules/@playwright/test/cli.js test --list --reporter=line,junit,json,html` | Phát hiện53 tests/15 files; reporter output external. Negative CLI/reporter/depth outputs vào repo bị từ chối. |
| PASS | Hai exporter: build+import phần TEMP bundle thực tế, không chạy production write | Bundle temporary ngoài repo và dependency resolution hoạt động; production model/texture/icon assets giữ nguyên. Full authoring export NOT_RUN. |
| PASS | `node scripts/check-verification-artifacts.mjs`, `--base main`, `--base 4b825dc642cb6eb9a060e54bf8d69288fbee4904` | Worktree/index, PR base và CI first-push base đều hợp lệ sau nhận diện source assets và exact pre-policy legacy hashes. |
| PASS | `python scripts/sync_editor_catalog.py --check` | 86 editor types/64 current physical parts theo registry, không hardcode count lịch sử. |
| PASS | Archive hash và physical before/after inventory | Hai prompt byte-identical; không có visual file mới/đổi/xóa, kể cả ignored. Kết quả cuối ở mục cleanup. |
| PASS | `git diff --check`, staged diff/status so baseline | Không whitespace error; staged diff rỗng; không có Git deletion, stage/commit/push. |
| FAIL — đã tồn tại | Full `.audit-runtime/Scripts/python.exe -m pytest -q --basetemp <owned-external-session>/pytest-final` | **1206 passed, 1 failed, 1 skipped**, 298.76s. Test fail duy nhất là regex import false positive đã có ở baseline, chi tiết dưới. |
| NOT_RUN | Toàn bộ53 E2E, full camera/depth matrices, native Linux, production PostgreSQL/deployment, physical GPU/FPGA, full load/palette benchmark và toàn bộ datasheet network | Không cần chạy lại những checklist lịch sử trong tác vụ này; không coi kết quả cũ là bằng chứng vừa chạy. |

Lệnh34 tests liên quan, chạy từ root bằng `.audit-runtime/Scripts/python.exe -m pytest -q` và `--basetemp` trong owned external session:

```text
tests/test_docs_baseline.py tests/test_post_r7_provenance.py
tests/integration/test_context_integrity.py tests/test_markdown_links.py
tests/test_artifact_paths.py tests/contracts/test_installed_package_probe.py
tests/contracts/test_release_entrypoint.py tests/frontend/test_browser_workflow.py
tests/integration/test_browser_harness_execution.py
```

### Lỗi đã tồn tại, lỗi do đổi output và review findings

Full suite lần đầu có1203 PASS/4 FAIL/1 SKIP. Ba failure package diagnostics phát sinh khi test còn kỳ vọng log `.build` và mock `subprocess.run` chặn cả Node allocator mới. Đã sửa test boundary theo command build thực tế, giữ tất cả assertions stdout/stderr/truncation/complete-log và upload-on-failure, bổ sung external location/cleanup assertions. Lần cuối toàn bộ ba test này PASS; không còn failure do thay đổi artifact.

Failure còn lại: `tests/frontend/test_frontend_shell.py::test_frontend_imports_stay_inside_the_application_boundary`. Regex cũ bắt chuỗi `import' | '` trong type union ở `apps/web/src/components/workbench/AppTitleBar.vue:22`/`:24`, rồi coi ` | ` là package. Đã đối chiếu `git show 0cc66f8:<path>`: **cả test và source đều không thay đổi trong audit**, cùng regex tái hiện false match ở baseline. Giữ nguyên để không sửa chức năng/check không liên quan trong nhiệm vụ Markdown/artifact. AST boundary gate hiện hành vẫn PASS; đây không được báo thành full Python PASS. Một Icarus test SKIP do tool không có; warning Starlette/httpx cũ được ghi nhận, không thêm dependency chỉ để dẹp warning.

Review độc lập phát hiện và đã sửa: baseline evidence bị chặn khi PR/first-push CI; embedded image/staged-content loophole; shortcut-reference và linked-heading anchor parsing; final JSON destination symlink; benchmark ghi đè lịch sử. Regression tests đã đi từ RED sang GREEN, không disable assertion hay cập nhật baseline ảnh. Một số lượt đầu gặp sandbox EPERM khi tạo junction/Git/pytest temp hoặc mở loopback; chạy lại bằng tool permission phù hợp đã PASS, không fallback output vào repo. Không còn blocker cho scope chính sách/tài liệu.

### Quan sát screenshot mới

Đã xem trực tiếp **hai PNG tạm ngoài repo** sau native tests. Grid phủ liên tục vùng nhìn thấy, opaque model faces che grid đúng; Header/File menu và focus item hiển thị đúng ở1440×1000. Native grid test: ink31573; clip-difference0; foreground samples512; foreground changes0; near23.491828293245348/far42.62675198979123. Đây là kết quả của kịch bản clipping/grid cụ thể, không suy rộng thành full camera/Z-fighting matrix hay physical GPU certification. Không đưa ảnh hoặc đường dẫn temp thành bằng chứng lâu dài.

SHA-256 protected prompts sau sửa:

- R0–R7: `cce3f52cec112f5b9125d20bf48cfb68a38f290f1453714a491f7ebb0cdc4985`.
- Post-R7: `d1c5608e508e9f1bb313136a08158c349d0a54a5994e33e3aee2c7d191984ca0`.

## Danh sách file sửa/thêm

Tổng **120 file**; chữ ADD dưới đây là untracked mới, các file còn lại đã sửa. Giữ source assets và product runtime nguyên trạng.

```text
UPDATE .github/workflows/browser-e2e.yml
UPDATE .github/workflows/contracts.yml
UPDATE .github/workflows/docs.yml
UPDATE .gitignore
ADD AGENTS.md
UPDATE README.md
UPDATE apps/web/README.md
UPDATE apps/web/e2e/contacts-wires-gallery.spec.ts
UPDATE apps/web/e2e/depth-artifacts.spec.ts
UPDATE apps/web/e2e/labels-contact-interaction.spec.ts
UPDATE apps/web/e2e/ribbon-shell.spec.ts
UPDATE apps/web/e2e/sealed-package-models.spec.ts
UPDATE apps/web/e2e/unified-camera-framing.spec.ts
UPDATE apps/web/e2e/workspace-depth-navigation.spec.ts
UPDATE apps/web/playwright.config.ts
UPDATE apps/web/public/models/function-generator-2ch/README.md
UPDATE apps/web/public/models/oscilloscope-2ch/README.md
UPDATE apps/web/scripts/benchmark-component-palette.mjs
UPDATE apps/web/scripts/e2e.mjs
UPDATE apps/web/scripts/export-function-generator.mjs
UPDATE apps/web/scripts/export-oscilloscope.mjs
UPDATE contracts/README.md
UPDATE contracts/api/README.md
UPDATE contracts/assignment/README.md
UPDATE contracts/circuit-schema/README.md
UPDATE contracts/fpga-protocol/versions.md
UPDATE contracts/physical-lab/README.md
UPDATE device-library/README.md
UPDATE device-library/parts/README.md
UPDATE docs/ARCHITECTURE.md
UPDATE docs/CHANGELOG.md
UPDATE docs/CIRCUIT_SPEC.md
UPDATE docs/COMPONENT_PLACEMENT.md
UPDATE docs/CONTEXT.md
UPDATE docs/DEV_LOG.md
UPDATE docs/Hardware/net-Circuit-Remote_FPGA_Architecture_Lab-First_v2.md
UPDATE docs/MIGRATION_LAB_FIRST.md
UPDATE docs/POWER_SUPPLY_CONTROLS.md
ADD docs/README.md
UPDATE docs/ROADMAP.md
UPDATE docs/SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md
UPDATE docs/SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md
UPDATE docs/SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md
UPDATE docs/SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md
UPDATE docs/SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md
UPDATE docs/SOURCE_ANALYSIS_SELECTION_AND_COMPONENT_INFO.md
UPDATE docs/SOURCE_ANALYSIS_SINGLE_WORKSPACE.md
UPDATE docs/SOURCE_ANALYSIS_STABILITY_AUDIT.md
UPDATE docs/SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md
UPDATE docs/SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md
UPDATE docs/SOURCE_ANALYSIS_ZOOM_TO_AREA.md
ADD docs/VERIFICATION.md
UPDATE docs/architecture/assignments-and-publication.md
UPDATE docs/architecture/auth-and-migrations.md
UPDATE docs/architecture/projects-and-revisions.md
UPDATE docs/architecture/signal-domains-and-simulation.md
UPDATE docs/archive/legacy-v1/SINGLE_WORKSPACE_DOCS_MANIFEST.md
UPDATE docs/component-visuals-authoring-verification.md
UPDATE docs/physical-components-verification.md
UPDATE docs/reviews/net-Circuit-Remote_FPGA_Contract_Review.md
UPDATE docs/superpowers/plans/2026-10-19-unified-camera-navigation.md
UPDATE docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md
UPDATE docs/verification/2026-10-09-component-information-browser.md
UPDATE docs/verification/2026-10-09-component-transform-gizmo-browser.md
UPDATE docs/verification/2026-10-09-interactive-workspace-browser.md
UPDATE docs/verification/2026-10-09-move-tool-browser.md
UPDATE docs/verification/2026-10-09-ribbon-gizmo-supply-browser.md
UPDATE docs/verification/2026-10-09-single-workspace-browser.md
UPDATE docs/verification/2026-10-09-technical-workbench-browser.md
UPDATE docs/verification/2026-10-09-workspace-navigation-browser.md
UPDATE docs/verification/2026-10-11-collapsible-toolbars-browser.md
UPDATE docs/verification/2026-10-11-fixed-drawers.md
UPDATE docs/verification/2026-10-11-overlay-drawers.md
UPDATE docs/verification/2026-10-11-panel-resize-performance.md
UPDATE docs/verification/2026-10-11-resizable-panels-browser.md
UPDATE docs/verification/2026-10-11-zoom-to-area-browser.md
UPDATE docs/verification/2026-10-12-instrument-gui.md
UPDATE docs/verification/2026-10-12-placement-follow.md
UPDATE docs/verification/2026-10-12-placement-ghost-gizmo.md
UPDATE docs/verification/2026-10-12-placement-sticky-gizmo.md
UPDATE docs/verification/2026-10-12-supply-generator-launchers.md
UPDATE docs/verification/2026-10-13-lab-first-r6.md
UPDATE docs/verification/2026-10-14-breadboard-mechanical-docking.md
UPDATE docs/verification/2026-10-14-wire-path-refactor.md
UPDATE docs/verification/2026-10-15-compact-wire-routing.md
UPDATE docs/verification/2026-10-15-unified-editor-commands.md
UPDATE docs/verification/2026-10-15-wire-visual-stacking.md
UPDATE docs/verification/2026-10-16-component-palette-benchmark.md
UPDATE docs/verification/2026-10-16-github-actions-refactor.md
UPDATE docs/verification/2026-10-16-source-inventory.md
UPDATE docs/verification/2026-10-16-w8-release.md
UPDATE docs/verification/2026-10-16-web-contracts-handoff.md
UPDATE docs/verification/2026-10-18-component-mechanics.md
UPDATE docs/verification/2026-10-18-component-placement.md
UPDATE docs/verification/2026-10-18-contacts-wires-label.md
UPDATE docs/verification/2026-10-18-sealed-package-models.md
UPDATE docs/verification/2026-10-19-adaptive-depth.md
ADD docs/verification/2026-10-19-documentation-artifact-audit.md
UPDATE docs/verification/2026-10-19-ribbon-shell.md
UPDATE docs/verification/2026-10-19-unified-camera-navigation.md
ADD scripts/artifact-paths.d.mts
ADD scripts/artifact-paths.mjs
ADD scripts/artifact-paths.test.mjs
ADD scripts/artifact_paths.py
UPDATE scripts/benchmark_web_sessions.py
ADD scripts/check-verification-artifacts.mjs
ADD scripts/check-verification-artifacts.test.mjs
UPDATE scripts/check_contract_package.py
ADD scripts/check_markdown.py
UPDATE scripts/check_release.py
UPDATE scripts/e2e_web_server.py
ADD scripts/legacy-verification-evidence.json
UPDATE services/api/README.md
UPDATE simulator/circuit-simulator/README.md
UPDATE tests/contracts/test_installed_package_probe.py
UPDATE tests/end-to-end/README.md
UPDATE tests/frontend/test_browser_workflow.py
UPDATE tests/integration/test_browser_harness_execution.py
ADD tests/test_artifact_paths.py
ADD tests/test_markdown_links.py
```

## Cleanup và bàn giao

PASS — kiểm kê vật lý cuối: **1516 file visual-like gồm SVG**, đối chiếu SHA-256 **và mtime**, không có file mới/ghi lại/đổi/xóa trong repository, gồm cả ignored outputs. Không stage screenshot mới; index vẫn rỗng so baseline. Raw JSON mới duy nhất được quản lý trong source là manifest chính sách review tĩnh, không phải báo cáo chẩn đoán phát sinh.

PASS — các owned artifact sessions của phiên đã được cleanup sau khi xem ảnh; helper kiểm canonical path/ownership trước khi xóa. Scratch audit do chính phiên tạo cũng được dọn, không đụng ảnh cũ hoặc dữ liệu phiên khác. Lượt cleanup thư mục temp đã tạo ngoài sandbox cần cùng tool permission phù hợp; không fallback trong source. Gói bàn giao patch/ZIP ở ngoài repository chỉ chứa 120 file source/tài liệu sửa/thêm theo đúng đường dẫn tương đối, **không kèm screenshot/video/trace/raw verification reports**. Giữ thay đổi trong working tree cho người dùng review; không stage/commit/push.
