# Private projects and circuit revisions

[Tiếng Việt](../../vi/architecture/projects-and-revisions.md) · [Documentation](../index.md)

The public project and document API is version 1.0 at `contracts/public/projects.schema.json`. The contract toolchain supplies the shapes, Python models, browser DTOs, runtime validators, OpenAPI and operation bindings. A durable principal owns each project. Instructor and Admin roles grant no implicit access to another principal's projects.

## Document identity and graph versions

`project_id` identifies a server project. `document_id` identifies a server document. The graph keeps its embedded `circuit_id`, and the server document name is separate from imported graph metadata. Create, Save, Open and Save As preserve supported Graph 1.0, 1.1 and 1.2, including extensions, metadata, mounting and contact bindings, memory images, lead properties and wire visuals. Storage validation checks the shape. Editor representability, execution authorization and physical wiring correctness remain separate checks.

The original public schema and routes keep their frozen legacy shapes. Additive `contracts/public/placement.schema.json` and `/api/v2` document operations accept `AnySupportedCircuitGraph`, including 1.2 flexible assemblies and explicit free physical descriptors. Legacy read, list and save operations that select a 1.2 document return `UNSUPPORTED_DOCUMENT_VERSION`. The Web selects v2 before writes and retries a read only after that explicit error. Mutation requests are never replayed. See the [flexible placement contract](https://github.com/CIRNETLAB/CIRNET-Contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md).

## Saves, lists and deletion

Projects and documents have revisions and timestamps. A save supplies `base_revision`, `name` and the canonical `graph`. The database updates the current row only if owner, identity, liveness and base revision match. The same transaction inserts the new immutable graph revision. A stale base returns HTTP 409 `REVISION_CONFLICT` with `current_revision`. Invalid or conflicting saves leave the prior graph and revision intact.

A successful response carries its revision and a matching ETag. The client associates the acknowledgement with the submitted local draft revision. An edit made while saving remains dirty. Save As creates a new server document from the current graph.

Project and circuit lists apply owner scope and bounded keyset pagination with `limit` 1–100, default 50, and an opaque `cursor`. The cursor marks a navigation position. Ownership is checked independently. Graph storage is limited to 2,000,000 UTF-8 bytes, matching the editor file boundary.

Deletion requires the matching base revision and creates a tombstone. Project deletion also hides its documents. Immutable graph revisions and experiment references survive, preserving historical evidence and admitted runs. New circuit insertion checks the parent atomically. PostgreSQL also locks the live parent row against concurrent deletion. Mutation authorization is rechecked inside the transaction after validation so a pending guest write cannot commit after account claim or revocation.

Confirmed guest claim atomically transfers project ownership alongside experiments and operation identities. Document ownership follows the composite parent/owner foreign key. Historical `saved_by` and audit records retain their author identities. Claim excludes other guests' data and orphaned legacy records.

See the [project routes](../../../services/api/app/api/projects.py) and [project service](../../../services/api/app/services/projects.py).

## Experiment admission

Admission can use an owned saved document and revision pair or an inline graph. A saved pair cannot be combined with an overriding inline graph. The server pins the graph, configuration and assignment context. It inserts the saved-document reference atomically with experiment creation. The public document-reference DTO includes execution mode and distinguishes `INLINE_GRAPH`, `SAVED_DOCUMENT` and `ASSIGNMENT_CONTEXT`.

A physical assignment or context snapshot is a design reference. The Lab-First scan determines observed wiring, and safety and executability gates remain authoritative. See [assignment publication](assignments-and-publication.md).

## Authored content and recovery

JSON import and export are local file operations. Export does not acknowledge a server save. Local recovery uses a separate, versioned browser repository partitioned by principal. It stores document work. Credentials, approvals and hardware execution authority stay outside it.

The document engine exposes one authored projection for history, export, clipboard duplication, server writes, recovery checkpoints and saved-document references. A captured momentary contact overlays live `pressed` input while retaining the original authored value and whether the field was omitted. It advances the live graph generation for preview and validation. The authored content generation and dirty state stay unchanged. Release, document switch, deletion, Undo/Redo and principal reset remove the captured input scope. Imported persistent `pressed=true` remains authored data after a captured press and release.

Save metadata belongs to each local draft within the current principal. Switching from a server draft to a scratch draft and back preserves the server draft's binding and acknowledged base revision. A pending save acknowledgement or conflict updates its originating draft even when another draft is active. It cannot mark the other draft saved. The registry keeps at most 128 live server draft bindings and explicitly rejects an additional one rather than evicting an open binding. Removed drafts are pruned.

On principal transitions, capture every authored recovery snapshot and per-draft binding, then synchronously clear documents and metadata before awaiting storage. Confirmed remote deletion detaches every matching draft binding and keeps local content.

Recovery stores bindings per draft and treats each as an untrusted server reference. A recovered draft is dirty. An authenticated, owner-checked CAS Save or server Open must establish a current acknowledgement before it can supply a saved execution reference. Recovery restores neither session nor hardware authority and does not replay a pending save.

## Migration, backup and verification

Migration `0003_projects` follows `0002_auth`. Its immutable schema defines projects, circuit documents, saved revisions and experiment references. It includes owner, parent and snapshot foreign keys, uniqueness constraints, indexes and `BIGINT` revisions for the declared safe-integer range. SQLite remains the development and test target. PostgreSQL is the production target. The migration adds tables without rewriting legacy experiments, assignments, operations, sessions, captures or quarantined leases. Older records remain readable and acquire no fabricated document references.

Before deployment, stop writers, make a verified backup and rehearse the upgrade on a separate restored database. The SQLite backup API rehearsal preserves W3 data, runs `PRAGMA integrity_check`, upgrades the copy and verifies the original remains at its prior revision. For PostgreSQL, use `pg_dump` and a separate restore before switching. Destructive downgrade is disabled. Recovery restores the verified database and matching capture files while writers remain stopped.

The PostgreSQL migration and concurrency gate requires a running server. Offline DDL compilation cannot satisfy it. Set `CIRNET_TEST_POSTGRES_URL` privately to a disposable database and put PostgreSQL client tools on PATH or select them with `CIRNET_TEST_PG_BIN`. Run the explicit gate.

~~~console
python -m pytest -q services/api/tests/postgres_cases.py
~~~

Missing database configuration fails the gate. Each case creates a random `cirnet_test_w34_<uuid>` schema and removes only that registered schema. The suite rehearses a real `pg_dump`/`psql` restore into a separate test schema, upgrades the historical migration chain, verifies independent-writer CAS and revision foreign keys, and observes PostgreSQL lock dependencies for guest claim, experiment admission and parent deletion. Deployment rehearsal still requires a separate restored database and matching capture backup.

See the [project migration](../../../services/api/app/migrations/versions/0003_projects.py), [PostgreSQL cases](../../../services/api/tests/postgres_cases.py) and [authentication and database upgrades](auth-and-migrations.md).
