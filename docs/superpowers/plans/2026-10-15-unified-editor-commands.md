# Unified editor commands implementation plan

> **For agentic workers:** Use the existing linked `refactor` worktree. Implement independent rendering/orientation tasks in parallel, then integrate and review the complete behavior.

**Goal:** Implement the user's seven requested editor corrections without changing CircuitGraph contracts or the backend.

**Architecture:** CircuitGraph remains authoritative. Pure selection/clipboard candidate builders own remapping and whole-graph validation; the circuit store commits each batch once. One command controller owns clipboard, preview and menu state. Three.js renders and picks transient previews without inserting them into the graph.

**Tech stack:** Vue 3, Pinia, TypeScript, Three.js, existing Node test runner.

**Spec:** The detailed request supplied in this chat on 2026-10-15, including the fourth reference image.

## Constraints and review focus

- No contract/backend changes, no new dependencies, no editor rewrite.
- Preserve wire editing, drawing, component placement, manual rotation, camera navigation and graph history.
- Exercise mixed selection, mounted occupancy, unselected references, graph watcher timing, right drag and invalid/cancelled previews.
- All selection-only operations leave graph/history unchanged. All rejected batches leave graph/history unchanged.

## Tasks

- [x] Gizmo: add camera/yaw/zoom regression tests, replace adaptive layouts with a fixed screen-facing ring at the model pivot, verify picks and placement capture.
- [x] Orientation: add catalog/instrument pose regressions, make default placement independent of camera, retain stored manual transforms.
- [x] Batch commands: add pure clipboard/candidate tests for deep cloning, unique IDs, endpoint/mount/frame remapping, rotated-board pitch, occupancy rejection and atomic store undo/redo; reuse electrical validators.
- [x] Selection: add mixed click/Meta/Ctrl/marquee tests; exclude background boards from marquee; normalize selection and keep single-object inspector/highlights coherent.
- [x] Controller: replace wire-only clipboard/menu ownership with one shared selection command controller; render group ghosts, validate before commit, retain next-paste cursor, cancel on Escape/right click and isolate own graph watchers.
- [x] Context/navigation: defer menu until a right click is distinguished from right drag; preserve existing OrbitControls input and wire editing priorities.
- [x] Integration/review: inspect all changes, run `cd apps/web && npm test` and `npm run build`, repair failures, report changed files and actual limitations.
