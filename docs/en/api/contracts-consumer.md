# Contracts consumer guide

[Tiếng Việt](../../vi/api/contracts-consumer.md) · [Original consumer README](../../../contracts/README.md)

The independent [cirnet-contracts](https://github.com/cirnetlab/cirnet-contracts) repository owns canonical Contracts and the Device Library. System **0.1.4** selects Interface **0.1.4** and API, Contracts, Simulator, Hardware and FPGA **0.1.2**. The Python distribution is `cirnet-contracts==0.1.2`, imported as `contracts`. Interface consumes `@cirnet/contracts` **0.1.2**. The independent DEV allocator uses Python **1.0.0a1** and npm **1.0.0-m1.0**. Use the [system manifest](../../../integration/release-set.json) for exact producer revisions, filenames and SHA-256 digests.

JSON Schemas define shapes, FastAPI registrations in Remote define public operations, and protobuf defines local RPC fields. The installed manifest identifies versions, visibility, producer and consumers, profiles, artifacts and compatibility policy. Absolute schema URIs resolve offline from installed resources, independently of the working directory. The registry reads historical relative IDs. Remote's `contracts/__init__.py` forwards module, spec and resource loading to the installed wheel. It rejects missing, wrong-version and editable Contracts.

## Prepare the selected artifacts

Contracts runtime packages support Python 3.11+. Primary generator and verification CI use Python 3.14 and Node 26. Start in a fresh external virtual environment. For the artifact-only release setup, use `python -B scripts/install_release.py --manifest integration/release-set.json --environment-file release-env.json` and import both environment blocks returned by the installer. See the [release runbook](../../../deployment/multi-repo-release.md).

For owner-local API source development, use reviewed absolute per-product manifests with artifact paths and digests. The Contracts manifest supplies Python and npm artifacts and the DEV allocator wheel. The following shell setup installs the producer wheels before the editable API and allocates external output for subsequent checks. Include every participating Git root in the artifact context before allocation if using multiple checkouts.

```sh
export CIRNET_CONTRACTS_ARTIFACT_MANIFEST=/absolute/reviewed/artifacts.json
python -B scripts/install_contracts.py --with-dev --manifest "$CIRNET_CONTRACTS_ARTIFACT_MANIFEST"
CIRNET_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)" || exit 1
export CIRNET_ARTIFACTS_SESSION
mkdir -p "$CIRNET_ARTIFACTS_SESSION/tmp" "$CIRNET_ARTIFACTS_SESSION/pip-cache"
export TMP="$CIRNET_ARTIFACTS_SESSION/tmp" TEMP="$CIRNET_ARTIFACTS_SESSION/tmp" TMPDIR="$CIRNET_ARTIFACTS_SESSION/tmp"
export PIP_CACHE_DIR="$CIRNET_ARTIFACTS_SESSION/pip-cache" PYTHONDONTWRITEBYTECODE=1
export CIRNET_SIMULATOR_ARTIFACT_MANIFEST=/absolute/reviewed/simulator-artifacts.json
python -B scripts/install_simulator.py
export CIRNET_HARDWARE_ARTIFACT_MANIFEST=/absolute/reviewed/hardware-artifacts.json
python -B scripts/install_hardware.py
python -B -m pip install -r requirements-verification.txt -e './services/api[test]'
export CIRNET_FPGA_ARTIFACT_MANIFEST=/absolute/reviewed/fpga-artifacts.json
fpga_install="$(python -B scripts/install_fpga.py --manifest "$CIRNET_FPGA_ARTIFACT_MANIFEST")" || exit 1
CIRNET_FPGA_ROOT="$(printf '%s' "$fpga_install" | python -B -c 'import json,sys; print(json.load(sys.stdin)["fpgaRoot"])')" || exit 1
export CIRNET_FPGA_ROOT
```

`--with-dev` bootstraps the allocator and installs Contracts. `--dev-only` prepares the allocator alone. The Simulator and Hardware commands accept `--manifest` or their corresponding environment selections shown above. The FPGA installer accepts `--manifest` and returns `fpgaRoot` for the fresh owned extraction. On PowerShell, parse the JSON with `ConvertFrom-Json` and assign `fpgaRoot` to `$env:CIRNET_FPGA_ROOT`. Retain the manifest, root and owned session for child checks. The FPGA product owns native RTL acceptance using its pinned parser and simulator toolchain and installed Contracts. Remote checks the selected scaffold as an archive and does not install FPGA as a Python dependency.

Interface owns Web setup, including SDK and DEV bootstrap before the locked npm install. Use the [selected Interface setup](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/README.md). Set `CIRNET_INTERFACE_ROOT` to the prepared product for Web and browser checks. The release runner also accepts an absolute `--interface-root` selector. Simulator and Hardware own their standalone builds and unit tests. The earlier 0.1.1 Simulator, Hardware and FPGA pins and the 0.1.1 SDK and test sdist belong to prior selections. Preserve their identities in the [M2 migration record](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers/plans/2026-10-24-multi-repo-migration-m2.md) and the historical producer trees in Git.

## Verify the consumer

Run these checks from the Remote root with the selected manifests and owned session. OpenAPI export reads registrations without starting services, and canonical Contracts generation uses the independent producer.

```sh
python -B -m scripts.check_contract_consumer
python -B scripts/generate_contracts.py --check
python -B scripts/export_openapi.py --check
python -B scripts/check_contract_sdk.py
python -B scripts/check_contract_package.py
python -B scripts/check_release.py --group contracts
```

`sync_lab_contracts.py --check` and the generation and catalog wrappers compare installed projections. Explicit exports use external output. Remote packages the empty `cirnet-remote-dev` metapackage. The Contracts producer retains deterministic UTF-8/LF generation, pinned tools, staged publication and ordinary I/O rollback. Standalone source and installed-resource generation modes are tested separately.

The selected wheel provides generated Python models, RPC bindings and resources. The selected npm tarball provides public DTOs, validators, catalogs and fixtures. Interface fills permitted test-only resource gaps from an allowlisted, digest-verified Contracts sdist. Remote's SDK consumer checks the real npm tarball for runtime parity, types and packed public closure. Interface owns application adapters and `src/types` facades. Browser exports omit private `InstrumentationExecutionPlan` and `StationCapabilities`, and public capabilities omit routing resources. Export a reviewed OpenAPI handoff from the API registrations, generate in Contracts, then require Remote's export on the final wheel to match. Open properties and metadata are intentionally opaque extension points.

## Profiles, wire behavior and diagnostics

Structural, editor and transport profiles have separate versions. Structural storage preserves arbitrary-precision legacy graph numbers. Browser import checks original numeric tokens and rejects precision loss before conversion. Legacy property alias normalization is a separate document operation. Transport applies both JavaScript safe-integer bounds and protobuf uint32 limits before RPC serialization. It rejects out-of-range values without changing them. Epoch `timestamp_ns` remains a decimal string. Read the [selected profiles](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/profiles.json) alongside the [historical profile snapshot](https://github.com/cirnetlab/cirnet-remote/blob/989954f95c1c6b1d224e31a53fb33f125f0a81a9/contracts/profiles.json).

Pydantic and TypeScript represent shapes. Full offline JSON Schema validation enforces composition, references, conditionals, array and numeric bounds, string patterns, mounting `if/not` rules and cross-field relationships. Generation rejects unknown vocabulary and unresolved or private references. Python boundary adapters preserve numeric input representations and omission. Use `response_model_exclude_unset=True` for route serialization.

The wheel's `fixtures/conformance.json` supplies common rule IDs and public cases for Python and the browser. Python also runs explicit internal cases. Editor authoring, server execution, observed physical evidence and electrical safety remain separate contexts. Contract validation grants no power permit, physical route or unavailable instrument.

WC20 operation metadata binds documented statuses and media types to canonical responses, including errors and legacy validation 422. Browser boundaries reject undocumented success statuses, malformed errors and mismatched binary media. Frozen legacy operation anchors are preserved, and preparse request budgets reject through the documented HTTP 400 ErrorEnvelope.

Generated `validators*.core` entrypoints cover synchronous editor, authored property, local configuration and auth validation. API and realtime workflows prepare complete offline profiles before use. `parseStructural` is synchronous and fails closed for an unprepared required validator. Complete profiles use literal lazy imports of generated validators without runtime compilation or network schema resolution. Both core and complete output are deterministic, with conformance and cold-workflow coverage. Unit fixtures prepare profiles when entering synchronous controllers directly. Cold-entry and native browser scenarios exercise real loading.

`fixtures/diagnostics.json` adds rule-code, JSON Pointer and profile expectations. Generated Pydantic errors carry sanitized canonical issues. HTTP adds a request-location prefix such as `/body/name` without echoing values or extending the frozen top-level envelope.

## Provenance and installed-package checks

The wheel's `compatibility/2026-10-16` stores exact Git blobs and the source revision for supported unpublished pre-W1 schemas and RPC. `public-wire-baseline.json` freezes supported unpublished API operation, request, response and security anchors, named schemas and NCAP layouts. `python -B scripts/check_public_compatibility.py` rejects anchor changes and includes negative mutations in coverage. New operations and versioned definitions can coexist. Baselines are reviewed explicitly. Recorded raw Windows digests are preserved, and comparisons normalize only CRLF to LF. These fixtures are historical, distinct from a release claim.

The wheel supplies the same baseline bytes on Windows and Linux. Graph 1.0 and 1.1 retain their frozen schemas. New presentation namespaces are opt-in and preserve unknown or future metadata. Breaking public shapes require a version and a tested migration. Named boolean root DTOs and dynamic-reference relocation raise generation errors. Nested boolean schemas and full JSON Schema 2020-12 runtime constraints are supported.

The wheel packages schema, data, baselines, fixtures and proto resources and generates RPC bindings at build time. Core runtime pins JSON Schema, referencing and Pydantic dependencies. The `[rpc]` extra provides dependencies for local RPC imports. API and Hardware pin grpcio and protobuf to the generator's versions. FastAPI and Pydantic are pinned for deterministic operation export. `requirements-verification.txt` includes the optional workload monitor used by the owned-process cleanup regression.

`check_contract_package.py` builds the API wheel and combines it with the selected Contracts, Simulator and Hardware wheels. Its isolated `-I` probe, virtual environment and working directory live physically outside Git. It checks imported paths, packaged resources, graph preservation, NCAP v1/v2, domain dispatch, RPC limits, migration head, auth/project/capture persistence and installed CLIs. Catalog identity comes from the installed wheel. Build logs go in the shared external session and cleanup removes only its owned children. Node and Python wrappers delegate to the same pinned DEV allocator. See [verification and artifacts](../contributing/verification.md).

## Named release gates

`python -B scripts/check_release.py --show-plan` lists exact commands and may allocate external pytest directories while constructing the plan. Repeated `--group` options select a subset.

| Group | Scope |
| --- | --- |
| `contracts` | Context, installed provenance, selected FPGA, projections, OpenAPI, public compatibility and the actual npm artifact. Runs Contracts pytest when the full Python group is absent. |
| `python` | Full Python suite, with applicable provenance prechecks. |
| `web` | Selected Interface boundaries, unit tests and build. |
| `postgres` | Real migrations, backup and restore, and independent-writer cases. Set a disposable `CIRNET_TEST_POSTGRES_URL` and matching PostgreSQL 18 client tools. |
| `browser` | Real Remote and Interface scenarios. Prepare the pinned Chromium cache and selected Interface product. |
| `package` | Clean installed-consumer checks with owned external scratch. |
| `all` | The six mandatory groups above. The combined plan runs full Python once. |

Make targets retain these groups. The optional `python -B scripts/check_release.py --group load` runs 50 cookie/CSRF sessions, concurrency 10, eight actual virtual captures and three read rounds with auth pacing enforced. It stays outside `all` and ordinary PR gates. Raw JSON goes to the external `web-sessions/report.json`. A direct `scripts/benchmark_web_sessions.py --output` override requires a validated absolute external file. Record the scenario, environment and results in the verification ledger and clean only the owned session. Dated 2026-10-16 measurements describe their local runs. Production capacity and physical hardware require separate evidence.
