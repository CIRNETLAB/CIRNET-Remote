# CI access to release artifacts

[Tiếng Việt](../../vi/operations/ci-artifact-access.md) · [Documentation](../index.md)

The [system release lock](../../../integration/release-set.json) selects exact
numeric GitHub asset URLs and SHA-256 digests for system **0.1.4**. Published
assets in the six public repositories support anonymous downloads. Test draft
access separately with the intended credential. A public download does not
establish draft visibility or the scope of an authenticated credential.

## Credential and scope

The [Integration workflow](../../../.github/workflows/integration.yml) prefers
`CIRNET_ARTIFACTS_READ_TOKEN` and keeps `NETCIRCUIT_ARTIFACTS_READ_TOKEN` as an
existing secret fallback. `system-artifact-access` requires one of these. Use
an expiring fine-grained token for `cirnetlab` with `Contents: Read-only` and
automatic metadata-read on the six selected repositories only. Store the
credential as `CIRNET_ARTIFACTS_READ_TOKEN`. Use a separate credential for
publishing or Git writes. Keep token values out of manifests, command arguments,
reports, chat and source. Workflow `contents: read` scopes its `GITHUB_TOKEN`.
A separate Actions secret keeps the scope assigned at provisioning.

The six repositories are `cirnet-remote`, `cirnet-contracts`, `cirnet-interface`,
`cirnet-simulator`, `cirnet-hardware`, and `cirnet-fpga`.

## Rotate and verify

Renew before expiration and update the configured secrets. Use the Integration
workflow's manual dispatch to rerun the access gate on the chosen revision.
The job installs all 15 selected artifacts into a fresh environment, rehashes
the selections and rollback inputs, and checks versions and installed origins.
Record revision, consumer identity and sanitized receipt. A successful transport
receipt still reports `credentialScopeVerification` as `NOT_VERIFIED`.
Record any provisioning attestation separately. Check draft visibility with
the replacement read credential, independently of publication access.

Authenticated CI fails closed on missing inputs or authentication errors.
Keep exact pins and verify before use. The installer supports no `latest`,
sibling checkout or editable fallback. See the
[release runbook](release-and-rollback.md) for local setup. The
[post-rename access record](../history/ci-artifact-access-record.md) refers to earlier
revisions and historical receipts.
