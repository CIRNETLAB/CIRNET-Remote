# Web & Contracts acceptance traceability

Authority: Lab-First v3.1 and the supplied W0–W8 task. W0–W8 local software gates passed:1015 full Python/1 Icarus SKIP,1054 Web/typecheck/AST/build,355 Contracts,16 actual PostgreSQL, four installed wheels outside checkout,14 native Chromium and the final50-principal1195-request workload. Every T01–T36 row below has executed local test/file evidence. Hosted CI, minimum Python3.11 execution, target deployment and hardware validation remain explicitly NOT RUN/unavailable; PASS does not claim those external gates.

| ID | Evidence in the current source | Gate |
| --- | --- | --- |
| T01 | `tests/contracts/test_contract_codegen.py`, `test_contract_registry.py`; staged generator/check-only drift and new-family manifest coverage | PASS — W1, W8 final |
| T02 | Registry unsupported keyword/reference tests, private-reference/type generation rejection | PASS — W1; W8 final |
| T03 | `test_circuit_schema.py`, `test_physical_mounting.py`, `test_project_api.py`; Web physical-mounting/wire/memory/project tests and `e2e/projects.spec.ts` | PASS — W1/W4/W5 |
| T04 | Shared `test_validation_profiles.py`, RPC field tests and generated browser boundaries; lossless JSON numeric guards, legacy storage divergence documented | PASS — W1/W2 |
| T05 | External mount conditionals and null/optional fixtures in registry/physical-mounting conformance; generated Python/Web fixtures | PASS — W1 |
| T06 | Shared semantic profile corpus, capture/generation metadata cases and public API response conformance | PASS — W1/W2/W7 |
| T07 | `services/api/tests/test_lab_lifecycle.py`, physical resolver/preview tests and execution policy | PASS — W0/W2, preserved |
| T08 | Lifecycle/compiler/resolver regressions prove observed student binding and no reference-net repair | PASS — W2, preserved |
| T09 | `test_instrument_path_compiler.py`, `test_instrument_path_rpc.py`, shared capability tests; approved path with analog-routing=false, default channels0 | PASS — W2/W7 |
| T10 | API auth/security/cookie-loss/control/WebSocket tests, real composable/EventClient rotation regressions, `e2e/auth.spec.ts` and held-response `auth-rotation.spec.ts` | PASS W3/W6/W8 hardening; full14-case native gate PASS |
| T11 | Project/assignment/experiment/capture owner isolation tests, RBAC HTTP/WS checks, real browser role flows | PASS — W3/W4/W6/W7 |
| T12 | Auth service/session claim/revocation races, actual PostgreSQL session fence and project/capture transfer, deferred legacy proof/expiry and held binary read→claim denial, browser principal partition | PASS W3/W4/W7/W8; legacy25 focused and final1015 Python,16 PostgreSQL,14 native browser |
| T13 | `e2e/projects.spec.ts`: save/reload/open, actual API PID restart, exact retained graph; project repository/API tests | PASS — W4/W6 |
| T14 | Pure save controller and document revision tests; stale ACK/edit N+1, bounded history/recovery | PASS — W4/W5 |
| T15 | Real two-tab project and assignment CAS conflicts with keep/fork paths; SQLite/PostgreSQL writer races | PASS — W4/W6 |
| T16 | Export versus save ACK tests, principal-partitioned IndexedDB recovery and no restored live hardware authority | PASS — W4/W5/W6 |
| T17 | `test_operation_identity.py`, pure lifecycle recovery and real committed Create/lost-response browser case | PASS — W2/W6 |
| T18 | Footer preflight guards, lifecycle Stop-during-Create/Run/dispose/switch tests; real lost-ACK Create resolves to one Stop/zero Run | PASS — W6/W7 |
| T19 | `test_realtime_protocol.py`, Web sequence/reconcile tests and bounded active/history snapshot reconciliation | PASS — W2/W6 |
| T20 | Pure remote polling single-flight/coalescing/backoff and store-scope ABA regressions; logout/principal UI tests | PASS — W6 |
| T21 | `e2e/lab-workflows.spec.ts` sends real pre-run vector, executes switches→AND→LED through API/RPC/worker, displays measured rising capture; real graph1.1/DC integration | PASS — W6/W7 |
| T22 | Shared80-case NCAP corpus, Python/browser codec tests,100k-event storage/RPC tests, malformed/long-name/hash/precision cases | PASS — W7 |
| T23 | Capture HTTP content type/OpenAPI, ownership/deletion/missing/corrupt/storage errors, SHA verification and explicit unavailable UI | PASS — W2/W7 |
| T24 | `test_capture_control_isolation.py`: read/hash/delete held slow while unrelated Stop completes; revoke/delete/old-generation checks | PASS — W7 |
| T25 | Persistent capture catalog/generations and cleanup tests; Stop does not delete payload, retirement targets exact ID; all8 real workload payloads retained after Stop | PASS — W7, W8 workload PASS |
| T26 | INT16/UINT16/FLOAT32 shared fixtures, calibrated/quality/clock envelope/UI tests; default runtime Scope0 and injected-source boundary | PASS — W7 |
| T27 | Pre-run builder/forms/StatusBar/Signal Monitor tests, actual browser Create assertions; durable requested/accepted/applied generator tests | PASS — W7 |
| T28 | Trigger/duty/clock unsupported rules, explicit channel/profile controls, invalid text blocks Create/Apply, honest no-producer Scope | PASS — W7 |
| T29 | Catalog/namespace compatibility fixtures, typed dispatcher/unavailable analog/mixed results, real supported graph1.1/DC RPC cases | PASS — W7 |
| T30 | Pure document/command/history tests plus placement/selection/wire/mount/memory/gesture cancellation regressions | PASS — W5, preserved |
| T31 | Scene/resource/asset provider cancellation/disposal tests and actual GLB previews; `graphics-recovery.spec.ts` uses native WEBGL_lose_context, trusted events/draws, stable graph/canvas and Undo/Redo | PASS W5/W6 resource gates and final14-case native gate (graphics6.297s); preceding focused PASS17.2s |
| T32 | `check-boundaries.mjs` AST dependency graph/negative fixtures; pure cores avoid Vue/Pinia/Three/network, no store cycle/private hardware import | PASS — W5/W7 |
| T33 | SQLite historical migrations and explicit actual PostgreSQL backup/restore/claim/CAS/lease/capture cases; transactional recovery/audit failure retry | PASS — W3/W4/W6/W7; W8 final |
| T34 | Four clean-staged wheels installed under isolated Python/venv/cwd outside checkout; package/resource/RPC/domain/NCAP/migration/CLI probes | PASS final outside-checkout four-wheel probe109.0s; imported resources/models/RPC and installed CLIs |
| T35 | Dedicated Contracts and consumer/browser workflows; workflow/entrypoint negative tests and copied API/NCAP/security/dialect breaking mutations | PASS local Contracts355/final Python1015 and negative compatibility/workflow tests; hosted CI NOT RUN |
| T36 | `scripts/benchmark_web_sessions.py`, bounded metrics/login-pacing/owned-process and real idle-socket tests; `2026-10-16-w8-load.json`:50 authenticated sessions,10 HTTP in-flight,8 real virtual jobs/max4,1195 requests/0 unexpected/0 transport errors, clean exit | PASS final50 principals,1195 requests/0 unexpected/0 transport errors,8 real captures retained,324.689s total/17.848s active, backend0 |

## Re-audit closure mapping

Paths below are repository-relative. Test basenames are qualified by their containing directory where needed. PASS refers to executed local gates, not hosted CI or hardware validation.

| Finding | Implemented closure | Regression/conformance evidence | Status |
| --- | --- | --- | --- |
| A01 | `contracts/manifest.json`, generated `contracts/boundary/models.py` and `apps/web/src/contracts/generated/` replace duplicate shape authority | `tests/contracts/test_contract_codegen.py`, `test_generated_python.py`; Web `generated-boundary.test.ts` | PASS W1; final Python/Web |
| A02 | Offline URI registry, JSON Schema2020-12 runtime validation and deterministic supported-keyword generation | `tests/contracts/test_contract_registry.py`, `test_contract_codegen.py`; Web `import-boundaries.test.ts` | PASS W1; final Contracts |
| A03 | Contract-name-bound parsers and generated operation response parsers | Web `generated-boundary.test.ts`, `api-response-boundary.test.ts`; generated discriminated DTO typecheck | PASS W1/W2; final Web |
| A04 | Canonical public DTOs, response models, schema-only OpenAPI export and typed client operations | `services/api/tests/test_public_api_contracts.py`, `test_auth_openapi.py`; Web `api-operations.test.ts` | PASS W2; final Python/Web |
| A05 | Explicit structural/editor/transport/execution profiles and shared cross-field semantics | `tests/contracts/test_validation_profiles.py`, `services/api/tests/test_circuit_validation.py`; shared Python/TS corpus | PASS W1; intentional legacy numeric divergence retained |
| A06 | Checked safe integers and protobuf field/presence bounds without coercing legacy stored JSON | `tests/contracts/test_validation_profiles.py`; Hardware Service `test_instrument_capabilities.py::test_generator_profile_preserves_optional_rpc_limit_presence`; Web `generated-boundary.test.ts` | PASS W1/W2; final Contracts/Python |
| A07 | Approved instrument paths use their own profile, allocation and compiler evidence; arbitrary analog routing stays separate | `services/api/tests/test_instrument_path_compiler.py`, `tests/integration/test_instrument_path_rpc.py`, Hardware Service `test_instrument_capabilities.py` | PASS W2/W7; real channels remain unavailable |
| A08 | Owned Project/Circuit CRUD, immutable revisions/CAS, Project Manager, exact save/open and partitioned local recovery | API `test_project_api.py`, `test_project_repository.py`; Web `project-save-controller.test.ts`, `e2e/projects.spec.ts` | PASS W4; final Python/Web |
| A09 | Durable users/sessions, Argon2 login, RBAC, CSRF/origin, expiry/revoke and explicit guest claim | API `test_auth_security.py`, `test_auth_control.py`, `test_auth_service.py`; Web `e2e/auth.spec.ts` | PASS W3/W6; final Python/Web |
| A10 | Versioned migrations0001–0005, durable principals and transaction-level authorization/ownership fences | API `test_auth_migration_integration.py`, `test_project_migrations.py`, `test_capture_migrations.py`, explicit `postgres_cases.py` | PASS SQLite/full Python and16 actual PostgreSQL cases |
| A11 | Versioned bounded realtime queues, stream/sequence/revision checks and explicit resync snapshots | API `test_realtime_protocol.py`; Web `websocket-reconcile.test.ts`, `remote-lifecycle.test.ts` | PASS W2/W6; final Python/Web |
| A12 | Pure mutation recovery, history/active reload and single-flight polling; unknown Create/Run ACK never replays Start | API `test_operation_identity.py`; Web `experiment-lifecycle-core.test.ts`, `remote-polling.test.ts`, `e2e/lab-workflows.spec.ts` | PASS W6; final Python/Web |
| A13 | Pure document/history/serialization plus application ports and composition wiring remove store cycle | Web `document-core.test.ts`, `lab-application.test.ts`, `document-revisions.test.ts`; AST boundary gate | PASS W5; final Web/190-module AST |
| A14 | Versioned SignalDomain/catalog and typed digital/DC/unavailable analog/mixed dispatch | `tests/contracts/test_signal_domains.py`, simulator `test_signal_dispatch.py`, `tests/integration/test_virtual_domains_execution.py`; Web `signal-domains.test.ts` | PASS W7; no SPICE/mixed producer claimed |
| A15 | Canonical opt-in visual/lead namespace1.0 preserves open legacy and unknown supported metadata | `tests/contracts/test_contract_registry.py`; Web `wire-layout.test.ts`, `import-boundaries.test.ts`, `project-document-hooks.test.ts` | PASS W1/W5; final Python/Web |
| A16 | Immutable draft→Create pre-run settings and durable requested/accepted/applied command identity | API `test_instrument_commands.py`; Web `instrument-run-entrypoints.test.ts`, `generator-acknowledgement.test.ts`, `e2e/lab-workflows.spec.ts` | PASS W7; no applied state without adapter acknowledgement |
| A17 | NCAP2 sampled descriptors, INT16/UINT16/FLOAT32 codecs, calibration/quality/clock-aware display preserving raw samples | `tests/contracts/test_sampled_capture_semantics.py`; Web `capture-golden.test.ts`, `analog-capture-view.test.ts`, `capture-envelope.test.ts` | PASS W7; synthetic fixtures confined to tests, runtime Scope unavailable |
| A18 | Independent Contracts CI, consumer triggers, support baseline and negative API/NCAP/RPC compatibility gates | `tests/contracts/test_release_workflows.py`, `test_public_compatibility.py`, `test_contract_codegen.py::test_supported_baseline_remains_byte_exact` | PASS local Contracts355; hosted workflow NOT RUN |
| A19 | Pinned actual Chromium CI/harness with temporary API/SQLite/RPC/virtual engine | `tests/frontend/test_browser_workflow.py`; `apps/web/e2e/*.spec.ts`, `tsconfig.e2e.json` | PASS W8 final14-case/runner0 and verified API0 on restart/final shutdown; hosted CI NOT RUN |
| A20 | Indexed capture catalog, generations, independent payload I/O, safe retirement/quota/retention | API `test_capture_control_isolation.py`, `test_capture_catalog.py`, `test_capture_maintenance.py` | PASS W7; final Python; real workload8 payloads retained after Stop |
| A21 | Targeted pure document/history, scene picking, pointer gesture session and resource ownership extraction | Web `document-core.test.ts`, `scene-picking.test.ts`, `pointer-gesture-session.test.ts`, existing editor regressions | PASS W5; final Web |
| A22 | Real bounded GLB asset provider/cache with refcount/cancellation/integrity/disposal used by both instrument previews | Web `asset-provider.test.ts`, `gltf-assets.test.ts`; native preview E2E in `assets.spec.ts` and graphics recovery in `graphics-recovery.spec.ts` | PASS final Web1054/native14; no renderer rewrite |
| A23 | Updated authority/API/setup/deployment/changelog/phase reports, decision records, matrix and full source inventory | `scripts/check_context.py`, deployment template tests; final document/source inventory review | PASS W8 final handoff/context/whitespace/source inventory; Git delivery BLOCKED |

## Explicit limits

Icarus/vvp is absent, so the existing optional RTL behavioral test remains skipped; no RTL/hardware gate is claimed. Full analog/mixed solvers and physical Scope/Generator producers remain unavailable. Target Linux/Nginx/systemd/TLS deployment and sustained/production PostgreSQL performance have not been exercised. Hosted GitHub Actions cannot be claimed from local workflow tests; no push is authorized. Linked-worktree Git metadata is read-only, so every attempted phase checkpoint fails before staging/commit. Local staged-source wheel verification proves packaged imports/resources outside the checkout, not an already-committed clean Git checkout or remote CI run.
