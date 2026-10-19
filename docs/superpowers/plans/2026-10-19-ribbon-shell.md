# File / Component / Run Ribbon implementation

**Goal:** Implement the supplied Ribbon/header/status-bar specification in the current `refactor` worktree, retaining the existing file, execution and rendering contracts.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Prompt_Codex_Ribbon_File_Component_Run.md` (user explicitly requests implementation, verification and a suggested commit; do not stage, commit or push).

**Architecture:** One stable workspace shell owns execution preparation and notification subscriptions. Header owns file command lifecycle and presents File plus manual-activation Component/Run tabs. One existing 96 px overlay/collapse owner contains both panels. Footer presents scoped messages and existing viewport commands.

**Stack:** Existing Vue/Pinia/TypeScript/Three/Node/Playwright; no new dependency or lockfile changes.

## Constraints

- CircuitGraph, history, selection, drafts, physical models, Contracts, backend and FPGA remain authoritative and unchanged by UI navigation.
- Do not edit SceneManager, CameraFraming, SceneClipping or TechnicalGrid. Insets integration retains `.component-panel`, occupied-state and existing size state to protect camera behavior.
- Default Component tab; File opening does not change the tab/collapse. Tab selection closes palette and expands the common Ribbon without canceling editor operations or issuing Run.
- Header DOM order: Logo, Undo, Redo, File, Component, Run, circuit name/save state, Account, Inspector.
- File order: New, Open Project, Save, Save As, Import, Export, History, Assignment. Preserve guards, shortcuts and asynchronous import/export ownership.
- Run is a single persistent command owner. Preserve all preflight configuration, principal/epoch/draft/revision/target/assignment checks, deduplication, Cancel and post-Create Stop/reconciliation. Unsupported Pause/Step stay disabled with accessible explanations.
- Footer has one white-text message region on the left and reachable viewport controls on the right. No old execution, verification, count, mode or connection badges remain there. Diagnostics remain in Inspector/History.
- Notification events differ from active context hints; actionable errors win over info; bounded history, dedupe, draft/principal scopes, full-text accessibility and lifecycle cleanup are mandatory.

## Review focus

1. Preflight pending across tab/collapse transitions must create/run once; actual shell disposal and principal/configuration changes must invalidate stale work.
2. A file read pending across menu dismissal must survive; New/principal change/unmount must reject late reads and late errors.
3. Escape from File or a hidden panel must not cancel placement/wiring; focus transfer to windows must not bounce back to File.
4. Active errors/hints must resolve promptly, with no stale principal messages or feedback from console bridging.
5. At narrow widths, long names/messages must not grow the header/footer or alter canvas geometry; one canvas, renderer and connection set must survive UI changes.

## Tasks

- [x] **1. Baseline and RED:** capture actual browser header/ribbon/footer, native canvas identity/pose and baseline screenshots; add behavioral regression failures for tab state, notifications and new command ownership.
- [x] **2. Execution owner:** create `composables/useExecutionCommands.ts` with typed injection and one shell instance; create `RunRibbonPanel.vue`; add Pause glyph; move execution tests to their new owner without dropping business assertions. Keep diagnostics in Inspector.
- [x] **3. Messages:** create `stores/workspaceMessages.ts`, `composables/useWorkspaceMessages.ts` and `SystemMessage.vue`; test priority, dedupe, active hint resolution and principal/draft scope changes. Bridge actual project, experiment, console, connection, editor and graphics sources.
- [x] **4. Header/File:** implement a presentation-only `FileMenu.vue` and persistent `AppTitleBar.vue` command owner; add the two tabs and UI tab action; preserve file races/shortcut guards and transfer focus correctly. Update existing file/account/project tests where UI roles changed.
- [x] **5. Ribbon and footer integration:** extract the Component content from its wrapper, create `WorkbenchRibbon.vue`, retain one collapse/motion owner, keep Component state/listeners inert while hidden; mount owners in shell, simplify `SimulationStatusBar.vue`, move canvas global hints/errors into the message channel and update CSS.
- [x] **6. Browser regressions:** implement `e2e/ribbon-shell.spec.ts`; adapt old File/Run selectors through shared helpers and existing E2Es while preserving their assertions. Cover native focus, menu layering, tab transitions, unsupported controls, messages, responsive/DPR/reduced-motion layout, canvas/pose/history/resource invariants and editor operations.
- [x] **7. Verify and review:** run boundaries, full unit suite, build, strict E2E TypeScript, Ribbon browser tests and relevant projects/auth/lab/camera/depth suites. Inspect before/after screenshots; obtain a fresh final code review and fix findings with focused regressions. Record exact results in `docs/verification/2026-10-19-ribbon-shell.md` and provide a short commit message.

## Execution record

Base: `71433e2`; clean linked worktree, branch `refactor`. Implement in place as explicitly requested. Runtime dependencies and local E2E services already exist. Use the memory-bounded test runner from the preceding CI fix; preserve it.

The supplied document is the implementation design/approval. Execute continuously without a redundant approval handoff. Independent final review is allowed by the executing-plans/requesting-code-review workflow; the main implementer owns all integration edits.
