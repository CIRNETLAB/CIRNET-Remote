"""Exercise the cleanup boundary in real Windows PowerShell 5.1."""

import json
from pathlib import Path
import stat
import subprocess

import pytest

from .support import REPO, run_ps


def ps_literal(value: Path | str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


@pytest.fixture
def clean_repo(tmp_path):
    root = tmp_path / "checkout"
    for directory in (".git", "scripts", "tests", "contracts", "services/api/app", "integration"):
        (root / directory).mkdir(parents=True, exist_ok=True)
    (root / "scripts/run-cirnet.ps1").write_text("# synthetic launcher\n")
    (root / "pyproject.toml").write_text("[project]\nname = 'fixture'\n")
    (root / "integration/release-set.json").write_text("{}")
    subprocess.run(["git", "init", "--quiet", str(root)], check=True, capture_output=True)
    return root


def write(root, name, content=b"cache"):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def invoke(root, *, preview=False, setup="", activity="Stopped", port="Available", env=None):
    # OS listener/process state is tested by Common. These controlled boundary
    # responses keep destructive fixtures independent of a developer's services.
    script = f"""
$ErrorActionPreference = 'Stop'
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
$module = Get-Module Clean
& $module {{
    Set-Item Function:script:Get-CirnetLauncherActivity {{ param($Configuration) [pscustomobject]@{{Status='{activity}';Detail='Fixture activity'}} }}
    Set-Item Function:script:Get-CirnetPortStatus {{ param($Port) [pscustomobject]@{{Port=$Port;Status='{port}';Detail='Fixture listener'}} }}
}}
{setup}
Invoke-CirnetClean -RepositoryRoot {ps_literal(root)} -DevHome {ps_literal(Path(root).parent / 'dev')} {'-Preview' if preview else ''} | ConvertTo-Json -Depth 10 -Compress
"""
    result = run_ps(script, env=env)
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout.strip())


def rows(summary):
    return {Path(row["Path"]): row for row in summary["Results"]}


def test_preview_reports_exact_bytes_without_deleting(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/check.cpython-311.pyc", b"1234567")
    summary = invoke(clean_repo, preview=True)
    assert summary["Preview"] is True
    assert summary["Deleted"] == 0
    assert summary["Bytes"] == 0
    assert rows(summary)[cache]["Status"] == "Eligible"
    assert rows(summary)[cache]["Bytes"] == 7
    assert rows(summary)[cache]["Files"] == 1
    assert cache.read_bytes() == b"1234567"


def test_deletes_only_recognized_bytecode_preserving_other_cache_contents(clean_repo):
    cache = write(clean_repo, "services/api/app/__pycache__/module.cpython-311.opt-1.pyc", b"12345")
    retained = [write(clean_repo, "services/api/app/__pycache__/source.py"),
                write(clean_repo, "services/api/app/__pycache__/important.pyc"),
                write(clean_repo, "services/api/app/__pycache__/release.zip"),
                write(clean_repo, "services/api/app/build/source.py"),
                write(clean_repo, "arbitrary/build/output.bin")]
    summary = invoke(clean_repo)
    assert summary["Deleted"] == 1
    assert summary["Files"] == 1
    assert summary["Bytes"] == 5
    assert rows(summary)[cache]["Status"] == "Deleted"
    assert not cache.exists()
    assert all(path.exists() for path in retained)


def test_standard_pytest_data_is_removed_but_unrecognized_files_survive(clean_repo):
    cache = write(clean_repo, ".pytest_cache/v/cache/nodeids", b"[]")
    source = write(clean_repo, ".pytest_cache/source.py")
    artifact = write(clean_repo, ".pytest_cache/v/cache/report.json")
    summary = invoke(clean_repo)
    assert rows(summary)[cache]["Status"] == "Deleted"
    assert source.exists() and artifact.exists()


@pytest.mark.parametrize("package", ["cirnet_remote_dev", "netcircuit_remote_dev"])
def test_exact_setuptools_metadata_is_cleaned_without_removing_archives(clean_repo, package):
    metadata = write(clean_repo, f".build/metadata/{package}.egg-info/PKG-INFO", b"metadata")
    protected = [write(clean_repo, f".build/metadata/{package}.egg-info/source.py"),
                 write(clean_repo, f".build/metadata/{package}.egg-info/release.whl"),
                 write(clean_repo, ".build/contracts-tools/allocator.mjs")]
    summary = invoke(clean_repo)
    assert rows(summary)[metadata]["Status"] == "Deleted"
    assert all(path.exists() for path in protected)


def test_tracked_file_is_skipped_even_inside_recognized_cache(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    subprocess.run(["git", "-C", str(clean_repo), "add", "--force", str(cache)], check=True, capture_output=True)
    summary = invoke(clean_repo)
    assert rows(summary)[cache]["Status"] == "Skipped"
    assert cache.exists()


def test_nonascii_tracked_paths_are_protected_in_legacy_console_encoding(clean_repo):
    cache = write(clean_repo, "scripts/tập_tin/__pycache__/source.cpython-311.pyc")
    subprocess.run(["git", "-C", str(clean_repo), "add", "--force", str(cache)], check=True, capture_output=True)
    summary = invoke(clean_repo, setup="[Console]::OutputEncoding = [Text.Encoding]::GetEncoding(437)")
    assert cache.exists()
    assert summary["Deleted"] == 0


@pytest.mark.parametrize("directory", [
    "docs", ".git", "node_modules", ".venv", "venv", ".runtime", ".build/contracts-tools",
    "releases", "captures", "services/api/app/db", "services/api/app/captures",
    "scripts/node_modules", "tests/fixtures", "contracts/generated", "assets",
])
def test_protected_locations_are_never_walked_or_deleted(clean_repo, directory):
    protected = write(clean_repo, f"{directory}/__pycache__/source.cpython-311.pyc")
    summary = invoke(clean_repo)
    assert protected.exists()
    assert not any(row["Status"] == "Deleted" and Path(row["Path"]) == protected for row in summary["Results"])


@pytest.mark.parametrize("marker", ["pyvenv.cfg", "conda-meta/history"])
def test_arbitrarily_named_dependency_environment_is_not_walked(clean_repo, marker):
    write(clean_repo, f"services/api/my-python-runtime/{marker}")
    protected = write(clean_repo, "services/api/my-python-runtime/Lib/site-packages/pkg/__pycache__/valid.cpython-312.pyc")
    summary = invoke(clean_repo)
    assert protected.exists()
    assert not any(Path(row["Path"]) == protected for row in summary["Results"])


@pytest.mark.parametrize("activity,port", [("Running", "Available"), ("Unknown", "Available"),
                                           ("Stopped", "InUse"), ("Stopped", "NotVerified")])
def test_cleanup_refuses_active_or_uncertain_services(clean_repo, activity, port):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    summary = invoke(clean_repo, activity=activity, port=port)
    assert summary["Deleted"] == 0
    assert summary["Failed"] >= 1
    assert cache.exists()


def test_locked_file_reports_failed_and_is_retained(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    summary = invoke(clean_repo, setup=f"$held = [IO.File]::Open({ps_literal(cache)}, 'Open', 'ReadWrite', 'None')")
    assert rows(summary)[cache]["Status"] == "Failed"
    assert summary["Failed"] >= 1
    assert cache.exists()


def test_readonly_file_reports_access_failure_with_size(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc", b"1234")
    cache.chmod(stat.S_IREAD)
    try:
        summary = invoke(clean_repo)
        assert rows(summary)[cache]["Status"] == "Failed"
        assert rows(summary)[cache]["Bytes"] == 4
        assert cache.exists()
    finally:
        cache.chmod(stat.S_IWRITE | stat.S_IREAD)


@pytest.mark.parametrize("busy_port", [50051, 8000, 5173])
def test_every_service_port_is_checked_before_deletion(clean_repo, busy_port):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    setup = f"""
& $module {{
    Set-Item Function:script:Get-CirnetPortStatus {{
        param($Port)
        $status = 'Available'
        if ($Port -eq {busy_port}) {{ $status = 'InUse' }}
        [pscustomobject]@{{Port=$Port;Status=$status;Detail='Fixture listener'}}
    }}
}}
"""
    summary = invoke(clean_repo, setup=setup)
    assert summary["Failed"] >= 1 and summary["Deleted"] == 0
    assert str(busy_port) in summary["Results"][0]["Reason"]
    assert cache.exists()


def test_real_launcher_lock_prevents_cleanup(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    dev = clean_repo.parent / "dev"
    result = run_ps(f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
[IO.Directory]::CreateDirectory({ps_literal(dev)}) | Out-Null
$held = [IO.File]::Open({ps_literal(dev / 'launcher.lock')}, 'OpenOrCreate', 'ReadWrite', 'None')
try {{ Invoke-CirnetClean -RepositoryRoot {ps_literal(clean_repo)} -DevHome {ps_literal(dev)} | ConvertTo-Json -Depth 10 -Compress }}
finally {{ $held.Dispose() }}
""")
    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads(result.stdout)
    assert summary["Failed"] >= 1 and summary["Deleted"] == 0
    assert "Running" in summary["Results"][0]["Reason"]
    assert cache.exists()


def test_maintenance_in_another_process_prevents_cleanup(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    dev = clean_repo.parent / "dev"
    inner = f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
Invoke-CirnetClean -RepositoryRoot {ps_literal(clean_repo)} -DevHome {ps_literal(dev)} | ConvertTo-Json -Depth 10 -Compress
"""
    result = run_ps(f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Common.psm1')} -Force
$configuration = Get-CirnetRuntimeConfiguration -RepositoryRoot {ps_literal(clean_repo)} -DevHome {ps_literal(dev)}
$mutex = Enter-CirnetMaintenance -Configuration $configuration
try {{ & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command {ps_literal(inner)} }}
finally {{ Exit-CirnetMaintenance -Mutex $mutex }}
""")
    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads(result.stdout)
    assert summary["Failed"] >= 1 and summary["Deleted"] == 0
    assert cache.exists() and not dev.exists()


def test_junction_cache_is_skipped_without_following_target(clean_repo, tmp_path):
    outside = tmp_path / "outside"
    protected = write(outside, "source.cpython-311.pyc")
    junction = clean_repo / "scripts/__pycache__"
    summary = invoke(clean_repo, setup=f"New-Item -ItemType Junction -Path {ps_literal(junction)} -Target {ps_literal(outside)} | Out-Null")
    assert protected.exists()
    assert rows(summary)[junction]["Status"] == "Skipped"


def test_junction_in_repository_ancestor_is_rejected(clean_repo, tmp_path):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    alias = tmp_path / "alias"
    summary = invoke(alias / "checkout", setup=f"New-Item -ItemType Junction -Path {ps_literal(alias)} -Target {ps_literal(tmp_path)} | Out-Null")
    assert summary["Failed"] >= 1
    assert summary["Deleted"] == 0
    assert cache.exists()


def test_file_symlink_is_retained_without_deleting_its_target(clean_repo, tmp_path):
    target = write(tmp_path, "valuable.py", b"source")
    link = clean_repo / "scripts/__pycache__/source.cpython-311.pyc"
    link.parent.mkdir()
    result = run_ps(f"New-Item -ItemType SymbolicLink -Path {ps_literal(link)} -Target {ps_literal(target)} | Out-Null")
    if result.returncode != 0 and ("privilege" in result.stderr.lower() or "access is denied" in result.stderr.lower()):
        pytest.skip("This Windows account cannot create a file symlink.")
    assert result.returncode == 0, result.stderr
    summary = invoke(clean_repo)
    assert rows(summary)[link]["Status"] == "Skipped"
    assert target.read_bytes() == b"source"
    assert link.is_symlink()


def test_hardlinked_file_is_retained_with_its_source(clean_repo, tmp_path):
    target = write(tmp_path, "valuable.py", b"source")
    link = clean_repo / "scripts/__pycache__/source.cpython-311.pyc"
    link.parent.mkdir()
    result = run_ps(f"New-Item -ItemType HardLink -Path {ps_literal(link)} -Target {ps_literal(target)} | Out-Null")
    assert result.returncode == 0, result.stderr
    summary = invoke(clean_repo)
    assert rows(summary)[link]["Status"] == "Skipped"
    assert target.read_bytes() == link.read_bytes() == b"source"


def test_native_deletion_rejects_changed_file_identity(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc", b"first")
    result = run_ps(f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
$snapshot = [Cirnet.Launcher.CleanNative]::Inspect({ps_literal(cache)})
[IO.File]::WriteAllText({ps_literal(cache)}, 'changed')
$refused = $false
try {{ [Cirnet.Launcher.CleanNative]::Delete({ps_literal(cache)}, $snapshot) | Out-Null }} catch {{ $refused = $true }}
if (-not $refused) {{ throw 'Changed cache file was deleted.' }}
""")
    assert result.returncode == 0, result.stdout + result.stderr
    assert cache.read_text() == "changed"


def test_native_deletion_rejects_ancestor_replaced_after_planning(clean_repo, tmp_path):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc", b"cache")
    outside = tmp_path / "outside"
    protected = write(outside, "source.cpython-311.pyc", b"source")
    result = run_ps(f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
$snapshot = [Cirnet.Launcher.CleanNative]::Inspect({ps_literal(cache)})
[IO.Directory]::Move({ps_literal(cache.parent)}, {ps_literal(cache.parent.with_name('original'))})
New-Item -ItemType Junction -Path {ps_literal(cache.parent)} -Target {ps_literal(outside)} | Out-Null
$refused = $false
try {{ [Cirnet.Launcher.CleanNative]::Delete({ps_literal(cache)}, $snapshot) | Out-Null }} catch {{ $refused = $true }}
if (-not $refused) {{ throw 'Cleanup followed a replacement junction.' }}
""")
    assert result.returncode == 0, result.stdout + result.stderr
    assert protected.read_bytes() == b"source"


@pytest.mark.parametrize("suffix", ["/../checkout", "/scripts/.."])
def test_traversal_root_is_rejected(clean_repo, suffix):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    summary = invoke(str(clean_repo) + suffix)
    assert summary["Failed"] >= 1
    assert summary["Deleted"] == 0
    assert cache.exists()


def test_default_dev_home_subtree_is_protected(clean_repo):
    cache = write(clean_repo, "scripts/__pycache__/source.cpython-311.pyc")
    script = f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
Invoke-CirnetClean -RepositoryRoot {ps_literal(clean_repo)} -DevHome {ps_literal(clean_repo.parent)} -Preview | ConvertTo-Json -Depth 10 -Compress
"""
    result = run_ps(script)
    assert result.returncode == 0, result.stdout + result.stderr
    summary = json.loads(result.stdout)
    assert summary["Failed"] >= 1
    assert cache.exists()


def test_default_dev_home_remains_protected_when_custom_home_is_selected(clean_repo):
    profile = clean_repo.parent
    destination = profile / "CIRNET-Dev" / "checkout"
    destination.parent.mkdir()
    clean_repo.rename(destination)
    cache = write(destination, "scripts/__pycache__/source.cpython-311.pyc")
    summary = invoke(destination, preview=True, env={"USERPROFILE": str(profile)})
    assert summary["Failed"] >= 1
    assert cache.exists()


def test_get_plan_returns_structured_rows_and_does_not_mutate(clean_repo):
    cache = write(clean_repo, "tests/__pycache__/test_clean.cpython-311.pyc", b"123")
    result = run_ps(f"""
Import-Module {ps_literal(REPO / 'scripts/launcher/Clean.psm1')} -Force
@(Get-CirnetCleanPlan -RepositoryRoot {ps_literal(clean_repo)} -DevHome {ps_literal(clean_repo.parent / 'dev')}) | ConvertTo-Json -Depth 10 -Compress
""")
    assert result.returncode == 0, result.stdout + result.stderr
    plan = json.loads(result.stdout)
    if isinstance(plan, dict):
        plan = [plan]
    row = next(row for row in plan if Path(row["Path"]) == cache)
    assert row["Status"] == "Eligible"
    assert row["Bytes"] == 3 and row["Files"] == 1
    assert row["Reason"]
    assert cache.exists()
