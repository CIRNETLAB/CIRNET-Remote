# Private projects and circuit revisions

[Tiếng Việt](../../vi/architecture/projects-and-revisions.md) · [Full original note](../../architecture/projects-and-revisions.md)

Projects belong to one durable principal. Instructor and Admin roles do not grant access to another principal's projects. `project_id` and `document_id` identify server records, while the graph retains its own `circuit_id`. Create, Save, Open and Save As preserve supported Graph 1.0, 1.1 and 1.2 content, including metadata, bindings, memory images, lead properties and wire visuals. Storage validation checks a document's shape. Editor support, execution validation and physical wiring checks remain separate.

## Saves, versions and deletion

Legacy operations keep the 1.0 shapes. `/api/v2` document operations accept Graph 1.2 flexible assemblies and explicit free physical descriptors. The editor selects v2 before writing a 1.2 document. It can retry a read after `UNSUPPORTED_DOCUMENT_VERSION`. Mutation requests are never replayed. A save sends `base_revision`, `name` and `graph`. The transaction rechecks session authority, owner, document liveness and the base revision, then adds an immutable revision. A stale base yields HTTP 409 `REVISION_CONFLICT` and `current_revision`. An ACK carries the revision and matching ETag and applies to the submitted draft state, so later local edits remain dirty. Save As creates a new server document.

Lists use owner-scoped keyset pagination, with a default limit of 50, allowed range 1–100 and an opaque cursor. The graph limit is 2,000,000 UTF-8 bytes. Deletion checks the base revision and records a tombstone. Project deletion also hides its documents. A concurrent child insertion must still see a live parent. Immutable revisions and experiment references survive deletion. Confirmed guest claim transfers owned projects with the other eligible records. Historical `saved_by` and audit identities are retained.

## Execution and recovery

An experiment pins an owned saved document and revision, an inline graph, or assignment context, along with the admitted configuration. A saved document and an overriding inline graph cannot be combined. Public references distinguish `INLINE_GRAPH`, `SAVED_DOCUMENT` and `ASSIGNMENT_CONTEXT`. The physical path uses the scan and safety gates to determine observed wiring.

JSON export is a local file operation. Server save, export, history and checkpoints use the authored graph. A held momentary contact changes live input for preview while preserving the authored `pressed` field and its omission semantics. It does not dirty the document. An imported persistent `pressed=true` remains authored data after a press and release.

Recovery partitions drafts by principal and treats a stored server binding as untrusted. A recovered draft needs an owner-checked Open or compare-and-swap Save before it can supply an acknowledged saved execution reference. Each save response updates its originating draft. The binding registry keeps at most 128 live server draft bindings and refuses another rather than evicting one. Deletion detaches matching bindings and retains local contents.

Migration `0003_projects` adds project, document, revision and experiment reference tables after `0002_auth`. Historical records retain their original content. Upgrade and rollback require a verified, matched database and capture backup. Use the explicit PostgreSQL gate with an isolated real database for migration, locking and backup/restore checks. See [database upgrades](auth-and-migrations.md).
