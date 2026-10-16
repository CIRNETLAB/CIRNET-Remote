# Persistent capture identities and cleanup

Revision `0005_captures` follows `0004_assignments`. Its frozen definitions live
in `app/migrations/schema_v0005.py`; the revision imports no mutable head table
metadata. It adds `lab_captures`, indexed for available payload age and pending
cleanup, with a foreign key to the owning experiment. Each row retains capture
identity, metadata JSON, creation time, availability and cleanup status. Samples
remain in external NCAP payloads. Multiple immutable capture generations may
reference one experiment.

Capture ownership comes from a join to `lab_experiments.owner_id`. It has no
second owner field to become stale during a confirmed guest claim. Instructor
and Admin roles do not grant another principal's private capture access.

The migration adopts existing sealed metadata that has a payload reference,
positive byte count and SHA-256 identity, or an unavailable zero-byte metadata
record. It skips inline sample arrays and unsealed historical records. It does
not rewrite original experiment JSON, remove inline legacy data, touch payload
files, delete leases or clear quarantine. Duplicate historical capture IDs fail
the migration instead of guessing ownership. Unsealed historical captures remain
in their original records and require an explicit recovery policy before they
can enter the sealed payload API.

Stop writers and retain the matching database and payload backup before upgrade.
Rehearse SQLite with the backup API and `PRAGMA integrity_check`; rehearse
PostgreSQL with actual `pg_dump` and restore into a separate owned schema or
database. Inspect catalog counts and retained JSON/lease state before switching.
A destructive downgrade is refused; rollback restores the verified database and
matching payload backup. Automated tests exercise both actual database dialects,
including PostgreSQL backup/restore and lock dependencies.

Experiment saves insert the current sealed capture into the catalog in the same
SQL transaction. Existing IDs cannot change their sealed metadata identity or
belong to a different experiment. Retired IDs cannot become available again.
Replacing an experiment's current capture retains older catalog generations.

`Repository.retire_capture` checks current session authority when supplied,
locks the parent experiment and re-reads its owner, terminal state and absence of
any lease, including quarantine. Retirement changes metadata to unavailable,
clears its payload reference/hash/size and commits `cleanup_pending=true` before
filesystem IO. It also updates the current experiment JSON and increments its
revision if that exact capture is still current. Deleting an older generation
cannot replace the current capture. Revision exhaustion rolls back the entire
retirement. Every changed retirement writes its reason to the audit in that same
transaction. Session-authorized deletion records its actual principal; maintenance
records a null actor rather than inventing a principal.

Cleanup may then remove the owned payload and mark cleanup complete. A failed
file operation leaves the tombstone and pending flag for an explicit retry;
clients cannot read a payload whose cleanup failed after retirement. Repeated
retirement is idempotent and retains pending cleanup. No SQL transaction spans
filesystem reads, hashing, deletion or retry. The bounded retention query selects
expired available captures and pending cleanup, excluding nonterminal or leased
experiments. Parent-row fences also prevent a competing reservation from
creating a new lease after terminal retirement.
Setting retention seconds to zero disables age expiry and continues retrying
pending cleanup; an available capture with epoch-zero metadata is not expired.
