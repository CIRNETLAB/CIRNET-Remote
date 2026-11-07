# Python API package

This package implements authentication, project revisions, experiment
scheduling and capture access for the selected CIRNET release. Station control
runs in a separate Hardware Service over local RPC. Run one API scheduler per
station set. Production requires PostgreSQL and persistent capture storage.

- [API guide in English](../../docs/en/api/application.md) · [Tiếng Việt](../../docs/vi/api/application.md)
- [Source development and selected dependencies](../../docs/en/api/contracts-consumer.md)
- [Deployment](../../docs/en/operations/deployment.md) · [Native migration status](../../docs/en/architecture/native-migration-status.md)
- [Previous backend guide](https://github.com/cirnetlab/cirnet-remote/blob/ae51abaa8ebdfce5981f91c0c95eca1d522900ee/services/api/README.md)
