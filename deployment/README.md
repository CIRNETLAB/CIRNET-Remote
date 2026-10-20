# Production deployment templates

Authority remains [Lab-First v3.1](../docs/ARCHITECTURE.md). These are reviewable Linux/Nginx/systemd templates for the intended Mini PC; they have not been installed or executed on that target during this task. Local tests verify configuration invariants, SQLite/PostgreSQL migrations and real software flows. They do not verify target TLS, firewall, service-manager configuration, hardware or production capacity.

Use one API process/worker. Its FIFO scheduler, event hub and directory quotas are process-local; additional Uvicorn workers or API replicas require a separate distributed ownership/scheduling design. `NETCIRCUIT_SIMULATION_WORKERS` bounds existing virtual subprocess jobs and is independent of HTTP sessions. Physical stations retain their declared slots and default unavailable capabilities.

## Installation and configuration

Build the four wheels and the Web bundle using the repository verification entrypoints. Install Contracts + simulator + API wheels into `/opt/netcircuit/venv-api`, and Contracts + simulator + Hardware Service wheels into `/opt/netcircuit/venv-hardware`. Install only the required runtime dependencies; production does not depend on editable checkouts, Node code generators or a source-tree working directory. Serve `apps/web/dist` from `/opt/netcircuit/web`.

Create the dedicated `netcircuit` OS/database role and database. Review [netcircuit.production.env.example](netcircuit.production.env.example) into a restricted `/etc/netcircuit/netcircuit.env`; this example uses a local PostgreSQL socket and provisioned peer authentication. For a remote database, configure its required authenticated/TLS connection explicitly. The root `.env.example` is for development and must not be copied unchanged to production. Keep credentials out of tracked files and logs.

Set `NETCIRCUIT_ENV=production`, `NETCIRCUIT_ALLOW_GUEST=false`, an exact HTTPS origin, PostgreSQL database URL, and an absolute persistent capture directory. Unknown environments, invalid origins and production guest/SQLite configurations fail explicitly. Cookies are HttpOnly/SameSite=Lax and Secure in production. Mutations require the current server session's CSRF token and trusted Origin. WebSocket authorization uses the same cookie and exact Origin, and revocation/expiry ends its control lifetime. Keep the browser on the same HTTPS origin for Web, `/api/` and `/ws/`.

Replace `lab.example.invalid` and certificate paths in [Nginx](nginx/netcircuit.conf), provision the actual certificate, and validate the resulting host configuration with `nginx -t` before use. HTTP redirects to the explicit HTTPS origin. API/RPC bind only to loopback, and Nginx never exposes port 50051. WebSocket upgrade and Origin pass through. The API trusts forwarded headers only from loopback. The 4MiB proxy body limit permits the canonical 2,000,000-byte document inside a JSON envelope; application contracts and document bounds still apply. Proxy oversize rejection uses the same JSON error envelope and frozen HTTP 400 status as the application, rather than an HTML error page. Cookie/CSRF/control headers pass through unchanged.

The application caps actual request bytes before JSON parsing, including chunked
input and false/missing Content-Length: 4MiB normally and 16KiB for `/api/auth/`.
JSON nesting is limited to 64 levels and the framing scan to 2,000,000 tokens
(retaining the existing graph byte allowance even for many small metadata values);
quoted braces do not count as nesting. A body has a 10-second receive budget.
JSON transport is UTF-8, optionally with a UTF-8 BOM. Invalid UTF-8, raw NUL and
UTF-16/32 encodings (with or without BOM) are rejected as invalid framing before
the byte scanner or JSON parser; encoding autodetection cannot hide nesting.
Rejection uses `REQUEST_TOO_LARGE`, `REQUEST_COMPLEXITY_EXCEEDED`,
`INVALID_REQUEST_FRAMING` or `REQUEST_TIMEOUT` in the existing HTTP 400 envelope.
The `NETCIRCUIT_REQUEST_MAX_BYTES`, `NETCIRCUIT_AUTH_REQUEST_MAX_BYTES`,
`NETCIRCUIT_REQUEST_JSON_MAX_DEPTH`, `NETCIRCUIT_REQUEST_JSON_MAX_TOKENS` and
`NETCIRCUIT_REQUEST_BODY_SECONDS` settings configure these bounds; the general
request cap cannot be set below the existing 2,000,000-byte document allowance.
Keep Nginx's body cap aligned when raising the application limit.

Realtime defaults to 512 process subscriptions, 16 per owner and 8 per session,
with at most one scheduled drain per subscription. Each retains at most 128
queued/ingress events per stage, 1MiB overall retained bytes and a 512KiB event
ceiling; the process has a 16MiB retained-byte budget including a reserved resync
allowance. Overflow emits versioned `resync.required` and preserves scoped
sequence semantics. Handshake, send and shielded cleanup each have a five-second
deadline; inbound messages are limited to 120 per minute, 64KiB and depth 32.
Legacy debug echoes are limited to 1KiB and carry no command authority.
`NETCIRCUIT_WEBSOCKET_MAX_SUBSCRIPTIONS`, `NETCIRCUIT_WEBSOCKET_MAX_PER_OWNER`,
`NETCIRCUIT_WEBSOCKET_MAX_PER_SESSION`, `NETCIRCUIT_WEBSOCKET_HANDSHAKE_SECONDS`,
`NETCIRCUIT_WEBSOCKET_SEND_SECONDS` and `NETCIRCUIT_WEBSOCKET_CLEANUP_SECONDS`
configure the deployment bounds. Subscription/message quota closure uses 4429;
handshake expiry uses 4408. Web controls stay unavailable after transport OPEN
until protocol hello and fresh scoped HTTP snapshots complete.
The systemd Uvicorn command also sets `--ws-max-size 65536 --ws-max-queue 4`
so the protocol layer bounds receive frames before they reach ASGI/application
validation. Keep those transport limits when changing the service command.

## Migration, administrator and startup

Back up both the database and capture directory before upgrading, and rehearse restoration into an isolated database. Run upgrades with the installed API environment and the service account's production configuration:

```sh
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username initial_admin --display-name 'Administrator'
```

The bootstrap CLI prompts for the password; no default account/password is installed. Its one-time environment alternative is for a controlled provisioning process and must be removed afterward. Migration HEAD is `0007_auth_maintenance`, following `0006_experiment_runtime`. An already-current database is a no-op. Historical experiment/lease/session data remains, legacy owners follow the documented policy, and active restart recovery still requires explicit safe release or quarantine. Migration verification includes actual PostgreSQL backup/restore and independent-connection race cases. There is no automatic downgrade; restoring the matched database and capture backup is an operator recovery action.

The [API service](systemd/netcircuit-api.service) checks migration HEAD before startup and uses `/var/lib/netcircuit`; [Hardware Service](systemd/netcircuit-hardware.service) stays on loopback. Review and install units only after configuration/probes pass. JSON application logs contain request, experiment, operation and capture correlation, excluding session secrets, credentials, private payloads and physical routes. Uvicorn raw access logging is disabled in the template; review any additional proxy/access logs separately. Recovery and destructive changes also retain database audit records.

## Capture data and maintenance

Keep capture data on persistent storage owned by the service user. Default budgets are 268,435,456 bytes and 4,096 `.ncap` files per directory, enforced for the supported single API writer. Atomic writes never replace a sealed ID with different bytes. Database metadata and every lifecycle event remain small; binary samples stay in owner-scoped NCAP v1 HTTP/RPC payloads. Slow read/hash/delete work does not hold the experiment-control lock. Missing/corrupt/unavailable storage is an explicit error, never a generated waveform.

Retention defaults to 30 days and runs only when invoked or scheduled. First inspect a bounded batch:

```sh
python -m app.capture_maintenance --limit 100 --dry-run
python -m app.capture_maintenance --limit 100
```

The separate [oneshot service](systemd/netcircuit-capture-maintenance.service) and [hourly timer](systemd/netcircuit-capture-maintenance.timer) are optional templates for that command. They do not initialize hardware or run recovery. Review the dry-run before enabling a policy. A batch retires only terminal, unleased evidence; active and quarantined captures are excluded. Availability is committed false with an audit entry before file deletion. Failed cleanup remains pending for a later batch; the CLI returns nonzero if any item fails. Set retention seconds to 0 to disable expiration while still retrying pending cleanup. Stop/release and expired execution leases do not delete historical captures or remove an authorized owner's read access.

Back up catalog metadata and payloads together. A process/disk failure between payload publication and metadata commit can leave an unreferenced file; directory quota remains conservative and the retention command intentionally does not guess that an unindexed file is safe to delete. Investigate such files against a consistent database snapshot while writers are stopped. Metadata tombstones/audits are retained; production database archival is an operator policy outside this bounded payload cleanup.

See the [target checklist](mini-pc/README.md) and [verification ledger](../docs/verification/2026-10-16-web-contracts.md) for observed release evidence and remaining limitations. Current physical Scope/Generator and full analog/mixed solvers remain unavailable until real validated producers/adapters exist.
