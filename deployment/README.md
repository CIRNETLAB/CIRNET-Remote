# Production deployment templates

The Linux templates define the service, proxy and environment configuration for
the selected CIRNET release. Use one API scheduler, loopback Hardware RPC,
PostgreSQL and persistent capture storage. Validate the selected artifacts and
host configuration before enabling services. Back up the database and capture
store as a matched pair before upgrades.

- [Deployment guide in English](../docs/en/operations/deployment.md) · [Tiếng Việt](../docs/vi/operations/deployment.md)
- [Exact release installation and rollback](multi-repo-release.md) · [Mini PC checklist](mini-pc/README.md)
- [Environment example](cirnet.production.env.example) · [Nginx](nginx/cirnet.conf) · [systemd units](systemd/)
- [Previous deployment guide](https://github.com/cirnetlab/cirnet-remote/blob/ae51abaa8ebdfce5981f91c0c95eca1d522900ee/deployment/README.md)
