# Assignment authoring, publication and compatibility

[Tiếng Việt](../../vi/architecture/assignments-and-publication.md) · [Documentation](../index.md)

An assignment has an editable head and a separately selected published revision. Instructors can edit their own drafts while students continue to see and use the selected publication.

## Authoring and publication

The canonical authoring API is `contracts/public/assignments.schema.json`, version 1.0. The `AssignmentAuthoringDocument` wraps the existing `AssignmentDefinition` with its owner, timestamps, current revision, publication status and published revision. Generated models, runtime parsers, OpenAPI and operation bindings share these definitions. Assignment identity stays fixed across saves.

Instructors author their own assignments. Administrator access to another author's assignment is explicit and audited on reads, edits, publication and experiment admission. Students cannot use authoring endpoints. Schema and byte-bound checks run before the mutation. Inside the transaction the shared database session fence rechecks the session, current role and owner. Entry-time middleware checks alone cannot authorize a delayed write.

`/api/assignment-documents` supports bounded keyset listing and creation. Its `/{assignment_id}` path supports reading and saving. Save supplies `{base_revision, definition}`. The `/{assignment_id}/publication` path accepts `{base_revision, published, feedback_policy?}`. A stale base returns HTTP 409 `REVISION_CONFLICT` with `current_revision` and leaves the unsaved draft on the client. Revisions cannot exceed the contract's safe-integer maximum.

Every accepted save or publication advances the authoring revision and retains an immutable definition snapshot. Creation produces revision 1. Publication produces and selects revision 2. Editing produces revision 3 while revision 2 remains available to students. The next publication selects revision 4. Unpublishing advances the head and clears the published selection. An unfinished draft does not replace the published execution definition. Draft endpoints may remain unresolved during authoring. Execution still uses the Lab-First resolution and safety gates.

See the [assignment routes](../../../services/api/app/api/assignments.py) and [authoring service](../../../services/api/app/services/assignments.py).

## Versioned and legacy API views

Additive `contracts/public/assignments-v2.schema.json` defines `AssignmentDefinitionV2` 2.0 with Graph 1.2 references. `/api/v2/assignment-documents` and `/api/v2/assignments` reuse ownership, immutable revisions, publication compare-and-swap (CAS) and redaction. The Web opts into v2 when attaching a 1.2 reference. Opening or saving an old definition preserves its version. Legacy reads and mutations reject a selected V2 definition with `UNSUPPORTED_DOCUMENT_VERSION` before changing it. See the [flexible placement contract](https://github.com/CIRNETLAB/CIRNET-Contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md).

The frozen `GET /api/assignments` and `GET /api/assignments/{id}` response shapes remain `AssignmentView` 1.0. Students receive only the published title, assessment policy and public endpoint fields. Reference designs, expected answers, instructor profiles and physical endpoint mappings stay private even with detailed experiment feedback. Privileged callers receive the legacy instructor projection. Versioned authoring clients use the wrapper for revision metadata and the draft definition.

The pre-auth application returned raw definitions. Authenticated role-scoped views replace that disclosure while preserving the stored definitions. Old create and publication routes use the same authoring service and return their original response shapes. The old publication request has no base revision. The service serializes publication of the current saved head in the transaction and cannot overwrite a definition. New clients use explicit publication CAS.

## Experiment admission and feedback

Admission resolves the definition and selected immutable revision before compilation. The experiment and operation insert transaction rechecks visibility and the same selection. Concurrent unpublication denies admission. A changed selected revision returns `ASSIGNMENT_CHANGED`. The API never substitutes a newer definition after compiling the older one. Editing a newer unpublished draft leaves student admission against the existing publication valid.

Private `_assignment_reference` and `_assignment_snapshot` retain the admitted revision and grading context. The frozen public document-reference DTO stays answer-free. An explicit instructor feedback policy change applies to historical HTTP, operation recovery and realtime experiment projections. The full immutable grading context and observations remain stored. Publication visibility controls new admission. Experiment ownership and control authority remain governed by the experiment's own authorization.

## Migration and rollback

Migration `0004_assignments` follows `0003_projects`. Its frozen tables add immutable versions and deferred foreign keys for current and published selections, plus the owner/sequence experiment-history index. Existing payloads and access policies become revision 1. Previously published assignments select revision 1. The migration preserves historical JSON without normalizing or deleting it. Trusted repository imports after migration seed the same metadata. Existing projects, captures, operations, leases and private experiment snapshots remain intact.

Destructive downgrade is disabled. Stop writers and restore a verified, matched database and capture backup. SQLite backup and actual PostgreSQL `pg_dump`/`psql` restore rehearsals verify the upgrade on a copy and retain the original database revision.

See the [assignment migration](../../../services/api/app/migrations/versions/0004_assignments.py), [private projects and revisions](projects-and-revisions.md) and [authentication and database upgrades](auth-and-migrations.md).
