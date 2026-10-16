# W3 Authentication, ownership and migrations

Authority: Lab-First v3.1. W0–W2 have separate evidence reports. This checkpoint does not claim Project/Circuit persistence or W4–W8 completion.

Implemented source:

- Canonical session/user/login/claim/assignment-view contracts, typed auth/admin routes and generated browser operations. OpenAPI declares cookie/CSRF security and exact-origin requirements.
- Durable principals, Argon2id password hashing, opaque high-entropy cookies stored only as digests, server-side expiry/revocation and single-use rotation. Pending stale login/logout/claim/admin changes recheck authorization inside the mutation transaction. No default password or public role escalation exists.
- Explicit development guest mode, production guest prohibition/HTTPS origins/PostgreSQL checks, exact configured environments and validated settings. Login admission is persisted and bounded by address/username; principal mutation admission is bounded and exempts Stop/logout.
- Alembic baseline/auth migrations with immutable historical schema metadata. Preserve assignments, experiment JSON/order, operations, legacy sessions, capture references, leases and quarantine. Verified guest possession plus explicit claim transfers ownership atomically; active/quarantined execution and operation-key collisions reject the claim.
- Principal/session/tab control separation. Viewer streams cannot maintain another tab's run; session expiry/revocation and controller disconnect cancel the affected control context. Workers recheck before hardware RPC. Shielded disconnect cleanup completes during ASGI cancellation; repeated Stop preserves the first cancellation cause. Fixed leases are never renewed by viewer reads/heartbeats.
- Student/Instructor/Admin role and object checks on HTTP, WebSocket, capture/operation/history endpoints. Student assignment views hide reference graphs, answers, profiles and private endpoint mappings. Default observed_only feedback also removes expected/reference diagnostics from every experiment HTTP/operation/event projection; complete evidence remains stored. Author/Admin and explicitly detailed policy retain authorized diagnostics.
- Volatile browser auth/session state, typed adapter, account/admin overlay, CSRF/control headers, principal remote-cache teardown and expired/revoked socket handling. Canvas remains mounted. Private document recovery and principal partitioning are W4.
- Real Chromium runner with isolated SQLite and the actual Hardware Service, plus explicit owned-process teardown. Interrupted Windows taskkill-based teardown was rejected as a gate; the replacement runner exits cleanly.

| Verification | Result |
| --- | --- |
| Full Python `pytest -q --basetemp .build/w3-release-gate` using `.audit-runtime` | **677 PASS / 1 SKIP**, 126.25 s |
| Browser `npm test` including TypeScript | **749 PASS**, 57.49 s |
| Browser production build | PASS, 247 modules; JS 3,630.40 kB / gzip 538.33 kB |
| Actual Chromium `npm run test:e2e` | **2 PASS**, 16.9 s, command exit 0 and clean shutdown |
| Owned HTTP/control/migration plus existing HTTP and real virtual RPC gate | **159 PASS** before the final privacy/cookie regressions |
| Final feedback/cookie/OpenAPI regressions | PASS; teacher-answer HTTP/WS leaks and hostile rejected-cookie overwrite observed RED before fixes |
| Generation/OpenAPI/context/catalog/breadboard drift checks | PASS |
| Contracts clean wheel outside checkout | PASS |
| API wheel/target install with isolated imports | PASS: packaged Alembic resources, new SQLite migration, check CLI and bootstrap CLI |
| PostgreSQL dialect DDL compilation | PASS; **live PostgreSQL NOT VERIFIED** |
| Whitespace verification | PASS; checkout CRLF advisories only |

The existing Icarus/vvp skip, Starlette/httpx deprecation and Vite chunk advisory remain. No lint command is configured. PostgreSQL executables/server and Docker daemon remain unavailable; dialect compilation is not a live PostgreSQL migration test. Deployment remains gated on a backed-up/rehearsed live PostgreSQL upgrade.

Final review reproduced and fixed a persisted-guest bypass: sessions issued while guests were enabled are invalid when guests are disabled. Service/raw HTTP regressions and the final full suite above pass. Invalid/revoked/expired credentials signal 401 before any guest replacement is used; hostile unsafe origins are rejected before minting cookies. W3 source acceptance passes. Live PostgreSQL deployment remains blocked as stated above.

Migration/bootstrap/backup/recovery procedures and legacy ownership policy: `docs/architecture/auth-and-migrations.md`. Phase decisions: `2026-10-16-contract-decisions.md`. Full T01–T36 completion remains pending later phases.

## Git checkpoint

The user requests one commit after each W phase. Git metadata is read-only in the managed workspace, so staging cannot create the linked worktree index.lock. Source checkpoints and evidence are preserved; no commit hash, push, merge, deploy, reset or permission bypass is claimed.
