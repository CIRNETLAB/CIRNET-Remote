# Linux Mini PC deployment checklist

Target: Intel Xeon W-1370, 16 GB RAM, 256 GB SSD. Canonical Lab-First authority: ../../docs/ARCHITECTURE.md. PostgreSQL production; SQLite optional for development/tests.

1. Create dedicated netcircuit user and /opt/netcircuit/repo checkout.
2. Build apps/web and deploy dist to /opt/netcircuit/web.
3. Install separate API/hardware environments under /opt/netcircuit.
4. Configure PostgreSQL and /etc/netcircuit/netcircuit.env; NETCIRCUIT_ENV=production requires a PostgreSQL URL.
5. Review systemd/Nginx paths and permissions; nginx -t before reload.
6. Verify loopback services before enabling startup.
7. Keep simulation until validated driver/profile/protection exists.
8. Validate TLS/auth/firewall/secrets/load/recovery before exposure.

Host communicates through FpgaTransport adapters, without GPIO assumptions. No hardware safety/deployment success claim is implied.
