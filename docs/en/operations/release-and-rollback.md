# System release and rollback

[Tiếng Việt](../../vi/operations/release-and-rollback.md) · [Documentation](../index.md)

Use the [system release lock](../../../integration/release-set.json). System
and Interface are **0.1.4**. API, Contracts, Simulator, Hardware and FPGA source
are **0.1.2**. The independent allocator remains Python **1.0.0a1** and npm
**1.0.0-m1.0**. Each selection binds an exact filename, SHA-256, source revision
and numeric GitHub release asset URL.

## Prepare an isolated verification environment

Install Git, Node.js 26 LTS and Python 3.14 or later. Activate an external
virtual environment. Set `CIRNET_ARTIFACTS_TOKEN` privately if authentication is
needed. Public published assets support anonymous access. See
[CI artifact access](ci-artifact-access.md) for credential scope and rotation.

Run from the Remote root in PowerShell. Invoke the installer once and retain
its external JSON. Import both environment blocks in the parent shell. The
installer does not start services or deploy the system.

```powershell
$releaseSummary = python -B scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json | ConvertFrom-Json -ErrorAction Stop
if ($LASTEXITCODE -ne 0) { throw 'Release installation failed; inspect its external diagnostics.' }
$releaseState = Get-Content -Raw -LiteralPath $releaseSummary.environmentFile -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
foreach ($block in @($releaseState.environment, $releaseState.processEnvironment)) {
  foreach ($property in $block.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
  }
}
python -B -m pip install -r requirements-verification.txt
if ($LASTEXITCODE -ne 0) { throw 'Verification tooling installation failed.' }
$interfaceBootstrap = node "$env:CIRNET_INTERFACE_ROOT/scripts/bootstrap-contracts.mjs" --manifest "$env:CIRNET_CONTRACTS_ARTIFACT_MANIFEST" | ConvertFrom-Json -ErrorAction Stop
if ($LASTEXITCODE -ne 0) { throw 'Interface artifact bootstrap failed.' }
foreach ($property in $interfaceBootstrap.environment.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
}
npm --prefix "$env:CIRNET_INTERFACE_ROOT" ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed.' }
npm --prefix "$env:CIRNET_INTERFACE_ROOT" run test:e2e:install
if ($LASTEXITCODE -ne 0) { throw 'Pinned browser installation failed.' }
python -B -m pip check
if ($LASTEXITCODE -ne 0) { throw 'The selected package set is inconsistent.' }
```

The first command verifies and installs the selected artifacts. Verification
dependencies and browser installation are separate steps. The package managers
inherit external cache and temporary paths. The browser installation cache
belongs to the external Interface export. Native launches use a fresh, owned
copy. Set `CIRNET_TEST_POSTGRES_URL` for an isolated real PostgreSQL database
and `CIRNET_TEST_PG_BIN` for matching backup and restore tools.

```text
python -B scripts/check_release.py --show-plan
python -B scripts/check_release.py --group contracts --group python --group web --group postgres --group browser --group package
```

The browser gate starts and stops the real API/RPC stack and exercises restart.
Use the configured one worker, zero retries, and forbid-only. FPGA owns its
separate pinned parser/compiler/runtime and both behavioral RTL benches. A
source build does not establish native browser, RTL or hardware acceptance.

## Verify a local candidate set

Use a separate `distribution: "local"` manifest with the six exact source
revisions, compatibility and backup policy. Each artifact has its versioned
filename, an absolute regular-file `path`, and SHA-256. Local entries omit
`url`. The installer validates the selection before bootstrap and verifies
bytes again when copying. Keep the manifest and artifacts outside Git. The
published lock continues to select the immutable public release.

```text
python -B scripts/install_release.py --local-artifacts --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST --environment-file release-env.json
```

Import both environment blocks and prepare verification tools as above. Record
uncommitted verification overlays separately from committed product inputs.
For local Windows smoke, set `CIRNET_RELEASE_MANIFEST` to the absolute local
manifest and use a separate `CIRNET_DEV_HOME`.

## Release and operate the selected set

Use the title `<project>-v<version>` and tag `v<version>`. Contracts, Simulator,
Hardware and FPGA use `v0.1.2`. Interface and the Remote system use `v0.1.4`.
The Remote release includes the API 0.1.2 artifacts and the system manifest.
Verify the complete local set, upload only the verified bytes to new drafts,
and check draft asset identities and digests before publication. Published tags
and bytes retain their original identities.

For an authorized production install, use separate API and Hardware Python
environments. API installs the selected API, Contracts and Simulator wheels.
Hardware installs the selected Hardware, Contracts and Simulator wheels. Serve
the exact Interface static bundle with the existing same-origin Nginx routes
`/models`, `/api` and `/ws`. Keep one API scheduler process and Hardware RPC on
loopback. Production runtime uses the verified packages and static bundle.
Keep unverified physical capabilities unavailable. See
[deployment](deployment.md) and the [Mini PC review](mini-pc.md).

## Roll back

Stop new admissions and retain a matched database backup, capture storage and
release manifest. Verify safe cleanup or retained quarantine. Keep the leases
and quarantine for unresolved cleanup. Restore the database and captures as one
set. Verify ownership, migrations, capture hashes and quarantine before startup.
Recreate environments from the matching exact release. Avoid replaying commands
whose outcome is unknown.

```text
python -B scripts/check_release_rollback.py --show-plan
python -B scripts/check_release_rollback.py --run --environment-file ABSOLUTE_INSTALLATION_STATE
python -B scripts/check_release_rollback.py --show-plan --local-artifacts --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST
python -B scripts/check_release_rollback.py --run --local-artifacts --environment-file ABSOLUTE_INSTALLATION_STATE
```

Use isolated test state. The checker binds the manifest digest, virtualenv and
owned output paths. Its software/restore gates and a complete prior-artifact
reinstall with matched database and capture restoration require separate
evidence. These procedures require separate authorization for live restore or
FPGA programming. Read the [dated evidence](../history/index.md) for the exact
scope of each rehearsal.
