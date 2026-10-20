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

Ordinary requests only resolve existing credentials. Credential-free health and
OPTIONS requests allocate no session or guest row; credential-free protected
reads return `UNAUTHENTICATED`. Supplied stale cookies retain the established
`SESSION_EXPIRED` policy, including health, and never install a cookie. Legacy
reads reuse one revocable internal context per proof. Only explicit bootstrap
allocates new credentials: creation is limited to 30 per client address per
60 seconds by default (`NETCIRCUIT_BOOTSTRAP_LIMIT`); valid credential reuse is
not counted. Login retains separate address and account admission limits.
An expired or revoked internal legacy context returns 401 on ordinary reads,
even if the original proof has a longer remaining lifetime. It is not refreshed
or resurrected; explicit bootstrap may still consume that live ownership proof
and rotate to a new opaque credential.

The application monitor performs one maintenance batch at most every minute,
independently of the scheduler lock. An indexed batch removes at most 100
credentials whose nominal expiry is at least one day old, including revoked
credentials; it also removes at most 100 rate buckets older than one day.
`NETCIRCUIT_AUTH_RETENTION_SECONDS` and `NETCIRCUIT_AUTH_MAINTENANCE_BATCH`
configure retention and batch size. A failed batch leaves the next monitor
iteration able to retry. Principals, users, ownership, operations and audit rows
are retained; session deletion cannot delete evidence or an owned document.
Expired/revoked context rows remain as fences while the matching legacy proof
is live, including with a zero retention setting. Maintenance reads at most
one configured batch of candidate scalar rows and proof IDs; an expiry/ID
keyset cursor advances past protected rows so other expired sessions still
progress, then wraps for the next pass. Principals are not deleted.
The address bucket table fails closed at 10,000 rows pending maintenance.
Multi-session revocation accepts every affected execution cancellation before
remote cleanup is dispatched. Expiry/disconnect sweeps use the same bounded
four-worker Stop dispatcher, with at most 16 outstanding identities, separately
from simulation workers. A contended execution configuration is retried by the
monitor rather than delaying another station's Stop. Stop ACK bookkeeping does
not release a lease; worker cleanup still requires the real safe-state outcome.

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
`0004_assignments` → `0005_captures` → `0006_experiment_runtime` →
`0007_auth_maintenance`. Revision 0007 adds expiry/principal/rate-window indexes
without rewriting credentials or ownership. This guide describes its identity foundation;
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

The [2026-10-16 release evidence](../verification/2026-10-16-w8-release.md) records
SQLite migration/restart and 16 actual PostgreSQL 18.6 cases, including
backup/restore and independent-writer/authorization/recovery races. Those are
historical results, not commands rerun during a later documentation edit. They
do not establish a target production deployment. PostgreSQL verification requires
a real isolated server; an absent server must fail that gate explicitly rather
than appear as a pass. New execution records follow [VERIFICATION.md](../VERIFICATION.md).
