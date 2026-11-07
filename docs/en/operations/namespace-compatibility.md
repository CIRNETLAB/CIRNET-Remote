# CIRNET source names and legacy compatibility

[Tiếng Việt](../../vi/operations/namespace-compatibility.md) · [Deployment](deployment.md)

Active source uses the `cirnetlab/cirnet-*` repository namespace. The table
lists the selected release's product names.

| Product | Distribution or artifact | Runtime identity |
| --- | --- | --- |
| Remote API | `cirnet-api` | `app` |
| Contracts | `cirnet-contracts` | `contracts` |
| Simulator | `cirnet-simulator` | `cirnet_sim` |
| Hardware | `cirnet-hardware-service` | `hardware_service` |
| Interface | `@cirnet/web`, `cirnet-interface` | public Contracts npm SDK |
| FPGA | `cirnet-fpga-scaffold` | canonical `cirnet_*` RTL modules |
| Independent DEV allocator | `cirnet-artifact-paths` | `cirnet_artifact_paths` |

System 0.1.4 selects the canonical `@cirnet/contracts` SDK and
`@cirnet/artifact-paths` allocator through the [release lock](../../../integration/release-set.json).
Interface imports the packages directly by their published identities.
Simulator and DEV retain application import aliases, and FPGA retains thin
old-module wrappers for RTL fixtures. The Windows launcher uses a separate
virtual environment for system 0.1.4 and reuses developer database and capture paths.

## Settings and protocol identities

`CIRNET_*` settings take precedence over matching `NETCIRCUIT_*` aliases,
including explicitly empty values. Bootstrap/launcher adapters synchronize both
spellings for subprocesses running pinned older tools. Current CI variables and
secrets use canonical names with fallback to their provisioned legacy names.
See the [CI artifact access guide](ci-artifact-access.md) for provisioning.

The selected API emits `cirnet_session` and `netcircuit_session` with the same
opaque credential, and reads the legacy cookie when the canonical credential
is absent. The historical immutable API 0.1.1 emits only `netcircuit_session`.
Browser acceptance recognizes these exact aliases and checks every present
cookie's privacy and security attributes. The canonical CSRF header is
`X-CIRNET-CSRF`; the previous generic `X-CSRF-Token` remains accepted. Current
Interface requests send both. Capture requests prefer
`application/vnd.cirnet.capture; version=1` and recognize the exact legacy media
namespace with the same version and bounds checks. The selected API identifies
as `cirnet-api` at `GET /api/health`. Consumers still recognize the historical
`netcircuit-api` identity. Schema and resource URI aliases preserve offline
resolution of historical documents. [Python compatibility adapter](../../../services/api/app/compatibility.py) · [Application API](../api/application.md)

The selected Python API defaults to `cirnet.db`, falling back to an existing
`netcircuit.db` when the canonical file is absent. Explicit database and capture
settings continue to identify the chosen existing storage. The Rust candidate
defaults directly to `sqlite:///./cirnet.db`. Use an explicit
`CIRNET_DATABASE_URL` when verifying against a copy of an existing database.
[Rust candidate settings](../../../native/src/config.rs)

Browser recovery reads old formats and migrates drafts into the canonical
IndexedDB name in one transaction. It retains the old database and exports
canonical recovery records.
Pending observations retain shared old-tab synchronization; no migration replays
an execution command. These adapters preserve data and operation identities.

## Existing deployments

New templates use `/opt/cirnet`, `/etc/cirnet/cirnet.env`, `/var/lib/cirnet`,
the `cirnet` service account, `cirnet-*.service`/`cirnet-*.timer` units, and
`deployment/nginx/cirnet.conf`. Each unit's install metadata provides its exact
old `netcircuit-*` alias. These are templates; no live services, accounts,
permissions, database names or directories are migrated automatically.

Before installing updated units on an existing host, back up the matched database
and capture store and review their configured paths and account permissions.
Keep the existing database URL and capture path unless an explicit, verified data
migration is performed. Review the new environment file with those exact values;
legacy `NETCIRCUIT_*` keys remain readable, but an explicit canonical value wins.
The units obtain capture settings from the required environment file rather than
injecting a canonical default that could mask an existing legacy path.

Stop and disable the old unit definitions during the controlled maintenance
window before installing/enabling their canonical replacements and aliases.
Ensure only one API scheduler and one Hardware Service are started. Existing
independent old unit files must not remain enabled alongside the replacements.
Reload and validate the host service-manager/proxy configuration before startup;
actual target installation, TLS and physical checks remain separate acceptance.
[Production guide](deployment.md)

## Published artifacts and preserved evidence

`integration/release-set.json` selects the current 0.1.4 release with exact
artifact digests and lowercase repository identities. `scripts/install_release.py`
accepts this release family and its verified local build counterpart. The
previous releases remain available under their original tags for historical reference.

The [history index](../history/index.md) links original names and recorded
release evidence. Environment and service aliases in this guide apply to
existing deployments and user data.
