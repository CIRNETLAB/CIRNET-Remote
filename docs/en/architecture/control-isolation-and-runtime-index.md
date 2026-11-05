# Scheduler control isolation and the runtime index

[Tiếng Việt](../../vi/architecture/control-isolation-and-runtime-index.md) · [Full original note](../../architecture/control-isolation-and-runtime-index.md)

A supported deployment runs one API scheduler process. Database reservations protect station and slot uniqueness. FIFO dispatch and the manager's execution ownership live in that one process.

## Reservation and safe Stop

The manager holds its state lock for queue, state and reservation changes. It reads the queue-head revision, releases the lock for remote capability discovery, then rechecks the head, revision, session, quarantine and available slots. Each reservation receives a generation. One dispatcher per station preserves FIFO. Concurrent requests schedule another pass while a remote call is in progress.

Live instrument operations serialize per execution. Capability, configuration and Stop RPCs run outside the manager state lock. Configuration checks owner, session, tab, state, revision, generation, lease and allocation before dispatch and after its reply. Stop records cancellation and `STOPPING` before waiting on that execution's control call. Late configuration replies cannot become `APPLIED` after cancellation or revocation. Worker finalization waits for in-flight configuration and retains the lease and slot until the actual cleanup outcome. Physical cleanup requires `accepted=true` and `hardware_applied=true`. Failure quarantines the station.

Expiry, disconnect, shutdown and revocation sweeps record cancellation for every affected execution before scheduling cleanup. The separate Stop pool has four workers and at most 16 outstanding identities. Sweep tasks try the execution lock without waiting and let the next monitor tick retry a contended execution. Duplicate or already acknowledged requests are suppressed. An ACK in the dispatcher bookkeeping still leaves final cleanup to the worker.

## Indexed recovery and reads

Migration `0006_experiment_runtime` adds `lab_experiment_runtime`. It backfills in 100-row keyset batches, preserving historical JSON, owner IDs, sequence, captures, operations, references and leases. Runtime state and queue metadata update with the experiment payload in one transaction. Ownership is read from the experiment row so a guest claim has one source of ownership.

Admission uses an indexed existence query. Sweeps read active scalar rows in batches of at most 100. Startup resolves leases first, then processes pending legacy capture conversion and queued work in 100-row batches. A 10,000-record ceiling per recovery pass raises `RECOVERY_LIMIT_EXCEEDED` and leaves the persisted queue for review before it could replay work over that bound. Run admission uses a one-second window and caps rate entries at 4,096, refusing new entries while the live table is full.

Current clients use owner-scoped `/api/experiments/history` and `/api/experiments/active` with bounded pages. The legacy list keeps its complete compatibility shape. Upgrade with writers stopped and a matched database and capture backup. Inspect historical payloads and indexed query plans in the restored rehearsal. The dated WC20 evidence in the original note covers software behavior and does not measure a physical Stop deadline. See [physical lab safety](physical-lab-safety.md).
