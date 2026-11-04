import json
from tests.launcher.support import REPO, run_ps


def test_runtime_configuration_preserves_stop_identity_and_rejects_repository_state(tmp_path):
    script = r"""
Import-Module ./scripts/launcher/Common.psm1 -Force
$config = Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $env:TEST_DEV
$same = Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $env:TEST_DEV.ToUpperInvariant()
if ($same.SignalName -ne $config.SignalName) { throw 'Stop identity changed with path casing.' }
foreach ($bad in @($env:TEST_REPO, (Join-Path $env:TEST_REPO 'child'), 'C:\')) {
    $rejected = $false
    try { Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $bad | Out-Null }
    catch { $rejected = $true }
    if (-not $rejected) { throw 'Unsafe development home was accepted.' }
}
$config | ConvertTo-Json -Compress
"""
    result = run_ps(script, env={"TEST_REPO": str(REPO), "TEST_DEV": str(tmp_path / "dev")})
    assert result.returncode == 0, result.stderr
    config = json.loads(result.stdout)
    assert config["DevHome"] == str(tmp_path / "dev")
    assert config["SignalName"].startswith("Local\\CIRNET-Stop-")
    assert not (tmp_path / "dev").exists()


def test_activity_does_not_create_state_and_detects_an_exclusive_launcher_lock(tmp_path):
    script = r"""
Import-Module ./scripts/launcher/Common.psm1 -Force
$config = Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $env:TEST_DEV
if ((Get-CirnetLauncherActivity -Configuration $config).Status -ne 'Stopped') { throw 'Missing state is not stopped.' }
if (Test-Path -LiteralPath $config.DevHome) { throw 'Read-only inspection created development state.' }
[IO.Directory]::CreateDirectory($config.DevHome) | Out-Null
$lock = [IO.File]::Open($config.LockPath, 'OpenOrCreate', 'ReadWrite', 'None')
try {
    if ((Get-CirnetLauncherActivity -Configuration $config).Status -ne 'Running') { throw 'Exclusive lock was missed.' }
} finally { $lock.Dispose() }
if ((Get-CirnetLauncherActivity -Configuration $config).Status -ne 'Stopped') { throw 'Released lock was misreported.' }
"""
    result = run_ps(script, env={"TEST_REPO": str(REPO), "TEST_DEV": str(tmp_path / "dev")})
    assert result.returncode == 0, result.stderr


def test_port_check_detects_listener_and_release():
    script = r"""
Import-Module ./scripts/launcher/Common.psm1 -Force
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
try {
    if ((Get-CirnetPortStatus -Port $port).Status -ne 'InUse') { throw 'Listening port was reported free.' }
} finally { $listener.Stop() }
if ((Get-CirnetPortStatus -Port $port).Status -ne 'Available') { throw 'Released port was reported busy.' }
"""
    result = run_ps(script)
    assert result.returncode == 0, result.stderr


def test_maintenance_mutex_blocks_another_process_without_creating_dev_home(tmp_path):
    script = r"""
Import-Module ./scripts/launcher/Common.psm1 -Force
$config = Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $env:TEST_DEV
$mutex = Enter-CirnetMaintenance -Configuration $config
try {
    $command = "Import-Module '$env:TEST_REPO/scripts/launcher/Common.psm1'; " +
        "try { Enter-CirnetMaintenance -Configuration (Get-CirnetRuntimeConfiguration -RepositoryRoot '$env:TEST_REPO' -DevHome '$env:TEST_DEV'); exit 8 } catch { exit 0 }"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $command
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent maintenance was accepted.' }
    if (Test-Path -LiteralPath $config.DevHome) { throw 'Maintenance created development state.' }
} finally { Exit-CirnetMaintenance -Mutex $mutex }
$again = Enter-CirnetMaintenance -Configuration $config
Exit-CirnetMaintenance -Mutex $again
"""
    result = run_ps(script, env={"TEST_REPO": str(REPO), "TEST_DEV": str(tmp_path / "dev")})
    assert result.returncode == 0, result.stderr


def test_invalid_lock_location_is_unknown(tmp_path):
    script = r"""
Import-Module ./scripts/launcher/Common.psm1 -Force
$config = Get-CirnetRuntimeConfiguration -RepositoryRoot $env:TEST_REPO -DevHome $env:TEST_DEV
[IO.Directory]::CreateDirectory($config.LockPath) | Out-Null
if ((Get-CirnetLauncherActivity -Configuration $config).Status -ne 'Unknown') {
    throw 'Invalid lock state must prevent cleanup.'
}
"""
    result = run_ps(script, env={"TEST_REPO": str(REPO), "TEST_DEV": str(tmp_path / "dev")})
    assert result.returncode == 0, result.stderr
