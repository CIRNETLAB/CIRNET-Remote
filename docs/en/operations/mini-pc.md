# Review the Linux Mini PC deployment

[Tiếng Việt](../../vi/operations/mini-pc.md) · [Documentation](../index.md)

The intended target is Intel Xeon W-1370, 16 GB RAM and 256 GB SSD. Treat
the [production templates](deployment.md) as a deployment
design. Collect target, service-manager, TLS and hardware evidence on the
actual machine. Follow the [Lab-First architecture](../architecture/system.md).

1. Provision a dedicated service account and PostgreSQL database. Rehearse a
   matched database and capture backup and restore.
2. Install verified wheels in separate API and Hardware Service environments.
   Install the selected Web bundle in `/opt/cirnet/web`.
3. Review the production environment example, exact HTTPS Origin, certificate
   and absolute data paths. Use production authentication and PostgreSQL.
4. Run migrations and the HEAD check. Run the one-time interactive administrator
   bootstrap in the installed API environment.
5. Check Nginx and systemd paths and permissions on the target before enabling
   services. Keep one API worker on `127.0.0.1:8000` and RPC on `127.0.0.1:50051`.
6. Verify login, CSRF, revoke, WebSocket reconnect, document CAS, real virtual
   capture, restart and safe quarantine on the target.
7. Review retention with a bounded dry run before enabling its timer. Monitor
   quotas, pending cleanup, audit growth and matched backups.
8. Repeat the documented 50-session workload on the target before claiming
   capacity. HTTP sessions, four virtual workers and physical slots are distinct.

The templates do not add a physical driver, real Scope/Generator producer,
or full SPICE/mixed solver. Web uses the product interfaces rather than FPGA
register, MUX or driver control. Keep unverified capabilities unavailable.
See the [original target review](../../../deployment/mini-pc/README.md) for
the recorded acceptance scope.
