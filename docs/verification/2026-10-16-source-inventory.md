# Source inventory — 2026-10-16

Inventory of publishable changed and new files against the original clean HEAD `8100039988272c2fa2b5972a00a603261e80064e` (`8100039`). HEAD still points to that commit. This compares the accumulated W0–W8 workspace with the original baseline; it does not claim an isolated clean CI run or a release commit.

`M` means a tracked path changed relative to the original HEAD. `A` means a new path reported as untracked. Additions remain untracked because Git metadata is read-only. Staging was attempted and failed; no staging or commit succeeded.

Collected using NUL-delimited paths (decoded as UTF-8), without reading file contents:

```sh
git diff --name-only -z 8100039 --
git ls-files --others --exclude-standard -z
```

Ignored runtime/build/dependency files and local `.env` secrets are excluded. Checked-in/public example environment templates are included. The inventory includes application code, schemas, generated artifacts, tests, configuration, tooling and documentation.

The existing final handoff (`docs/verification/2026-10-16-web-contracts-handoff.md`) and this inventory are included as additions. All listed paths exist at collection time.

**Total: 452 files — 145 modified, 307 additions.**

| Area | M | A | Total |
| --- | ---: | ---: | ---: |
| Repository build, dependency, CI and configuration files | 12 | 6 | 18 |
| Canonical contracts, generated boundaries, fixtures and compatibility anchors | 7 | 44 | 51 |
| Generation, verification, packaging and benchmark scripts | 3 | 8 | 11 |
| Browser application source | 50 | 55 | 105 |
| Browser generated contract artifacts | 0 | 9 | 9 |
| Browser tests and E2E fixtures | 14 | 57 | 71 |
| Browser tooling, documentation and asset metadata | 8 | 7 | 15 |
| API application, migrations and packaging | 18 | 36 | 54 |
| API tests and test helpers | 6 | 34 | 40 |
| Hardware-service source, tests and packaging | 4 | 0 | 4 |
| Simulator source, tests and packaging | 3 | 2 | 5 |
| Device catalog source | 2 | 0 | 2 |
| Repository contract, frontend, integration and deployment tests | 6 | 24 | 30 |
| Deployment templates and documentation | 5 | 3 | 8 |
| Architecture, plans, verification and handoff documentation | 7 | 22 | 29 |
| **Total** | **145** | **307** | **452** |

## Repository build, dependency, CI and configuration files

18 files (12 M, 6 A).

- M `.env.example`
- M `.gitattributes`
- M `.github/workflows/backend.yml`
- A `.github/workflows/browser-e2e.yml`
- A `.github/workflows/contracts.yml`
- M `.github/workflows/frontend.yml`
- M `.github/workflows/hardware-service.yml`
- M `.github/workflows/integration.yml`
- M `.github/workflows/simulator.yml`
- M `.gitignore`
- A `MANIFEST.in`
- M `Makefile`
- M `README.md`
- M `pyproject.toml`
- A `requirements-benchmark.txt`
- A `requirements-codegen.txt`
- A `requirements-verification.txt`
- M `setup.py`

## Canonical contracts, generated boundaries, fixtures and compatibility anchors

51 files (7 M, 44 A).

- A `contracts/README.md`
- M `contracts/api/README.md`
- A `contracts/api/openapi.json`
- A `contracts/boundary/__init__.py`
- A `contracts/boundary/base.py`
- A `contracts/boundary/capture_layout.py`
- A `contracts/boundary/models.py`
- A `contracts/capture/README.md`
- A `contracts/capture/layout.json`
- A `contracts/capture/ncap.schema.json`
- M `contracts/capture_codec.py`
- A `contracts/capture_layout.py`
- A `contracts/capture_validation.py`
- A `contracts/compatibility/2026-10-16/assignment/assignment.schema.json`
- A `contracts/compatibility/2026-10-16/baseline.json`
- A `contracts/compatibility/2026-10-16/circuit-schema/circuit.schema.json`
- A `contracts/compatibility/2026-10-16/circuit-schema/connection.schema.json`
- A `contracts/compatibility/2026-10-16/circuit-schema/module.schema.json`
- A `contracts/compatibility/2026-10-16/fpga-protocol/control.schema.json`
- A `contracts/compatibility/2026-10-16/hardware/v2/rpc_v2.proto`
- A `contracts/compatibility/2026-10-16/memory/memory-image.schema.json`
- A `contracts/compatibility/2026-10-16/physical-lab/lab.schema.json`
- A `contracts/compatibility/2026-10-16/public-wire-baseline.json`
- A `contracts/compatibility/README.md`
- M `contracts/design-models/README.md`
- M `contracts/design-models/physical-parts.v1.json`
- A `contracts/design-models/signal-domains.schema.json`
- A `contracts/design-models/signal-port-catalog.json`
- A `contracts/design/visual.schema.json`
- M `contracts/design_validation.py`
- A `contracts/fixtures/capture/conformance.json`
- A `contracts/fixtures/conformance.json`
- A `contracts/fixtures/history-conformance.json`
- A `contracts/fixtures/instrument-control-conformance.json`
- A `contracts/fixtures/signal-domains-conformance.json`
- M `contracts/instrument_validation.py`
- A `contracts/manifest.json`
- A `contracts/profiles.json`
- A `contracts/public/api.schema.json`
- A `contracts/public/assignments.schema.json`
- A `contracts/public/auth.schema.json`
- A `contracts/public/common.schema.json`
- A `contracts/public/history.schema.json`
- A `contracts/public/instrument-control.schema.json`
- A `contracts/public/projects.schema.json`
- A `contracts/public/realtime.schema.json`
- A `contracts/public_compatibility.py`
- A `contracts/registry.py`
- A `contracts/semantic_profiles.py`
- A `contracts/signal_domains.py`
- M `contracts/validation.py`

## Generation, verification, packaging and benchmark scripts

11 files (3 M, 8 A).

- A `scripts/benchmark_web_sessions.py`
- A `scripts/check_contract_package.py`
- A `scripts/check_public_compatibility.py`
- A `scripts/check_release.py`
- A `scripts/e2e_web_server.py`
- A `scripts/export_openapi.py`
- A `scripts/generate_contracts.py`
- M `scripts/generate_hardware_rpc.py`
- A `scripts/generate_python_contracts.py`
- M `scripts/sync_editor_catalog.py`
- M `scripts/sync_lab_contracts.py`

## Browser application source

105 files (50 M, 55 A).

- A `apps/web/src/application/assets/AssetProvider.ts`
- A `apps/web/src/application/assignments/authoring.ts`
- A `apps/web/src/application/experimentLifecycle.ts`
- A `apps/web/src/application/instruments/commands.ts`
- A `apps/web/src/application/instruments/configuration.ts`
- A `apps/web/src/application/labApplication.ts`
- A `apps/web/src/application/ports/execution.ts`
- A `apps/web/src/application/ports/lab.ts`
- A `apps/web/src/application/projects/recovery.ts`
- A `apps/web/src/application/projects/saveController.ts`
- A `apps/web/src/application/remoteConnection.ts`
- A `apps/web/src/application/remotePolling.ts`
- A `apps/web/src/components/account/AccountMenu.vue`
- A `apps/web/src/components/windows/AnalogCaptureView.vue`
- A `apps/web/src/components/windows/AssignmentWindow.vue`
- A `apps/web/src/components/windows/ExperimentHistoryWindow.vue`
- M `apps/web/src/components/windows/FloatingWindowManager.vue`
- M `apps/web/src/components/windows/GeneratorWindow.vue`
- M `apps/web/src/components/windows/InspectorWindow.vue`
- A `apps/web/src/components/windows/InstrumentConfigurationForm.vue`
- M `apps/web/src/components/windows/OscilloscopeWindow.vue`
- A `apps/web/src/components/windows/ProjectManagerWindow.vue`
- M `apps/web/src/components/windows/SignalMonitorWindow.vue`
- M `apps/web/src/components/workbench/AppTitleBar.vue`
- M `apps/web/src/components/workbench/SimulationStatusBar.vue`
- M `apps/web/src/components/workbench/SingleWorkspaceShell.vue`
- A `apps/web/src/composables/instrumentControlScope.ts`
- M `apps/web/src/composables/useCircuitEditor.ts`
- M `apps/web/src/composables/useLabConnection.ts`
- A `apps/web/src/composables/useLabNavigation.ts`
- A `apps/web/src/composables/useProjectWorkspace.ts`
- A `apps/web/src/contracts/structural.ts`
- A `apps/web/src/contracts/validation.ts`
- M `apps/web/src/data/editorCatalog.json`
- M `apps/web/src/data/editorCatalog.ts`
- M `apps/web/src/data/editorParts.json`
- A `apps/web/src/data/instrumentAssets.ts`
- M `apps/web/src/data/labContracts.json`
- M `apps/web/src/data/leadProperties.ts`
- M `apps/web/src/data/partCatalog.ts`
- M `apps/web/src/data/physicalParts.json`
- A `apps/web/src/data/signalPortCatalog.json`
- A `apps/web/src/domain/capture/envelope.ts`
- A `apps/web/src/domain/capture/json.ts`
- A `apps/web/src/domain/capture/ncap.ts`
- A `apps/web/src/domain/capture/validation.ts`
- A `apps/web/src/domain/document/circuitFile.ts`
- A `apps/web/src/domain/document/editorDocument.ts`
- A `apps/web/src/domain/document/graphCommands.ts`
- A `apps/web/src/domain/document/json.ts`
- A `apps/web/src/domain/document/memoryImage.ts`
- A `apps/web/src/editor/PointerGestureSession.ts`
- M `apps/web/src/editor/batchCommands.ts`
- A `apps/web/src/electrical/signalDomains.ts`
- M `apps/web/src/main.ts`
- A `apps/web/src/preview/instrumentPreview.ts`
- M `apps/web/src/router/routes.ts`
- M `apps/web/src/services/api.ts`
- A `apps/web/src/services/api/assignmentDocuments.ts`
- M `apps/web/src/services/api/assignments.ts`
- A `apps/web/src/services/api/auth.ts`
- M `apps/web/src/services/api/captures.ts`
- M `apps/web/src/services/api/circuits.ts`
- M `apps/web/src/services/api/client.ts`
- M `apps/web/src/services/api/experiments.ts`
- A `apps/web/src/services/api/history.ts`
- A `apps/web/src/services/api/instruments.ts`
- A `apps/web/src/services/api/operations.ts`
- A `apps/web/src/services/api/projects.ts`
- M `apps/web/src/services/api/stations.ts`
- A `apps/web/src/services/assets/gltfAssets.ts`
- A `apps/web/src/services/captures/analog.ts`
- M `apps/web/src/services/captures/digital.ts`
- M `apps/web/src/services/execution/presentation.ts`
- M `apps/web/src/services/files/circuitFile.ts`
- M `apps/web/src/services/files/memoryImage.ts`
- A `apps/web/src/services/recovery/indexedDb.ts`
- A `apps/web/src/services/session/controlClient.ts`
- A `apps/web/src/services/session/remoteScope.ts`
- A `apps/web/src/services/session/storeScope.ts`
- M `apps/web/src/services/websocket/client.ts`
- M `apps/web/src/services/websocket/events.ts`
- A `apps/web/src/services/websocket/reconcile.ts`
- A `apps/web/src/stores/assignments.ts`
- A `apps/web/src/stores/auth.ts`
- M `apps/web/src/stores/circuit.ts`
- M `apps/web/src/stores/experiment.ts`
- M `apps/web/src/stores/instrument.ts`
- A `apps/web/src/stores/projects.ts`
- M `apps/web/src/style.css`
- M `apps/web/src/three/ComponentModel.ts`
- A `apps/web/src/three/ObjectResources.ts`
- M `apps/web/src/three/SceneManager.ts`
- A `apps/web/src/three/ScenePicking.ts`
- M `apps/web/src/types/api.ts`
- M `apps/web/src/types/circuit.ts`
- M `apps/web/src/types/experiment.ts`
- M `apps/web/src/types/lab.ts`
- M `apps/web/src/types/labValidation.ts`
- M `apps/web/src/types/memory.ts`
- M `apps/web/src/types/station.ts`
- M `apps/web/src/types/windows.ts`
- M `apps/web/src/wires/wireClipboard.ts`
- M `apps/web/src/wires/wireRouting.ts`
- M `apps/web/src/wires/wireVisual.ts`

## Browser generated contract artifacts

9 files (0 M, 9 A).

- A `apps/web/src/contracts/generated/captureLayout.ts`
- A `apps/web/src/contracts/generated/dto.ts`
- A `apps/web/src/contracts/generated/operations.ts`
- A `apps/web/src/contracts/generated/validators.d.ts`
- A `apps/web/src/contracts/generated/validators.editor.d.ts`
- A `apps/web/src/contracts/generated/validators.editor.js`
- A `apps/web/src/contracts/generated/validators.js`
- A `apps/web/src/contracts/generated/validators.structural.d.ts`
- A `apps/web/src/contracts/generated/validators.structural.js`

## Browser tests and E2E fixtures

71 files (14 M, 57 A).

- A `apps/web/e2e/assets.spec.ts`
- A `apps/web/e2e/auth-rotation.spec.ts`
- A `apps/web/e2e/auth.spec.ts`
- A `apps/web/e2e/graphics-recovery.spec.ts`
- A `apps/web/e2e/lab-workflows.spec.ts`
- A `apps/web/e2e/lifecycle.ts`
- A `apps/web/e2e/projects.spec.ts`
- A `apps/web/tests/account-ui.test.ts`
- A `apps/web/tests/analog-capture-view.test.ts`
- A `apps/web/tests/api-operations.test.ts`
- A `apps/web/tests/api-response-boundary.test.ts`
- M `apps/web/tests/api.test.ts`
- A `apps/web/tests/asset-provider.test.ts`
- A `apps/web/tests/assignment-authoring.test.ts`
- A `apps/web/tests/assignment-boundary.test.ts`
- A `apps/web/tests/assignment-store.test.ts`
- A `apps/web/tests/assignment-window.test.ts`
- M `apps/web/tests/audit-async.test.ts`
- M `apps/web/tests/audit-file-lifecycle.test.ts`
- A `apps/web/tests/auth-rotation.test.ts`
- A `apps/web/tests/auth-scope.test.ts`
- A `apps/web/tests/auth.test.ts`
- A `apps/web/tests/capture-analog-loader.test.ts`
- M `apps/web/tests/capture-data-plane.test.ts`
- A `apps/web/tests/capture-envelope.test.ts`
- A `apps/web/tests/capture-golden.test.ts`
- A `apps/web/tests/document-core.test.ts`
- A `apps/web/tests/document-revisions.test.ts`
- A `apps/web/tests/e2e-lifecycle.test.ts`
- A `apps/web/tests/experiment-lifecycle-core.test.ts`
- A `apps/web/tests/experiment-scope.test.ts`
- A `apps/web/tests/generated-boundary.test.ts`
- A `apps/web/tests/generator-acknowledgement.test.ts`
- A `apps/web/tests/gltf-assets.test.ts`
- A `apps/web/tests/helpers/auth.ts`
- M `apps/web/tests/helpers/capture.ts`
- A `apps/web/tests/helpers/instruments.ts`
- A `apps/web/tests/helpers/labApplication.ts`
- M `apps/web/tests/helpers/station.ts`
- A `apps/web/tests/history-contracts.test.ts`
- A `apps/web/tests/history-window.test.ts`
- A `apps/web/tests/import-boundaries.test.ts`
- M `apps/web/tests/instrument-capabilities.test.ts`
- A `apps/web/tests/instrument-commands.test.ts`
- A `apps/web/tests/instrument-configuration.test.ts`
- A `apps/web/tests/instrument-control-contracts.test.ts`
- A `apps/web/tests/instrument-control-scope.test.ts`
- A `apps/web/tests/instrument-drafts.test.ts`
- A `apps/web/tests/instrument-form.test.ts`
- M `apps/web/tests/instrument-launchers.test.ts`
- A `apps/web/tests/instrument-run-entrypoints.test.ts`
- M `apps/web/tests/instrument-windows.test.ts`
- A `apps/web/tests/lab-application.test.ts`
- M `apps/web/tests/lab-first.test.ts`
- A `apps/web/tests/lab-navigation.test.ts`
- A `apps/web/tests/pointer-gesture-session.test.ts`
- A `apps/web/tests/project-document-hooks.test.ts`
- A `apps/web/tests/project-recovery.test.ts`
- A `apps/web/tests/project-save-controller.test.ts`
- A `apps/web/tests/project-window.test.ts`
- A `apps/web/tests/projects.test.ts`
- A `apps/web/tests/remote-lifecycle.test.ts`
- A `apps/web/tests/remote-polling.test.ts`
- A `apps/web/tests/scene-picking.test.ts`
- A `apps/web/tests/signal-domains.test.ts`
- A `apps/web/tests/statusbar-run-intent.test.ts`
- M `apps/web/tests/stores.test.ts`
- A `apps/web/tests/websocket-reconcile.test.ts`
- M `apps/web/tests/websocket.test.ts`
- M `apps/web/tests/wire-layout.test.ts`
- M `apps/web/tests/workbench.test.ts`

## Browser tooling, documentation and asset metadata

15 files (8 M, 7 A).

- M `apps/web/README.md`
- M `apps/web/function-generator-preview.html`
- M `apps/web/oscilloscope-preview.html`
- M `apps/web/package-lock.json`
- M `apps/web/package.json`
- A `apps/web/playwright.config.ts`
- M `apps/web/public/models/function-generator-2ch/README.md`
- M `apps/web/public/models/oscilloscope-2ch/README.md`
- A `apps/web/scripts/check-boundaries.mjs`
- A `apps/web/scripts/e2e-lifecycle.d.mts`
- A `apps/web/scripts/e2e-lifecycle.mjs`
- A `apps/web/scripts/e2e.mjs`
- A `apps/web/scripts/generate-contracts.mjs`
- A `apps/web/tsconfig.e2e.json`
- M `apps/web/vite.config.ts`

## API application, migrations and packaging

54 files (18 M, 36 A).

- M `services/api/README.md`
- M `services/api/app/api/assignments.py`
- A `services/api/app/api/auth.py`
- M `services/api/app/api/captures.py`
- M `services/api/app/api/circuits.py`
- M `services/api/app/api/experiments.py`
- M `services/api/app/api/health.py`
- A `services/api/app/api/operations.py`
- A `services/api/app/api/projects.py`
- M `services/api/app/api/stations.py`
- A `services/api/app/api/users.py`
- A `services/api/app/bootstrap_admin.py`
- A `services/api/app/capture_maintenance.py`
- M `services/api/app/config.py`
- A `services/api/app/db/__init__.py`
- A `services/api/app/db/schema.py`
- M `services/api/app/main.py`
- A `services/api/app/migrate.py`
- A `services/api/app/migrations/__init__.py`
- A `services/api/app/migrations/env.py`
- A `services/api/app/migrations/schema_v0002.py`
- A `services/api/app/migrations/schema_v0003.py`
- A `services/api/app/migrations/schema_v0004.py`
- A `services/api/app/migrations/schema_v0005.py`
- A `services/api/app/migrations/versions/0001_legacy.py`
- A `services/api/app/migrations/versions/0002_auth.py`
- A `services/api/app/migrations/versions/0003_projects.py`
- A `services/api/app/migrations/versions/0004_assignments.py`
- A `services/api/app/migrations/versions/0005_captures.py`
- A `services/api/app/migrations/versions/__init__.py`
- M `services/api/app/models/circuit.py`
- A `services/api/app/services/api_contracts.py`
- A `services/api/app/services/assignment_views.py`
- A `services/api/app/services/assignments.py`
- A `services/api/app/services/auth.py`
- A `services/api/app/services/capture_maintenance.py`
- A `services/api/app/services/capture_repository.py`
- M `services/api/app/services/capture_store.py`
- M `services/api/app/services/captures.py`
- M `services/api/app/services/circuit_validator.py`
- M `services/api/app/services/events.py`
- A `services/api/app/services/execution_errors.py`
- A `services/api/app/services/experiment_access.py`
- A `services/api/app/services/experiment_history.py`
- M `services/api/app/services/experiments.py`
- A `services/api/app/services/instrument_control.py`
- A `services/api/app/services/observability.py`
- A `services/api/app/services/operations.py`
- M `services/api/app/services/persistence.py`
- A `services/api/app/services/project_repository.py`
- A `services/api/app/services/projects.py`
- A `services/api/app/services/request_limits.py`
- M `services/api/app/websocket/events.py`
- M `services/api/pyproject.toml`

## API tests and test helpers

40 files (6 M, 34 A).

- A `services/api/tests/csrf_client.py`
- A `services/api/tests/postgres_cases.py`
- A `services/api/tests/test_application_boundary.py`
- A `services/api/tests/test_assignment_admission.py`
- A `services/api/tests/test_assignment_documents.py`
- A `services/api/tests/test_assignment_documents_api.py`
- A `services/api/tests/test_assignment_migrations.py`
- A `services/api/tests/test_auth_configuration.py`
- A `services/api/tests/test_auth_control.py`
- A `services/api/tests/test_auth_cookie_loss.py`
- A `services/api/tests/test_auth_migration_integration.py`
- A `services/api/tests/test_auth_migrations.py`
- A `services/api/tests/test_auth_openapi.py`
- A `services/api/tests/test_auth_security.py`
- A `services/api/tests/test_auth_service.py`
- A `services/api/tests/test_capture_catalog.py`
- A `services/api/tests/test_capture_control_isolation.py`
- A `services/api/tests/test_capture_maintenance.py`
- A `services/api/tests/test_capture_migrations.py`
- A `services/api/tests/test_capture_quotas.py`
- M `services/api/tests/test_capture_storage.py`
- M `services/api/tests/test_circuit_validation.py`
- M `services/api/tests/test_config.py`
- A `services/api/tests/test_control_ownership_unit.py`
- A `services/api/tests/test_experiment_document_snapshots.py`
- A `services/api/tests/test_experiment_history.py`
- A `services/api/tests/test_feedback_access.py`
- A `services/api/tests/test_instrument_commands.py`
- A `services/api/tests/test_instrument_path_compiler.py`
- M `services/api/tests/test_lab_lifecycle.py`
- A `services/api/tests/test_observability.py`
- A `services/api/tests/test_operation_identity.py`
- M `services/api/tests/test_physical_preview.py`
- A `services/api/tests/test_project_api.py`
- A `services/api/tests/test_project_migrations.py`
- A `services/api/tests/test_project_repository.py`
- A `services/api/tests/test_public_api_contracts.py`
- A `services/api/tests/test_realtime_protocol.py`
- A `services/api/tests/test_request_limits.py`
- M `services/api/tests/test_websocket.py`

## Hardware-service source, tests and packaging

4 files (4 M, 0 A).

- M `services/hardware-service/hardware_service/station/physical.py`
- M `services/hardware-service/hardware_service/station/virtual.py`
- M `services/hardware-service/pyproject.toml`
- M `services/hardware-service/tests/test_instrument_capabilities.py`

## Simulator source, tests and packaging

5 files (3 M, 2 A).

- M `simulator/circuit-simulator/netcircuit_sim/analog.py`
- A `simulator/circuit-simulator/netcircuit_sim/dispatch.py`
- M `simulator/circuit-simulator/pyproject.toml`
- M `simulator/circuit-simulator/tests/test_events.py`
- A `simulator/circuit-simulator/tests/test_signal_dispatch.py`

## Device catalog source

2 files (2 M, 0 A).

- M `device-library/editor/components.json`
- M `device-library/parts/physical-parts.json`

## Repository contract, frontend, integration and deployment tests

30 files (6 M, 24 A).

- A `tests/contracts/test_assignment_authoring_contracts.py`
- A `tests/contracts/test_capture_format.py`
- A `tests/contracts/test_contract_codegen.py`
- A `tests/contracts/test_contract_registry.py`
- A `tests/contracts/test_generated_python.py`
- A `tests/contracts/test_history_contracts.py`
- A `tests/contracts/test_installed_package_probe.py`
- A `tests/contracts/test_instrument_control_contracts.py`
- A `tests/contracts/test_instrument_path_contracts.py`
- A `tests/contracts/test_package_build.py`
- A `tests/contracts/test_project_contracts.py`
- A `tests/contracts/test_public_compatibility.py`
- A `tests/contracts/test_release_entrypoint.py`
- A `tests/contracts/test_release_workflows.py`
- A `tests/contracts/test_rpc_publication.py`
- A `tests/contracts/test_sampled_capture_semantics.py`
- A `tests/contracts/test_signal_domains.py`
- A `tests/contracts/test_validation_profiles.py`
- M `tests/deployment/test_deployment_templates.py`
- M `tests/end-to-end/README.md`
- A `tests/frontend/test_browser_workflow.py`
- M `tests/frontend/test_frontend_shell.py`
- M `tests/frontend/test_physical_catalog.py`
- A `tests/integration/test_browser_harness_execution.py`
- A `tests/integration/test_instrument_path_rpc.py`
- M `tests/integration/test_repository_boundaries.py`
- A `tests/integration/test_saved_document_execution.py`
- A `tests/integration/test_session_benchmark.py`
- A `tests/integration/test_virtual_domains_execution.py`
- M `tests/integration/test_virtual_lab_execution.py`

## Deployment templates and documentation

8 files (5 M, 3 A).

- M `deployment/README.md`
- M `deployment/mini-pc/README.md`
- A `deployment/netcircuit.production.env.example`
- M `deployment/nginx/netcircuit.conf`
- M `deployment/systemd/netcircuit-api.service`
- A `deployment/systemd/netcircuit-capture-maintenance.service`
- A `deployment/systemd/netcircuit-capture-maintenance.timer`
- M `deployment/systemd/netcircuit-hardware.service`

## Architecture, plans, verification and handoff documentation

29 files (7 M, 22 A).

- M `docs/ARCHITECTURE.md`
- M `docs/CHANGELOG.md`
- M `docs/CIRCUIT_SPEC.md`
- M `docs/CONTEXT.md`
- M `docs/DEV_LOG.md`
- M `docs/MIGRATION_LAB_FIRST.md`
- M `docs/ROADMAP.md`
- A `docs/architecture/assignments-and-publication.md`
- A `docs/architecture/auth-and-migrations.md`
- A `docs/architecture/capture-catalog.md`
- A `docs/architecture/projects-and-revisions.md`
- A `docs/architecture/signal-domains-and-simulation.md`
- A `docs/superpowers/plans/2026-10-16-web-contracts.md`
- A `docs/verification/2026-10-16-acceptance-matrix.md`
- A `docs/verification/2026-10-16-contract-decisions.md`
- A `docs/verification/2026-10-16-instrument-path-decision.md`
- A `docs/verification/2026-10-16-source-inventory.md`
- A `docs/verification/2026-10-16-w1-contracts.md`
- A `docs/verification/2026-10-16-w2-api-realtime.md`
- A `docs/verification/2026-10-16-w3-auth-migrations.md`
- A `docs/verification/2026-10-16-w4-projects.md`
- A `docs/verification/2026-10-16-w5-assets.md`
- A `docs/verification/2026-10-16-w5-boundaries.md`
- A `docs/verification/2026-10-16-w6-remote-assignments.md`
- A `docs/verification/2026-10-16-w7-instruments-domains-capture.md`
- A `docs/verification/2026-10-16-w8-load.json`
- A `docs/verification/2026-10-16-w8-release.md`
- A `docs/verification/2026-10-16-web-contracts-handoff.md`
- A `docs/verification/2026-10-16-web-contracts.md`
