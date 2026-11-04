"""Run launcher checks with the same Windows PowerShell host as the batch file."""
import base64
import os
from pathlib import Path
import subprocess

import pytest

REPO = Path(__file__).resolve().parents[2]
PS_EXECUTABLE = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"


def run_ps(script, *, env=None, timeout=30):
    if os.name != "nt" or not PS_EXECUTABLE.is_file():
        pytest.skip("The launcher requires Windows PowerShell.")
    prelude = "$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n"
    encoded = base64.b64encode((prelude + script).encode("utf-16-le")).decode("ascii")
    environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", **(env or {})}
    return subprocess.run(
        [str(PS_EXECUTABLE), "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        cwd=REPO, env=environment, text=True, encoding="utf-8", errors="replace",
        capture_output=True, timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
