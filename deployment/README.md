# Mini PC deployment templates

Canonical Lab-First authority: ../docs/ARCHITECTURE.md. Linux Mini PC Intel Xeon W-1370 / 16 GB RAM / 256 GB SSD; Nginx, systemd, FastAPI, isolated Hardware Service, PostgreSQL production.

nginx/netcircuit.conf serves Vue/proxies API and WebSocket. systemd units bind API 127.0.0.1:8000 and Hardware Service 127.0.0.1:50051. See mini-pc/README.md. RPC stays local-only behind FastAPI. Templates have not been validated on target hardware.
