# Web & Contracts handoff — 2026-10-16

> Historical handoff status — 2026-10-19 audit: software results, versions and Git delivery limits below belong to the 2026-10-16 session. They are preserved, not rerun assertions for current HEAD. Current architecture is [ARCHITECTURE.md](../ARCHITECTURE.md); new checks follow [VERIFICATION.md](../VERIFICATION.md). Reproduction commands below use the current external artifact policy.

Authority remains [Lab-First v3.1](../ARCHITECTURE.md). This handoff describes the implemented software boundary; the [execution ledger](2026-10-16-web-contracts.md), [acceptance matrix](2026-10-16-acceptance-matrix.md), [W8 evidence](2026-10-16-w8-release.md) and [source inventory](2026-10-16-source-inventory.md) contain the completed local phase results and452 changed/new files. Final evidence is1015 Python PASS/1 Icarus SKIP,1054 Web PASS,14 native Chromium PASS,16 PostgreSQL PASS, four installed wheels outside checkout and50 principals/1195 requests/0 unexpected or transport errors. Git delivery and unexecuted external gates remain explicit limits.

## Working system

The existing Vue/Pinia/Three workbench now uses generated, validated public contracts. Authenticated students save/reopen exact server Project/Circuit revisions, recover scoped local drafts and resolve CAS conflicts without overwriting newer edits. Instructor/Admin authoring publishes immutable assignment revisions with student-safe projections. Real browser flows exercise cookie/CSRF/RBAC, reload and API restart, two-tab conflicts, lost Create acknowledgement without Run replay, actual virtual switches→AND→LED execution through API/RPC/spawn workers, retained digital captures and both imported instrument previews.

Connection recovery uses stream/sequence/revision reconciliation and single-flight polling. Durable mutation identities recover unknown acknowledgements without replaying Start or generator output. Pre-run configurations are immutable; only explicit adapter acknowledgement can update applied instrument state. Sealed owner-scoped captures have indexed generations, independent I/O, quotas and explicit bounded retention. Stop does not delete retained evidence, and a slow payload read/hash/delete cannot hold the global control lock. Structured runtime metadata logs and durable critical audits preserve correlation without credentials or private graphs/payloads.

CircuitGraph remains design truth; observed topology remains physical truth. Safety and correctness are independent. No browser hardware register/route/driver, unverified analog acquisition, real transport or RTL implementation was added.

## Versions and migration

| Boundary | Support and compatibility |
| --- | --- |
| CircuitGraph | Existing1.0/1.1 canonical schema bytes and supported metadata/memory/mount/wire semantics retained. Structural storage preserves legacy large integers; browser editing rejects unrepresentable values explicitly. Server document identity is independent of embedded graph identity. |
| Lab/assignment/memory | Existing1.0 schema baseline retained; named transport/editor/execution profiles add checked semantics without rewriting frozen schemas. |
| Public API/auth/projects/authoring/history/realtime/instruments | New canonical1.0 families, typed OpenAPI and generated operation/parser bindings. Legacy assignment, instruments and validation responses remain supported. Baseline is supported unpublished source, not a fabricated release. |
| Visual/lead and signal domains | Opt-in versioned namespaces1.0; legacy open metadata preserved. Unsupported future domain versions remain readable but cannot silently execute. Digital/CLOCK/DC support is explicit; MIXED does not grant a solver. |
| NCAP | Existing v1 bytes and runtime MIME remain unchanged. New separately versioned v2 sampled library codecs support INT16/UINT16/FLOAT32, calibration, rational clocks and quality/loss metadata; no default analog producer is installed. |
| Local RPC/FPGA scaffold | Existing protobuf2.0 fields/tags/presence and1.0-scaffold baseline retained. No new FPGA ABI or hardware capability is claimed. |

Database migrations are0001 legacy adoption,0002 auth,0003 projects,0004 assignments and0005 captures. Follow the [auth/migration guide](../architecture/auth-and-migrations.md) and [production runbook](../../deployment/README.md): backup the database and capture directory together, inspect current migration status, upgrade deliberately and require HEAD before services/maintenance. Production uses PostgreSQL and one API scheduler/writer; development/tests may use SQLite. Guest claims are explicit and possession-bound. Recovery acknowledges actual Stop before committing FAULT, safe lease release/quarantine and audit atomically; audit failure retains the old lease for a later safe retry, never automatic Start.

## Reproduce verification

Prepare all four local Python packages, pinned verification/codegen dependencies and Node dependencies using the root and Web READMEs. Source development rebuilds ignored RPC; installed wheels already include it. The unified command entrypoint is:

```sh
python scripts/check_release.py --show-plan
python scripts/check_release.py --group all
```

`all` requires an explicitly provisioned isolated PostgreSQL database in `NETCIRCUIT_TEST_POSTGRES_URL`, matching PostgreSQL backup tools, installed pinned Chromium and a writable external package workspace. `--package-temporary-root` selects that external workspace. Missing prerequisites fail explicitly; gates are not silently skipped. The current run executed the named Contracts/Python/Web/PostgreSQL/package groups separately and the complete native browser command recorded in the W8 report, rather than claiming a single successful `all` invocation.

The optional load group is separate:

```sh
python scripts/benchmark_web_sessions.py --sessions 50 --concurrency 10 --runs 8 --read-rounds 3
```

The checked-in [2026-10-16 raw report](2026-10-16-w8-load.json) preserves the original measurements. A new run writes `report.json` under an external `web-sessions` artifact directory; it does not replace historical evidence. An explicit `--output` must also point outside the repository. The original run took over five minutes because the address-level login limit was respected. The workload proves50 authenticated sessions, at most10 in-flight HTTP requests and4 virtual jobs, eight exact real NCAP captures and expected conflict/denial isolation. It does not prove50 simultaneous simulations or physical executions, sustained load, target Mini PC capacity or production PostgreSQL/TLS latency.

The final run took324.689s (301.704s paced bootstrap,17.848s active work) with1195 requests/0 unexpected statuses/0 transport failures and backend exit0. Each HTTP session has one connection/retained connection,1-second client idle expiry and zero automatic retries. A prior failed transport run and its live-socket regression are disclosed in the W8 evidence; mutation replay, server timeout changes and weakened authentication limits were not used to obtain a pass.

## Delivery and external limits

Every phase Git checkpoint was requested and attempted after its gate. Linked-worktree Git metadata is read-only and `git add -- .` fails creating `index.lock`; no staging or commit succeeded. Original branch `refactor` and HEAD `8100039988272c2fa2b5972a00a603261e80064e` remain unchanged. The accumulated source is available for review; no reset, push, merge or deployment occurred. Restoring Git permissions is external to this sandbox; this task does not fabricate historical phase commits.

Hosted GitHub Actions and actual Python3.11 minimum-runtime execution remain NOT RUN. Local verification used Python3.12.14/Node24.20.0. The existing optional Icarus/vvp behavioral test remains skipped because its tools are absent. Production Nginx/systemd/TLS and hardware integration have not been executed. Physical Scope/Generator channels and full analog/mixed engines remain honestly unavailable, with contracts/adapters ready for later validated producers.

The final owned local PostgreSQL test server was stopped after its fresh16-case gate through a helper that owns both server and `pg_ctl` in the same process scope. Graceful shutdown and the owner exited0, and its postmaster PID file was removed. This avoids the environment's earlier cross-tool PID lookup limitation. Benchmark/native-browser harness shutdown is recorded in the final W8 evidence. Ignored verification runtimes/cache/data remain local and are excluded from the source inventory.
