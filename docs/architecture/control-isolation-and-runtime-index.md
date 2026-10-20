# Scheduler control isolation and bounded persistence

Status: IMPLEMENTED. Verification scope is recorded in the dated
[WC20 control evidence](../verification/2026-10-20-wc20-control.md).
The supported deployment has one API scheduler process. Database reservations
protect station/slot uniqueness; they do not establish multi-process scheduler
ownership or distributed FIFO.

The manager holds its state lock for queue/state/reservation changes. It reads
a queue-head revision, releases that lock for remote capabilities, then checks
the current head, revision, session, quarantine and occupied slots before
reserving. Each reservation receives a generation. A station has one dispatcher;
concurrent requests schedule another dispatch pass rather than waiting on its
remote call. FIFO order and capacity shrink/quarantine rules remain enforced.

Live instrument operations serialize per execution, using weakly held locks.
Capabilities, configuration and Stop RPCs never hold the manager state lock.
Stop first records cancellation and STOPPING, then waits only for that execution's
control call. Configuration checks owner/session/tab, state, revision, generation,
lease and allocation before dispatch and after its reply. A late reply cannot
become APPLIED after revocation or cancellation. The worker's final Stop waits
for any in-flight configuration; it retains the slot until cleanup is actually
acknowledged. Hardware requires accepted=true and hardware_applied=true; absent
acknowledgement quarantines the station. Enqueuing Stop is not safe completion.
Gateway deadlines remain the configured RPC budget; local thread tests do not
establish a physical shutdown deadline.

Expiry, disconnect, shutdown and multi-session revocation sweeps first accept
cancellation for every affected indexed record, then dispatch remote cleanup.
A separate four-worker Stop pool admits at most 16 outstanding identities,
independently of simulator workers. Sweep tasks acquire an execution control
lock without waiting: a blocked configuration remains STOPPING and is retried
by the next monitor tick. Pending identities and acknowledged requests are
deduplicated; capacity exhaustion retains cancellation rather than growing an
executor queue. An acknowledged request suppresses duplicate Stop dispatch but
does not release a slot or certify safe completion. Worker finalization retains
the existing actual-ACK/quarantine rule. An explicit user's Stop still serializes
with its own execution, while unrelated sweeps and revocation can proceed.

Forward Alembic revision `0006_experiment_runtime` adds the relational
`lab_experiment_runtime` projection. It backfills historical records in 100-row
keyset batches, retaining original payload JSON, owner IDs, sequence, captures,
operations, document references and leases. State, active flag, session/tab,
station, queue order and legacy-capture flags update in the same transaction as
the payload through repository writes. Owner joins the original experiment row,
so guest ownership transfer has no duplicate owner field to drift.

Admission uses EXISTS. Expiry/disconnection/shutdown read indexed active scalar
rows in batches of at most 100; terminal circuit graphs are not hydrated.
Startup reads only pending inline-capture migrations and queued records in
100-row batches. Electrical lease cleanup runs first in 100-row batches. Each
legacy-capture/queued recovery pass has a 10,000-record ceiling: startup fails
explicitly with RECOVERY_LIMIT_EXCEEDED before replaying queued work above that
ceiling, preserving the persisted queue for operator review.
This is a startup resource guard, not a history deletion policy. Existing
inline-capture externalization remains resumable as each converted row commits.

Run rate entries expire after the one-second admission window and have a
4,096-entry ceiling. Admission refuses new entries while that ceiling is full;
it never evicts an unexpired entry to allow a rate-limit bypass. Idle execution
locks and empty dispatcher/queue entries are removed.

The browser uses bounded owner-scoped `/api/experiments/history` (1–100 rows)
and `/api/experiments/active` (100 rows with a cursor). The legacy list route
retains its complete historical array for compatibility; it is not used by
monitoring or current Web recovery. It must not be silently truncated. New
integrations must use the paged routes; removing the legacy shape requires a
separate versioned compatibility decision.

Upgrade with writers stopped and a verified database/capture backup. Rehearse
the forward chain on a restored database; compare record and lease counts,
unchanged historical payloads and indexed active query plans before switching.
Downgrade restores the matching backup. PostgreSQL query-plan and real
pg_dump/restore cases are explicit release gates, independently of SQLite tests.
