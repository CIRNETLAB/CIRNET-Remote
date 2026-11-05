# Production deployment on the Linux Mini PC

[Tiếng Việt](../../vi/operations/deployment.md) · [Original deployment guide](../../../deployment/README.md) · [Lab-First architecture](../architecture/system.md)

These Linux, Nginx and systemd templates describe the intended target. Dated local tests cover configuration invariants, software flows and database migrations. Collect target TLS, firewall, service-manager, capacity and hardware evidence on the actual host. [Mini PC checklist](mini-pc.md) · [0.1.4 local release report](../../verification/2026-11-05-cirnet-release-0.1.4.md) · [PostgreSQL results in native Stage 0](../../verification/2026-11-05-native-migration-stage-0.md)

## Select and install the runtime

Use the [system release lock](../../../integration/release-set.json). It selects system and Interface `0.1.4`, API, Contracts, Simulator, Hardware and FPGA scaffold `0.1.2`, and independent DEV versions. Verify each selected filename, source revision and SHA-256. The current source repositories use `cirnetlab/cirnet-*`. Published artifacts retain their recorded bytes and build source. Keep newly built same-version candidates separate from the selected release. [Release installation and rollback](release-and-rollback.md)

| Destination | Selected contents |
| --- | --- |
| `/opt/cirnet/venv-api` | Contracts, Simulator and API wheels, with their runtime dependencies |
| `/opt/cirnet/venv-hardware` | Contracts, Simulator and Hardware Service wheels, with their runtime dependencies |
| `/opt/cirnet/web` | Interface static archive, including `/models`, on the same origin as `/api/` and `/ws/` |

Install the selected API wheel for production. An API source build belongs to a separate verification or release-candidate workflow. Select the independent producer artifacts for Hardware, Contracts, Simulator and Interface. Production runs installed packages and static files. Keep the previous approved bundle and matching compatibility set for rollback. [Contracts consumer boundary](../api/contracts-consumer.md)

Use one API process and one Uvicorn worker. The FIFO scheduler, event hub and directory quotas are process-local. Replication requires a separate distributed ownership and scheduling design. `CIRNET_SIMULATION_WORKERS` bounds virtual subprocess work independently of the number of HTTP sessions. Physical stations use their declared slots and unavailable defaults.

## Configure the service account and origin

Use the [production environment example](../../../deployment/cirnet.production.env.example), [Nginx template](../../../deployment/nginx/cirnet.conf) and [systemd units](../../../deployment/systemd). Create the dedicated `cirnet` OS role, PostgreSQL role and database. Store the reviewed production settings in a restricted `/etc/cirnet/cirnet.env`. The example uses a local PostgreSQL socket and requires provisioned peer authentication. For a remote database, configure authenticated TLS explicitly. The root [development example](../../../.env.example) describes local development settings. Keep credentials in the restricted environment and out of tracked files and logs.

Canonical `CIRNET_*` variables take precedence over legacy `NETCIRCUIT_*` aliases. The units include legacy `netcircuit-*` install aliases. Existing hosts require explicit configuration, service and data-path review before renaming. Service aliases change name resolution. Data relocation is a separate operator action. [Existing deployments](../../NAMESPACE.md#existing-deployments)

Set `CIRNET_ENV=production`, `CIRNET_ALLOW_GUEST=false`, an explicit HTTPS origin in `CIRNET_TRUSTED_ORIGINS`, a PostgreSQL `CIRNET_DATABASE_URL` and an absolute persistent `CIRNET_CAPTURE_DIR`. Unknown environments, invalid origins, production guests and production SQLite fail configuration. Session cookies are HttpOnly, SameSite=Lax and Secure in production. Mutations require the current session CSRF token and an exact trusted Origin. WebSocket authorization uses that cookie and Origin. Expiry or revocation ends the associated control lifetime.

Set `CIRNET_SIMULATION_BACKEND=legacy` in the shared API and Hardware environment for the current digital and bounded DC behavior. Both services read the backend at startup. Restart both after changing it. `ngspice` is reserved and unavailable in Simulator `0.1.2`. Validation and document storage remain usable with that selection, while preview and execution cannot produce captures. Unknown or empty selectors fail configuration. Backend selection changes simulation dispatch only. Physical safety authority stays with the existing station lifecycle. [Signal domains and simulation](../architecture/signal-domains-and-simulation.md)

## Nginx, HTTP and realtime limits

Replace `lab.example.invalid` and the certificate paths, provision the real certificate and run `nginx -t` on the target before enabling the configuration. HTTP redirects to the chosen HTTPS origin. Serve the browser, `/api/` and `/ws/` on that origin. API listens on `127.0.0.1:8000` and RPC on `127.0.0.1:50051`. Nginx proxies the API and WebSocket routes only. It preserves Origin, WebSocket Upgrade, cookies and CSRF/control headers. The API trusts forwarded headers from loopback. The proxy cap is 4 MiB to accommodate a 2,000,000-byte document in a JSON envelope. Oversize API requests receive the frozen HTTP 400 JSON error envelope.

The application counts actual body bytes before JSON parsing, including chunked input and absent or inaccurate `Content-Length`. Defaults are 4 MiB normally, 16 KiB under `/api/auth/`, 64 nesting levels, 2,000,000 framing tokens and a 10-second body receive budget. Quoted braces count as string content. JSON uses UTF-8 and allows a UTF-8 BOM. Invalid UTF-8, raw NUL and UTF-16/32 are rejected before parsing. The HTTP 400 envelope uses `REQUEST_TOO_LARGE`, `REQUEST_COMPLEXITY_EXCEEDED`, `INVALID_REQUEST_FRAMING` or `REQUEST_TIMEOUT`. The settings are `CIRNET_REQUEST_MAX_BYTES`, `CIRNET_AUTH_REQUEST_MAX_BYTES`, `CIRNET_REQUEST_JSON_MAX_DEPTH`, `CIRNET_REQUEST_JSON_MAX_TOKENS` and `CIRNET_REQUEST_BODY_SECONDS`. The general cap must permit at least 2,000,000 bytes. Keep the Nginx cap aligned when increasing the application limit. [Application settings](../../../services/api/app/config.py)

Realtime defaults are 512 process subscriptions, 16 per owner and 8 per session, with one scheduled drain per subscription. Each stage holds at most 128 queued or ingress events. The retained-byte limit is 1 MiB per subscription, the event ceiling is 512 KiB, and the process budget is 16 MiB including reserved resync space. Overflow emits versioned `resync.required` with scoped sequence semantics. Handshake, send and shielded cleanup each have a five-second deadline. Inbound limits are 120 messages per minute, 64 KiB, depth 32 and 2,048 framing tokens. Legacy debug echoes are bounded to 1 KiB and carry no command authority. Subscription and message quotas close with 4429. Handshake expiry closes with 4408. Controls become available only after protocol hello and fresh scoped HTTP snapshots.

Configure subscription and deadline bounds with `CIRNET_WEBSOCKET_MAX_SUBSCRIPTIONS`, `CIRNET_WEBSOCKET_MAX_PER_OWNER`, `CIRNET_WEBSOCKET_MAX_PER_SESSION`, `CIRNET_WEBSOCKET_HANDSHAKE_SECONDS`, `CIRNET_WEBSOCKET_SEND_SECONDS` and `CIRNET_WEBSOCKET_CLEANUP_SECONDS`. Keep Uvicorn `--ws-max-size 65536 --ws-max-queue 4` to bound protocol-layer receipt before application validation. [WebSocket implementation](../../../services/api/app/websocket/events.py) · [API unit](../../../deployment/systemd/cirnet-api.service)

## Migration, administrator and startup

Before upgrading, stop new Run admissions, complete safe cleanup or retain quarantine, and back up the database and capture directory together with the matching release manifest. Rehearse restoration in isolation. Confirm restored ownership, capture digests, leases, quarantine and queued work before authorizing one scheduler to control Hardware. Keep uncertain Start operations from replaying. [Release installation and rollback](release-and-rollback.md)

With the installed API interpreter and the service account's production configuration, run:

```sh
python -m app.migrate
python -m app.migrate --check
python -m app.bootstrap_admin --username initial_admin --display-name 'Administrator'
```

The administrator CLI prompts for a password. The provisioner can instead use the one-time `CIRNET_BOOTSTRAP_PASSWORD` environment variable and clear it before server startup. Accounts and passwords are explicitly provisioned. Migration HEAD is `0007_auth_maintenance`, following `0006_experiment_runtime`. Upgrading a current database is a no-op. Migrations preserve experiment, lease and session history, follow legacy owner rules and retain explicit safe release or quarantine for restart recovery. PostgreSQL backup/restore and independent-connection race tests have their own dated evidence. A rollback restores the matched database and capture backup as an operator action. [Auth and migrations](../architecture/auth-and-migrations.md)

The [API unit](../../../deployment/systemd/cirnet-api.service) checks migration HEAD before startup and uses `/var/lib/cirnet`. The [Hardware unit](../../../deployment/systemd/cirnet-hardware.service) binds RPC to loopback. Install units after reviewing configuration and probes on the intended target. Structured JSON logs correlate request, experiment, operation and capture IDs and exclude session secrets, credentials, private payloads and physical routes. The unit disables Uvicorn raw access logs. Review separate proxy/access logging. Recovery and destructive changes keep database audit records.

## Capture retention and maintenance

Keep captures on persistent storage owned by the service user. Default directory limits are 268,435,456 bytes and 4,096 `.ncap` files for the single API writer. Atomic writes preserve sealed IDs and their bytes. Database and lifecycle events store metadata. Owner-scoped NCAP v1 HTTP/RPC payloads carry binary samples. Reads, hashing and deletion run outside the experiment-control lock. Storage failures are explicit and produce no synthesized waveform. [Capture catalog](../architecture/capture-catalog.md)

Retention defaults to 30 days and runs when invoked or scheduled. Review the dry-run before applying a bounded batch.

```sh
python -m app.capture_maintenance --limit 100 --dry-run
python -m app.capture_maintenance --limit 100
```

The optional [oneshot unit](../../../deployment/systemd/cirnet-capture-maintenance.service) and [hourly timer](../../../deployment/systemd/cirnet-capture-maintenance.timer) run bounded capture maintenance separately from hardware initialization and recovery. A batch retires terminal, unleased evidence. Active and quarantined captures are protected. Metadata is marked unavailable and audited before file deletion. Failed cleanup remains pending and produces a nonzero exit. `CIRNET_CAPTURE_RETENTION_SECONDS=0` disables expiration while pending cleanup remains retryable. Stop/release and lease expiry preserve historical captures and authorized owner read access.

Back up catalog metadata and payloads together. A crash between payload publication and metadata commit can leave an unreferenced file. The directory quota counts it conservatively. Investigate against a consistent database snapshot with writers stopped. The maintenance command retires indexed items only. Metadata tombstones and audits are retained. Database archival remains a separate operator policy. The current physical Scope/Generator and full analog/mixed solvers require validated producers or adapters before availability. [Physical lab safety](../architecture/physical-lab-safety.md) · [Historical Web/Contracts verification ledger](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-web-contracts.md)
