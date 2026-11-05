"""Presentation contracts, exercised in both supported PowerShell generations."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

from tests.launcher.support import PS_EXECUTABLE, REPO


HOSTS = [pytest.param(str(PS_EXECUTABLE), id="windows-powershell")]
if shutil.which("pwsh"):
    HOSTS.append(pytest.param(shutil.which("pwsh"), id="powershell-7"))


@pytest.fixture(params=HOSTS)
def console_ps(request):
    executable = request.param
    if os.name != "nt" or not Path(executable).is_file():
        pytest.skip("A Windows PowerShell host is required.")

    def run(script, env=None):
        prelude = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Import-Module ./scripts/launcher/Console.psm1 -Force
function Use-CapturedHost {
    & (Get-Module Console) {
        function script:Write-CirnetHostText {
            param([string]$Text, [string]$Tone, [switch]$NoNewline)
            if ($NoNewline) { [Console]::Out.Write($Text) }
            else { [Console]::Out.WriteLine($Text) }
        }
    }
}
"""
        environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "NO_COLOR": "", "TERM": "", **(env or {})}
        return subprocess.run(
            [executable, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", prelude + script],
            cwd=REPO, env=environment, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    return run


def assert_success(result):
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("settings", [{}, {"NO_COLOR": "1"}, {"TERM": "dumb"}])
def test_captured_presentation_is_readable_without_terminal_controls(console_ps, settings):
    # A redirected process must never receive live cursor/color control output.
    result = console_ps(r"""
Initialize-CirnetConsole
Write-CirnetBanner
Write-CirnetSection 'Services'
foreach ($level in @('INFO','OK','WARN','ERROR')) { Write-CirnetMessage 'Readable status' -Level $level }
Start-CirnetActivity 'Waiting for API'
Update-CirnetActivity 'Waiting for API health'
Stop-CirnetActivity 'API is ready'
""", env=settings)
    assert_success(result)
    assert result.stderr == ""
    assert "CIRNET REMOTE LAUNCHER" in result.stdout
    assert "Local simulation workspace" in result.stdout
    for level in ("INFO", "OK", "WARN", "ERROR", "WORKING"):
        assert f"[{level}]" in result.stdout
    assert "Waiting for API" in result.stdout and "API is ready" in result.stdout
    assert result.stdout.isascii()
    assert all(control not in result.stdout for control in ("\x1b", "\r", "\b"))


def test_messages_do_not_contaminate_the_success_pipeline(console_ps):
    # Returning host UI text would corrupt dispatcher JSON or configuration values.
    result = console_ps(r"""
$values = @(& {
    Initialize-CirnetConsole -NoColor -NoAnimation
    Write-CirnetLine 'Plain line' -Tone Muted
    Write-CirnetMessage 'Information'
    Write-CirnetBanner 'Launcher' 'Workspace'
    Write-CirnetSection 'Section'
    Start-CirnetActivity 'Inspecting'
    Update-CirnetActivity
    Stop-CirnetActivity
})
[Console]::Out.WriteLine('PIPELINE=' + $values.Count)
""")
    assert_success(result)
    assert result.stdout.endswith("PIPELINE=0\n")
    assert result.stderr == ""


def test_error_stream_and_no_newline_survive_plain_output(console_ps):
    # Errors must remain separate from machine-readable stdout, even without color.
    result = console_ps(r"""
Initialize-CirnetConsole -NoColor
Write-CirnetLine 'left' -NoNewline
Write-CirnetLine '-right'
Write-CirnetMessage 'Cannot start API' -Level ERROR -ErrorStream
Write-CirnetLine 'Detail' -Tone Error -ErrorStream -NoNewline
""")
    assert_success(result)
    assert result.stdout == "left-right\n"
    assert result.stderr == "[ERROR] Cannot start API\nDetail"


def test_bytes_are_numeric_binary_units_independent_of_current_culture(console_ps):
    # String lengths, integer overflow and locale commas must not distort totals.
    result = console_ps(r"""
[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('fr-FR')
@((Format-CirnetBytes 0), (Format-CirnetBytes 1), (Format-CirnetBytes 1023),
  (Format-CirnetBytes 1024), (Format-CirnetBytes 1536), (Format-CirnetBytes 1048576),
  (Format-CirnetBytes 1099511627776), (Format-CirnetBytes ([long]::MaxValue))) | ConvertTo-Json -Compress
""")
    assert_success(result)
    assert json.loads(result.stdout) == ["0 B", "1 B", "1023 B", "1.0 KiB", "1.5 KiB", "1.0 MiB", "1.0 TiB", "8.0 EiB"]


@pytest.mark.parametrize("flag,environment", [
    ("-NoColor", {}), ("-NoAnimation", {}), ("", {"NO_COLOR": "1"}), ("", {"TERM": "dumb"}),
])
def test_user_controls_disable_activity_redraw_even_on_a_capable_host(console_ps, flag, environment):
    # Mock only capability detection: production presentation and Console writes remain real.
    result = console_ps(r"""
& (Get-Module Console) { function script:Get-CirnetConsoleCapabilities { @{Color=$true; Animation=$true} } }
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$writer.NewLine = "`n"
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole FLAG
    Start-CirnetActivity 'Waiting'
    Update-CirnetActivity
    Stop-CirnetActivity 'Ready'
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString()} | ConvertTo-Json -Compress
""".replace("FLAG", flag), env=environment)
    assert_success(result)
    output = json.loads(result.stdout)["Text"]
    assert "[WORKING] Waiting" in output and "[OK] Ready" in output
    assert all(control not in output for control in ("\x1b", "\r", "\b"))


def test_activity_clears_before_messages_and_stops_without_leaving_spinner_text(console_ps):
    # A short replacement and intervening log must erase the entire old activity line.
    result = console_ps(r"""
& (Get-Module Console) {
    function script:Get-CirnetConsoleCapabilities { @{Color=$false; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 40 }
}
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole
    Start-CirnetActivity ('Waiting for a service ' * 8)
    Update-CirnetActivity 'Short'
    Write-CirnetMessage 'Health checked'
    Update-CirnetActivity
    Stop-CirnetActivity
    Write-CirnetLine 'Finished'
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString()} | ConvertTo-Json -Compress
""")
    assert_success(result)
    text = json.loads(result.stdout)["Text"]
    # Interpret a terminal's carriage return and overwrite behavior, retaining spaces.
    lines, row, cursor = [], [], 0
    for char in text:
        if char == "\r":
            cursor = 0
        elif char == "\n":
            lines.append("".join(row).rstrip())
            row, cursor = [], 0
        else:
            assert cursor < 40, "Activity wrapped into an unrelated terminal line"
            if cursor == len(row):
                row.append(char)
            else:
                row[cursor] = char
            cursor += 1
    assert [line for line in lines if line] == ["[INFO] Health checked", "Finished"]
    assert "".join(row).strip() == ""


def test_capability_failure_and_terminal_resize_degrade_without_losing_messages(console_ps):
    # Missing console facilities must disable decoration rather than abort launcher work.
    result = console_ps(r"""
$module = Get-Module Console
& $module { function script:Get-CirnetConsoleCapabilities { throw 'No console API' } }
$values = @(Initialize-CirnetConsole)
Write-CirnetMessage 'Fallback works'
& $module {
    function script:Get-CirnetConsoleCapabilities { @{Color=$false; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 30 }
}
Initialize-CirnetConsole
Start-CirnetActivity 'Waiting'
& $module { function script:Get-CirnetConsoleWidth { 0 } }
Update-CirnetActivity 'Unavailable terminal'
Stop-CirnetActivity 'Ready'
if ($values.Count -ne 0) { throw 'Initialization leaked state' }
""")
    assert_success(result)
    assert "[INFO] Fallback works" in result.stdout
    assert "[OK] Ready" in result.stdout
    assert result.stderr == ""


def test_activity_cleanup_precedes_stderr_and_reinitialization(console_ps):
    # Errors and a fresh initialization must never leave an active partial line behind.
    result = console_ps(r"""
& (Get-Module Console) {
    function script:Get-CirnetConsoleCapabilities { @{Color=$true; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 60 }
}
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$writer.NewLine = "`n"
$errors = [IO.StringWriter]::new()
$errors.NewLine = "`n"
$original = [Console]::Out
$originalError = [Console]::Error
$foreground = [Console]::ForegroundColor
[Console]::SetOut($writer)
[Console]::SetError($errors)
try {
    Initialize-CirnetConsole
    Start-CirnetActivity 'Connecting'
    Write-CirnetMessage 'Connection refused' -Level ERROR -ErrorStream
    $afterError = $writer.ToString()
    Update-CirnetActivity
    Initialize-CirnetConsole -NoColor
    Update-CirnetActivity
    Stop-CirnetActivity
    Stop-CirnetActivity
} finally {
    [Console]::SetOut($original)
    [Console]::SetError($originalError)
}
@{Text=$writer.ToString(); BeforeError=$afterError; Errors=$errors.ToString();
  ForegroundRestored=([Console]::ForegroundColor -eq $foreground)} | ConvertTo-Json -Compress
""")
    assert_success(result)
    data = json.loads(result.stdout)
    assert data["Errors"] == "[ERROR] Connection refused\n"
    assert data["ForegroundRestored"] is True
    assert data["BeforeError"].endswith("\r" + " " * len("[|] Connecting") + "\r")
    assert data["Text"].endswith("\r" + " " * len("[/] Connecting") + "\r")
    assert result.stderr == ""


def test_input_redirection_uses_static_activity_with_terminal_output(console_ps):
    # Piped menu input must not receive animation even if stdout is a console.
    result = console_ps(r"""
& (Get-Module Console) {
    function script:Get-CirnetConsoleRedirection { @{Input=$true; Output=$false; Error=$false} }
    function script:Get-CirnetConsoleWidth { 60 }
}
$capabilities = & (Get-Module Console) { Get-CirnetConsoleCapabilities }
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$writer.NewLine = "`n"
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole
    Start-CirnetActivity 'Waiting'
    Update-CirnetActivity
    Stop-CirnetActivity 'Ready'
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString(); Color=$capabilities.Color} | ConvertTo-Json -Compress
""")
    assert_success(result)
    data = json.loads(result.stdout)
    assert data["Color"] is True
    text = data["Text"]
    assert text == "[WORKING] Waiting\n[OK] Ready\n"


def test_width_loss_after_active_frame_starts_new_line_without_blind_erasing(console_ps):
    # Unknown width cannot safely erase an old long frame with spaces or carriage returns.
    result = console_ps(r"""
$module = Get-Module Console
& $module {
    function script:Get-CirnetConsoleCapabilities { @{Color=$false; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 80 }
}
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$writer.NewLine = "`n"
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole
    Start-CirnetActivity ('Waiting ' * 20)
    $writer.GetStringBuilder().Clear() | Out-Null
    & $module { function script:Get-CirnetConsoleWidth { 0 } }
    Update-CirnetActivity 'Terminal unavailable'
    Update-CirnetActivity
    Stop-CirnetActivity 'Ready'
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString()} | ConvertTo-Json -Compress
""")
    assert_success(result)
    assert json.loads(result.stdout)["Text"] == "\n[WORKING] Terminal unavailable\n[OK] Ready\n"


def test_spinner_frames_keep_the_same_single_glyph_prefix(console_ps):
    # A two-character backslash frame shifts the readiness text and causes flicker.
    result = console_ps(r"""
& (Get-Module Console) {
    function script:Get-CirnetConsoleCapabilities { @{Color=$false; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 60 }
}
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole
    Start-CirnetActivity 'Waiting'
    Update-CirnetActivity
    Update-CirnetActivity
    Update-CirnetActivity
    Stop-CirnetActivity
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString()} | ConvertTo-Json -Compress
""")
    assert_success(result)
    frames = [part for part in json.loads(result.stdout)["Text"].split("\r") if part.strip()]
    assert frames == ["[|] Waiting", "[/] Waiting", "[-] Waiting", "[\\] Waiting"]


def test_closed_output_and_failed_host_fallback_do_not_interrupt_cleanup(console_ps):
    # A failed presentation channel must not replace the launcher's actual failure.
    result = console_ps(r"""
& (Get-Module Console) { function script:Write-Host { throw 'Host output unavailable' } }
$writer = [IO.StringWriter]::new()
$writer.Dispose()
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole -NoColor
    Write-CirnetLine 'Original diagnostic'
    Start-CirnetActivity 'Cleanup'
    Stop-CirnetActivity 'Stopped'
} finally { [Console]::SetOut($original) }
[Console]::Out.WriteLine('Cleanup completed')
""")
    assert_success(result)
    assert result.stdout == "Cleanup completed\n"
    assert result.stderr == ""


@pytest.mark.parametrize("action", ["Update-CirnetActivity", "Stop-CirnetActivity 'Ready'"])
def test_resize_preserves_complete_old_frame_and_switches_to_static_output(console_ps, action):
    # Reflowed activity may occupy multiple rows; erasing any tail would orphan its first row.
    result = console_ps(r"""
$module = Get-Module Console
& $module {
    function script:Get-CirnetConsoleCapabilities { @{Color=$false; Animation=$true} }
    function script:Get-CirnetConsoleWidth { 120 }
}
Use-CapturedHost
$writer = [IO.StringWriter]::new()
$writer.NewLine = "`n"
$original = [Console]::Out
[Console]::SetOut($writer)
try {
    Initialize-CirnetConsole
    Write-CirnetLine 'Earlier log entry'
    Start-CirnetActivity 'Waiting for readiness across API, worker and simulator endpoints'
    & $module { function script:Get-CirnetConsoleWidth { 40 } }
    ACTION
    Update-CirnetActivity
    Stop-CirnetActivity
    Start-CirnetActivity 'Next check'
    Update-CirnetActivity
    Stop-CirnetActivity 'Finished'
} finally { [Console]::SetOut($original) }
@{Text=$writer.ToString()} | ConvertTo-Json -Compress
""".replace("ACTION", action))
    assert_success(result)
    text = json.loads(result.stdout)["Text"]
    expected = "Earlier log entry\n[|] Waiting for readiness across API, worker and simulator endpoints\n"
    if action == "Update-CirnetActivity":
        expected += "[WORKING] Waiting for readiness across API, worker and simulator endpoints\n"
    else:
        expected += "[OK] Ready\n"
    expected += "[WORKING] Next check\n[OK] Finished\n"
    assert text == expected
    assert result.stderr == ""


def test_unicode_stdout_uses_host_instead_of_legacy_console_encoding(console_ps):
    # Console.Out's OEM writer cannot represent Vietnamese user profile paths.
    result = console_ps(r"""
$hostCapture = [IO.StringWriter]::new()
$hostCapture.NewLine = "`n"
& (Get-Module Console) {
    $script:HostCapture = $args[0]
    function script:Write-CirnetHostText {
        param([string]$Text, [string]$Tone, [switch]$NoNewline)
        if ($NoNewline) { $script:HostCapture.Write($Text) }
        else { $script:HostCapture.WriteLine($Text) }
    }
} $hostCapture
$bytes = [IO.MemoryStream]::new()
$legacyWriter = [IO.StreamWriter]::new($bytes, [Text.Encoding]::GetEncoding(437))
$original = [Console]::Out
[Console]::SetOut($legacyWriter)
try {
    Initialize-CirnetConsole -NoColor
    $name = 'Tr' + [char]0x1EA7 + 'n'
    Write-CirnetLine ('Path C:\Users\' + $name + '\workspace')
    $legacyWriter.Flush()
} finally { [Console]::SetOut($original) }
@{TextUtf8=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($hostCapture.ToString()));
  LegacyBytes=$bytes.Length} | ConvertTo-Json -Compress
""")
    assert_success(result)
    data = json.loads(result.stdout)
    assert base64.b64decode(data["TextUtf8"]).decode("utf-8") == "Path C:\\Users\\Trần\\workspace\n"
    assert data["LegacyBytes"] == 0
    assert result.stderr == ""
