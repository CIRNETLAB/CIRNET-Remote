# M3B replaceable simulation backends verification

Date: 2026-10-27, Asia/Saigon. Scope: user-authorized preparation for ngspice or another core while preserving current behavior. This completes the additive backend portion of M3; actual ngspice execution and M4 are outside scope. Authority: [architecture](../ARCHITECTURE.md), [design/research](../superpowers/specs/2026-10-27-simulator-backends-design.md), [implementation plan](../superpowers/plans/2026-10-27-simulator-backends.md), [M3A extraction/history evidence](2026-10-27-multi-repo-migration-m3.md).

## Implemented boundary

Simulator 0.2.0 adds one runtime module, `netcircuit_sim.backends`, around the eight byte-identical legacy modules. Trusted providers implement compile, execute and preview, with explicit registry composition. Plans contain backend ID, adapter version, plan format, serializable payload and endpoint directions. Workers resolve the plan identity without reading ambient backend selection. Missing/mismatched providers fail; no fallback or dynamic module discovery exists.

`NETCIRCUIT_SIMULATION_BACKEND=legacy` preserves existing behavior. API settings and virtual stations freeze selection at construction. The reserved `ngspice` provider reports unavailable and zero execution/instrument capabilities. No executable, DLL, native dependency, new solver, analog sample conversion, schema or public endpoint is introduced. Document validation/storage remain available independently. Custom cores require trusted composition in the parent and worker; the service currently exposes only the built-ins.

The analysis records future requirements for upstream build/ABI, device-model versions, graph/netlist mapping, typed results/units/timebase, native cancellation and crash recovery. Current legacy delay/DC approximations remain compatibility behavior, not a physical accuracy claim for future SPICE results.

## Verification and review

Final local integrated gates pass against the reviewed 0.2.0 wheel. Hosted and native-core execution remain separate gates.

| Gate | Observed result |
| --- | --- |
| Initial standalone facade | 107 PASS; subsequent semantic-boundary regression expanded the final suite |
| Final standalone installed suite | 109 PASS, 21.73 seconds; eight legacy modules and license unchanged |
| Fresh hashlocked offline sdist installation | 109 PASS, 23.33 seconds; selected wheel digest/payload/RECORD, pip check and byte-identical wheel rebuilt from extracted sdist |
| Initial consumer integration | 62 PASS, 9.43 seconds; both preview routes, frozen settings, document storage and real spawn/reused workers |
| Final focused consumer integration | 74 PASS, 11.06 seconds, including 14 new selection/domain/RPC cases and existing preview/configuration/virtual/worker/control lifecycle |
| Artifact/selector policy | 23 PASS, 4.07 seconds |
| Rollback | Fresh offline venv `0.2.0 -> 0.1.1 -> 0.2.0`, 51.39 seconds; original 75 cases pass on rollback and restoration, with pip check and installed origins |
| Workflow syntax | Nine Remote workflows and standalone Simulator workflow PASS with actionlint 1.7.12 |
| Clean four-wheel installed integration | PASS, 111.72 seconds; Contracts/Simulator/API/Hardware imported outside checkout, actual spawn/reused worker, RPC, NCAP v1/v2, resources, migrations and CLI |
| Artifact containment and Markdown | Five allocator/guard tests PASS; worktree/index artifact guard PASS; 186 Markdown files pass checks |
| Full Python/Contracts release | 1,307 PASS, four skips and one existing Starlette/httpx warning in 828.28 seconds; all ten release commands PASS in 852.5 seconds (outer runner 865.86 seconds), including installed provenance, generation, OpenAPI equality, public compatibility and Python/npm parity |
| Final preservation/cleanup | PASS: post-regression hash/HEAD/index and ignored-output audits; no matching owned worker remains; canonical cleanup removed only the owned M3 session and confirmed absence |
| Final documentation/provenance | 12 baseline/context/Markdown tests PASS; context, 186-file Markdown scan, both Git diff checks and worktree/index artifact guard PASS; installed Simulator matches the durable selected SHA |

Remote integrated commands use the exact reviewed Contracts/Simulator manifests,
the existing API venv, the canonical multi-repository session, disabled Python
bytecode/pytest cache, and external TEMP/TMP/TMPDIR/database/capture paths:

```text
services/api/.venv/Scripts/python.exe scripts/check_release.py --group python --group contracts
services/api/.venv/Scripts/python.exe scripts/check_contract_package.py
node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs
node scripts/check-verification-artifacts.mjs
services/api/.venv/Scripts/python.exe scripts/check_markdown.py
```

The independent Simulator gate installs the 20-package closure with
`--no-index --require-hashes --only-binary=:all:`, bootstraps exact first-party
artifacts, runs `check_installed.py --wheel ABSOLUTE_WHEEL`, and executes
`python -I -m pytest` against the extracted sdist from an external working
directory. The original six test modules supply 75 cases; package-boundary
cases and 29 backend cases bring the final total to 109.

The four skips retain the baseline prerequisites: two Windows file-symlink
privileges and optional slang/Icarus FPGA tooling. Directory-junction checks
still execute. No assertion was weakened, baseline regenerated or missing
native/hardware capability relabelled as successful.

Independent review found two P2 issues and no other significant defect in the reviewed scope. R1: RPC experiment session construction could reread ambient selection and disagree with its registered station's frozen capability. R2: unavailable classification leaked `ValidationError` for preserved future domain metadata; API's global handler returned generic `422 INVALID_CONTRACT` instead of the preview semantic envelope, and Hardware missed its normal mapping. A station-owned `new_session()` factory carries the selected ID and verifies identity for R1; a narrow `ValidationError -> SimulationError` conversion addresses R2. Regression tests first reproduced two RPC failures and three preview/station failures, then passed against the final artifact. Actual ConfigureVirtualCircuit/StopExecution calls cover both selection directions and a new experiment after Stop. Unexpected provider implementation errors still propagate. Independent closure review inspected the fixes and RED/GREEN evidence and closed both findings.

One initial consumer RED invocation stalled and was stopped using its verified process identity; a correctly isolated unbuffered rerun produced the expected nine failures in 3.38 seconds. No product-cause claim is made for that stall. An initial actionlint command used an incorrect standalone workflow filename; the corrected ten-file invocation passed. The artifact-policy command exited zero with five passing cases, but the external log runner's console-tail printing failed on a Unicode checkmark under Windows cp1252; the saved log and result were inspected directly. Neither setup/display failure is counted as product success.

## Artifacts and compatibility

Local handoff manifest: `C:/Users/trann/.codex/visualizations/2026/10/24/01a16c1e-02ba-7253-9226-6f4a43582df4/migration-release-artifacts/m3-simulator-0.2.0-reviewed-20261027-9w8IIV/artifacts.json`.

| Artifact | SHA-256 |
| --- | --- |
| Simulator 0.2.0 wheel, 33,312 bytes | `fc7930662e49c5751980154261e5c39448c63fde1cb5da9a8f509b82b1dd2e62` |
| Simulator 0.2.0 verified sdist, 76,554 bytes | `070fcaefd0c3486ef003b87db4465ee5bfb0f6a6a835f10102b5f116c23a9fa7` |
| Contracts 1.0.1 wheel | `ab865f991950fb575d86d3b6bb23646864c706b64c3d0305ba4b9ca9d0237c79` |

All 36 target source files match the sdist byte-for-byte. Source fingerprint: `4127414fbb32c763f5eb545b4693656ae7b314e0056a1ca6b215ef1556ecf29c`, using sorted UTF-8 `sha256  relative-path` lines; build epoch `1792844004`. Artifacts describe the reviewed uncommitted source export, not a fabricated commit or a future committed clean checkout. The selected `verified-sdist` archive is exactly the final offline test input. The earlier `6419eb...` sdist remains preserved with identical member payloads but different tar/gzip timestamps; only wheel byte reproducibility is claimed. The immutable reviewed 0.1.1 artifacts and 20-wheel Windows AMD64/Python 3.14 hashlocked dependency closure remain preserved separately.

| Consumer/product | Required producer |
| --- | --- |
| Current Remote API and Hardware source/metadata | Simulator exactly 0.2.0, Contracts exactly 1.0.1 |
| Simulator 0.2.0 | Contracts 1.0.1, jsonschema 4.26.0 |
| Legacy direct dispatcher/engine callers | Existing imports retained in 0.2.0 |
| Future real ngspice provider | Additional native/model artifacts and result/lifecycle acceptance; not available now |

Local interpreter is Windows Python 3.14.4. Hosted Linux/Python 3.12/Node 22 and minimum Python 3.11 execution are NOT_RUN here. No browser, physical hardware, PostgreSQL or production deployment success is claimed. Prior M2 browser disposition remains unchanged. Package artifacts are LOCAL_UNPUBLISHED.

## Rollback and Git

Working diff ownership at handoff: Remote has 50 changed/untracked paths covering
artifact selection and exact dependency pins, seven consumer workflows,
API configuration/two previews, Hardware station/RPC session composition,
installed-package probes, regression tests and canonical Markdown. Simulator
has 35 changed/untracked paths (36 source files including the unchanged license):
extracted legacy modules/tests, the additive backend facade, independent build,
locked verification dependencies, CI, provenance/allocator tooling and docs.
No Web, Contracts, physical driver, FPGA, saved schema or capture format is edited.

For operational use keep `legacy`. To roll back the additive API, stop/drain owned executions, restore the reviewed 0.1.1 wheel together with matching prior API/Hardware source and metadata, and restart both services. New consumers require the facade and must not be paired with 0.1.1 alone. Preserve database, documents, captures, leases and quarantine; no migration or replay is required. The isolated wheel rollback test establishes package compatibility, not a live deployment rollback.

Original revisions and dedicated branches remain those in the M3A report. Filtered history is preserved in verified bundles; connecting target ancestry still requires separately authorized Git work. No staging, authored commit, merge, push, force-push, source deletion, license change, deployment or M4 occurs. Post-regression preservation audit confirms 546 original source/data files, four licenses and nine pre-existing pytest cache files retain their recorded hashes (cache mtimes too); all original HEADs and empty indexes are preserved, and Contracts/Interface remain clean. Current ignored-output inspection examined 214 non-dependency diagnostic/data/media candidates across the four repositories and found none modified since session creation. Ignored Python bytecode caches are compilation output and remain present; no old evidence is removed.

All referenced raw test logs, package contents, RED/GREEN evidence and process audit were inspected before cleanup. No screenshots or visual verification were produced. Canonical cleanup, with the original owner and Remote/Simulator/Contracts context, removed the owned M3 session and confirmed its absence. Durable release/rollback artifacts and history bundles are outside that deleted target and remain retained. Local M3 implementation and verification are complete; publication, hosted CI and connecting ancestry remain separately authorized work.
