# Application Backend

FastAPI modular-monolith boundary for the Lab-First laboratory on a Linux Mini PC. Current authority: ../../docs/ARCHITECTURE.md. PostgreSQL is the production target; SQLite is optional for tests/development. R4 adds assignment/experiment/station/verification/persistence and FIFO/lease lifecycle; endpoints below describe the pre-R4 implementation.

## Local run

The web application's `npm run dev` starts Vite only. Run this API in a second
terminal so Vite can proxy `/api` and `/ws` to `127.0.0.1:8000`. A refused
connection to that address means the API is not listening; restarting Vite alone
does not start it.

### Windows PowerShell

First-time setup, from the repository root (Python 3.11 or newer):

```powershell
py -3 -m venv services/api/.venv
.\services\api\.venv\Scripts\python.exe -m pip install -e './services/api[test]'
```

Start the API and keep this terminal running:

```powershell
.\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services/api --reload-dir services/api --host 127.0.0.1 --port 8000 --reload
```

If your terminal is already in `apps/web`, use this equivalent command:

```powershell
..\..\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir ..\..\services\api --reload-dir ..\..\services\api --host 127.0.0.1 --port 8000 --reload
```

`--app-dir` selects the import path; `--reload-dir` selects the watched source
directory. Start only one API on port 8000. If another API is already running,
use it or stop it in its original terminal before starting another instance.
On Windows a second bind may report `WinError 10013`.

To identify an existing listener before taking any action:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

These commands use the project's virtual environment directly, so PowerShell
activation and execution-policy changes are unnecessary. The default mode is
simulation; a physical station is not required for these endpoints.

In a separate terminal:

```powershell
cd apps/web
npm run dev
```

Verify the API directly and through Vite (use the port printed by Vite if 5173
is already occupied):

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://localhost:5173/api/stations
```

The health response should identify `netcircuit-api`; station discovery in
simulation mode should return `virtual-station-01` with state `ready`.

### Linux/macOS

```bash
cd services/api
python -m venv .venv
. .venv/bin/activate
pip install -e '.[test]'
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Current endpoints:

- `GET /api/health`
- `POST /api/circuits/validate`
- `GET /api/stations`
- `WS /ws/events`

This layer validates application intent. It does not write FPGA registers directly.
