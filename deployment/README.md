# Production deployment templates

Authority remains [Lab-First v3.1](../docs/ARCHITECTURE.md). These are reviewable Linux/Nginx/systemd templates for the intended Mini PC; they have not been installed or executed on that target during this task. Local tests verify configuration invariants, SQLite/PostgreSQL migrations and real software flows. They do not verify target TLS, firewall, service-manager configuration, hardware or production capacity.

Use one API process/worker. Its FIFO scheduler, event hub and directory quotas are process-local; additional Uvicorn workers or API replicas require a separate distributed ownership/scheduling design. `NETCIRCUIT_SIMULATION_WORKERS` bounds existing virtual subprocess jobs and is independent of HTTP sessions. Physical stations retain their declared slots and default unavailable capabilities.

## Installation and configuration

Build the four wheels and the Web bundle using the repository verification entrypoints. Install Contracts + simulator + API wheels into `/opt/netcircuit/venv-api`, and Contracts + simulator + Hardware Service wheels into `/opt/netcircuit/venv-hardware`. Install only the required runtime dependencies; production does not depend on editable checkouts, Node code generators or a source-tree working directory. Serve `apps/web/dist` from `/opt/netcircuit/web`.

Create the dedicated `netcircuit` OS/database role and database. Review [netcircuit.production.env.example](netcircuit.production.env.example) into a restricted `/etc/netcircuit/netcircuit.env`; this example uses a local PostgreSQL socket and provisioned peer authentication. For a remote database, configure its required authenticated/TLS connection explicitly. The root `.env.example` is for development and must not be copied unchanged to production. Keep credentials out of tracked files and logs.

Set `NETCIRCUIT_ENV=production`, `NETCIRCUIT_ALLOW_GUEST=false`, an exact HTTPS origin, PostgreSQL database URL, and an absolute persistent capture directory. Unknown environments, invalid origins and production guest/SQLite configurations fail explicitly. Cookies are HttpOnly/SameSite=Lax and Secure in production. Mutations require the current server session's CSRF token and trusted Origin. WebSocket authorization uses the same cookie and exact Origin, and revocation/expiry ends its control lifetime. Keep the browser on the same HTTPS origin for Web, `/api/` and `/ws/`.

Replace `lab.example.invalid` and certificate paths in [Nginx](nginx/netcircuit.conf), provision the actual certificate, and validate the resulting host configuration with `nginx -t` before use. HTTP redirects to the explicit HTTPS origin. API/RPC bind only to loopback, and Nginx never exposes port 50051. WebSocket upgrade and Origin pass through. The API trusts forwarded headers only from loopback. The 4MiB proxy body limit permits the canonical 2,000,000-byte document inside a JSON envelope; application contracts and document bounds still apply. Cookie/CSRF/control headers pass through unchanged.

## Migration, administrator and startup

Back up both the database and capture directory before upgrading, and rehearse restoration into an isolated database. Run upgrades with the installed API environment and the service account's production configuration:

```sh
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username initial_admin --display-name 'Administrator'
```

The bootstrap CLI prompts for the password; no default account/password is installed. Its one-time environment alternative is for a controlled provisioning process and must be removed afterward. Migration HEAD is 0005. An already-current database is a no-op. Historical experiment/lease/session data remains, legacy owners follow the documented policy, and active restart recovery still requires explicit safe release or quarantine. Migration verification includes actual PostgreSQL backup/restore and independent-connection race cases. There is no automatic downgrade; restoring the matched database and capture backup is an operator recovery action.

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
