import os
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.launcher.support import PS_EXECUTABLE, REPO


def launch(repo, args=(), *, text="", env=None):
    if os.name != "nt":
        pytest.skip("The batch launcher requires Windows.")
    return subprocess.run(
        [str(PS_EXECUTABLE), "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
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
    (modules / "Doctor.psm1").write_text("""
function Get-CirnetEnvironmentReport {
    [pscustomobject]@{Ready=$true; Checks=@(); MissingRequired=@()}
}
Export-ModuleMember -Function Get-CirnetEnvironmentReport
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
        "         CIRNET REMOTE LAUNCHER", "How can I help you?",
        "[1] Clean build files", "[2] Check development environment",
        "[3] Run CIRNET Remote", "[0] Exit", "Enter your choice (0-3):",
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
    assert eof.stdout.count("How can I help you?") == 1


@pytest.mark.parametrize("args", [("doctor",), ("exit",), ("clean", "-Preview")])
def test_explicit_actions_never_show_a_menu(isolated_launcher, args):
    result = launch(isolated_launcher, args)
    assert result.returncode == 0, result.stderr
    assert "How can I help you?" not in result.stdout


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
    assert "How can I help you?" not in result.stdout
    assert "git" in result.stderr.lower()


@pytest.mark.parametrize("choice", ["3", "start"])
def test_menu_run_reaches_the_existing_start_path(isolated_launcher, tmp_path, choice):
    result = launch(isolated_launcher, text=choice + "\n",
                    env={"PATH": "", "CIRNET_DEV_HOME": str(tmp_path / "dev")})
    assert result.returncode == 1
    assert result.stdout.count("How can I help you?") == 1
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
        assert ("How can I help you?" in result.stdout) == (not args)


def test_doctor_failure_reports_named_remediation_and_failure_exit(isolated_launcher):
    (isolated_launcher / "scripts/launcher/Doctor.psm1").write_text("""
function Get-CirnetEnvironmentReport {
    $item = [pscustomobject]@{Name='Node.js'; Required=$true; Status='INCOMPATIBLE';
        Version='24.0.0'; Path='C:\\tools\\node.exe'; Detail='Node.js 22 is required.';
        Remediation='Install Node.js 22 and select it on PATH.'}
    [pscustomobject]@{Ready=$false; Checks=@($item); MissingRequired=@($item)}
}
Export-ModuleMember -Function Get-CirnetEnvironmentReport
""", encoding="utf-8")
    result = launch(isolated_launcher, ("doctor",))
    assert result.returncode == 1
    assert "MISSING REQUIRED DEPENDENCIES" in result.stdout
    assert "Node.js [INCOMPATIBLE]" in result.stdout
    assert "Install Node.js 22" in result.stdout
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
