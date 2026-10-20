# Private projects and circuit revisions

The public project/document API is version 1.0 at
`contracts/public/projects.schema.json`. Shapes, Python models, browser DTOs,
runtime validators, OpenAPI, and operation bindings come from the contract
toolchain. Project ownership is private for every role, including Instructor and
Admin; a role never grants implicit access to another principal's projects.

`project_id` identifies a server project. `document_id` identifies a server
document and is independent of the canonical graph's embedded `circuit_id`.
Create, Save, Open, and Save As preserve supported graph 1.0/1.1/1.2, extensions,
metadata, mounting/contact bindings, memory images, lead properties and wire
visuals without covertly renaming the embedded graph. The document name is
separate from imported graph metadata. Structural storage validation does not
authorize execution or assert physical wiring correctness. Browser editor
representability and execution validation remain explicit consumer boundaries.

The original public schema and routes remain frozen for legacy graphs. Additive
`contracts/public/placement.schema.json` and `/api/v2` document operations
accept `AnySupportedCircuitGraph`, including 1.2 flexible assemblies and explicit
free physical descriptors. A legacy read/list/save that selects a 1.2 document
returns `UNSUPPORTED_DOCUMENT_VERSION`; the Web chooses v2 before writes and
retries a read only after that explicit version error. Mutation requests are
never replayed. See [flexible placement](../../contracts/design-models/flexible-placement.md).

Projects and documents have revisions and timestamps. A save supplies
`base_revision`, `name`, and the canonical `graph`. The database updates the
current row only when owner, identity, liveness, and base revision match; the
new immutable graph revision is inserted in the same transaction. A stale base
returns HTTP 409 `REVISION_CONFLICT` with `current_revision`. The server never
silently overwrites a competing save. Successful responses include their
revision in the body and a matching ETag. Clients must associate an ACK with the
local document revision that was submitted; an edit made while saving remains
dirty. Save As creates a new server document using the current graph.

Project and circuit lists use bounded keyset pagination (`limit` 1–100, default
50, plus an opaque `cursor`). A cursor is a navigation position and never an
ownership credential. Queries apply owner scope independently of the cursor.
Graph storage is bounded to 2,000,000 UTF-8 bytes, matching the editor's file
boundary. Invalid saves and conflicts leave the prior graph and revision intact.

Deletion requires a matching base revision and creates a tombstone. Deleting a
project also hides its documents. Immutable graph revisions and experiment
references remain retained, so deletion does not erase historical evidence or
change an admitted run. New circuit insertion checks the parent atomically;
PostgreSQL additionally locks the live parent row against concurrent deletion.
Mutation session authority is checked again inside the actual transaction after
validation, preventing a pending guest write from committing after account
claim/revocation.

The migration chain adds `0003_projects` after `0002_auth`. Its immutable schema
snapshot defines projects, circuit documents, saved revisions and experiment
references with owner/parent/snapshot foreign keys, uniqueness constraints,
indexes, and BIGINT revision fields for the declared safe-integer range. SQLite
remains the development/test target; PostgreSQL is the production target. The
migration adds tables without rewriting legacy experiments, assignments,
operations, sessions, captures, or quarantined leases. Older records remain
readable and do not acquire fabricated document references.

Experiment admission may use an owned saved document/revision pair or an inline
graph. A saved pair cannot be combined with an overriding inline graph. The
server pins graph, configuration, and assignment context for that experiment.
Its saved-document reference is inserted atomically with experiment creation.
The public document-reference DTO distinguishes `INLINE_GRAPH`,
`SAVED_DOCUMENT`, and `ASSIGNMENT_CONTEXT`, including execution mode. A physical
assignment/context snapshot is a design reference and never observed wiring
authority; the Lab-first scan and safety/executability gates remain authoritative.

Confirmed guest claim atomically transfers project ownership alongside
experiments and operation identities. Document ownership follows the composite
parent/owner foreign key. Historical `saved_by` and audit records retain their
original author identity. Claim does not adopt another guest's data or orphaned
legacy records.

JSON import/export remains local file work. Export does not acknowledge a server
save. Local recovery is a separate, versioned browser repository partitioned by
principal; it contains document work rather than credentials, approvals, or
hardware execution authority.

The document engine exposes one authored projection for history, export,
clipboard duplication, server writes, recovery checkpoints and saved-document
references. Captured momentary contacts overlay live `pressed` input while retaining
the original authored field and its omission semantics. They advance the live
graph generation for preview/validation without advancing the authored content
generation or making a clean document dirty. Release, document switch, deletion,
Undo/Redo and principal reset remove the captured input scope. Imported persistent
`pressed=true` remains authored data, including after a captured press/release.

Save metadata is indexed by local draft within the current principal. Switching
from a server draft to a scratch draft and back preserves only the server draft's
binding and acknowledged base revision. A pending save ACK or conflict updates
its originating draft even while another draft is active; it cannot mark that
other draft saved. The registry retains at most 128 live server draft bindings
and rejects an additional binding with an explicit error rather than silently
evicting an open binding. Removed drafts are pruned. Principal transitions first
capture all authored recovery snapshots and per-draft bindings, then synchronously
clear documents and metadata before awaiting storage. Confirmed remote deletion
detaches every matching draft binding and keeps its local content.

Recovery stores each draft's binding separately but treats it as an untrusted
server reference: a recovered draft is dirty, and an authenticated owner-checked
CAS Save or server Open must establish a current acknowledgement before a saved
execution reference can be used. Recovery never restores session or hardware
authority and never replays a pending save.

Before deployment, stop writers, make a verified backup, and rehearse the upgrade
on a separate restored database. The SQLite backup API rehearsal tests preserve
W3 data, run `PRAGMA integrity_check`, upgrade the copy, and verify the original
remains at the prior revision. For PostgreSQL use `pg_dump` and a separate restore
before switching. Destructive downgrade is disabled: recovery restores the
verified database and matching capture files while writers remain stopped.
Live PostgreSQL migration/concurrency verification requires a running server;
offline DDL compilation is not a substitute for that deployment gate.

Run the explicit PostgreSQL gate with `NETCIRCUIT_TEST_POSTGRES_URL` set privately
to a disposable test database and PostgreSQL client tools available on PATH (or
in `NETCIRCUIT_TEST_PG_BIN`):

```console
python -m pytest -q services/api/tests/postgres_cases.py
```

Missing database configuration fails this gate. Each case creates its own random
`netcircuit_test_w34_<uuid>` schema and removes only that registered schema. The
suite rehearses a real `pg_dump`/`psql` restore into a separate test schema,
upgrades the historical migration chain, verifies independent-writer CAS and
revision foreign keys, and observes PostgreSQL lock dependencies for guest claim,
experiment admission, and parent deletion. Deployment rehearsal still uses a
separate restored database and the matching capture backup.
