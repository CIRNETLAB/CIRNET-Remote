# Multi-Repo Migration M4 implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. User authorizes M4 only; no staging, authored commit, merge, push or M5.

**Goal:** Extract Hardware Service into an independently built, versioned net-Circuit-Hardware product while preserving Safety-gated execution and current Remote integration.

**Architecture:** Hardware owns local-only RPC, station/transport implementation and service tests. Remote owns API orchestration, leases/quarantine, deployment and integrated acceptance. Hardware consumes exact installed Contracts 1.0.1 and Simulator 0.2.0 artifacts; API runtime remains independent of Hardware implementation. Retained source is a frozen rollback reference.

**Tech Stack:** Python >=3.11, grpcio 1.84.0, protobuf 7.36.2, jsonschema 4.26.0, setuptools 84.0.0, current installed Contracts/Simulator and canonical DEV allocator.

**Spec:** [Approved M0, ownership and M4 gates](2026-10-24-multi-repo-migration-m0.md), [canonical architecture](../../ARCHITECTURE.md), [verification policy](../../VERIFICATION.md).

## Baseline and rulings

- Remote source: `0d038c7aed15798696223558b4e58f5ffe926aa9`, clean committed M3; local branch `codex/m4-hardware-consumer`.
- Hardware destination: `2b0005f40dc826bc7940cd0af28c57ebb063fcb7`, initially clean README/LICENSE; local branch `codex/m4-hardware-extract`. Remote read access verified; publication/consumer CI ACL is separate.
- Contracts: `1f4388252a0711eae0a167b95964372453e811d2`; Simulator: `96a57e0f42a114c4f5b4675411c625415019f907`. Both clean/read-only; reviewed local artifacts remain Contracts 1.0.1 and Simulator 0.2.0.
- Continue the established migration workflow in the named checkouts on dedicated branches. Temporary clones, exports, environments and raw diagnostics use the canonical external session with explicit Remote/Hardware/Contracts/Simulator roots.
- Current Hardware distribution 0.1.0 becomes 0.1.1. Preserve all eight non-version runtime modules byte-for-byte; only `hardware_service/__init__.py::__version__` changes among the nine runtime files. Explicitly declare directly imported jsonschema. No new driver, model, native solver or capability.
- Preserve original 18 service files and all old Markdown/evidence in Remote. Preserve all six repository licenses. No automatic history merge or source removal.
- Baseline: 109 service/virtual/RPC/capture/backend integration tests PASS (18.18 seconds; one existing Starlette/httpx warning). Hash inventory protects 688 original source/data files, six licenses and nine existing pytest cache files.
- Documentation ruling: `contracts/README.md` is the current Remote consumer guide, and its obsolete editable Simulator/Hardware setup must be updated. This is the sole intentional edit within the 688-file protected-tree inventory; canonical schemas/catalogs and all retained Hardware source remain unchanged. Final audit distinguishes this reviewed guide from the 687 preserved files.

## Ownership and dependency changes

| Files | Canonical owner and change |
| --- | --- |
| `services/hardware-service/hardware_service/**` | Hardware root `hardware_service/**`; RPC/stations/private FPGA transport, current lifecycle and safety unchanged |
| Seven service test modules | Hardware `tests/`; preserve assertions, remove source path injections and root codegen; resolve local test helpers without importing product source |
| Transport-unavailable test in `tests/fpga/test_lab_first_control.py` | Copy pure transport assertions into Hardware unit tests; Remote keeps installed compatibility assertion; other FPGA tests/RTL stay Remote until M5 |
| Service README/packaging | Independent Hardware build/docs/lock/CI, package discovery restricted to hardware_service |
| Root artifact selectors and integration manifest | Remote adds exact Hardware 0.1.1 selection, digest/RECORD/origin checks, installer and provenance gate |
| Root integration metapackage, pytest discovery | Pin Hardware 0.1.1; exclude frozen service tests, run target units independently and preserve Remote API/RPC integration |
| API runtime dependency manifest | Keep free of Hardware implementation; network abstraction remains authority |
| Workflows/browser harness/package probe | Install reviewed Hardware wheel; package gate builds API only and selects three independent producer wheels |
| History | Fresh temporary clone extraction; original and target bundles plus mapping; mixed transport test stored as historical-only evidence, outside active target product |

## Review focus

1. Physical start still requires fresh scan/safety, matching station/experiment plan, observed routes, guarded power and armed capture; malformed evidence and revoked profile must fail closed.
2. Stop/control threads and generation fences remain independent of CPU workers; failed cleanup preserves quarantine/leases and never replays Start.
3. RPC session creation preserves the registered backend snapshot, unavailable ngspice and zero physical/instrument capabilities remain truthful.
4. Wheel installation rejects editable/source-shadowed/wrong-version/stale same-version archives; no API dependency or sibling source/codegen path in Hardware.
5. Clean four-wheel runtime must exercise actual loopback RPC and virtual worker/NCAP, not only construct a station; unsafe bind and absent-driver behavior remain rejected.

## Tasks

- [x] T1 — Read authority and ownership; inspect Git/access, preserve baseline inputs, run focused baseline.
- [x] T2 — History: bundle source/target, filter fresh clone without force, verify blob/mode/identity mapping, restore bundles and fsck; preserve durable external archives and Markdown mapping.
- [x] T3 — Hardware product: copy allowlist, version-only runtime update, remove test-time source/codegen coupling, add standalone installed-provenance/transport/NCAP checks, exact dependency hash lock and CI. Prove original assertions and clean installed tests.
- [x] T4 — Remote consumer: Hardware artifact manifest/selector/installer/checker, root pin, source-free integration fixtures/tests, workflow/harness/release updates and clean package gate. Use RED -> GREEN for selection/provenance/collection boundaries.
- [x] T5 — Build/export/install: inspect wheel/sdist inventory, clean external offline hashlocked environment, exact selected artifact binding, pip check, reproducible wheel build and package rollback.
- [x] T6 — Integrated acceptance: full relevant Python/Contracts release, OpenAPI equality, actual RPC/capture/virtual worker and lifecycle/control/physical safety regressions, four independently installed wheels outside checkout.
- [x] T7 — Independent whole-change review and fixes; documentation/context/workflow/artifact checks; inspect diagnostics, verify protected source/index/HEAD/ignored outputs, canonical cleanup and concise commit suggestions. Stop after M4.

Target implementer owns Hardware product files only. Consumer implementer owns Remote scripts/config/workflows/tests only. History implementer owns history evidence only. Root owns coordination, canonical docs, baseline, shared environment mutations, integrated verification, artifact handoff and final cleanup. No concurrent mutation of the shared API venv.

## Verification and rollback

Use exact first-party wheel digests from reviewed manifests; lock the complete third-party verification closure including grpcio/protobuf. Clean external exports/sdists are distinguished from a future committed clean checkout because no commit is authorized. Root Python/Contracts release and external package gates retain their assertions; hosted CI, Linux/Python 3.12, minimum Python 3.11, browser, target deployment and electrical hardware require separate evidence.

Rollback: stop admission and drain/Stop through acknowledged safe cleanup or quarantine; restore prior matching Hardware/Contracts/Simulator artifacts and consumer pins; restart the service. Preserve database/captures/leases/quarantine, no data conversion or command replay. Test package rollback only in an isolated external venv. Do not pair new exact-version consumers with an incompatible prior artifact.

Original history is never rewritten. Filtered commits may change IDs/prune empty commits. Bundles and author/committer mappings preserve provenance; connecting target ancestry remains separate authorized Git work. No force-push, mirror-push, license change, source deletion or M5 occurs.

## Final local acceptance

Hardware 0.1.1: 107 installed tests PASS, repeated from the final sdist in a fresh
22-wheel hashlocked offline environment; reproducible wheel, selected archive
provenance, pip check and isolated rollback PASS. Remote: 1,256 tests PASS with
four baseline environmental skips; eleven Python/Contracts release commands and
the final clean four-wheel RPC/worker/capture gate PASS. Two P2 review findings
fixed with RED/GREEN evidence; final review approves the source. All protected
inputs, indexes and original HEADs verified; inspected temporary diagnostics
removed through canonical session cleanup. Durable release/history archives
remain available. See the [verification and rollback report](../../verification/2026-10-27-multi-repo-migration-m4.md).
