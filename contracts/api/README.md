# Public Application API 1.0

The canonical schema families registered in `contracts/manifest.json` own public DTO shapes: API, auth, projects/revisions, assignment authoring, history, realtime and instrument control. Lab domain definitions remain in `physical-lab/lab.schema.json`; CircuitGraph supports 1.0 and 1.1. FastAPI route registrations own methods, paths and status codes. `openapi.json` is exported from those routes with canonical schemas and explicit validation profiles. Generated browser operation bindings choose the named response parser from the operation identity; callers cannot assert an unrelated generic response shape.

Generate DTOs with `python scripts/generate_contracts.py`. Export or check operations with `python scripts/export_openapi.py` and `python scripts/export_openapi.py --check`. Export uses `create_app(schema_only=True)`, without database creation, experiment recovery or hardware connection.

| Route | Request / success contract |
|---|---|
| GET `/api/health` | `HealthResponse` |
| POST `/api/circuits/validate` | CircuitGraph / `CircuitValidationResult` |
| POST `/api/circuits/physical-preview` | CircuitGraph / `PhysicalPreviewResult` |
| GET `/api/stations` | Array of `StationDescriptor` |
| GET `/api/stations/{id}/capabilities` | `PublicStationCapabilities` |
| GET `/api/stations/{id}/queue` | `QueueState` |
| POST `/api/assignments` | `AssignmentDefinition` / authorized `InstructorAssignmentDocument` (201) |
| GET `/api/assignments`, `/api/assignments/{id}` | `AssignmentView` array / authorized student or instructor view |
| PATCH `/api/assignments/{id}/publication` | Legacy `AssignmentPublication` / authorized `InstructorAssignmentDocument`; retained compatibility route |
| POST `/api/experiments` | `ExperimentCreate` / `ExperimentRecord` (201) |
| GET `/api/experiments`, `/api/experiments/{id}` | Owner-scoped record array / record |
| POST `/api/experiments/{id}/run`, `/stop` | `ExperimentRecord` |
| GET `/api/experiments/{id}/results` | `ExperimentRecord` with independent verification and capture metadata |
| POST `/api/experiments/{id}/instruments` | `InstrumentConfigureRequest` / `InstrumentOperationResult` |
| GET `/api/operations/{key}` | Owner-scoped `OperationRecord`; `kind` and optional `experiment_id` select operation scope |
| GET `/api/captures/{id}/payload` | Bounded NCAP v1 binary, `application/vnd.netcircuit.capture; version=1` |
| DELETE `/api/captures/{id}/payload` | `CaptureMetadata`, marked unavailable |
| GET `/api/auth/session`; POST `/api/auth/login`, `/logout`, `/claim-guest` | `SessionView`; server cookie rotation and current CSRF token |
| GET/POST `/api/admin/users`; PATCH `/api/admin/users/{id}` | Admin-only typed user views/mutations |
| GET/POST `/api/projects`; GET/PATCH/DELETE `/api/projects/{id}` | Owner-scoped projects, bounded pages and conditional revision |
| GET/POST `/api/projects/{id}/circuits`; GET/PUT/DELETE `/api/circuits/{id}` | Exact graph document, saved revision, CAS conflict and tombstone |
| GET/POST `/api/assignment-documents`; GET/PUT `/api/assignment-documents/{id}`; PATCH `/{id}/publication` | Author/Admin draft and stable published revisions; student access denied |
| GET `/api/experiments/history`, `/api/experiments/active` | Bounded owner-scoped snapshot pages; no restored control authority |
| GET `/api/experiments/{id}/document-reference` | Immutable admitted document/schema/config reference |
| GET `/api/experiments/{id}/instruments/access` | Current owned control context/allocated generator subset; capability channel count remains authoritative |
| POST `/api/experiments/{id}/instruments/generator`; GET `/{id}/instruments/commands/{key}` | Required idempotency key / durable `InstrumentCommandRecord`; read-only acknowledgement recovery |

`PublicStationCapabilities` omits private routing resources and observed node maps. The internal `StationCapabilities` contract and protobuf RPC remain unchanged. Browser consumers use the public projection; historical internal-shape fixtures remain covered independently. Neither experiment creation nor any public mutation accepts a client-authored execution decision, private plan or hardware resource configuration.

Circuit validation and preview preserve their existing 422 `{valid:false,code,message}` compatibility response. Other failures use `ErrorEnvelope` with `code`, readable `message`, `request_id` and optional structured field issues. Standard statuses distinguish ownership (403), missing resources (404), conflicts (409/412), invalid input (422), admission limits (429), and unavailable dependencies (503). Response models preserve omitted optional fields. Preview responses identify `provenance=simulation_preview` and their limited educational model envelope; they provide no hardware acquisition evidence.

Create, Run and Stop accept an optional `Idempotency-Key` for compatibility with existing callers. A key is scoped to owner, operation and verified request content. Reusing a key with different content fails. Clients that lose a response reconcile through the operation endpoint instead of creating another experiment or replaying Start. `REQUESTED`, `ACCEPTED`, `APPLIED` and `FAILED` represent operation progress. Run becomes APPLIED when Start acknowledges (persisted CAPTURING transition); later acquisition faults remain experiment outcomes. Stop becomes APPLIED only after terminal state and actual safe lease release, including absence of a quarantined lease. Successful operation acknowledgement has no operation error, even when the experiment retains a prior error. Accepted instrument configuration is not advertised as applied output. The server remains authoritative for state, safety, lease and capability checks.

Experiment JSON and lifecycle events contain capture metadata only. Samples remain in the owner-scoped HTTP binary data plane and local Hardware Service RPC payload. NCAP v1 preserves digital sample order and `0`, `1`, `X`. NCAP v2 sampled descriptors/codecs are a separate library boundary with an explicit injected source; they do not change the current v1 endpoint/MIME or enable an unavailable analog producer. Stop/release preserves retained payloads. Indexed terminal-owner retirement commits unavailability/audit before cleanup; pending cleanup can retry through bounded maintenance. Authorization is checked before and after slow reads.

Durable principals own data independently of revocable hashed server sessions. Every mutation requires the current CSRF token and trusted Origin, including login/logout; production cookies are Secure/HttpOnly/SameSite=Lax and production guests are disabled. Explicit session bootstrap and successful auth mutations install credentials; ordinary expired reads return401 without a replacement cookie, so an old response cannot overwrite a newer login. Student/Instructor/Admin roles never grant another owner's private projects/experiments/captures. Guest claim requires proven possession and explicit confirmation. Assignment list/detail returns a published student projection or authorized author view; expected answers/reference data are withheld by default. The legacy POST assignment route remains author-role protected; draft publication uses the versioned authoring endpoints.

Run/live instrument changes also require the bound non-secret `X-Control-Client`. Typed access queries opt into this header without turning ordinary reads into control heartbeats. Stop remains owner-authorized. New Generator commands persist intent before RPC, distinguish ACCEPTED/APPLIED, and preserve REQUESTED/ACKNOWLEDGEMENT_UNKNOWN after a lost driver reply. GET recovery never replays output; the legacy instrument response remains its original accepted/code/status shape.

The realtime protocol in `contracts/public/realtime.schema.json` has explicit version, stream identity/sequence, revision and resync. Clients reconcile authorized snapshots after overflow/gap/reset/reconnect; stale/duplicate snapshots cannot replace newer state and historical selection cannot become live control. Structured metadata-only logs link request → operation → experiment → capture; critical actions also retain durable audits. Supported unpublished public wire/NCAP anchors are checked by `scripts/check_public_compatibility.py`; this is not a fabricated release or a generic JSON Schema subtype proof. Physical execution remains safety/executability gated; topology and assessment do not grant or veto power permission.
