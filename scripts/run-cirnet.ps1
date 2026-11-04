param(
    [Parameter(Position = 0)]
    [string]$Action,
    [switch]$Check,
    [switch]$NoBrowser,
    [Alias('DryRun', 'WhatIf')][switch]$Preview,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'launcher\Common.psm1') -Force

function Read-CirnetInput([string]$Prompt) {
    if ([Console]::IsInputRedirected) {
        Write-Host $Prompt -NoNewline
        return [Console]::In.ReadLine()
    }
    Read-Host $Prompt.TrimEnd(':', ' ')
}

function ConvertTo-CirnetAction([string]$Value) {
    switch ($Value.Trim().ToLowerInvariant()) {
        { $_ -in '1', 'clean' } { return 'clean' }
        { $_ -in '2', 'doctor' } { return 'doctor' }
        { $_ -in '3', 'start' } { return 'start' }
        { $_ -in '0', 'exit' } { return 'exit' }
        'stop' { return 'stop' }
        default { return '' }
    }
}

function Show-CirnetCleanResult($Report) {
    if ($Report.Preview) { Write-Host '[INFO] Cleanup preview.' }
    foreach ($row in $Report.Results) {
        Write-Host "[$($row.Status)] $($row.Path)"
        if ($row.Files -gt 0) {
            Write-Host "    $($row.Reason) ($($row.Files) files, $($row.Bytes) bytes)"
        } else { Write-Host "    $($row.Reason)" }
    }
    if ($Report.Preview) {
        $eligible = @($Report.Results | Where-Object Status -eq 'Eligible')
        $files = ($eligible | Measure-Object -Property Files -Sum).Sum
        $bytes = ($eligible | Measure-Object -Property Bytes -Sum).Sum
        Write-Host "Eligible files: $([long]$files) | Eligible bytes: $([long]$bytes)"
    }
    Write-Host "Deleted: $($Report.Deleted) | Skipped: $($Report.Skipped) | Failed: $($Report.Failed)"
    Write-Host "Deleted files: $($Report.Files) | Reclaimed bytes: $($Report.Bytes)"
}

function Invoke-CirnetLauncherClean {
    Import-Module (Join-Path $PSScriptRoot 'launcher\Clean.psm1') -Force
    $plan = Invoke-CirnetClean -RepositoryRoot $repo -Preview
    Show-CirnetCleanResult $plan
    if ($Preview) { return ($plan.Failed -eq 0) }
    if (-not $Yes) {
        $answer = Read-CirnetInput 'Delete the eligible build and cache files? [y/N]: '
        if ($null -eq $answer -or $answer.Trim().ToLowerInvariant() -notin @('y', 'yes')) {
            Write-Host '[INFO] Cleanup cancelled.'
            return $true
        }
    }
    $report = Invoke-CirnetClean -RepositoryRoot $repo
    Show-CirnetCleanResult $report
    return ($report.Failed -eq 0)
}

function Invoke-CirnetLauncherDoctor {
    Import-Module (Join-Path $PSScriptRoot 'launcher\Doctor.psm1') -Force
    $report = Get-CirnetEnvironmentReport -RepositoryRoot $repo
    foreach ($required in @($true, $false)) {
        if ($required) { Write-Host 'Required tools and runtime' }
        else { Write-Host 'Optional native and FPGA tools' }
        foreach ($item in @($report.Checks | Where-Object { $_.Required -eq $required })) {
            Write-Host "[$($item.Status)] $($item.Name)"
            if ($item.Version) { Write-Host "    Version: $($item.Version)" }
            if ($item.Path) { Write-Host "    Path: $($item.Path)" }
            if ($item.Detail) { Write-Host "    $($item.Detail)" }
            if ($item.Remediation -and $item.Status -ne 'INSTALLED') {
                Write-Host "    Action: $($item.Remediation)"
            }
        }
    }
    if ($report.Ready) { Write-Host 'READY FOR LOCAL SIMULATION' }
    else {
        Write-Host 'MISSING REQUIRED DEPENDENCIES'
        foreach ($item in $report.MissingRequired) { Write-Host "    $($item.Name) [$($item.Status)]" }
    }
    return [bool]$report.Ready
}

function Show-CirnetLauncherMenu {
    while ($true) {
        Write-Host @'
========================================
         CIRNET REMOTE LAUNCHER
========================================

How can I help you?

[1] Clean build files
[2] Check development environment
[3] Run CIRNET Remote
[0] Exit

'@
        $choice = Read-CirnetInput 'Enter your choice (0-3): '
        if ($null -eq $choice) { return 'exit' }
        $selected = ConvertTo-CirnetAction $choice
        try {
            switch ($selected) {
                'clean' { Invoke-CirnetLauncherClean | Out-Null }
                'doctor' { Invoke-CirnetLauncherDoctor | Out-Null }
                'start' { return 'start' }
                'stop' { return 'stop' }
                'exit' { return 'exit' }
                default { Write-Host '[WARN] Invalid choice. Enter 0-3, clean, doctor, start, or exit.' }
            }
        } catch {
            [Console]::Error.WriteLine("[ERROR] $($_.Exception.Message)")
        }
        Write-Host ''
    }
}

try {
    if ($PSBoundParameters.Count -eq 0) { $Action = Show-CirnetLauncherMenu }
    elseif (-not $Action) { $Action = 'start' }
    else { $Action = ConvertTo-CirnetAction $Action }
    if (-not $Action) { throw 'Unknown action. Use clean, doctor, start, stop, or exit.' }
    if (($Preview -or $Yes) -and $Action -ne 'clean') { throw 'Use -Preview or -Yes with the clean action.' }
    switch ($Action) {
        'clean' { if (Invoke-CirnetLauncherClean) { exit 0 }; exit 1 }
        'doctor' { if (Invoke-CirnetLauncherDoctor) { exit 0 }; exit 1 }
        'exit' { Write-Host '[INFO] Goodbye.'; exit 0 }
    }
} catch {
    [Console]::Error.WriteLine("[ERROR] $($_.Exception.Message)")
    exit 1
}

$children = @()
$launcherLock = $null
$maintenance = $null
$stopSignal = $null
$savedControlMode = $null
$readConsoleKeys = $false
$logDir = $null
$result = 0

function Get-Sha256([byte[]]$bytes) {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha256.ComputeHash($bytes)) }
    finally { $sha256.Dispose() }
}

function Import-ProcessEnvironment($values) {
    foreach ($item in $values.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable($item.Name, [string]$item.Value, 'Process')
    }
}

function Test-ApiHealth($url) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    $health = $response.Content | ConvertFrom-Json
    return $health.status -eq 'ok' -and $health.hardware_mode -eq 'simulation'
}

function Test-StopRequested {
    if ($stopSignal.WaitOne(0)) { return $true }
    if ($readConsoleKeys) {
        try {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                if ($key.Key -eq [ConsoleKey]::Enter -or $key.KeyChar -eq [char]3) {
                    [void]$stopSignal.Set()
                    return $true
                }
            }
        } catch [IO.IOException], [InvalidOperationException] {
            $script:readConsoleKeys = $false
        }
    }
    return $false
}

function Wait-Ready($process, [string]$name, [scriptblock]$probe) {
    $deadline = (Get-Date).AddSeconds(60)
    do {
        if (Test-StopRequested) { throw [OperationCanceledException]::new() }
        if ($process.HasExited) { throw "$name exited during startup (exit code $($process.ExitCode))." }
        try {
            if (& $probe) { return }
        } catch {
            # The listener may still be starting.
        }
    } while (-not $stopSignal.WaitOne(300) -and (Get-Date) -lt $deadline)
    if (Test-StopRequested) { throw [OperationCanceledException]::new() }
    throw "Timed out waiting 60 seconds for $name to become ready."
}

function Start-ServiceProcess($exe, $arguments, $directory, $name) {
    $options = @{
        FilePath = $exe
        ArgumentList = $arguments
        WorkingDirectory = $directory
        WindowStyle = 'Hidden'
        PassThru = $true
        RedirectStandardInput = $serviceInput
        RedirectStandardOutput = (Join-Path $logDir "$name.out.log")
        RedirectStandardError = (Join-Path $logDir "$name.err.log")
    }
    Start-Process @options
}

try {
    Set-Location -LiteralPath $repo
    $configuration = Get-CirnetRuntimeConfiguration -RepositoryRoot $repo
    $dev = $configuration.DevHome
    $lockPath = $configuration.LockPath
    $signalName = $configuration.SignalName
    if ($Action -eq 'stop') {
        try { $stopSignal = [Threading.EventWaitHandle]::OpenExisting($signalName) }
        catch [Threading.WaitHandleCannotBeOpenedException] {
            Write-Host '[INFO] No active CIRNET launcher was found.'
            exit 0
        }
        [void]$stopSignal.Set()
        $stopSignal.Dispose()
        $stopSignal = $null
        $deadline = (Get-Date).AddSeconds(20)
        do {
            try {
                $lock = [IO.File]::Open($lockPath, 'Open', 'ReadWrite', 'None')
                $lock.Dispose()
                Write-Host '[OK] CIRNET launcher has stopped.'
                exit 0
            } catch [IO.IOException] {
                Start-Sleep -Milliseconds 200
            }
        } while ((Get-Date) -lt $deadline)
        throw 'A stop request was sent, but the launcher did not exit within 20 seconds. Check the launcher window for details.'
    }

    $maintenance = Enter-CirnetMaintenance -Configuration $configuration
    Get-Command git.exe -CommandType Application | Out-Null
    $node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
    $npm = (Get-Command npm.cmd -CommandType Application | Select-Object -First 1).Source
    $manifest = Join-Path $repo 'integration\release-set.json'
    try {
        Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json | Out-Null
    } catch {
        throw "Could not load the JSON release manifest at '$manifest'. $($_.Exception.Message)"
    }
    $manifestHash = Get-Sha256 ([IO.File]::ReadAllBytes($manifest))
    New-Item -ItemType Directory -Path $dev -Force | Out-Null
    $launcherLock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    $stopSignal = [Threading.EventWaitHandle]::new($false, 'ManualReset', $signalName)

    foreach ($port in @(50051, 8000, 5173)) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try { $listener.Start() }
        catch {
            throw "Could not bind to 127.0.0.1 on port $port. Check whether another process is using the port. $($_.Exception.GetBaseException().Message)"
        }
        finally { $listener.Stop() }
    }

    $python = Join-Path $dev '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        $basePython = (Get-Command python.exe -CommandType Application | Select-Object -First 1).Source
        & $basePython -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 or newer is required. Install it and make sure python.exe is on PATH.' }
        & $basePython -m venv (Join-Path $dev '.venv')
        if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment in '$dev' (exit code $LASTEXITCODE)." }
    }

    $env:NETCIRCUIT_ARTIFACTS_DIR = $dev
    Remove-Item Env:NETCIRCUIT_ARTIFACTS_SESSION,Env:NETCIRCUIT_ARTIFACTS_CONTEXT -ErrorAction SilentlyContinue

    $cacheFile = Join-Path $dev 'launcher-state.json'
    $state = $null
    if (Test-Path -LiteralPath $cacheFile -PathType Leaf) {
        try {
            $cached = Get-Content -LiteralPath $cacheFile -Raw | ConvertFrom-Json
            if ($cached.manifestHash -eq $manifestHash -and $cached.repo -eq $repo) {
                $saved = Get-Content -LiteralPath $cached.environmentFile -Raw | ConvertFrom-Json
                $vite = Join-Path $saved.environment.NETCIRCUIT_INTERFACE_ROOT 'node_modules\vite\bin\vite.js'
                $sessionMarker = Join-Path $saved.environment.NETCIRCUIT_ARTIFACTS_SESSION '.netcircuit-artifact-session.json'
                if ($saved.python -eq $python -and (Test-Path -LiteralPath $vite -PathType Leaf) -and
                    (Test-Path -LiteralPath $sessionMarker -PathType Leaf)) {
                    & $python -I -B -c 'import uvicorn, hardware_service.server, netcircuit_sim, contracts' 2>$null
                    if ($LASTEXITCODE -eq 0) { $state = $saved }
                }
            }
        } catch {
            Write-Host '[WARN] Saved setup could not be loaded. Reinstalling dependencies.'
        }
    }

    if (-not $state) {
        Write-Host '[1/4] Installing pinned Python dependencies and downloading CIRNET-Interface. This can take several minutes.'
        $summaryJson = & $python -B scripts/install_release.py --manifest $manifest --environment-file release-env.json
        if ($LASTEXITCODE -ne 0) {
            throw "Release setup failed (exit code $LASTEXITCODE). Check the installer output and the latest system-release logs under '$dev'."
        }
        $summary = $summaryJson | ConvertFrom-Json
        $state = Get-Content -LiteralPath $summary.environmentFile -Raw | ConvertFrom-Json
        Import-ProcessEnvironment $state.environment
        Import-ProcessEnvironment $state.processEnvironment

        Write-Host '[2/4] Preparing Contracts and installing Web dependencies.'
        Push-Location -LiteralPath $env:NETCIRCUIT_INTERFACE_ROOT
        try {
            $bootstrapJson = & $node scripts/bootstrap-contracts.mjs --manifest $env:NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST
            if ($LASTEXITCODE -ne 0) { throw "Could not prepare Contracts for CIRNET-Interface (exit code $LASTEXITCODE). See the output above." }
            $bootstrap = $bootstrapJson | ConvertFrom-Json
            Import-ProcessEnvironment $bootstrap.environment
            & $npm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Web dependency installation failed (npm ci exit code $LASTEXITCODE). See the output above." }
        } finally {
            Pop-Location
        }

        @{manifestHash = $manifestHash; repo = $repo; environmentFile = $summary.environmentFile} |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $cacheFile -Encoding UTF8
    } else {
        Write-Host '[1-2/4] Reusing the installed Python and Web dependencies.'
        Import-ProcessEnvironment $state.environment
        Import-ProcessEnvironment $state.processEnvironment
    }

    $allocatorCache = Join-Path $repo '.build\contracts-tools'
    if (-not (Test-Path -LiteralPath (Join-Path $allocatorCache 'allocator.json')) -or
        -not (Test-Path -LiteralPath (Join-Path $allocatorCache 'allocator.mjs'))) {
        & $python -B -c 'from scripts.bootstrap_contract_tools import materialize_allocator; materialize_allocator()'
        if ($LASTEXITCODE -ne 0) { throw 'Could not restore the pinned DEV allocator cache.' }
    }
    $logDir = & $node scripts/artifact-paths.mjs ("launcher-" + [Guid]::NewGuid().ToString('N'))
    if ($LASTEXITCODE -ne 0 -or -not $logDir) { throw 'Could not allocate launcher logs.' }
    # Keep service keyboard readers (including Vite shortcuts) off the launcher console.
    $serviceInput = Join-Path $logDir 'stdin.empty'
    [IO.File]::WriteAllBytes($serviceInput, [byte[]]@())
    Write-Host "[INFO] Service logs: $logDir"

    $env:NETCIRCUIT_ENV = 'development'
    $env:NETCIRCUIT_HARDWARE_MODE = 'simulation'
    $env:NETCIRCUIT_HARDWARE_GRPC_TARGET = '127.0.0.1:50051'
    $env:NETCIRCUIT_SIMULATION_BACKEND = 'legacy'
    $env:NETCIRCUIT_ALLOW_GUEST = 'true'
    $env:NETCIRCUIT_TRUSTED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173'
    $env:NETCIRCUIT_DATABASE_URL = 'sqlite:///' + $dev.Replace('\','/') + '/netcircuit-dev.sqlite'
    $env:NETCIRCUIT_CAPTURE_DIR = Join-Path $dev 'captures'
    $env:NETCIRCUIT_DEV_API_TARGET = 'http://127.0.0.1:8000'

    if (-not [Console]::IsInputRedirected) {
        try {
            $savedControlMode = [Console]::TreatControlCAsInput
            [Console]::TreatControlCAsInput = $true
            $readConsoleKeys = $true
        } catch {
            $savedControlMode = $null
        }
    }
    if (Test-StopRequested) { throw [OperationCanceledException]::new() }
    Write-Host '[3/4] Starting Hardware Service and Remote API.'
    $hardware = Start-ServiceProcess $python @('-B','-m','hardware_service.server') $repo 'hardware'
    $children += $hardware
    Wait-Ready $hardware 'Hardware Service' {
        $client = [Net.Sockets.TcpClient]::new()
        try { $client.Connect('127.0.0.1', 50051); return $client.Connected }
        finally { $client.Dispose() }
    }

    $api = Start-ServiceProcess $python @('-B','-m','uvicorn','app.main:app','--app-dir','services/api','--host','127.0.0.1','--port','8000') $repo 'api'
    $children += $api
    Wait-Ready $api 'Remote API' { Test-ApiHealth 'http://127.0.0.1:8000/api/health' }

    Write-Host '[4/4] Starting CIRNET-Interface.'
    $web = Start-ServiceProcess $node @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') $env:NETCIRCUIT_INTERFACE_ROOT 'web'
    $children += $web
    $url = 'http://127.0.0.1:5173'
    Wait-Ready $web 'CIRNET-Interface' {
        (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2).StatusCode -eq 200 -and
            (Invoke-WebRequest -UseBasicParsing -Uri "$url/src/main.ts" -TimeoutSec 2).StatusCode -eq 200 -and
            (Test-ApiHealth "$url/api/health")
    }

    Write-Host "[OK] CIRNET is ready: $url"
    if (-not $Check) {
        if (-not $NoBrowser) {
            try { Start-Process $url } catch { Write-Host "[WARN] Could not open the browser. Open $url manually." }
        }
        Write-Host '[INFO] To stop CIRNET, focus this terminal and press Enter or Ctrl+C.'
        Write-Host '[INFO] You can also run .\run-cirnet.bat stop from the repository directory in another terminal.'
        while (-not $stopSignal.WaitOne(150) -and -not (Test-StopRequested)) {
            foreach ($child in $children) {
                if ($child.HasExited) { throw "A CIRNET service exited unexpectedly (exit code $($child.ExitCode))." }
            }
        }
        Write-Host '[INFO] Stopping CIRNET...'
    }
} catch [OperationCanceledException] {
    Write-Host '[INFO] Stopping CIRNET...'
} catch {
    [Console]::Error.WriteLine("[ERROR] $($_.Exception.Message)")
    if ($logDir) { [Console]::Error.WriteLine("        See service logs in '$logDir'.") }
    $result = 1
} finally {
    try {
        for ($index = $children.Count - 1; $index -ge 0; $index--) {
            $child = $children[$index]
            if (-not $child.HasExited) {
                & "$env:SystemRoot\System32\taskkill.exe" /PID $child.Id /T /F | Out-Null
                if (-not $child.WaitForExit(5000)) {
                    [Console]::Error.WriteLine("[ERROR] Could not stop CIRNET process $($child.Id).")
                    $result = 1
                }
            }
            $child.Dispose()
        }
    } finally {
        if ($stopSignal) { $stopSignal.Dispose() }
        if ($launcherLock) { $launcherLock.Dispose() }
        if ($maintenance) { Exit-CirnetMaintenance -Mutex $maintenance }
        if ($null -ne $savedControlMode) {
            try { [Console]::TreatControlCAsInput = $savedControlMode }
            catch [IO.IOException], [InvalidOperationException] {}
        }
    }
}
exit $result
