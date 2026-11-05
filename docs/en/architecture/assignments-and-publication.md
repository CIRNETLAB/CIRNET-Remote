# Assignment authoring and publication

[Tiếng Việt](../../vi/architecture/assignments-and-publication.md) · [Full original note](../../architecture/assignments-and-publication.md)

An assignment has an editable head and a separately selected published revision. Instructors can edit their own drafts while students continue to see and use the selected published definition. Students cannot use authoring routes. Administrator access to another author's assignment is explicit and audited.

## Authoring and publication

The 1.0 `AssignmentAuthoringDocument` wraps an `AssignmentDefinition` with its owner, timestamps, authoring revision and publication state. Identity stays fixed across saves. The authoring collection at `/api/assignment-documents` uses bounded keyset pagination. A save sends `{base_revision, definition}`, and publication sends `{base_revision, published, feedback_policy?}` to the assignment's publication endpoint. A stale base returns HTTP 409 `REVISION_CONFLICT` with `current_revision`. The client's unsaved draft stays available. Schema and size checks precede the mutation, and the transaction rechecks session, role and ownership.

Each accepted save or publication records an immutable revision within the contract's safe-integer range. For example, creation makes revision 1, publication selects revision 2, and a draft edit makes revision 3 while revision 2 remains published. The next publication selects revision 4. Unpublishing advances the head and clears its published selection. Drafts can contain unresolved endpoints, which the execution path resolves and checks before admission.

## Versioned reads and admission

`/api/v2/assignment-documents` and `/api/v2/assignments` share ownership, publication and redaction rules with the 1.0 API. They accept the 2.0 definition with Graph 1.2 references. The editor opts in when attaching a 1.2 reference. Legacy operations reject a selected V2 definition with `UNSUPPORTED_DOCUMENT_VERSION`. The legacy publication operation serializes selection of the current saved head. New clients provide a base revision.

A student sees the published title, assessment policy and public endpoint fields. Reference graphs, expected answers, instructor profiles and physical mappings remain private, including when detailed feedback is enabled. Admission resolves the selected immutable definition before compilation and rechecks it in the experiment and operation insert transaction. Concurrent unpublication denies admission, and a changed selection yields `ASSIGNMENT_CHANGED`. A private snapshot preserves the admitted grading context. Explicit feedback policy changes affect historical HTTP, operation recovery and realtime projections while keeping the original observations and grading context.

Migration `0004_assignments` follows `0003_projects`. It gives existing payloads revision 1, selects it for previously published assignments and preserves original JSON. Use a matched database and capture backup for rollback. See [private projects](projects-and-revisions.md) and [authentication and database upgrades](auth-and-migrations.md).
