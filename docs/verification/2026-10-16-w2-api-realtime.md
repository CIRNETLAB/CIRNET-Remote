# W2 Public API/realtime checkpoint

Authority: Lab-First v3.1. W0/W1 evidence is recorded separately. This report does not claim completion of W3–W8.

Implemented source:

- Canonical public API/error/operation/realtime DTOs, typed FastAPI routes and response validation, public station projection without private routing resources, preview provenance and limitations.
- Route-authoritative deterministic OpenAPI export and generated browser operation bindings in the unified staged/check-only toolchain. Schema export and module import do not initialize DB/recovery/hardware. All browser API facades consume generated operations.
- Correlated error envelopes with readable messages and structured sanitized field issues. HTTP adapters enforce media type/version, response bounds, timeout/abort, empty responses, exact binary payloads and precision-safe JSON parsing.
- Durable Create/Run/Stop operation keys. Create and its operation commit atomically. Same-key retry and recovery cannot replay Start; new keys still pass lifecycle validation. Per-key concurrency does not serialize unrelated Stop behind slow Create.
- Polling-independent operation acknowledgement: Run APPLIED after Start acknowledgement; later capture failure remains the experiment result. Stop APPLIED requires actual safe lease release. Quarantined leases never report successful Stop. Operation errors and experiment errors remain separate.
- Versioned bounded realtime stream, sequence/aggregate revision/stream identity, explicit overflow/resync, incompatible-version handling and snapshot reconciliation hook. Full application reload/polling lifecycle remains W6.
- Approved Scope/Generator path validation across compiler/shared rules/native adapter/RPC, independent of arbitrary analog circuit routing. Default physical Scope/Generator remain zero-channel/unavailable. See `2026-10-16-instrument-path-decision.md`.
- Shared corpus now has 51 cases: browser runs all public cases, Python also runs two explicitly internal capability cases. Internal StationCapabilities and execution plan are absent from browser exports. Descriptor identity and nested operation experiment semantics are checked in both languages.

| Fresh gate | Result |
| --- | --- |
| Full Python `python -m pytest -q --basetemp .build/w2-full-frozen` using `.audit-runtime` | **571 PASS / 1 SKIP**, 74.41 s |
| Operation/application boundary review regression | **14 PASS**, including formerly failing new-Run, polling timing and quarantined Stop cases |
| Compiler/native/shared/actual loopback RPC instrument-path regression | **128 PASS** |
| `generate_contracts.py --check`, `export_openapi.py --check` | PASS |
| `check_contract_package.py` | PASS, clean venv wheel installation/probe outside checkout |
| Context/catalog/breadboard checks and `git diff --check` | PASS |
| Browser `npm test` (includes TypeScript checks) | **732 PASS / 0 FAIL**, 83.63 s |
| Browser production build | PASS, 240 modules; JS 3,368.46 kB / gzip 516.20 kB |

The first full Python run overlapped the final shared semantic/corpus edits and reported one fixture failure; targeted fixtures and the frozen full run above both pass. An earlier full run detected header-bound artifact drift, corrected by regeneration. Only the frozen final runs count toward the gate. The existing Icarus/vvp skip, Starlette/httpx deprecation and Vite chunk advisory remain. No lint script is configured. Node/SFC tests are unit tests, not browser E2E. PostgreSQL and real browser E2E are not claimed here.

## Git checkpoint limitation

User requests a commit after each W phase. Managed Git metadata remains read-only; staging/commit cannot create the worktree `index.lock`. No commit hash is fabricated and no permission bypass, push, merge, deploy or reset is performed. Phase source changes and verification remain in this worktree. The W2 source acceptance gate passes; Git checkpoint remains BLOCKED by the environment.
