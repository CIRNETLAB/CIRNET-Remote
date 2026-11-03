param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop')]
    [string]$Action = 'start',
    [switch]$Check,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$children = @()
$launcherLock = $null
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
        if ($process.HasExited) { throw "[ERROR] $name exited with code $($process.ExitCode)." }
        try {
            if (& $probe) { return }
        } catch {
            # The listener may still be starting.
        }
    } while (-not $stopSignal.WaitOne(300) -and (Get-Date) -lt $deadline)
    if (Test-StopRequested) { throw [OperationCanceledException]::new() }
    throw "[ERROR] $name did not become ready within 60 seconds."
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
    $dev = Join-Path $env:USERPROFILE 'CIRNET-Dev'
    if ($env:CIRNET_DEV_HOME) { $dev = $env:CIRNET_DEV_HOME }
    $dev = [IO.Path]::GetFullPath($dev)
    if ($dev -eq [IO.Path]::GetPathRoot($dev)) {
        throw '[ERROR] CIRNET_DEV_HOME must be a directory below the drive root.'
    }
    $dev = $dev.TrimEnd('\')
    if ($dev.Equals($repo, 'OrdinalIgnoreCase') -or $dev.StartsWith("$repo\", 'OrdinalIgnoreCase')) {
        throw '[ERROR] CIRNET_DEV_HOME must be outside the repository.'
    }
    $lockPath = Join-Path $dev 'launcher.lock'
    $signalName = 'Local\CIRNET-Stop-' + (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($dev.ToUpperInvariant())))
    if ($Action -eq 'stop') {
        try { $stopSignal = [Threading.EventWaitHandle]::OpenExisting($signalName) }
        catch [Threading.WaitHandleCannotBeOpenedException] {
            Write-Host '[ERROR] No active CIRNET launcher was found.'
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
                Write-Host '[ERROR] CIRNET launcher has stopped.'
                exit 0
            } catch [IO.IOException] {
                Start-Sleep -Milliseconds 200
            }
        } while ((Get-Date) -lt $deadline)
        throw "[ERROR] Stop was requested. The launcher is still finishing; check its window for details."
    }

    Get-Command git.exe -CommandType Application | Out-Null
    $node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
    $npm = (Get-Command npm.cmd -CommandType Application | Select-Object -First 1).Source
    $manifest = Join-Path $repo 'integration\release-set.json'
    try {
        Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json | Out-Null
    } catch {
        throw "[ERROR] Invalid JSON in $manifest. $($_.Exception.Message)"
    }
    $manifestHash = Get-Sha256 ([IO.File]::ReadAllBytes($manifest))
    New-Item -ItemType Directory -Path $dev -Force | Out-Null
    $launcherLock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    $stopSignal = [Threading.EventWaitHandle]::new($false, 'ManualReset', $signalName)

    foreach ($port in @(50051, 8000, 5173)) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try { $listener.Start() }
        catch { throw "[ERROR] Port $port is busy. Close the CIRNET process already using it and try again." }
        finally { $listener.Stop() }
    }

    $python = Join-Path $dev '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        $basePython = (Get-Command python.exe -CommandType Application | Select-Object -First 1).Source
        & $basePython -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'
        if ($LASTEXITCODE -ne 0) { throw "[ERROR] Install Python 3.12 or newer and add it to PATH." }
        & $basePython -m venv (Join-Path $dev '.venv')
        if ($LASTEXITCODE -ne 0) { throw "[ERROR] Could not create the Python environment." }
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
            Write-Host '[ERROR] Previous setup is incomplete. Preparing a fresh selection.'
        }
    }

    if (-not $state) {
        Write-Host '[1/4] Installing pinned Python dependencies and downloading Interface. This can take several minutes.'
        $summaryJson = & $python -B scripts/install_release.py --manifest $manifest --environment-file release-env.json
        if ($LASTEXITCODE -ne 0) {
            throw "[ERROR] Release setup failed. Check the error above and the latest system-release installation logs under $dev."
        }
        $summary = $summaryJson | ConvertFrom-Json
        $state = Get-Content -LiteralPath $summary.environmentFile -Raw | ConvertFrom-Json
        Import-ProcessEnvironment $state.environment
        Import-ProcessEnvironment $state.processEnvironment

        Write-Host '[2/4] Preparing and installing Web dependencies.'
        Push-Location -LiteralPath $env:NETCIRCUIT_INTERFACE_ROOT
        try {
            $bootstrapJson = & $node scripts/bootstrap-contracts.mjs --manifest $env:NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST
            if ($LASTEXITCODE -ne 0) { throw 'Interface Contracts bootstrap failed.' }
            $bootstrap = $bootstrapJson | ConvertFrom-Json
            Import-ProcessEnvironment $bootstrap.environment
            & $npm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Interface npm ci failed.' }
        } finally {
            Pop-Location
        }

        @{manifestHash = $manifestHash; repo = $repo; environmentFile = $summary.environmentFile} |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $cacheFile -Encoding UTF8
    } else {
        Write-Host '[1-2/4] Reusing dependencies from the previous setup.'
        Import-ProcessEnvironment $state.environment
        Import-ProcessEnvironment $state.processEnvironment
    }

    $logDir = & $node scripts/artifact-paths.mjs ("launcher-" + [Guid]::NewGuid().ToString('N'))
    if ($LASTEXITCODE -ne 0 -or -not $logDir) { throw 'Could not allocate launcher logs.' }
    # Keep service keyboard readers (including Vite shortcuts) off the launcher console.
    $serviceInput = Join-Path $logDir 'stdin.empty'
    [IO.File]::WriteAllBytes($serviceInput, [byte[]]@())
    Write-Host "Logs: $logDir"

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
    Wait-Ready $hardware '[ERROR] Hardware Service' {
        $client = [Net.Sockets.TcpClient]::new()
        try { $client.Connect('127.0.0.1', 50051); return $client.Connected }
        finally { $client.Dispose() }
    }

    $api = Start-ServiceProcess $python @('-B','-m','uvicorn','app.main:app','--app-dir','services/api','--host','127.0.0.1','--port','8000') $repo 'api'
    $children += $api
    Wait-Ready $api '[ERROR] Remote API' { Test-ApiHealth 'http://127.0.0.1:8000/api/health' }

    Write-Host '[4/4] Starting Interface.'
    $web = Start-ServiceProcess $node @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') $env:NETCIRCUIT_INTERFACE_ROOT 'web'
    $children += $web
    $url = 'http://127.0.0.1:5173'
    Wait-Ready $web '[ERROR] Interface' {
        (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2).StatusCode -eq 200 -and
            (Invoke-WebRequest -UseBasicParsing -Uri "$url/src/main.ts" -TimeoutSec 2).StatusCode -eq 200 -and
            (Test-ApiHealth "$url/api/health")
    }

    Write-Host "[OK] CIRNET is ready: $url"
    if (-not $Check) {
        if (-not $NoBrowser) {
            try { Start-Process $url } catch { Write-Host "Open $url in your browser." }
        }
        Write-Host '[CANCEL] Press Enter or Ctrl+C to stop'
        Write-Host '[!] If that does not work, run the command run-cirnet.bat stop in a separate terminal window'
        while (-not $stopSignal.WaitOne(150) -and -not (Test-StopRequested)) {
            foreach ($child in $children) {
                if ($child.HasExited) { throw "[ERROR] A CIRNET service stopped with exit code $($child.ExitCode)." }
            }
        }
        Write-Host '[!] Stopping CIRNET...'
    }
} catch [OperationCanceledException] {
    Write-Host '[!] Stopping CIRNET...'
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    if ($logDir) { [Console]::Error.WriteLine("See logs in $logDir") }
    $result = 1
} finally {
    try {
        for ($index = $children.Count - 1; $index -ge 0; $index--) {
            $child = $children[$index]
            if (-not $child.HasExited) {
                & "$env:SystemRoot\System32\taskkill.exe" /PID $child.Id /T /F | Out-Null
                if (-not $child.WaitForExit(5000)) {
                    [Console]::Error.WriteLine("Could not stop CIRNET process $($child.Id).")
                    $result = 1
                }
            }
            $child.Dispose()
        }
    } finally {
        if ($stopSignal) { $stopSignal.Dispose() }
        if ($launcherLock) { $launcherLock.Dispose() }
        if ($null -ne $savedControlMode) {
            try { [Console]::TreatControlCAsInput = $savedControlMode }
            catch [IO.IOException], [InvalidOperationException] {}
        }
    }
}
exit $result
