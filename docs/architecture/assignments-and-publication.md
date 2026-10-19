# Assignment authoring, publication and compatibility

The canonical authoring API is
`contracts/public/assignments.schema.json`, version 1.0. An
`AssignmentAuthoringDocument` wraps the existing `AssignmentDefinition`; generated
models, runtime parsers, OpenAPI and operation bindings share those definitions.
The wrapper carries owner, timestamps, current revision, publication status and
published revision. Assignment identity cannot change during a save.

Additive `contracts/public/assignments-v2.schema.json` defines
`AssignmentDefinitionV2` 2.0 with Graph 1.2 references. `/api/v2/assignment-documents`
and `/api/v2/assignments` reuse the same ownership, immutable revisions,
publication CAS and redaction authority. The Web explicitly opts into this
version when attaching a 1.2 reference; opening/saving an old definition does not
retag it. Legacy reads/mutations reject a selected V2 definition with
`UNSUPPORTED_DOCUMENT_VERSION` before changing it. See the [flexible contract](../../contracts/design-models/flexible-placement.md).

Instructors author their own assignments. Admin access to another author's
assignment is explicit and audited on reads, edits, publication and execution
admission. Students cannot access authoring endpoints. Session, current role and
owner checks execute in the mutation transaction using the shared database
session fence; entry-time middleware checks alone do not authorize a delayed
write. Schema and byte-bound validation happen before that transaction.

`/api/assignment-documents` supports bounded keyset listing and creation.
`/{assignment_id}` supports reading and saving. Save supplies
`{base_revision, definition}`. `/{assignment_id}/publication` accepts
`{base_revision, published, feedback_policy?}`. A stale base returns HTTP 409
`REVISION_CONFLICT` with `current_revision`; the caller retains its unsaved draft.
Revisions cannot advance beyond the contract's safe-integer maximum.

Every accepted save or publication increments the authoring revision and retains
an immutable definition snapshot. For example: creation produces revision 1;
publication produces revision 2 and selects published revision 2; editing produces
revision 3 while published revision 2 remains available to students; publication
then selects revision 4. Unpublication increments the head and clears its
published selection. An unfinished draft does not replace the published
execution definition. Endpoint bindings may remain unresolved while authoring;
execution still performs the existing Lab-first resolution and safety gates.

The frozen legacy `GET /api/assignments` and `GET /api/assignments/{id}` response
shapes remain `AssignmentView` 1.0. Students receive only the published title,
assessment policy and public endpoint fields. Reference designs, expected
answers, instructor profiles and physical endpoint mappings remain excluded even
when detailed experiment feedback is enabled. Privileged callers receive the
legacy instructor projection; versioned authoring clients use the new wrapper to
obtain revision metadata and the draft definition.

The pre-auth application returned raw assignment definitions. That disclosure is
intentionally not preserved: authenticated role-scoped views replace it, without
altering the stored canonical definitions. Old create and publication routes
delegate to the same authoring service and return their original response
shapes. The old publication request has no base revision; this compatibility
operation serializes publication of the current saved head inside the database
transaction. It cannot overwrite a definition. New clients always use explicit
publication CAS.

Experiment admission resolves the definition and selected revision before
compilation, then rechecks visibility and that same immutable selection inside
the experiment/operation insert transaction. A concurrent unpublication denies
admission; a changed selected revision returns `ASSIGNMENT_CHANGED`. The API does
not substitute a newer definition after compiling an older one. Editing a newer
unpublished draft leaves student admission against the existing published
revision valid. Private `_assignment_reference` and `_assignment_snapshot` retain
the admitted version and grading context without extending the frozen public
document-reference DTO or exposing answers.

Feedback policy is deliberately live for all historical public experiment
reads: an explicit instructor policy change affects HTTP, operation recovery and
realtime projections of previous runs. The full immutable grading context and
observations remain stored. Publication visibility controls new assignment
admission; it does not transfer experiment ownership or grant control authority.

Migration `0004_assignments` follows `0003_projects`. Its frozen table definitions
add immutable versions and deferred foreign keys for the current/published
selection, and add the owner/sequence experiment-history index. Existing
assignment payloads and access policies become revision 1 without normalizing or
deleting historical JSON; previously published assignments select that revision.
Trusted repository imports after migration seed the same metadata. Existing
projects, captures, operations, leases and private experiment snapshots remain
untouched. Destructive downgrade is disabled; use a verified database/capture
backup with writers stopped. SQLite backup and actual PostgreSQL
`pg_dump`/`psql` restore rehearsals verify the upgrade and retain the original
database revision.
