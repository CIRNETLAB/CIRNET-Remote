# Scheduler control isolation and the runtime index

[Tiếng Việt](../../vi/architecture/control-isolation-and-runtime-index.md)

The scheduler keeps cancellation and queue decisions responsive while an execution waits for RPC. The runtime index gives the scheduler bounded queries over active work. Both are implemented. The dated [WC20 control evidence](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-wc20-control.md) records the scope that was verified.

## Reservation and safe Stop
The supported deployment has one API scheduler process. Database reservations
protect station and slot uniqueness. Scheduler ownership and FIFO stay within
that one process.

The manager holds its state lock for queue/state/reservation changes. It reads
a queue-head revision, releases that lock for remote capabilities, then checks
the current head, revision, session, quarantine and occupied slots before
reserving. Each reservation receives a generation. A station has one dispatcher.
Concurrent requests schedule another dispatch pass without waiting on its
remote call. FIFO order and capacity shrink/quarantine rules remain enforced.

Live instrument operations serialize per execution, using weakly held locks.
Capabilities, configuration and Stop RPCs never hold the manager state lock.
Stop first records cancellation and STOPPING, then waits only for that execution's
control call. Configuration checks owner/session/tab, state, revision, generation,
lease and allocation before dispatch and after its reply. A late reply cannot
become APPLIED after revocation or cancellation. The worker's final Stop waits
for any in-flight configuration. It retains the slot until cleanup is actually
acknowledged. Hardware requires `accepted=true` and `hardware_applied=true`.
Absent acknowledgement quarantines the station. Enqueuing Stop is not safe completion.
Gateway deadlines follow the configured RPC budget. A physical shutdown
deadline requires physical timing evidence beyond the local thread tests.

Expiry, disconnect, shutdown and multi-session revocation sweeps first accept
cancellation for every affected indexed record, then dispatch remote cleanup.
A separate four-worker Stop pool admits at most 16 outstanding identities,
independently of simulator workers. Sweep tasks acquire an execution control
lock without waiting. A blocked configuration remains STOPPING and is retried
by the next monitor tick. Pending identities and acknowledged requests are
deduplicated. At capacity, the scheduler retains cancellation without growing
the executor queue. An acknowledged request suppresses duplicate Stop dispatch but
does not release a slot or certify safe completion. Worker finalization retains
the existing actual-ACK/quarantine rule. An explicit user's Stop still serializes
with its own execution, while unrelated sweeps and revocation can proceed.

## Indexed recovery and reads

Forward Alembic revision `0006_experiment_runtime` adds the relational
`lab_experiment_runtime` projection. It backfills historical records in 100-row
keyset batches, retaining original payload JSON, owner IDs, sequence, captures,
operations, document references and leases. State, active flag, session/tab,
station, queue order and legacy-capture flags update in the same transaction as
the payload through repository writes. Owner joins the original experiment row,
so guest ownership transfer has no duplicate owner field to drift.

Admission uses `EXISTS`. Expiry, disconnection and shutdown read indexed active
scalar rows in batches of at most 100 without loading terminal circuit graphs.
Startup reads only pending inline-capture migrations and queued records in
100-row batches. Electrical lease cleanup runs first in 100-row batches. Each
legacy-capture/queued recovery pass has a 10,000-record ceiling. Startup fails
explicitly with RECOVERY_LIMIT_EXCEEDED before replaying queued work above that
ceiling, preserving the persisted queue for operator review.
This startup resource guard preserves history. Existing
inline-capture externalization remains resumable as each converted row commits.

Run rate entries expire after the one-second admission window and have a
4,096-entry ceiling. Admission refuses new entries while that ceiling is full.
It never evicts an unexpired entry to allow a rate-limit bypass. Idle execution
locks and empty dispatcher/queue entries are removed.

The browser uses bounded owner-scoped `/api/experiments/history` (1–100 rows)
and `/api/experiments/active` (100 rows with a cursor). The legacy list route
retains its complete historical array for compatibility. Monitoring and current
Web recovery use the bounded routes. Keep the complete legacy response. New
integrations must use the paged routes. Removing the legacy shape requires a
separate versioned compatibility decision.

## Upgrade and rollback

Upgrade with writers stopped and a verified database/capture backup. Rehearse
the forward chain on a restored database. Compare record and lease counts,
unchanged historical payloads and indexed active query plans before switching.
Downgrade restores the matching backup. PostgreSQL query-plan and real
`pg_dump`/restore cases are explicit release gates, independently of SQLite tests.

See the [scheduler](../../../services/api/app/services/experiments.py), [runtime-index migration](../../../services/api/app/migrations/versions/0006_experiment_runtime.py), [physical lab safety](physical-lab-safety.md) and [authentication and database upgrades](auth-and-migrations.md).
