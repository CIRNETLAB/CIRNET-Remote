# Verify Rust Remote

[Tiếng Việt](../../vi/contributing/rust-verification.md) · [Documentation](../index.md)

Use this guide for the native `cirnet-remote` binary. The
[system verification guide](verification.md) owns output allocation and the
published artifact checks. The [migration status](../architecture/native-migration-status.md)
identifies the Windows Gate 4 candidate and the pending gates.

## Build and run ordinary tests

Use Rust `1.90.0` from [rust-toolchain.toml](../../../rust-toolchain.toml).
[Cargo.toml](../../../Cargo.toml) and [Cargo.lock](../../../Cargo.lock) pin the
dependencies, including Contracts native `0.1.2` at
`e640f80b1199779659d3db7817fee16d13cc24c1`. Run from the Remote root in a fresh
owned external session. Check that the allocator returns the requested paths
before running Cargo. Use `--offline` when the locked dependencies are cached.

```powershell
$env:CARGO_TARGET_DIR = node scripts/artifact-paths.mjs rust-remote/target
$env:TEMP = $env:TMP = $env:TMPDIR = node scripts/artifact-paths.mjs rust-remote/tmp
cargo build --locked --release --bin cirnet-remote
cargo test --locked --lib --bins
cargo test --locked --lib --bins -- --list
```

The ordinary tests exercise configuration, API boundary and WebSocket logic,
and shutdown supervision. Listing the tests helps select the ignored fixture
cases below. These commands exercise the local build. The recorded gate used a
separately frozen executable and the exact integration artifacts.

## Select the fixtures for a focused test

The CLI migration test needs an empty `CIRNET_REMOTE_CLI_DIR` in the owned
session. The OpenAPI case needs `CIRNET_CONTRACTS_ROOT` pointing to the pinned
Contracts resources containing `contracts/api/openapi.json`.
It compares the export byte for byte and checks all 63 operation IDs. Set these
inputs before selecting the corresponding case. The migration case creates a
disposable database and checks both explicit migration and a second no-op run.

```powershell
$env:CIRNET_REMOTE_CLI_DIR = node scripts/artifact-paths.mjs rust-remote/cli
cargo test --locked --test cli migrations_are_explicit_and_idempotent -- --ignored --exact
cargo test --locked --test cli openapi_export_matches_pinned_handoff_and_route_inventory -- --ignored --exact
```

For a read-only SQLite comparison, set `$referencePython` to the Python
executable with the exact installed Stage 3 r8 reference. The seed script creates
the named fixture child, which must be absent when it starts.

```powershell
$fixtureParent = node scripts/artifact-paths.mjs rust-remote
$env:CIRNET_REMOTE_DB_FIXTURE_DIR = Join-Path $fixtureParent 'sqlite-read'
& $referencePython -I -B native/tests/db_seed_legacy.py
cargo test --locked --test db_readonly reads_legacy_sqlite_without_mutating_files -- --ignored --exact
```

| Case family | Required inputs and entry points |
| --- | --- |
| Database migration and live writes | Use [db_seed_migrations.py](../../../native/tests/db_seed_migrations.py) for `db_migrations` and fresh copies of the legacy seed for [db_write.rs](../../../native/tests/db_write.rs). Set `CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR`, `CIRNET_REMOTE_DB_WRITE_SQLITE_DIR` or the matching PostgreSQL selectors in the test. PostgreSQL read fixtures use `CIRNET_REMOTE_DB_FIXTURE_POSTGRES` and a disposable loopback database named with the `cirnet_stage4_db_` prefix. |
| Auth, runtime and scheduler | Select [auth_lifecycle.rs](../../../native/tests/auth_lifecycle.rs), [runtime_records.rs](../../../native/tests/runtime_records.rs), [stop_claim_authority.rs](../../../native/tests/stop_claim_authority.rs) or [scheduler_authority.rs](../../../native/tests/scheduler_authority.rs) and prepare their isolated SQLite or PostgreSQL fixtures. [Runtime](../../../native/tests/seed_runtime_records.py) and [Stop claim](../../../native/tests/seed_stop_claim.py) seeders use the installed Python reference. The helper cases marked for subprocess use belong to their owning harness. |
| Compiler and Hardware preview | [compiler_cases.rs](../../../native/tests/compiler_cases.rs) uses `CIRNET_REMOTE_COMPILER_CORPUS` from [compiler_fixture.py](../../../native/tests/compiler_fixture.py) and `CIRNET_CONTRACTS_ROOT`. [preview_hardware.rs](../../../native/tests/preview_hardware.rs) uses the exact R2 Hardware in `CIRNET_NATIVE_STAGE3_HARDWARE` and the pinned C++ worker in `CIRNET_SIM_CPP_WORKER`. |
| Capture, realtime and lifecycle | [experiment_captures.rs](../../../native/tests/experiment_captures.rs) uses an owned `CIRNET_REMOTE_CAPTURE_TEST_DIR` and pinned Contracts. [websocket_protocol.rs](../../../native/tests/websocket_protocol.rs) and [experiment_manager.rs](../../../native/tests/experiment_manager.rs) specify the `CIRNET_REMOTE_WS_FIXTURE_DIR` and the other owned SQLite and PostgreSQL test inputs. |

Select a named test with its documented prerequisites. Use its teardown,
then inspect the evidence and clean the owned session as described in
[system verification](verification.md). Keep PostgreSQL credentials and
database/capture data in the test environment and record artifact digests.

## Test the exact artifacts together

The explicit `tests/integration/native_remote_*_cases.py` suites run pytest
against separate processes. The
[reference selector](../../../tests/integration/native_remote_gate_cases.py)
requires `CIRNET_NATIVE_STAGE3_CANDIDATE`, `CIRNET_NATIVE_STAGE1_CANDIDATE`
and `CIRNET_NATIVE_STAGE3_PYTHON`. Set `CIRNET_NATIVE_REMOTE_EXE` to the
selected Rust binary and satisfy the digest check in the chosen driver.

- The [HTTP matrix](../../../tests/integration/native_remote_matrix_cases.py)
  covers both SQLite and PostgreSQL with isolated data. Use the
  [cutover and rollback case](../../../tests/integration/native_remote_cutover_cases.py)
  with its owned PostgreSQL state and matching backup tools. The
  [historical restore](../../../tests/integration/native_remote_old_restore_cases.py)
  and [clock expiry](../../../tests/integration/native_remote_expiry_cases.py)
  cases cover older data and scheduler safety.
- The [Interface case](../../../tests/integration/native_remote_browser_cases.py)
  pins the Interface source/static artifact and Playwright Python/Chromium.
  The [worker fault cases](../../../tests/integration/native_remote_worker_fault_cases.py)
  exercise actual C++ crash and timeout.
- The [loaded Stop driver](../../../tests/integration/native_remote_stop_cases.py)
  and [fixed load driver](../../../tests/integration/native_remote_load_cases.py)
  have explicit run selectors. Apply the
  [host policy](../architecture/native-migration.md#gate-4-acceptance-policy-by-host)
  to determine the correct acceptance scope.

The [Windows checkpoint](../architecture/native-migration.md#stage-4-windows-compatibility-and-safety-checkpoint--717402ba)
records the local Gate 4 PASS for the pinned candidate. Linux/Xeon performance
and full loaded Stop, Linux signal execution, physical HIL and production
release acceptance are **NOT RUN**. The checked-in workflows cover
documentation, Python service and artifact integration, browser, Contracts and
FPGA. Rust Remote acceptance runs are local and explicit. See the
[documentation workflow](../../../.github/workflows/docs.yml) and
[integration workflow](../../../.github/workflows/integration.yml).
