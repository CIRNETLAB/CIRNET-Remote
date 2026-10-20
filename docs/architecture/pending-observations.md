# Browser pending operation observations

The backend remains the authority for durable operation and instrument command
records. Browser recovery retains a minimal observation hint before dispatch:
verified principal ID, operation kind/key, optional known experiment ID, generator
channel, creation/expiry timestamps and observation status. It stores no request
payload, graph, configuration, cookie, CSRF token, control-client identity or
hardware approval. This local format is not a public API or hardware contract.

The framework-independent ledger uses a storage port. Its browser adapter stores
one versioned localStorage item, bounded to 64 records total, 32 records per
principal and 65,536 UTF-8 bytes. Records expire after 24 hours. Quota rejection
preserves existing pending entries and reports a visible error. An unreadable,
corrupt or unavailable store blocks new Create/Run/Apply before dispatch; an
explicit authenticated Stop remains available. Cleanup failure after a received
ACK preserves command semantics and reports the browser tracking issue.

Every browser read/modify/write mutation holds the same origin-wide exclusive
Web Lock for the entire localStorage transaction. This serializes separate tabs'
begin, unknown, terminal cleanup and forget updates; reads happen after lock
acquisition, so a stale tab cannot overwrite another pending key or resurrect a
completed key. Create/Run/Apply wait for the committed identity before dispatch
and recheck cancellation after waiting. A browser without Web Locks fails
tracking explicitly; it cannot silently use an unsafe unlocked fallback. The
storage port permits synchronous isolated memory implementations for unit tests.
Explicit Stop tracking uses Web Locks' immediate `ifAvailable` acquisition for
both begin and response cleanup. A lock held in another tab therefore cannot
delay the Stop HTTP request or keep an acknowledged Stop pending; unavailable
tracking is reported and the backend response remains authoritative.

Fresh verified principal scope hydrates that principal's keys. Remote snapshots
and operation reconciliation use read-only backend queries. A temporarily missing
record remains unknown; absence is not evidence that a mutation did not execute.
Restored lifecycle records cannot grant `controlledExperimentId`, and generator
status reads cannot restore output authority. An ACCEPTED generator command is
observed separately from driver APPLIED; multiple restored keys on one channel
are reconciled in order. Terminal observed entries are removed locally.

Session reset fences in-flight responses synchronously and clears in-memory
state. Old principal entries remain partitioned in storage until reconciled,
forgotten or expired; no old keys are displayed under the next principal.
Returning to the same principal can observe them again. Account claim does not
silently transfer browser operation hints or authority.

History and generator status provide explicit local tracking removal. Forgetting
only deletes browser hints. It never mutates backend evidence, Stop state or
output, and never repeats a command. Run admission continues to depend on fresh
owned execution snapshots, and Stop remains a separate explicit user action.
