# Linux Mini PC deployment review

Intended target: Intel Xeon W-1370, 16 GB RAM, 256 GB SSD. Actual target deployment, service-manager/TLS checks and hardware execution were not performed in this task. Follow the [production guide](../README.md) and [Lab-First authority](../../docs/ARCHITECTURE.md).

1. Provision the dedicated service account and PostgreSQL database; rehearse matched database/capture backup and restoration.
2. Install verified wheels into separate API/Hardware Service environments, and the built Web bundle into `/opt/netcircuit/web`.
3. Review the production environment example, exact HTTPS Origin, certificate and absolute data paths. Do not reuse the development guest/SQLite configuration.
4. Run migrations and HEAD check, then the one-time interactive administrator bootstrap with the installed API environment.
5. Review Nginx and systemd paths/permissions. Check the target Nginx configuration before installing/enabling services. API remains one worker on 127.0.0.1:8000; RPC remains 127.0.0.1:50051.
6. Verify login/CSRF/revoke, WebSocket reconnection, document CAS, real virtual capture, process restart and safe quarantine behavior on the actual target.
7. Inspect retention with a bounded dry-run before enabling its separate timer. Monitor directory quotas, pending cleanup, audit growth and matched backups.
8. Re-run the documented 50-session workload on the target before making a capacity claim. Local HTTP sessions and four virtual workers are separate from physical slots.

Keep current capabilities honest: no real Scope/Generator producer, full SPICE/mixed solver or physical driver is added by these templates. Existing transport abstractions remain; Web has no FPGA register/MUX/driver authority.
