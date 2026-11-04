function ConvertTo-CirnetEnvironment {
    param($Values)
    $result = @{}
    if ($null -eq $Values) { $Values = [Environment]::GetEnvironmentVariables('Process') }
    if ($Values -is [Collections.IDictionary]) {
        foreach ($key in $Values.Keys) { $result[[string]$key] = [string]$Values[$key] }
    } else {
        foreach ($item in $Values.PSObject.Properties) { $result[$item.Name] = [string]$item.Value }
    }
    foreach ($key in @($result.Keys)) {
        if ($key -notmatch '^(CIRNET|NETCIRCUIT)_(.+)$') { continue }
        $suffix = $Matches[2]
        $current = 'CIRNET_' + $suffix
        $legacy = 'NETCIRCUIT_' + $suffix
        $value = if ($result.ContainsKey($current)) { $result[$current] } else { $result[$legacy] }
        $result[$current] = $result[$legacy] = $value
    }
    return [pscustomobject]$result
}

function Import-CirnetEnvironment {
    param($Values)
    $normalized = ConvertTo-CirnetEnvironment $Values
    foreach ($item in $normalized.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable($item.Name, [string]$item.Value, 'Process')
    }
}

function Get-CirnetRuntimeConfiguration {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [string]$DevHome
    )
    if (-not [IO.Path]::IsPathRooted($RepositoryRoot)) {
        throw 'The repository path must be absolute.'
    }
    $root = [IO.Path]::GetFullPath($RepositoryRoot).TrimEnd('\')
    if (-not $DevHome) { $DevHome = $env:CIRNET_DEV_HOME }
    if (-not $DevHome) { $DevHome = Join-Path $env:USERPROFILE 'CIRNET-Dev' }
    if (-not [IO.Path]::IsPathRooted($DevHome)) { $DevHome = Join-Path $root $DevHome }
    $dev = [IO.Path]::GetFullPath($DevHome)
    if ($dev -eq [IO.Path]::GetPathRoot($dev)) {
        throw 'Set CIRNET_DEV_HOME to a directory below the drive root.'
    }
    $dev = $dev.TrimEnd('\')
    if ($dev.Equals($root, 'OrdinalIgnoreCase') -or $dev.StartsWith("$root\", 'OrdinalIgnoreCase')) {
        throw 'Set CIRNET_DEV_HOME to a directory outside the repository.'
    }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = [BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($dev.ToUpperInvariant())))
    } finally { $sha256.Dispose() }
    [pscustomobject]@{
        RepositoryRoot = $root
        DevHome = $dev
        LockPath = Join-Path $dev 'launcher.lock'
        SignalName = 'Local\CIRNET-Stop-' + $hash
        MaintenanceName = 'Local\CIRNET-Maintenance-' + $hash
    }
}

function Get-CirnetLauncherActivity {
    param([Parameter(Mandatory = $true)]$Configuration)
    $event = $null
    try {
        $event = [Threading.EventWaitHandle]::OpenExisting($Configuration.SignalName)
        return [pscustomobject]@{Status = 'Running'; Detail = 'An active CIRNET launcher owns the stop signal.'}
    } catch [Threading.WaitHandleCannotBeOpenedException] {
        # A missing event is expected when the launcher is stopped.
    } catch {
        return [pscustomobject]@{Status = 'Unknown'; Detail = 'The CIRNET stop signal could not be inspected.'}
    } finally {
        if ($event) { $event.Dispose() }
    }
    try {
        $attributes = [IO.File]::GetAttributes($Configuration.LockPath)
        if (($attributes -band ([IO.FileAttributes]::Directory -bor [IO.FileAttributes]::ReparsePoint)) -ne 0) {
            return [pscustomobject]@{Status = 'Unknown'; Detail = 'The CIRNET launcher lock is not an ordinary file.'}
        }
        $lock = [IO.File]::Open($Configuration.LockPath, 'Open', 'Read', 'None')
        $lock.Dispose()
        [pscustomobject]@{Status = 'Stopped'; Detail = 'No active CIRNET launcher was found.'}
    } catch [IO.FileNotFoundException], [IO.DirectoryNotFoundException] {
        [pscustomobject]@{Status = 'Stopped'; Detail = 'No active CIRNET launcher was found.'}
    } catch [IO.IOException] {
        $code = $_.Exception.GetBaseException().HResult -band 65535
        if ($code -in @(32, 33)) {
            [pscustomobject]@{Status = 'Running'; Detail = 'The CIRNET launcher lock is in use.'}
        } else {
            [pscustomobject]@{Status = 'Unknown'; Detail = 'The CIRNET launcher lock could not be inspected.'}
        }
    } catch {
        [pscustomobject]@{Status = 'Unknown'; Detail = 'The CIRNET launcher lock could not be inspected.'}
    }
}

function Get-CirnetPortStatus {
    param([Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$Port)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        [pscustomobject]@{Port = $Port; Status = 'Available'; Detail = 'The loopback port is available.'}
    } catch [Net.Sockets.SocketException] {
        $status = 'NotVerified'
        if ($_.Exception.SocketErrorCode -eq [Net.Sockets.SocketError]::AddressAlreadyInUse) { $status = 'InUse' }
        [pscustomobject]@{Port = $Port; Status = $status; Detail = 'The loopback port could not be reserved.'}
    } finally { $listener.Stop() }
}

function Enter-CirnetMaintenance {
    param([Parameter(Mandatory = $true)]$Configuration)
    $mutex = [Threading.Mutex]::new($false, $Configuration.MaintenanceName)
    try {
        try { $acquired = $mutex.WaitOne(0) }
        catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (-not $acquired) { throw 'A CIRNET launcher or cleanup operation is already running.' }
        return $mutex
    } catch {
        $mutex.Dispose()
        throw
    }
}

function Exit-CirnetMaintenance {
    param([Parameter(Mandatory = $true)][Threading.Mutex]$Mutex)
    try { $Mutex.ReleaseMutex() }
    finally { $Mutex.Dispose() }
}

Export-ModuleMember -Function ConvertTo-CirnetEnvironment, Import-CirnetEnvironment, Get-CirnetRuntimeConfiguration, Get-CirnetLauncherActivity, Get-CirnetPortStatus, Enter-CirnetMaintenance, Exit-CirnetMaintenance
