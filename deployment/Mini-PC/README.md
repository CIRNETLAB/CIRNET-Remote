# Raspberry Pi 5 Deployment — Starter Checklist

**Target:** Raspberry Pi 5, Raspberry Pi OS 64-bit.

This is an initial deployment plan. It has not yet been validated on the final Raspberry Pi hardware.

## Suggested filesystem layout

```text
/opt/netcircuit/repo/          project checkout
/opt/netcircuit/web/           built frontend files
/opt/netcircuit/venv-api/      API virtual environment
/opt/netcircuit/venv-hardware/ Hardware Service virtual environment
/etc/netcircuit/netcircuit.env runtime environment file
```

## High-level steps

1. Create a dedicated `netcircuit` system user.
2. Clone/copy the repository to `/opt/netcircuit/repo`.
3. Build the Web frontend and copy `apps/web/dist/*` to `/opt/netcircuit/web/`.
4. Create separate Python virtual environments for API and Hardware Service.
5. Install each Python project in its own environment.
6. Copy the systemd unit templates to `/etc/systemd/system/` and review paths/permissions.
7. Copy the Nginx template to the site configuration and enable it.
8. Run `nginx -t` before reload.
9. Enable/start systemd units only after local service checks pass.
10. Keep `NETCIRCUIT_HARDWARE_MODE=simulation` until the physical FPGA transport is intentionally integrated.

## Security boundary

Only Nginx should accept browser-facing traffic in the baseline deployment. FastAPI and Hardware Service remain loopback-bound. TLS, authentication policy, firewall rules, secrets management and production hardening are later deployment tasks and must be completed before Internet exposure.
