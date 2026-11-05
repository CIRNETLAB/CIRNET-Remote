import os
import json
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tests.launcher.support import PS_EXECUTABLE, REPO, run_ps


MENU_PROMPT = "Enter your choice (0-3):"

DOCTOR_RECOMMENDATIONS = """
function Get-CirnetRequiredTools {
    [pscustomobject]@{Name='Node.js'; RecommendedVersion='26 LTS'; Purpose='Runs the Web tooling.'}
}
"""


def launch(repo, args=(), *, text="", env=None, host=PS_EXECUTABLE):
    if os.name != "nt":
        pytest.skip("The batch launcher requires Windows.")
    return subprocess.run(
        [str(host), "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
         "-File", str(repo / "scripts/run-cirnet.ps1"), *args],
        cwd=repo, input=text, capture_output=True, text=True, timeout=30,
        env={**os.environ, **(env or {})}, creationflags=subprocess.CREATE_NO_WINDOW,
    )


@pytest.fixture
def isolated_launcher(tmp_path):
    root = tmp_path / "remote with spaces"
    modules = root / "scripts/launcher"
    modules.mkdir(parents=True)
    shutil.copy2(REPO / "run-cirnet.bat", root)
    shutil.copy2(REPO / "scripts/run-cirnet.ps1", root / "scripts")
    shutil.copy2(REPO / "scripts/launcher/Common.psm1", modules)
    shutil.copy2(REPO / "scripts/launcher/Console.psm1", modules)
    (modules / "Doctor.psm1").write_text(DOCTOR_RECOMMENDATIONS + """
function Get-CirnetEnvironmentReport {
    [pscustomobject]@{Ready=$true; Checks=@(); MissingRequired=@()}
}
Export-ModuleMember -Function Get-CirnetEnvironmentReport, Get-CirnetRequiredTools
""", encoding="utf-8")
    (modules / "Clean.psm1").write_text("""
function Invoke-CirnetClean {
    param($RepositoryRoot, $DevHome, [switch]$Preview)
    if (-not $Preview) { [IO.File]::WriteAllText($env:TEST_DELETED, 'confirmed') }
    [pscustomobject]@{Results=@(); Deleted=0; Skipped=0; Failed=0; Bytes=0; Files=0; Preview=[bool]$Preview}
}
Export-ModuleMember -Function Invoke-CirnetClean
""", encoding="utf-8")
    return root


def test_no_arguments_show_the_requested_menu_and_exit_without_setup(isolated_launcher, tmp_path):
    dev = tmp_path / "unused-dev"
    result = launch(isolated_launcher, text="0\n", env={"CIRNET_DEV_HOME": str(dev)})
    assert result.returncode == 0, result.stderr
    for line in (
        "CIRNET REMOTE LAUNCHER",
        "[1] Clean build files", "[2] Check development environment",
        "[3] Run CIRNET Remote", "[0] Exit", MENU_PROMPT,
    ):
        assert line in result.stdout
    assert not dev.exists()


def test_menu_handles_invalid_input_commands_and_eof(isolated_launcher):
    result = launch(isolated_launcher, text="invalid\ndoctor\nexit\n")
    assert result.returncode == 0, result.stderr
    assert "Invalid choice" in result.stdout
    assert "READY FOR LOCAL SIMULATION" in result.stdout
    eof = launch(isolated_launcher)
    assert eof.returncode == 0, eof.stderr
    assert eof.stdout.count(MENU_PROMPT) == 1


@pytest.mark.parametrize("args", [("doctor",), ("exit",), ("clean", "-Preview")])
def test_explicit_actions_never_show_a_menu(isolated_launcher, args):
    result = launch(isolated_launcher, args)
    assert result.returncode == 0, result.stderr
    assert MENU_PROMPT not in result.stdout


def test_clean_requires_confirmation_and_preview_never_deletes(isolated_launcher, tmp_path):
    sentinel = tmp_path / "deletion-called"
    environment = {"TEST_DELETED": str(sentinel)}
    for args, text in [(("clean",), "no\n"), (("clean", "-DryRun"), ""), ((), "clean\nno\nexit\n"), ((), "1\nno\n0\n")]:
        result = launch(isolated_launcher, args, text=text, env=environment)
        assert result.returncode == 0, result.stderr
        assert not sentinel.exists()
    result = launch(isolated_launcher, ("clean",), text="yes\n", env=environment)
    assert result.returncode == 0, result.stderr
    assert sentinel.read_text() == "confirmed"
    sentinel.unlink()
    result = launch(isolated_launcher, ("clean", "-Yes"), env=environment)
    assert result.returncode == 0, result.stderr
    assert sentinel.exists()


@pytest.mark.parametrize("args", [("-Check",), ("-NoBrowser",), ("start", "-Check")])
def test_existing_cli_flags_take_the_original_start_path_without_a_menu(isolated_launcher, tmp_path, args):
    # No Git on this test PATH means start stops before bootstrap or services.
    result = launch(isolated_launcher, args, env={"PATH": "", "CIRNET_DEV_HOME": str(tmp_path / "dev")})
    assert result.returncode == 1
    assert MENU_PROMPT not in result.stdout
    assert "git" in result.stderr.lower()


@pytest.mark.parametrize("choice", ["3", "start"])
def test_menu_run_reaches_the_existing_start_path(isolated_launcher, tmp_path, choice):
    result = launch(isolated_launcher, text=choice + "\n",
                    env={"PATH": "", "CIRNET_DEV_HOME": str(tmp_path / "dev")})
    assert result.returncode == 1
    assert result.stdout.count(MENU_PROMPT) == 1
    assert "git" in result.stderr.lower()


def test_existing_stop_and_batch_forwarding_work_without_menu(isolated_launcher, tmp_path):
    environment = {**os.environ, "CIRNET_DEV_HOME": str(tmp_path / "stopped")}
    stopped = launch(isolated_launcher, ("stop",), env=environment)
    assert stopped.returncode == 0, stopped.stderr
    assert "No active CIRNET launcher" in stopped.stdout
    if os.name != "nt":
        pytest.skip("Windows batch execution is required.")
    for args, text in [(("exit",), ""), ((), "0\n")]:
        result = subprocess.run(
            [os.environ["COMSPEC"], "/d", "/c", str(isolated_launcher / "run-cirnet.bat"), *args],
            cwd=isolated_launcher, input=text, capture_output=True, text=True, timeout=30,
            env=environment, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        assert result.returncode == 0, result.stderr
        assert (MENU_PROMPT in result.stdout) == (not args)


def test_doctor_failure_reports_named_remediation_and_failure_exit(isolated_launcher):
    (isolated_launcher / "scripts/launcher/Doctor.psm1").write_text(DOCTOR_RECOMMENDATIONS + """
function Get-CirnetEnvironmentReport {
    $item = [pscustomobject]@{Name='Node.js'; Required=$true; Status='INCOMPATIBLE';
        Version='24.0.0'; Path='C:\\tools\\node.exe'; Detail='Node.js 26 is required.';
        Remediation='Install Node.js 26 LTS and select it on PATH.'}
    [pscustomobject]@{Ready=$false; Checks=@($item); MissingRequired=@($item)}
}
Export-ModuleMember -Function Get-CirnetEnvironmentReport, Get-CirnetRequiredTools
""", encoding="utf-8")
    result = launch(isolated_launcher, ("doctor",))
    assert result.returncode == 1
    assert result.stdout.index("Required tools and recommended versions") < result.stdout.index("[INCOMPATIBLE]")
    assert "26 LTS" in result.stdout and "Version: 24.0.0" in result.stdout
    assert "MISSING REQUIRED DEPENDENCIES" in result.stdout
    assert "Node.js [INCOMPATIBLE]" in result.stdout
    assert "Install Node.js 26 LTS" in result.stdout
    assert "@{Name=" not in result.stdout


def test_clean_preview_distinguishes_eligible_bytes_from_unscanned_directories(isolated_launcher):
    (isolated_launcher / "scripts/launcher/Clean.psm1").write_text("""
function Invoke-CirnetClean {
    param($RepositoryRoot, [switch]$Preview)
    $rows = @(
        [pscustomobject]@{Path='cache.cpython-312.pyc';Status='Eligible';Files=1;Bytes=7;Reason='Generated cache.'},
        [pscustomobject]@{Path='node_modules';Status='Skipped';Files=0;Bytes=0;Reason='Protected dependencies.'})
    [pscustomobject]@{Results=$rows;Deleted=0;Skipped=1;Failed=0;Bytes=0;Files=0;Preview=$true}
}
Export-ModuleMember -Function Invoke-CirnetClean
""", encoding="utf-8")
    result = launch(isolated_launcher, ("clean", "-Preview"))
    assert result.returncode == 0, result.stderr
    assert "Eligible files: 1 | Eligible bytes: 7" in result.stdout
    assert "Protected dependencies. (0 files, 0 bytes)" not in result.stdout


HOSTS = [PS_EXECUTABLE] + ([Path(shutil.which("pwsh.exe"))] if shutil.which("pwsh.exe") else [])


@pytest.fixture(scope="module")
def versioned_python_executable(tmp_path_factory):
    """Execute the launcher's real version expression with a controlled Python version."""
    directory = tmp_path_factory.mktemp("launcher-python-probe")
    bridge = directory / "probe.py"
    bridge.write_text(
        "import os, sys\n"
        "sys.version_info = tuple(map(int, os.environ['CIRNET_TEST_PYTHON_VERSION'].split('.')))\n"
        "exec(os.environ['CIRNET_TEST_PROBE_CODE'])\n", encoding="utf-8",
    )
    source = directory / "Probe.cs"
    source.write_text(r'''
using System;
using System.Diagnostics;
using System.IO;
public class Probe {
    public static int Main(string[] args) {
        File.AppendAllText(Environment.GetEnvironmentVariable("CIRNET_TEST_PYTHON_CALLS"), String.Join("\t", args) + "\n");
        int code = Array.IndexOf(args, "-c");
        if (code >= 0 && code + 1 < args.Length && args[code + 1].Contains("sys.version_info")) {
            ProcessStartInfo info = new ProcessStartInfo(Environment.GetEnvironmentVariable("CIRNET_TEST_REAL_PYTHON"));
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.Arguments = "-I -S -B \"" + Environment.GetEnvironmentVariable("CIRNET_TEST_PYTHON_BRIDGE") + "\"";
            info.EnvironmentVariables["CIRNET_TEST_PROBE_CODE"] = args[code + 1];
            using (Process child = Process.Start(info)) { child.WaitForExit(); return child.ExitCode; }
        }
        Console.Error.WriteLine("Fixture stopped before environment creation, package installation or service startup.");
        return 73;
    }
}
''', encoding="utf-8")
    executable = directory / "python.exe"
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    result = run_ps(
        f"Add-Type -Path {quote(source)} -OutputAssembly {quote(executable)} -OutputType ConsoleApplication",
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    return executable, bridge


@pytest.mark.parametrize("host", HOSTS, ids=lambda host: host.name)
@pytest.mark.parametrize("cached", [False, True], ids=["base", "cached-venv"])
@pytest.mark.parametrize("version", ["3.12.10", "3.13.12", "3.14.0", "3.14.6"])
def test_start_validates_python_before_reuse_or_install_preserving_user_data(
    isolated_launcher, tmp_path, versioned_python_executable, host, cached, version,
):
    # Removing the existing-venv version probe would let old runtimes import the
    # cached application or install packages; either call is captured below.
    executable, bridge = versioned_python_executable
    tools = tmp_path / "tools"
    tools.mkdir()
    for name in ("python.exe", "git.exe", "node.exe"):
        shutil.copy2(executable, tools / name)
    (tools / "npm.cmd").write_text("@exit /b 73\n", encoding="ascii")
    manifest = isolated_launcher / "integration/release-set.json"
    manifest.parent.mkdir()
    manifest.write_text("{}", encoding="utf-8")
    dev = tmp_path / "dev"
    dev.mkdir()
    database = dev / "database.sqlite3"
    database.write_bytes(b"retained database")
    capture = dev / "captures/evidence.ncap"
    capture.parent.mkdir()
    capture.write_bytes(b"retained capture")
    if cached:
        python = dev / ".venv-0.1.4/Scripts/python.exe"
        python.parent.mkdir(parents=True)
        shutil.copy2(executable, python)
        # Deliberately claim a compatible version: the actual interpreter must
        # decide readiness rather than trusting editable configuration text.
        (dev / ".venv-0.1.4/pyvenv.cfg").write_text("version = 3.14.6\n", encoding="utf-8")
        session = dev / "retained-session"
        vite = session / "interface/node_modules/vite/bin/vite.js"
        vite.parent.mkdir(parents=True)
        vite.write_text("", encoding="utf-8")
        (session / ".cirnet-artifact-session.json").write_text("{}", encoding="utf-8")
        environment_file = session / "environment.json"
        environment_file.write_text(json.dumps({"python": str(python), "environment": {
            "CIRNET_INTERFACE_ROOT": str(session / "interface"), "CIRNET_ARTIFACTS_SESSION": str(session),
        }}), encoding="utf-8")
        (dev / "launcher-state-0.1.4.json").write_text(json.dumps({
            "repo": str(isolated_launcher), "manifestHash": hashlib.sha256(manifest.read_bytes()).hexdigest(),
            "environmentFile": str(environment_file),
        }), encoding="utf-8")
    calls = tmp_path / "python-calls.txt"
    result = launch(isolated_launcher, ("start", "-NoColor", "-NoAnimation"), host=host, env={
        "PATH": str(tools), "CIRNET_DEV_HOME": str(dev),
        "CIRNET_TEST_REAL_PYTHON": sys.executable, "CIRNET_TEST_PYTHON_BRIDGE": str(bridge),
        "CIRNET_TEST_PYTHON_VERSION": version, "CIRNET_TEST_PYTHON_CALLS": str(calls),
    })
    assert result.returncode == 1, result.stdout + result.stderr
    recorded = calls.read_text(encoding="utf-8")
    if version.startswith(("3.12.", "3.13.")):
        assert "Python 3.14" in result.stderr, result.stderr
        assert all("sys.version_info" in line for line in recorded.splitlines()), recorded
        if cached:
            assert "recreate only" in result.stderr
            assert "databases and captures" in result.stderr
            assert python.read_bytes() == executable.read_bytes()
    else:
        # A compatible interpreter reaches the next boundary, whose executable
        # fixture deliberately refuses creation/installation without network use.
        assert "Release setup failed" in result.stderr if cached else "Could not create the Python environment" in result.stderr
        assert "Fixture stopped" in result.stderr
    assert database.read_bytes() == b"retained database"
    assert capture.read_bytes() == b"retained capture"


@pytest.mark.parametrize("host", HOSTS, ids=lambda host: host.name)
@pytest.mark.parametrize("flags", [("-NoColor",), ("-NoAnimation",), ("-NoColor", "-NoAnimation")])
def test_presentation_flags_keep_menu_and_direct_action_contract(isolated_launcher, tmp_path, host, flags):
    dev = tmp_path / "unused-dev"
    menu = launch(isolated_launcher, flags, text="0\n", env={"CIRNET_DEV_HOME": str(dev)}, host=host)
    assert menu.returncode == 0, menu.stderr
    assert MENU_PROMPT in menu.stdout
    assert not dev.exists()
    direct = launch(isolated_launcher, ("doctor", *flags), host=host)
    assert direct.returncode == 0, direct.stderr
    assert "READY FOR LOCAL SIMULATION" in direct.stdout
    assert MENU_PROMPT not in direct.stdout
    assert "\x1b" not in menu.stdout + direct.stdout
    assert "\b" not in menu.stdout + direct.stdout


@pytest.mark.parametrize("host", HOSTS, ids=lambda host: host.name)
def test_doctor_summarizes_readiness_and_points_to_fpga_workflow(isolated_launcher, host):
    (isolated_launcher / "scripts/launcher/Doctor.psm1").write_text(DOCTOR_RECOMMENDATIONS + """
function Get-CirnetEnvironmentReport {
    $checks = @(
        [pscustomobject]@{Name='Git'; Required=$true; Status='INSTALLED'; Version='2.48.0';
            Path='C:\\tools\\git.exe'; Detail='Version checked.'; Remediation=''})
    [pscustomobject]@{Ready=$true; Checks=$checks; MissingRequired=@()}
}
Export-ModuleMember -Function Get-CirnetEnvironmentReport, Get-CirnetRequiredTools
""", encoding="utf-8")
    result = launch(isolated_launcher, ("doctor",), host=host, env={"NO_COLOR": "1", "TERM": "dumb"})
    assert result.returncode == 0, result.stderr
    for text in ("ENVIRONMENT DOCTOR", "Required ready: 1/1", "FPGA development",
                 "CIRNET-FPGA", "READY FOR LOCAL SIMULATION"):
        assert text in result.stdout
    assert "Optional installed" not in result.stdout
    assert "MISSING REQUIRED DEPENDENCIES" not in result.stdout
    assert "\x1b" not in result.stdout + result.stderr


def test_clean_preview_keeps_exact_counts_and_adds_readable_sizes(isolated_launcher):
    (isolated_launcher / "scripts/launcher/Clean.psm1").write_text("""
function Invoke-CirnetClean {
    param($RepositoryRoot, [switch]$Preview)
    $row=[pscustomobject]@{Path='cache.cpython-312.pyc';Status='Eligible';Files=1;Bytes=1024;Reason='Generated cache.'}
    [pscustomobject]@{Results=@($row);Deleted=0;Skipped=0;Failed=0;Bytes=0;Files=0;Preview=$true}
}
Export-ModuleMember -Function Invoke-CirnetClean
""", encoding="utf-8")
    result = launch(isolated_launcher, ("clean", "-Preview"))
    assert result.returncode == 0, result.stderr
    assert "CLEAN BUILD FILES" in result.stdout
    assert "Eligible files: 1 | Eligible bytes: 1024" in result.stdout
    assert "KiB" in result.stdout


@pytest.mark.parametrize("host", HOSTS, ids=lambda host: host.name)
def test_quiet_presentation_preserves_start_failure_on_stderr(isolated_launcher, tmp_path, host):
    result = launch(isolated_launcher, ("start", "-NoColor", "-NoAnimation"), host=host,
                    env={"PATH": "", "CIRNET_DEV_HOME": str(tmp_path / "dev")})
    assert result.returncode == 1
    assert "[ERROR]" in result.stderr and "git" in result.stderr.lower()
    assert "[ERROR]" not in result.stdout
    assert MENU_PROMPT not in result.stdout
    assert "\x1b" not in result.stdout + result.stderr
