param(
    [Parameter(Position = 0)]
    [string]$Action,
    [switch]$Check,
    [switch]$NoBrowser,
    [Alias('DryRun', 'WhatIf')][switch]$Preview,
    [switch]$Yes,
    [switch]$NoColor,
    [switch]$NoAnimation
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'launcher\Common.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'launcher\Console.psm1') -Force
Initialize-CirnetConsole -NoColor:$NoColor -NoAnimation:$NoAnimation

function Read-CirnetInput([string]$Prompt) {
    if ([Console]::IsInputRedirected) {
        Write-CirnetLine -Text $Prompt -Tone Accent -NoNewline
        return [Console]::In.ReadLine()
    }
    Write-CirnetLine -Text $Prompt -Tone Accent -NoNewline
    Read-Host
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
    if ($Report.Preview) { Write-CirnetMessage 'Cleanup preview.' }
    foreach ($row in $Report.Results) {
        $tone = switch ($row.Status) {
            'Failed' { 'Error' }
            'Skipped' { 'Warning' }
            default { 'Success' }
        }
        Write-CirnetLine -Text ("{0} {1}" -f "[$($row.Status)]".PadRight(12), $row.Path) -Tone $tone
        if ($row.Files -gt 0) {
            Write-CirnetLine -Text "    $($row.Reason) ($($row.Files) files, $($row.Bytes) bytes; $(Format-CirnetBytes $row.Bytes))" -Tone Muted
        } else { Write-CirnetLine -Text "    $($row.Reason)" -Tone Muted }
    }
    Write-CirnetSection 'Cleanup summary'
    if ($Report.Preview) {
        $eligible = @($Report.Results | Where-Object Status -eq 'Eligible')
        $files = ($eligible | Measure-Object -Property Files -Sum).Sum
        $bytes = ($eligible | Measure-Object -Property Bytes -Sum).Sum
        Write-CirnetLine -Text "Eligible files: $([long]$files) | Eligible bytes: $([long]$bytes)"
        Write-CirnetLine -Text "Eligible size: $(Format-CirnetBytes $bytes)" -Tone Accent
    }
    Write-CirnetLine -Text "Deleted: $($Report.Deleted) | Skipped: $($Report.Skipped) | Failed: $($Report.Failed)"
    Write-CirnetLine -Text "Deleted files: $($Report.Files) | Reclaimed bytes: $($Report.Bytes)"
    if (-not $Report.Preview) { Write-CirnetLine -Text "Reclaimed space: $(Format-CirnetBytes $Report.Bytes)" -Tone Accent }
}

function Invoke-CirnetLauncherClean {
    Write-CirnetSection 'CLEAN BUILD FILES'
    Write-CirnetMessage 'Scanning recognized build and cache locations. Please wait.'
    Import-Module (Join-Path $PSScriptRoot 'launcher\Clean.psm1') -Force
    $plan = Invoke-CirnetClean -RepositoryRoot $repo -Preview
    Show-CirnetCleanResult $plan
    if ($Preview) {
        Write-CirnetMessage 'Preview only. No files were changed.'
        return ($plan.Failed -eq 0)
    }
    if (-not $Yes) {
        Write-CirnetMessage -Level WARN -Text 'Cleanup removes only recognized generated files. Review the preview before continuing.'
        $answer = Read-CirnetInput 'Delete the eligible build and cache files? [y/N]: '
        if ($null -eq $answer -or $answer.Trim().ToLowerInvariant() -notin @('y', 'yes')) {
            Write-CirnetMessage 'Cleanup cancelled.'
            return $true
        }
    }
    Write-CirnetMessage 'Removing recognized generated files. Please wait.'
    $report = Invoke-CirnetClean -RepositoryRoot $repo
    Show-CirnetCleanResult $report
    return ($report.Failed -eq 0)
}

function Invoke-CirnetLauncherDoctor {
    Write-CirnetSection 'ENVIRONMENT DOCTOR'
    Write-CirnetMessage 'Checking local tools, dependencies, release cache and ports. Please wait.'
    Import-Module (Join-Path $PSScriptRoot 'launcher\Doctor.psm1') -Force
    $report = Get-CirnetEnvironmentReport -RepositoryRoot $repo
    foreach ($required in @($true, $false)) {
        if ($required) { Write-CirnetSection 'Required tools and runtime' }
        else { Write-CirnetSection 'Optional native and FPGA tools' }
        foreach ($item in @($report.Checks | Where-Object { $_.Required -eq $required })) {
            $tone = if ($item.Status -eq 'INSTALLED') { 'Success' }
                elseif ($required -and $item.Status -in @('MISSING','INCOMPATIBLE')) { 'Error' }
                else { 'Warning' }
            Write-CirnetLine -Text ("{0} {1}" -f "[$($item.Status)]".PadRight(16), $item.Name) -Tone $tone
            if ($item.Version) { Write-CirnetLine -Text "    Version: $($item.Version)" -Tone Muted }
            if ($item.Path) { Write-CirnetLine -Text "    Path: $($item.Path)" -Tone Muted }
            if ($item.Detail) { Write-CirnetLine -Text "    $($item.Detail)" }
            if ($item.Remediation -and $item.Status -ne 'INSTALLED') {
                Write-CirnetLine -Text "    Action: $($item.Remediation)" -Tone Warning
            }
        }
    }
    $requiredChecks = @($report.Checks | Where-Object Required)
    $optionalChecks = @($report.Checks | Where-Object { -not $_.Required })
    $requiredReady = @($requiredChecks | Where-Object Status -eq 'INSTALLED').Count
    $optionalReady = @($optionalChecks | Where-Object Status -eq 'INSTALLED').Count
    Write-CirnetSection 'Environment summary'
    Write-CirnetLine -Text "Required ready: $requiredReady/$($requiredChecks.Count) | Optional installed: $optionalReady/$($optionalChecks.Count)"
    if ($report.Ready) { Write-CirnetMessage -Level OK -Text 'READY FOR LOCAL SIMULATION' }
    else {
        Write-CirnetLine -Text 'MISSING REQUIRED DEPENDENCIES' -Tone Error
        foreach ($item in $report.MissingRequired) { Write-CirnetLine -Text "    $($item.Name) [$($item.Status)]" -Tone Error }
    }
    return [bool]$report.Ready
}

function Show-CirnetLauncherMenu {
    while ($true) {
        Write-CirnetBanner
        Write-CirnetLine -Text 'How can I help you?'
        Write-CirnetLine -Text ''
        Write-CirnetLine -Text '[1] Clean build files' -Tone Accent
        Write-CirnetLine -Text '[2] Check development environment' -Tone Accent
        Write-CirnetLine -Text '[3] Run CIRNET Remote' -Tone Accent
        Write-CirnetLine -Text '[0] Exit' -Tone Accent
        Write-CirnetLine -Text ''
        Write-CirnetLine -Text 'Commands: clean | doctor | start | stop | exit' -Tone Muted
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
                default { Write-CirnetMessage -Level WARN -Text 'Invalid choice. Enter 0-3, clean, doctor, start, or exit.' }
            }
        } catch {
            Write-CirnetMessage -Level ERROR -ErrorStream -Text $_.Exception.Message
        }
        Write-CirnetLine -Text ''
    }
}

try {
    $modeParameters = @($PSBoundParameters.Keys | Where-Object { $_ -notin @('NoColor','NoAnimation') })
    if ($modeParameters.Count -eq 0) { $Action = Show-CirnetLauncherMenu }
    elseif (-not $Action) { $Action = 'start' }
    else { $Action = ConvertTo-CirnetAction $Action }
    if (-not $Action) { throw 'Unknown action. Use clean, doctor, start, stop, or exit.' }
    if (($Preview -or $Yes) -and $Action -ne 'clean') { throw 'Use -Preview or -Yes with the clean action.' }
    switch ($Action) {
        'clean' { if (Invoke-CirnetLauncherClean) { exit 0 }; exit 1 }
        'doctor' { if (Invoke-CirnetLauncherDoctor) { exit 0 }; exit 1 }
        'exit' { Write-CirnetMessage 'Goodbye.'; exit 0 }
    }
} catch {
    Write-CirnetMessage -Level ERROR -ErrorStream -Text $_.Exception.Message
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
    Import-CirnetEnvironment $values
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
    Start-CirnetActivity "Waiting for $name"
    try {
        do {
            if (Test-StopRequested) { throw [OperationCanceledException]::new() }
            if ($process.HasExited) { throw "$name exited during startup (exit code $($process.ExitCode))." }
            Update-CirnetActivity
            $ready = $false
            try {
                $ready = & $probe
            } catch {
                # The listener may still be starting.
            }
            if ($ready) {
                Stop-CirnetActivity -Message "$name is ready."
                return
            }
        } while (-not $stopSignal.WaitOne(300) -and (Get-Date) -lt $deadline)
        if (Test-StopRequested) { throw [OperationCanceledException]::new() }
        throw "Timed out waiting 60 seconds for $name to become ready."
    } finally { Stop-CirnetActivity }
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
            Write-CirnetMessage 'No active CIRNET launcher was found.'
            exit 0
        }
        [void]$stopSignal.Set()
        $stopSignal.Dispose()
        $stopSignal = $null
        $deadline = (Get-Date).AddSeconds(20)
        Start-CirnetActivity 'Waiting for CIRNET to stop'
        do {
            Update-CirnetActivity
            try {
                $lock = [IO.File]::Open($lockPath, 'Open', 'ReadWrite', 'None')
                $lock.Dispose()
                Stop-CirnetActivity -Message 'CIRNET launcher has stopped.'
                exit 0
            } catch [IO.IOException] {
                Start-Sleep -Milliseconds 200
            }
        } while ((Get-Date) -lt $deadline)
        throw 'A stop request was sent, but the launcher did not exit within 20 seconds. Check the launcher window for details.'
    }

    Write-CirnetBanner -Title '<<<<<<<< STARTING CIRNET REMOTE >>>>>>>>>>'
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
    $existingEnvironment = Test-Path -LiteralPath $python -PathType Leaf
    $runtimePython = if ($existingEnvironment) { $python } else {
        (Get-Command python.exe -CommandType Application | Select-Object -First 1).Source
    }
    # Check the actual interpreter before cached imports or package installation.
    # -S also prevents an old environment's .pth/sitecustomize code from running.
    & $runtimePython -I -S -B -c 'import sys; raise SystemExit(sys.version_info < (3, 14))'
    if ($LASTEXITCODE -ne 0) {
        if ($existingEnvironment) {
            throw "Python 3.14 or newer is required. Stop CIRNET, recreate only '$dev\.venv' with Python 3.14+, move launcher-state.json aside, then run .\run-cirnet.bat start. Keep databases and captures."
        }
        throw 'Python 3.14 or newer is required. Install it and make sure python.exe is on PATH.'
    }
    if (-not $existingEnvironment) {
        & $runtimePython -m venv (Join-Path $dev '.venv')
        if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment in '$dev' (exit code $LASTEXITCODE)." }
    }

    $env:CIRNET_ARTIFACTS_DIR = $dev
    $env:NETCIRCUIT_ARTIFACTS_DIR = $dev
    Remove-Item Env:CIRNET_ARTIFACTS_SESSION,Env:CIRNET_ARTIFACTS_CONTEXT,Env:NETCIRCUIT_ARTIFACTS_SESSION,Env:NETCIRCUIT_ARTIFACTS_CONTEXT -ErrorAction SilentlyContinue

    $cacheFile = Join-Path $dev 'launcher-state.json'
    $state = $null
    if (Test-Path -LiteralPath $cacheFile -PathType Leaf) {
        try {
            $cached = Get-Content -LiteralPath $cacheFile -Raw | ConvertFrom-Json
            if ($cached.manifestHash -eq $manifestHash -and $cached.repo -eq $repo) {
                $saved = Get-Content -LiteralPath $cached.environmentFile -Raw | ConvertFrom-Json
                $saved.environment = ConvertTo-CirnetEnvironment $saved.environment
                $vite = Join-Path $saved.environment.CIRNET_INTERFACE_ROOT 'node_modules\vite\bin\vite.js'
                $sessionMarker = Join-Path $saved.environment.CIRNET_ARTIFACTS_SESSION '.cirnet-artifact-session.json'
                if (-not (Test-Path -LiteralPath $sessionMarker -PathType Leaf)) {
                    $sessionMarker = Join-Path $saved.environment.CIRNET_ARTIFACTS_SESSION '.netcircuit-artifact-session.json'
                }
                if ($saved.python -eq $python -and (Test-Path -LiteralPath $vite -PathType Leaf) -and
                    (Test-Path -LiteralPath $sessionMarker -PathType Leaf)) {
                    & $python -I -B -c 'import importlib, importlib.util; import uvicorn, hardware_service.server, contracts; importlib.import_module(''cirnet_sim'' if importlib.util.find_spec(''cirnet_sim'') else ''netcircuit_sim'')' 2>$null
                    if ($LASTEXITCODE -eq 0) { $state = $saved }
                }
            }
        } catch {
            Write-CirnetMessage -Level WARN -Text 'Saved setup could not be loaded. Reinstalling dependencies.'
        }
    }

    if (-not $state) {
        Write-CirnetSection '1/4  Install pinned Python and Interface artifacts'
        Write-CirnetMessage 'Installing pinned Python dependencies and downloading CIRNET-Interface. This can take several minutes.'
        $summaryJson = & $python -B scripts/install_release.py --manifest $manifest --environment-file release-env.json
        if ($LASTEXITCODE -ne 0) {
            throw "Release setup failed (exit code $LASTEXITCODE). Check the installer output and the latest system-release logs under '$dev'."
        }
        $summary = $summaryJson | ConvertFrom-Json
        $state = Get-Content -LiteralPath $summary.environmentFile -Raw | ConvertFrom-Json
        Import-ProcessEnvironment $state.environment
        Import-ProcessEnvironment $state.processEnvironment

        Write-CirnetSection '2/4  Prepare Contracts and Web dependencies'
        Push-Location -LiteralPath $env:CIRNET_INTERFACE_ROOT
        try {
            $bootstrapJson = & $node scripts/bootstrap-contracts.mjs --manifest $env:CIRNET_CONTRACTS_ARTIFACT_MANIFEST
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
        Write-CirnetSection '1-2/4  Reuse cached development setup'
        Write-CirnetMessage 'Reusing the installed Python and Web dependencies.'
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
    Write-CirnetMessage "Service logs: $logDir"

    $env:CIRNET_ENV = 'development'
    $env:CIRNET_HARDWARE_MODE = 'simulation'
    $env:CIRNET_HARDWARE_GRPC_TARGET = '127.0.0.1:50051'
    $env:CIRNET_SIMULATION_BACKEND = 'legacy'
    $env:CIRNET_ALLOW_GUEST = 'true'
    $env:CIRNET_TRUSTED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173'
    $databaseName = 'cirnet-dev.sqlite'
    if (-not (Test-Path -LiteralPath (Join-Path $dev $databaseName)) -and
        (Test-Path -LiteralPath (Join-Path $dev 'netcircuit-dev.sqlite') -PathType Leaf)) {
        $databaseName = 'netcircuit-dev.sqlite'
    }
    $env:CIRNET_DATABASE_URL = 'sqlite:///' + $dev.Replace('\','/') + '/' + $databaseName
    $env:CIRNET_CAPTURE_DIR = Join-Path $dev 'captures'
    $env:CIRNET_DEV_API_TARGET = 'http://127.0.0.1:8000'
    Import-CirnetEnvironment

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
    Write-CirnetSection '3/4  Start Hardware Service and Remote API'
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

    Write-CirnetSection '4/4  Start CIRNET-Interface'
    $web = Start-ServiceProcess $node @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') $env:CIRNET_INTERFACE_ROOT 'web'
    $children += $web
    $url = 'http://127.0.0.1:5173'
    Wait-Ready $web 'CIRNET-Interface' {
        (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2).StatusCode -eq 200 -and
            (Invoke-WebRequest -UseBasicParsing -Uri "$url/src/main.ts" -TimeoutSec 2).StatusCode -eq 200 -and
            (Test-ApiHealth "$url/api/health")
    }

    Write-CirnetSection 'CIRNET REMOTE IS READY'
    Write-CirnetMessage -Level OK -Text "CIRNET is ready: $url"
    Write-CirnetLine -Text '    Hardware RPC  127.0.0.1:50051' -Tone Muted
    Write-CirnetLine -Text '    Remote API    http://127.0.0.1:8000/api/health' -Tone Muted
    Write-CirnetLine -Text "    Web interface $url" -Tone Accent
    if (-not $Check) {
        if (-not $NoBrowser) {
            try { Start-Process $url } catch { Write-CirnetMessage -Level WARN -Text "Could not open the browser. Open $url manually." }
        }
        Write-CirnetMessage 'To stop CIRNET, focus this terminal and press Enter or Ctrl+C.'
        Write-CirnetMessage 'You can also run .\run-cirnet.bat stop from the repository directory in another terminal.'
        while (-not $stopSignal.WaitOne(150) -and -not (Test-StopRequested)) {
            foreach ($child in $children) {
                if ($child.HasExited) { throw "A CIRNET service exited unexpectedly (exit code $($child.ExitCode))." }
            }
        }
        Write-CirnetMessage 'Stopping CIRNET...'
    } else {
        Write-CirnetMessage 'Health checks passed. Stopping the verification session.'
    }
} catch [OperationCanceledException] {
    Write-CirnetMessage 'Stopping CIRNET...'
} catch {
    Write-CirnetMessage -Level ERROR -ErrorStream -Text $_.Exception.Message
    if ($logDir) { Write-CirnetLine -ErrorStream -Tone Error -Text "        See service logs in '$logDir'." }
    $result = 1
} finally {
    Stop-CirnetActivity
    try {
        for ($index = $children.Count - 1; $index -ge 0; $index--) {
            $child = $children[$index]
            if (-not $child.HasExited) {
                & "$env:SystemRoot\System32\taskkill.exe" /PID $child.Id /T /F | Out-Null
                if (-not $child.WaitForExit(5000)) {
                    Write-CirnetMessage -Level ERROR -ErrorStream -Text "Could not stop CIRNET process $($child.Id)."
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
