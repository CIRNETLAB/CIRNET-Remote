# Replaceable Simulator Backends Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. User-authorized M3B only; no commits or later milestones.

**Goal:** Prepare ngspice/other-core integration through a replaceable backend while retaining all current functions.

**Architecture:** Add a provider facade around unchanged legacy modules. Snapshot configured selection in consumers; bind compiled plans to an exact backend identity across spawn workers. Ngspice remains explicitly unavailable until its native/model/result adapter is implemented.

**Tech Stack:** Python, installed Contracts 1.0.1, immutable Simulator 0.2.0 wheel/sdist, existing FastAPI and Hardware spawn runtime.

**Spec:** [Design and research](../specs/2026-10-27-simulator-backends-design.md). User selected this preparatory scope during M3 on 2026-10-27.

## Global constraints and decisions

- Keep all eight legacy runtime modules byte-identical; no new solver and no ngspice/native dependency installation.
- No public schema/OpenAPI, physical capability, safety, persistence or UI change.
- No arbitrary dynamic imports, silent fallback, environment reselection in workers or fabricated analog capture.
- Preserve M3A 0.1.1 artifacts; version this additive API as 0.2.0 with exact consumer pins.
- Continue the existing dedicated branches and canonical external session; no stage, commit, merge, push, deploy, license change or M4.

## Review focus

1. Legacy preview must retain UNSUPPORTED device states rather than inherit execution rejection.
2. Existing dispatcher.compile -> engine.run_plan callers must still work.
3. Spawned and reused workers must honor plan identity after environment changes; custom registries cannot disappear into a fallback.
4. Ngspice selection must disable actual execution/instrument capabilities without disabling document validation/storage.
5. Exact package inventory checks must cover new facade modules without relaxing legacy/source-shadowing or same-version digest protection.

## Tasks

- [x] B1 — Simulator target: add provider types/registry/facade and reserved ngspice boundary; tests RED -> GREEN for delegation, identity, serialization, no fallback and unchanged legacy parity. Bump 0.2.0, update package/CI/inventory checks, build/install independently.
- [x] B2 — Remote consumers: freeze settings/station selection; switch both preview routes and Hardware compile/spawn paths; derive truthful capabilities; update pins/installer/workflows/package probes; tests RED -> GREEN for selection, unavailable behavior and actual process execution.
- [x] B3 — Integrated validation: OpenAPI equality, full relevant Python regression, standalone clean hashlocked wheel/sdist, actual external installed package/spawn gate and rollback-compatible artifact handoff.
- [x] B4 — Independent review/fix pass, canonical docs/report/diff, preserved inputs and guarded session cleanup, concise commit suggestions. Stop at M3.

Ownership: target agent owns Simulator files; consumer agent owns Remote runtime/config/package/workflow/tests; root owns design/research, canonical docs, artifact assembly, integrated gates and final review. Shared API surface is agreed before product edits. Source cleanup/commits remain prohibited.

## Progress

M3A baseline: reviewed 0.1.1 wheel, 80 standalone tests, 1,284 full Remote Python tests (four environmental skips), 102 final consumer tests (same four skips), clean four-wheel/spawn gate and rollback verified. User authorized B1–B4 preparatory extension; real ngspice execution is not selected. Detailed prior evidence remains in the M3 report.

Design review: preserve built-in-only service composition for this phase, expose trusted custom registries through the facade, and test their explicit composition in real reused spawn workers. Semantic provider errors use SimulationError; invalid selectors fail configuration. Payload captures provider configuration, so worker behavior cannot change with ambient environment. These are implementation requirements, not claims of native ngspice support.

B1/B2: final standalone 109 tests PASS, repeated from the final sdist in a fresh hashlocked offline environment; wheel rebuild byte-identical. Consumer focus 74 tests PASS, including 14 new cases. Independent review reproduced two P2 issues: unavailable-domain exception mapping and RPC session construction rereading selection. Narrow exception mapping and a station-owned session factory fix them, with RED -> GREEN regressions. Integrated gates and final evidence are recorded in the [M3B report](../../verification/2026-10-27-simulator-backends.md).

B3/B4 complete: 1,307 full Python tests PASS with four baseline environmental skips; ten Python/Contracts release commands and clean four-wheel installation/spawn gate PASS. Both review findings closed. Preserved-input/index/HEAD audits pass; inspected diagnostics were removed only through canonical session cleanup. Reviewed artifacts and history bundles remain external. No later milestone, commit, push or deployment performed.
