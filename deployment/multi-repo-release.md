# Multi-repo release and rollback

Use `integration/release-set.json` as the exact six-product selection. Every product is 0.1.1; DEV tooling, third-party dependencies and wire protocols have separate versions. Download URLs identify private GitHub release asset IDs and require a credential with access to the canonical repositories. Never use `latest`, editable producer installs or sibling checkouts as fallback.

Install Git, Node 22 and Python 3.12+ first. Create an external virtual environment, activate it, and privately set `NETCIRCUIT_ARTIFACTS_TOKEN`. From a clean Remote checkout run:

```text
python -B scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json
```

The installer prints JSON including the allocator-owned absolute `environmentFile`. Apply both its `environment` selections and `processEnvironment` containment settings to the parent process; a child cannot change its parent shell. The state contains no credential. In PowerShell, the complete verification preparation is:

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
$interfaceBootstrap = node "$env:NETCIRCUIT_INTERFACE_ROOT/scripts/bootstrap-contracts.mjs" --manifest "$env:NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST" | ConvertFrom-Json -ErrorAction Stop
if ($LASTEXITCODE -ne 0) { throw 'Interface artifact bootstrap failed.' }
foreach ($property in $interfaceBootstrap.environment.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
}
npm --prefix "$env:NETCIRCUIT_INTERFACE_ROOT" ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Interface dependency installation failed.' }
npm --prefix "$env:NETCIRCUIT_INTERFACE_ROOT" run test:e2e:install
if ($LASTEXITCODE -ne 0) { throw 'Pinned browser installation failed.' }
python -B -m pip check
if ($LASTEXITCODE -ne 0) { throw 'The selected package set is inconsistent.' }
```

Invoke the installer once and retain the resulting JSON state for reuse. Python tooling and Interface dependencies are verification prerequisites, separate from runtime installation. All package-manager caches and temporary paths in this recipe inherit owned external directories. The browser installation cache is inside the external exported product; actual browser launches use separate complete owned copies. Set `NETCIRCUIT_TEST_POSTGRES_URL` to an isolated test database and `NETCIRCUIT_TEST_PG_BIN` to the matching tools before PostgreSQL gates.

For an explicitly local rebuild, use a separate `distribution: "local"` system manifest and add `--local-artifacts`. Every selected artifact, including the preserved rollback bundle, must have its exact versioned filename, absolute regular-file `path` and SHA-256; local entries cannot contain `url`. Keep the six committed producer revisions and the same compatibility/rollback inventory. The installer validates the complete selection before bootstrap and checks the bytes again when copying. It retains all archive identity, package provenance and installed-origin checks. Local mode performs no GitHub artifact downloads; third-party Python/npm dependencies still follow their pinned package requirements. The default published mode rejects local manifests/paths and continues requiring immutable numeric GitHub asset URLs.

```text
python -B scripts/install_release.py --local-artifacts --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST --environment-file release-env.json
```

Store the local manifest with its retained artifacts outside Git. Its absolute paths identify that machine's local set; it does not replace `integration/release-set.json` or establish a published release. Apply both returned environment blocks and prepare verification prerequisites exactly as above. Record any uncommitted integration-tool overlay separately from the clean committed product inputs.

```text
python scripts/check_release.py --show-plan
python scripts/check_release.py --group contracts --group python --group web --group postgres --group browser --group package
```

Use an isolated real PostgreSQL database and the matching `pg_dump`/`pg_restore` tools. Prepare the pinned Playwright installation cache and let the Interface launcher make an owned external runtime copy. The browser group owns real API/RPC startup, restart and safe shutdown; keep one worker, zero retries and forbid-only. The FPGA standalone repository owns mandatory pinned parser/compiler/runtime and both behavioral testbenches. Passing source/static compilation does not substitute for native browser or RTL execution.

Production installation is a separate authorized operation. Select API/Contracts/Simulator wheels for the API environment, and Hardware/Contracts/Simulator wheels for the Hardware environment. Serve the exact Interface static bundle through the existing same-origin Nginx routes. Preserve `/models`, `/api` and `/ws`; keep one API scheduler process and Hardware RPC on loopback. DEV tooling and source checkouts are unnecessary for the running application. Keep unavailable native/physical capabilities unavailable.

Before changing a deployed set, stop new admissions and preserve the matching database backup, capture storage and release manifest together. Confirm safe cleanup or retained quarantine; an unresolved cleanup must retain its leases/quarantine. A database backup and unrelated capture directory are not a valid pair.

Rollback selects the reviewed pre-M6 bundle recorded in the system manifest and verifies its archive hash and every contained artifact. Recreate the old virtual environments from those exact artifacts; never reuse a higher-version package cache. Restore the corresponding database and capture backup as one set, verify ownership/migrations/capture hashes and quarantine, then start services with normal recovery. Do not replay Start, Apply, Run or other uncertain commands, and do not erase quarantine to make startup succeed. Retain the failed set and its diagnostic evidence for review.

`python scripts/check_release_rollback.py --show-plan` lists the software/restore gates; `--run` executes them against isolated test state. Its output distinguishes those gates from a complete prior-artifact rehearsal. Only the dated M6 evidence can establish that the complete exact-set rehearsal actually ran. No command in this runbook authorizes a live production restore or board programming.

For the explicitly local set, also pass `--local-artifacts` to `check_release_rollback.py --show-plan --manifest ABSOLUTE_LOCAL_RELEASE_MANIFEST` or `--run --environment-file ABSOLUTE_INSTALLATION_STATE`. The rollback checker still binds the saved manifest digest, invoking virtualenv and canonical output ownership. Its default mode rejects a local selection; passing these registered software gates alone still does not establish a complete old-artifact reinstall and paired database/capture restore.
