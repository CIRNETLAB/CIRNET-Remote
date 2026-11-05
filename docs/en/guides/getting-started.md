# Run CIRNET Remote locally

[Tiếng Việt](../../vi/guides/getting-started.md) · [Documentation](../index.md)

CIRNET Remote runs a browser-based electronics lab. The Windows launcher uses
the exact system [release lock](../../../integration/release-set.json) and starts
three processes in order. Hardware Service listens on `127.0.0.1:50051`, the
Remote API on `127.0.0.1:8000`, and CIRNET-Interface on `127.0.0.1:5173`. The
browser uses the Interface origin and its API proxy.

The selected system is **0.1.4**. Interface is **0.1.4**. API, Contracts,
Simulator, Hardware and the FPGA source scaffold are **0.1.2**. The scaffold
declares `physicalAvailable=false`. Use the launcher for local simulation.

## Start and stop on Windows

Install Git, Windows PowerShell 5.1, Python 3.14 or later with pip and venv, and
Node.js 26 LTS with npm. Reopen the terminal after changing `PATH` and confirm
`node --version` starts with `v26.`. Open
[run-cirnet.bat](../../../run-cirnet.bat) or run it from the repository root.

The menu accepts a number or `clean`, `doctor`, `start`, or `exit`. Select **3**
to run. The first run downloads and verifies the locked release inputs and can
take several minutes. The launcher opens `http://127.0.0.1:5173` when ready.
Keep the terminal open. The console uses English messages.

```powershell
.\run-cirnet.bat start
.\run-cirnet.bat -NoBrowser
.\run-cirnet.bat -Check
.\run-cirnet.bat stop
.\run-cirnet.bat doctor
.\run-cirnet.bat clean -Preview
.\run-cirnet.bat clean
.\run-cirnet.bat -NoColor
.\run-cirnet.bat start -NoAnimation
.\run-cirnet.bat doctor -NoColor
```

Explicit actions and startup flags bypass the menu. `-NoBrowser` starts the
services without opening a browser. `-Check` checks the real services and stops
them automatically. During a normal start, press **Esc** in the launcher while
it checks readiness or while it is running to stop and return to the menu.
Choose **3** again for a fresh run. First-run setup finishes before readiness
checks. **Enter**, **Ctrl+C**, and `stop` from another terminal stop the session
and exit. The launcher prints the absolute path of its own external log session.

Development SQLite and captures are under `%USERPROFILE%\CIRNET-Dev`, or the
external directory selected by `CIRNET_DEV_HOME`. Preserve that data when
repairing the runtime. The launcher checks the base interpreter and the
release-specific `.venv-0.1.4` against the Python floor. If the venv uses an old
interpreter, follow Doctor's repair instructions for that venv.

`-NoColor` disables color and animation. `-NoAnimation` keeps supported color
and disables motion. Either switch alone opens the menu. Redirection,
`NO_COLOR=1`, `TERM=dumb`, or an unsupported console gives plain output.
Redirected input disables animation. Resizing during a spinner changes it to
a static status line.

## Diagnose and clean

Doctor reports recommended tools, the detected runtime and release cache, and
ports `50051`, `8000` and `5173`. It reports `INSTALLED`, `MISSING`,
`INCOMPATIBLE`, or `NOT VERIFIED`, with remediation. `READY FOR LOCAL SIMULATION`
requires the tools and a verified installed runtime. On a fresh machine, install
the required tools, run `start` to bootstrap, and run Doctor again. Doctor makes
local inspections and writes its report to the console. FPGA development uses
the pinned `pyslang`, Icarus Verilog and `vvp` flow owned by CIRNET-FPGA.

Clean previews its whitelist and requests confirmation. `-DryRun` and `-WhatIf`
are aliases of `-Preview`. Use `clean -Yes` for deliberate noninteractive cleanup.
The report gives Deleted, Skipped and Failed counts, paths, file counts and sizes.
Allowed files include CPython-tagged `.pyc` in recognized `__pycache__` locations,
three pytest cache files, and the five standard Remote setuptools egg-info files.
Clean leaves empty cache directories in place and skips unknown outputs. It
protects source, Git, documents, dependencies, virtual environments, SQLite,
captures, release artifacts and the DEV allocator cache. An active launcher or
relevant service blocks cleanup.

## Develop and verify

For an explicit release install, isolated verification or a production plan,
follow the [release and rollback runbook](../operations/release-and-rollback.md).
For native browser and PostgreSQL checks, follow
[verification](../contributing/verification.md). For API development, see the
[API checkout guide](../api/application.md). The launcher
starts the API from this source checkout, the installed Hardware module and the
extracted Interface product. Production uses verified installed wheels and the
selected static Interface bundle.

The current runtime is Web-first, Safety-gated and Lab-First. The browser never
controls raw FPGA transport. Published software evidence, a deployment template
and a physical hardware result have distinct acceptance criteria. See the
[system architecture](../architecture/system.md) and [history](../history/index.md).
