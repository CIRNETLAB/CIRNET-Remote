# Authentication and database upgrades

[Tiếng Việt](../../vi/architecture/auth-and-migrations.md) · [Full original note](../../architecture/auth-and-migrations.md)

A durable principal owns data. An independent cookie credential authenticates a session, and a separate session ID supports revocation and control leases. A new cookie has 256 random bits, and the database stores its SHA-256 digest. Passwords use Argon2id. `X-Control-Client` identifies a tab for control.

## Sessions and roles

Only explicit `GET /api/auth/session` creates a guest or pre-login session and returns its CSRF token. An unauthenticated production visitor receives a pre-login session. Unsafe methods, including login and logout, require an exact trusted Origin and matching CSRF. API 0.1.2 emits `cirnet_session` and `netcircuit_session` with the same credential, preferring the canonical name on reads. It prefers `X-CIRNET-CSRF` and accepts the legacy `X-CSRF-Token`. Cookies are HttpOnly, SameSite=Lax, Path=/, and Secure in production. WebSocket authorization checks the same credential, Origin, expiry and revocation.

An ordinary request with a stale credential returns `SESSION_EXPIRED` without replacing the cookie. Protected reads without a credential return `UNAUTHENTICATED`. Login, logout and confirmed guest claim rotate credentials. Role and active-status changes revoke affected sessions. A late ordinary response cannot overwrite a successful rotation. The browser reconciles an uncertain rotation with a session read, without repeating the mutation. A valid legacy ownership proof can be exchanged through explicit bootstrap. A confirmed guest claim transfers owned records and operation keys atomically, rejecting active or quarantined leases and key collisions.

New bootstrap allocation defaults to 30 per client address per minute. Maintenance uses indexed batches, preserving principals, audit and owned data. The defaults retain expired credentials for a day, process at most 100 credentials and 100 old rate buckets per pass, and cap address buckets at 10,000. Live legacy proof keeps its revocation fence. Only an authenticated Admin can administer accounts, and the last active Admin cannot be disabled or demoted.

## Deployment and upgrade

Production requires PostgreSQL, `CIRNET_ALLOW_GUEST=false` and an explicit HTTPS `CIRNET_TRUSTED_ORIGINS`. With the installed API interpreter, migrate and provision the first administrator from a private terminal.

```console
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username instructor-admin
```

The command prompts for the password. Remove `CIRNET_BOOTSTRAP_PASSWORD` after controlled environment-based provisioning. The Alembic chain runs from `0001_legacy` through auth, projects, assignments, captures and runtime indexing to `0007_auth_maintenance`. It preserves historical data, ownership, operation identity and quarantined leases. Upgrade with writers stopped and a verified database and matching capture backup. Rehearse SQLite with its backup API and an integrity check, and PostgreSQL with a dump restored to a separate database. Rollback restores the matched pair. The 2026-10-16 PostgreSQL results belong to the run documented in the original note. See the [API guide](../api/application.md).
