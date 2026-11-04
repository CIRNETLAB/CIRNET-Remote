"""Run the FPGA workflow's installer-output boundary with both namespaces."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[2]
CANONICAL = "CIRNET_FPGA_TOOLCHAIN_ROOT"
LEGACY = "NETCIRCUIT_FPGA_TOOLCHAIN_ROOT"


def bash_executable():
    if os.name == "nt":
        git_bash = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Git/bin/bash.exe"
        if git_bash.is_file():
            return str(git_bash)
    bash = shutil.which("bash")
    if bash is None:
        pytest.skip("Bash is required to execute the GitHub Actions boundary")
    return bash


@pytest.mark.parametrize(("canonical", "legacy", "expected"), [
    (None, "legacy toolchain", "legacy toolchain"),
    ("canonical toolchain", None, "canonical toolchain"),
    ("canonical toolchain", "legacy toolchain", "canonical toolchain"),
    ("", "legacy toolchain", None),
    ("", None, None),
    (None, "", None),
    (None, None, None),
], ids=["legacy-only", "canonical-only", "canonical-wins", "canonical-empty-masks-legacy",
        "canonical-empty", "legacy-empty", "missing"])
def test_rtl_step_accepts_installer_namespace_and_rejects_empty_roots(tmp_path, canonical, legacy, expected):
    document = yaml.safe_load((ROOT / ".github/workflows/fpga.yml").read_text(encoding="utf-8"))
    step = next(step for step in document["jobs"]["syntax"]["steps"]
                if "/scripts/check_rtl.py" in step.get("run", ""))
    product = tmp_path / "reviewed FPGA source"
    scripts = product / "scripts"
    scripts.mkdir(parents=True)
    # Record the consumer's arguments without downloading or executing native tools.
    (scripts / "check_rtl.py").write_text(
        "import json, os, sys\n"
        "from pathlib import Path\n"
        "Path(os.environ['CIRNET_TEST_ARGV']).write_text(json.dumps(sys.argv[1:]), encoding='utf-8')\n",
        encoding="utf-8",
    )
    arguments = tmp_path / "rtl-arguments.json"
    environment = os.environ.copy()
    for name in (CANONICAL, LEGACY):
        environment.pop(name, None)
    for name, value in ((CANONICAL, canonical), (LEGACY, legacy)):
        if value is not None:
            environment[name] = (tmp_path / value).as_posix() if value else ""
    environment.update({
        "CIRNET_FPGA_ROOT": product.as_posix(),
        "CIRNET_TEST_ARGV": str(arguments),
        "PATH": str(Path(sys.executable).parent) + os.pathsep + environment.get("PATH", ""),
        "PYTHONDONTWRITEBYTECODE": "1",
    })
    result = subprocess.run(
        [bash_executable(), "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step["run"]],
        cwd=ROOT, env=environment, capture_output=True, text=True, check=False,
    )
    if expected is None:
        assert result.returncode == 1, result.stdout + result.stderr
        assert "FPGA toolchain root" in result.stdout + result.stderr
        assert not arguments.exists(), "An empty root must never reach the artifact consumer"
    else:
        assert result.returncode == 0, result.stdout + result.stderr
        assert json.loads(arguments.read_text(encoding="utf-8")) == [
            "--toolchain-root", (tmp_path / expected).as_posix(),
        ]
