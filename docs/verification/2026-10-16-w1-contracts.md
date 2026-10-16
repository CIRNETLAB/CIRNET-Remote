# W1 Contract toolchain — verified checkpoint

Authority: Lab-First v3.1. W0 evidence: `2026-10-16-web-contracts.md`. This report records W1, not completion of W2–W8.

Implemented: machine-readable ownership/version/visibility manifest; offline absolute-URI registry; frozen pre-W1 Git schema/RPC baseline with explicit CRLF→LF-only comparison; pinned deterministic Python/TS generation; standalone 2020-12 runtime validators; structural/editor/transport profiles; protobuf uint32/JS-safe bounds; precision-safe browser import; shared semantic issues/44 conformance fixtures; name-bound parsers; typed HTTP results requiring parsing; generated graph/mount/memory/wire/lead facades; private execution-plan export removal; explicit alias normalization; staged/check-only generation with rollback on ordinary publication failure; packaged resources and build-time RPC.

| Fresh command | Result |
| --- | --- |
| `python scripts/generate_contracts.py` and `--check` using `.audit-runtime` | PASS |
| `python -m pytest -q --basetemp .build/pytest-w1-final` using `.audit-runtime` | **507 PASS / 1 SKIP**, 71.58 s |
| `npm test` in `apps/web` | **712 PASS**, no failures/skips; TypeScript checks PASS |
| `npm run build` in `apps/web` | PASS, 237 modules; JS 2,751.75 kB / gzip 474.71 kB |
| `python scripts/check_contract_package.py` using `.audit-runtime` | PASS: fresh venv wheel install outside checkout, resources/generated DTO/RPC imports, numeric guard |
| Context/catalog/breadboard drift checks | PASS |
| `git diff --check` | PASS, LF checkout advisories only |

Single pre-existing skip: Icarus/vvp behavior test. Existing Starlette/httpx deprecation and Vite chunk warning remain. Three validator profiles increase browser code size; no dynamic Ajv compiler/eval is shipped. No lint command was configured; typecheck and whitespace verification are reported separately.

Independent review reproduced/fixed reserved-property and annotation corruption, relative URI resolution, manifest identity/kind/ownership collisions, cross-platform baseline hashes, publication rollback and Python numeric representation. Existing tests were retained. Historical graph 1.0/1.1 schemas and editor/mount/memory/metadata semantics remain supported. Generated numeric boundaries preserve mathematical integral floats; the API facade retains its earlier exact-int mount/contact version rule.

W1 closes the current shape/parser/toolchain portions of A01–A03/A05–A06/A15. Public operations/events are W2; auth/migrations, Project Manager, domain/history isolation, recovery/assignments, domain/instrument/capture completion and release evidence remain W3–W8. The final T01–T36 matrix is not claimed complete.

## Commit blocker

The user requested a commit after each W phase. W0 staging/commit was attempted but Git cannot create `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/net-Circuit-Remote/.git/worktrees/refactor/index.lock`: **Permission denied**. Managed Git metadata access is read-only. HEAD remains `8100039988272c2fa2b5972a00a603261e80064e`; no new commit, push, merge, deploy, reset or permission bypass occurred. W0/W1 are verified source checkpoints awaiting Git write access. Independent source implementation continues.
