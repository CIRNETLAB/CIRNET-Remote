# WC20 auth, input bounds and realtime evidence

Recorded 2026-10-20, Asia/Saigon. Source base `a09d53d`, dirty shared worktree;
no staging, commit or push. These results concern F01, F04, F05, F13 and a
subsequent F02 sweep-isolation review, and
do not replace the complete WC20 release gates or hardware evidence.

## Reproduced findings

Before implementation, the new auth/realtime regression file failed all three
initial cases: credential-free protected discovery silently allocated a Guest;
20 health reads plus discovery created 21 sessions with guests disabled;
1,001 publications scheduled 1,001 loop callbacks before draining. This was
executed with real SQLite, FastAPI TestClient and an asyncio loop.

An initial sandbox run was blocked in Windows Python's loopback socketpair
initialization (`socket.accept`), before the application test could run. The
same tests ran outside the sandbox without changing application networking.
Explicit temporary paths and the shared allocator session remained external.

Independent review also reproduced an F02 convoy after the direct global-lock
fix: the expiry/session sweeps synchronously called Stop for station A before
accepting station B's cancellation. Both new real-worker barrier regressions
failed while A's generator configuration was held. The correction accepts all
affected cancellations first, then dispatches Stop through four separate safety
workers with at most 16 outstanding identities. A nonblocking execution lock
keeps a contended configuration out of the worker backlog, and the monitor
retries pending cancellations. A multi-session auth callback uses one batch.

Final edge review reproduced 12 failures: UTF-16/32 escaped-quote payloads could
hide 70-level nesting from the UTF-8 byte scanner, and expired/revoked internal
legacy contexts returned 500 from duplicate deterministic-ID insertion. The
transport now requires UTF-8 (optional UTF-8 BOM), rejects raw NUL/invalid
encoding before scanning, and preserves valid near-2MB Unicode/escaped data.
An existing expired/revoked read context now yields 401 without allocation.
Bounded maintenance retains its fence while the original proof is live, and a
keyset cursor prevents retained rows starving other cleanup. Explicit bootstrap
still proves the original owner and rotates to a fresh opaque credential.

## Implemented policy

- Credential-free ordinary reads, including health, allocate no auth session
  or cookie. Explicit bootstrap and auth mutations install or rotate credentials.
  Supplied stale cookies keep the prior 401 policy. A valid legacy proof may
  establish one internal revocable context, which subsequent reads reuse without
  installing an opaque credential.
- Bootstrap creation has persisted address admission. Auth maintenance uses
  indexed, bounded batches and retries after failure, preserving principals,
  ownership and audit/evidence. Forward migration 0007 adds its indexes.
- ASGI input framing limits actual bytes, total receive time, JSON depth and
  collection framing before parsing, including chunked/misdeclared lengths.
  Frozen operations retain the documented HTTP 400 error envelope.
- Event subscriptions cap ingress, queued and in-flight delivery bytes with
  one scheduled drain each, per-owner/session/process quotas and a global byte
  reserve for resync notices. Overflow explicitly requires scoped snapshots.
- Socket negotiation, send and shielded cleanup have finite deadlines. Text,
  complexity, inbound rate and legacy echo have independent bounds.
- Web transport OPEN, protocol hello and fresh snapshot readiness are separate.
  Scope/generation fences prevent a late snapshot enabling an old connection;
  station event versions and experiment revisions preserve newer observations.
  Profile preparation finishes before opening the socket, and disposal cancels
  the pending connection. Reconnection never replays a command.

## Executed checks

Environment: Windows, Python 3.12.14 in `.audit-runtime`, project-installed
FastAPI/Starlette/SQLAlchemy, local Node/Vite toolchain. Unit connection tests
use declared browser/socket/storage adapters; these are not native browser or
network soak evidence. All temporary databases/captures/basetemp were external.
Raw tool output was inspected; this phase produced no screenshots or video.

| Command/scope | Result |
| --- | --- |
| Initial `pytest -q services/api/tests/test_wc20_auth_realtime_limits.py` | FAIL, three expected regressions before implementation |
| Seven auth/realtime files including `test_auth_security.py`, `test_auth_control.py`, `test_auth_migration_integration.py` and new WC20 tests | PASS, 89 tests, 83.50 seconds |
| Follow-up `pytest` selection `socket_send or content_length or burst` | PASS, four cases, 9.15 seconds |
| Delivery-byte follow-up including outgoing reservation | PASS, five cases, 27.03 seconds |
| Two-station sweep regressions, direct control isolation, auth control, lab lifecycle and ownership | PASS, 54 tests, 207.26 seconds under concurrent host workload |
| Twenty-execution bounded Stop-dispatch/retry regression | PASS, one case, 22.12 seconds |
| Encoding/legacy edge and related auth/cookie/migration suite | PASS, 55 cases, 61.71 seconds after 12 expected RED failures |
| Bounded maintenance cursor skips live legacy fence and cleans following rows | PASS, one case, 1.97 seconds |
| Initial new Web pre-hello publication regression | FAIL, delivered one event before hello |
| `node scripts/test.mjs websocket.test.ts notification-connection.test.ts` | PASS, 13 tests; includes mounted fresh-snapshot/late-event ordering |
| `npm run build` | PASS, Vue typecheck and Vite production build, 361 modules |
| `npm run check:boundaries` | PASS, AST policy over 245 source modules |

The build recorded a full structural-registry static-import warning under the
concurrently changing F08 work. Its bundle measurements describe that build,
not the final delivery bundle. The full final Web/Contracts gates are recorded
by the integrating WC20 report after all agents finish.

## Synthetic subscriber pressure measurement

At 20:06:37 Asia/Saigon on 2026-10-20, a separate Python 3.12.14 process on
Windows 11 measured 50 synthetic EventHub subscriptions with distinct owner and
session scopes. One publisher submitted 1,001 snapshots per owner (50,050 total)
without yielding the event loop, deliberately making every subscriber nonreading.
The publication phase lasted 3.681882 seconds; the complete probe lasted
4.509612 seconds. HTTP concurrency, virtual jobs and physical executions were
all zero. This is module pressure evidence, not 50 connected network users,
a soak run, or a target Mini PC capacity result.

Budgets were chosen from the actual defaults before running: one scheduled
drain per subscription, 128 events per ingress/queue stage, 1MiB retained bytes
per subscription, and 16MiB retained bytes per process. No latency SLO was
claimed. The source base was `a09d53d` with 117 dirty paths; other verification
processes were running on the same host. Raw JSON and its temporary probe script
were allocated outside the checkout, inspected, and left for the root session's
owned cleanup. No source telemetry or permanent temporary-path link was added.

| Metric | Observed |
| --- | --- |
| Publish latency p50 / p95 / p99 | 42.9 / 83.9 / 294.8 microseconds |
| Scheduled callbacks / maximum scheduled drains | 50 / 50 |
| Maximum ingress events across 50 subscriptions | 5,615 |
| Maximum retained-byte accounting | 5,709,384 bytes, below 16,777,216 |
| Queued events before the first loop drain | 0 |
| Retained bytes after drain / with 50 in-flight deliveries | 3,623,660 / 3,615,760 |
| Resync notices / final revision | 50 / revision 1,000 for every owner |
| Subscriptions and retained bytes after unsubscribe | 0 and 0 |
| Probe RSS before / after / peak | 25,317,376 / 38,854,656 / 39,817,216 bytes |

Per-publish timings exclude metrics sampling; elapsed throughput includes that
sampling. Retained-byte accounting describes serialized application data, not
deep heap size. RSS describes this isolated probe process, not the API, browser,
or target machine. It does not prove leak freedom or sustained user capacity.

## CI runtime isolation follow-up

The F15 audit found six state-writing verification jobs whose direct tests or
Node fixtures could import the default API application before an external
database/capture environment existed. Backend, hardware-service, frontend,
repository integration, PostgreSQL migrations and canonical Contracts now use
the shared Node allocator under `runner.temp`, publish ownership before later
allocation, isolate default application state, and always clean the owned
session. Direct pytest commands also receive an owned `--basetemp`. Existing
test scopes, triggers, the PostgreSQL 18 service and its explicit test database
URL are preserved. The simulator, documentation and FPGA jobs have no default
API state writers in their selected tests and were left unchanged.

Regression evidence:

- RED: `python -m pytest -q tests/contracts/test_release_workflows.py -k state_writing`
  failed all six affected jobs before the workflow changes (6 failed,
  14 deselected).
- GREEN: `python -m pytest -q tests/contracts/test_release_workflows.py tests/contracts/test_release_entrypoint.py tests/frontend/test_browser_workflow.py`
  with external application defaults and `--basetemp` passed all 28 tests in
  5.24 seconds. Assertions include failure cleanup, publication of ownership
  before subsequent allocation, and retention of the real PostgreSQL gate.
- `git diff --check` exited 0. The final worktree/index inventory showed no staged
  changes; temporary pytest output stayed in the shared external session and
  was inspected for the root session's cleanup.

Hosted GitHub Actions jobs and their PostgreSQL service were NOT_RUN here. These
results verify local workflow policy and entrypoint behavior, not a hosted CI
execution.

## Limits

Nginx is unavailable in this environment: `nginx -t` is NOT_RUN; validate the
example host/certificate paths and canonical proxy-error response on deployment.
No target Mini PC soak, physical cutoff latency, external database query-plan
measurement, or hardware capability is established by this report. The local
bounded callback/queue regressions do not represent 50 physical executions.
The root verification run owns final external artifact inspection and cleanup.
