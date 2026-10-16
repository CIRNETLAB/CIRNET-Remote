# Authentication and database upgrades

The API uses durable principal IDs for ownership and independent, opaque cookie
credentials. New cookie values have 256 bits of randomness; only their SHA-256
digests are stored in `auth_sessions`. Session IDs used for revocation and control
leases are separate identifiers. Passwords use pinned `argon2-cffi==25.1.0`
Argon2id hashing, verification, and parameter rehashing. Passwords and cookie
credentials do not appear in public DTOs, audit rows, or command arguments.

`GET /api/auth/session` establishes a session and returns its CSRF token. In
explicit development guest mode the principal is a Guest with Student access.
When guests are disabled it establishes an unauthenticated session for login
CSRF. All unsafe HTTP methods, including login and logout, require an exact
trusted `Origin` and matching `X-CSRF-Token`. Cookie attributes are HttpOnly,
SameSite=Lax, Path=/, bounded lifetime, and Secure in production. Login, logout,
guest claim, and role changes revoke the previous session. The websocket checks
the same cookie, origin, expiry, and revocation state. `X-Control-Client` identifies
a tab's control lease and is not a credential.
An invalid, expired, or revoked supplied cookie produces `SESSION_EXPIRED` for
ordinary requests without installing a replacement cookie. Explicit
`GET /api/auth/session` bootstrap installs and returns a fresh prelogin or guest
session truthfully; it never retains the prior authenticated identity. Successful
auth mutations install their own rotated credentials. A late old-cookie or
no-cookie read therefore cannot overwrite a successful login's cookie. A valid
legacy-cookie bootstrap exchange is recognized separately and preserves only its
proven guest ownership. The Web retires prior remote connections during an auth
mutation and reconciles an unsuccessful/unknown rotation with one read-only
session request; it never replays login, claim or Run.

Set `NETCIRCUIT_ALLOW_GUEST=false` in production and provide explicit HTTPS
`NETCIRCUIT_TRUSTED_ORIGINS`. Production also requires PostgreSQL. Insecure
production combinations fail configuration validation. Development guest mode
is unsuitable for an Internet deployment. No default administrator exists.
`NETCIRCUIT_ENV` accepts exactly `development`, `test`, or `production`;
`NETCIRCUIT_ALLOW_GUEST` accepts exactly `true` or `false`. Misspelled values fail
startup rather than falling back to anonymous development behavior.

After installing the API, migrate and bootstrap from a private terminal:

```console
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username instructor-admin
```

The bootstrap command prompts without echo, or reads
`NETCIRCUIT_BOOTSTRAP_PASSWORD` for deployment provisioning. Remove that variable
after provisioning. It refuses when an administrator already exists. Only an
authenticated Admin may create accounts or change roles and active status; the
last active administrator cannot be disabled or demoted. These changes are
audited and revoke every affected session. Login admission limits are persisted
in the database; application mutation admission separately permits safety Stop.

Students see published `StudentAssignmentView` records without reference graphs,
expected answers, instructor pin profiles, or private endpoint mappings.
Instructors author and publish their own assignments; they do not automatically
receive another instructor's private assignments. Admin access is explicit.
The internal `AssignmentDefinition` remains the compiler's authoritative input.
Direct repository imports are private until explicitly assigned to an owner and
published. Experiment creation checks assignment access independently of listing.
Feedback defaults to `observed_only`; future detailed feedback must honor the
stored policy rather than expose teacher answers by default.

The current Alembic chain is `0001_legacy` → `0002_auth` → `0003_projects` →
`0004_assignments` → `0005_captures`. This guide describes its identity foundation;
the project, assignment and capture guides cover their later revisions. New
repositories run the chain, replacing unversioned `create_all`. The baseline verifies required legacy
columns before admitting an existing database and creates missing historical
tables. The auth revision adds identities, sessions, assignment access metadata,
audit records, and rate limits. It preserves experiment sequence, payload JSON,
operations, capture references, lease rows, quarantine flags, and legacy owner
strings. New auth and assignment access tables have foreign keys. Historical
experiment/operation ownership columns remain unchanged for trusted internal
imports; authenticated HTTP writes always use the durable principal ID.

Existing anonymous owners migrate to Guest principals. A still-valid old cookie
can be exchanged once for a new opaque session proving that same guest identity;
an expired cookie cannot claim historical records. Ordinary legacy-owned reads,
including capture payloads, retain that proof and install no replacement cookie.
They use an internal revocable context so final read authorization remains active.
That internal context expires no later than the legacy proof and is revoked by
confirmed claim together with the guest's other sessions.
Only explicit `GET /api/auth/session` consumes the proof and installs its opaque
credential; this prevents a delayed legacy read from overwriting a later login.
This intentionally replaces automatic credential installation on an ordinary
legacy read while preserving its owned read access and explicit claim flow.
Logging in preserves that
proof, but performs no automatic transfer. Explicit confirmed guest claim moves
experiments and operation keys atomically, rejects any active or quarantined
lease and active execution state, aborts on operation-key collisions, then rotates
the session. Historical assignments migrate private under `legacy-system` and
need deliberate owner/publication assignment. Migration never adopts all old
data into the first login.

Before upgrading a deployed database, stop API writers and make a verified
backup. For SQLite use the SQLite backup API (or `.backup`), not a live file copy;
open the backup and run `PRAGMA integrity_check`, then rehearse the migration on
that copy. For PostgreSQL use `pg_dump` and restore into a separate database,
run the migration and verify record/operation/lease counts before switching.
Keep capture files and their metadata together. Downgrade intentionally refuses
to delete identities; rollback means restoring the verified pre-upgrade database
and matching capture backup while writers remain stopped.

SQLite migration/restart and16 explicit actual PostgreSQL18.6 cases have run
locally, including backup/restore and independent-writer/authorization/recovery
races; see the current release evidence. This does not establish a target
production deployment. PostgreSQL verification requires a real isolated server;
an absent server must fail that gate explicitly rather than appear as a pass.
