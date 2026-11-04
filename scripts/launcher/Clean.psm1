Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1')

# Delete through a verified Windows handle, holding every directory ancestor
# against replacement. File.Delete/Remove-Item would reopen a checked pathname
# and could follow a junction or file symlink installed after the check.
if (-not ('Cirnet.Launcher.CleanNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Cirnet.Launcher {
    public sealed class CleanSnapshot {
        public uint Attributes, Volume, IndexHigh, IndexLow, Links;
        public long Length, Written, Created;
    }
    public static class CleanNative {
        [StructLayout(LayoutKind.Sequential)] private struct FileTime { public uint Low, High; }
        [StructLayout(LayoutKind.Sequential)] private struct FileInfo {
            public uint Attributes; public FileTime Created, Accessed, Written;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)] private struct Disposition {
            [MarshalAs(UnmanagedType.Bool)] public bool Delete;
        }
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share,
            IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle file, out FileInfo info);
        [DllImport("kernel32.dll", SetLastError=true)]
        private static extern bool SetFileInformationByHandle(SafeFileHandle file, int kind,
            ref Disposition info, uint size);
        private static IOException Error(string operation) {
            return new IOException(operation + " (Windows error " + Marshal.GetLastWin32Error() + ").");
        }
        private static SafeFileHandle Open(string path, uint access, uint share, bool directory) {
            SafeFileHandle handle = CreateFile(path, access, share, IntPtr.Zero, 3,
                0x00200000u | (directory ? 0x02000000u : 0u), IntPtr.Zero);
            if (handle.IsInvalid) {
                int error=Marshal.GetLastWin32Error();
                handle.Dispose();
                throw new IOException("Cannot open cleanup path safely (Windows error " + error + ").");
            }
            return handle;
        }
        private static CleanSnapshot Read(SafeFileHandle handle) {
            FileInfo value;
            if (!GetFileInformationByHandle(handle, out value)) throw Error("Cannot inspect cleanup handle");
            return new CleanSnapshot { Attributes=value.Attributes, Volume=value.Volume,
                IndexHigh=value.IndexHigh, IndexLow=value.IndexLow, Links=value.Links,
                Length=((long)value.SizeHigh << 32) | value.SizeLow,
                Written=((long)value.Written.High << 32) | value.Written.Low,
                Created=((long)value.Created.High << 32) | value.Created.Low };
        }
        public static CleanSnapshot Inspect(string path) {
            using (SafeFileHandle handle = Open(path, 0x80u, 7u, false)) { return Read(handle); }
        }
        public static long Delete(string path, CleanSnapshot expected) {
            List<SafeFileHandle> parents = new List<SafeFileHandle>();
            try {
                Stack<string> names = new Stack<string>();
                DirectoryInfo parent = new DirectoryInfo(Path.GetDirectoryName(path));
                while (parent != null) { names.Push(parent.FullName); parent=parent.Parent; }
                while (names.Count != 0) {
                    SafeFileHandle handle=Open(names.Pop(), 0x80u, 3u, true);
                    parents.Add(handle);
                    uint attributes=Read(handle).Attributes;
                    if ((attributes & 0x400u) != 0 || (attributes & 0x10u) == 0)
                        throw new IOException("A cleanup ancestor is a link or is no longer a directory.");
                }
                using (SafeFileHandle handle=Open(path, 0x10080u, 0u, false)) {
                    CleanSnapshot current=Read(handle);
                    if ((current.Attributes & 0x410u) != 0 || current.Links != 1)
                        throw new IOException("Cleanup refuses linked files and directories.");
                    if (current.Volume != expected.Volume || current.IndexHigh != expected.IndexHigh ||
                        current.IndexLow != expected.IndexLow || current.Length != expected.Length ||
                        current.Written != expected.Written || current.Created != expected.Created)
                        throw new IOException("Cleanup file changed after the preview was prepared.");
                    Disposition disposition=new Disposition { Delete=true };
                    if (!SetFileInformationByHandle(handle, 4, ref disposition, 4))
                        throw Error("Cannot delete cleanup file");
                    return current.Length;
                }
            } finally { foreach (SafeFileHandle handle in parents) handle.Dispose(); }
        }
    }
}
'@
}

function New-CirnetCleanRow {
    param([string]$Path, [string]$Status, [long]$Bytes = 0, [long]$Files = 0, [string]$Reason)
    [pscustomobject]@{ Path = $Path; Status = $Status; Bytes = $Bytes; Files = $Files; Reason = $Reason }
}

function Test-CirnetCleanPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathRooted($Path) -or
        $Path -match '(^|[\\/])\.{1,2}([\\/]|$)' -or $Path -match '^\\\\[?.]\\' -or
        $Path.Substring([IO.Path]::GetPathRoot($Path).Length).Contains(':')) {
        throw 'Cleanup requires an absolute ordinary path without traversal or alternate streams.'
    }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    foreach ($component in $full.Substring([IO.Path]::GetPathRoot($full).Length).Split([char[]]@('\', '/'))) {
        if ($component.EndsWith('.') -or $component.EndsWith(' ')) {
            throw 'Cleanup refuses path components with Windows trailing-dot or trailing-space aliases.'
        }
    }
    if ($full -eq [IO.Path]::GetPathRoot($Path).TrimEnd('\', '/')) {
        throw 'Cleanup refuses a drive or share root.'
    }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Cleanup refuses a link or junction in the path: $cursor"
            }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}

function Get-CirnetCleanConfiguration {
    param([string]$RepositoryRoot, [string]$DevHome)
    $root = Test-CirnetCleanPath $RepositoryRoot
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'Repository directory does not exist.' }
    $configuration = Get-CirnetRuntimeConfiguration -RepositoryRoot $root -DevHome $DevHome
    $dev = Test-CirnetCleanPath $configuration.DevHome
    if ($root.Equals($dev, 'OrdinalIgnoreCase') -or $root.StartsWith($dev + '\', 'OrdinalIgnoreCase')) {
        throw 'Cleanup refuses the development home and every repository beneath it.'
    }
    if ($env:USERPROFILE) {
        $profileRoot = [IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\')
        $defaultDev = Join-Path $profileRoot 'CIRNET-Dev'
        if ($root.Equals($profileRoot, 'OrdinalIgnoreCase') -or $root.Equals($defaultDev, 'OrdinalIgnoreCase') -or
            $root.StartsWith($defaultDev + '\', 'OrdinalIgnoreCase')) {
            throw 'Cleanup refuses the user profile and the default CIRNET-Dev tree.'
        }
    }
    return $configuration
}

function Invoke-CirnetCleanGitQuery {
    param([string]$Root, [string]$Arguments)
    $git = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $git
    $start.WorkingDirectory = $Root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = New-Object Text.UTF8Encoding($false, $true)
    $start.StandardErrorEncoding = New-Object Text.UTF8Encoding($false, $true)
    # Do not allow an inherited alternate Git index/worktree to hide tracked files.
    foreach ($key in @($start.EnvironmentVariables.Keys)) {
        if ([string]$key -like 'GIT_*') { $start.EnvironmentVariables.Remove([string]$key) }
    }
    $start.Arguments = $Arguments
    $process = [Diagnostics.Process]::Start($start)
    try {
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(10000)) {
            try { $process.Kill() } catch { }
            throw 'Cleanup Git inspection timed out; no file is eligible for deletion.'
        }
        if (-not $outputTask.Wait(1000) -or -not $errorTask.Wait(1000)) {
            throw 'Cleanup could not finish reading the Git inventory.'
        }
        if ($process.ExitCode -ne 0) { throw 'Cleanup could not verify the Git root and tracked-file inventory.' }
        return $outputTask.Result
    } finally { $process.Dispose() }
}

function Get-CirnetCleanTrackedFiles {
    param([string]$Root)
    $top = (Invoke-CirnetCleanGitQuery $Root 'rev-parse --show-toplevel').Trim()
    if (-not $top -or -not [IO.Path]::GetFullPath($top).TrimEnd('\').Equals($Root, 'OrdinalIgnoreCase')) {
        throw 'Cleanup could not verify the exact repository Git root.'
    }
    $output = Invoke-CirnetCleanGitQuery $Root 'ls-files --cached -z'
    $tracked = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in $output.Split([char]0)) {
        if ($name) { [void]$tracked.Add([IO.Path]::GetFullPath((Join-Path $Root $name))) }
    }
    return ,$tracked
}

function Get-CirnetCleanPlanState {
    param([string]$RepositoryRoot, [string]$DevHome)
    $rows = New-Object 'Collections.Generic.List[object]'
    $snapshots = @{}
    $configuration = $null
    try {
        $configuration = Get-CirnetCleanConfiguration $RepositoryRoot $DevHome
        $root = $configuration.RepositoryRoot
        $tracked = Get-CirnetCleanTrackedFiles $root
        $denied = @('.git', '.venv', 'venv', 'env', 'node_modules', 'vendor', '.runtime', '.audit-runtime',
            '.build', '.test-build', '.vite', 'dist', 'build', 'releases', 'release', 'captures', 'capture',
            'db', 'database', 'databases', 'docs', 'assets', 'fixtures', 'generated', 'golden', 'baselines',
            '.superpowers', '.worktrees', 'CIRNET-Dev', 'site-packages', 'third_party', 'third-party', 'deps', 'dependencies')

        function Add-Candidate([IO.FileSystemInfo]$item, [string]$kind, [string]$relative) {
            $path = $item.FullName
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Links and junctions are protected.'))
                return
            }
            if ($item.PSIsContainer) {
                $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Unrecognized cache subdirectory is protected.'))
                return
            }
            $eligible = switch ($kind) {
                'Bytecode' { $item.Name -cmatch '^[A-Za-z0-9_][A-Za-z0-9_.-]*\.cpython-[0-9]{2,3}(\.opt-[12])?\.pyc$' }
                'Pytest' { $relative -cin @('v/cache/nodeids', 'v/cache/lastfailed', 'v/cache/stepwise') }
                'Metadata' { $item.Name -cin @('PKG-INFO', 'SOURCES.txt', 'dependency_links.txt', 'requires.txt', 'top_level.txt') }
            }
            if (-not $eligible -or $tracked.Contains($path)) {
                $reason = 'File is outside the exact generated-file whitelist.'
                if ($tracked.Contains($path)) { $reason = 'Git tracked files are protected.' }
                $rows.Add((New-CirnetCleanRow $path 'Skipped' -Bytes $item.Length -Files 1 -Reason $reason))
                return
            }
            try {
                [void](Test-CirnetCleanPath $path)
                $snapshot = [Cirnet.Launcher.CleanNative]::Inspect($path)
                if (($snapshot.Attributes -band 0x410) -ne 0 -or $snapshot.Links -ne 1) {
                    $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Linked files and directories are protected.'))
                    return
                }
                $snapshots[$path] = $snapshot
                $rows.Add((New-CirnetCleanRow $path 'Eligible' -Bytes $snapshot.Length -Files 1 -Reason "Recognized $kind compilation cache."))
            } catch {
                $rows.Add((New-CirnetCleanRow $path 'Failed' -Bytes $item.Length -Files 1 -Reason "Cannot inspect cleanup file: $($_.Exception.Message)"))
            }
        }

        function Read-Cache([string]$path, [string]$kind, [string]$relative = '') {
            try {
                $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $item.PSIsContainer) {
                    $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Cache path is a link or is not a directory.'))
                    return
                }
                foreach ($child in @(Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop)) {
                    $name = $child.Name
                    if ($relative) { $name = $relative + '/' + $child.Name }
                    if ($kind -eq 'Pytest' -and $child.PSIsContainer -and
                        ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and
                        $name -cin @('v', 'v/cache')) {
                        Read-Cache $child.FullName $kind $name
                    } else { Add-Candidate $child $kind $name }
                }
            } catch {
                $rows.Add((New-CirnetCleanRow $path 'Failed' -Reason "Cannot inspect cache directory: $($_.Exception.Message)"))
            }
        }

        function Read-SourceTree([string]$path) {
            try {
                $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
                if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $item.PSIsContainer) {
                    $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Source anchor is a link or is not a directory.'))
                    return
                }
                if (Test-Path -LiteralPath (Join-Path $path '.git')) {
                    $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Nested repositories are protected.'))
                    return
                }
                if ((Test-Path -LiteralPath (Join-Path $path 'pyvenv.cfg')) -or
                    (Test-Path -LiteralPath (Join-Path $path 'conda-meta'))) {
                    $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Python and Conda dependency environments are protected.'))
                    return
                }
                foreach ($child in @(Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop)) {
                    if (-not $child.PSIsContainer) { continue }
                    if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                        $rows.Add((New-CirnetCleanRow $child.FullName 'Skipped' -Reason 'Links and junctions are protected.'))
                    } elseif ($child.Name -eq '__pycache__') { Read-Cache $child.FullName 'Bytecode' }
                    elseif ($child.Name -eq '.pytest_cache') { Read-Cache $child.FullName 'Pytest' }
                    elseif ($child.Name -in $denied) {
                        $rows.Add((New-CirnetCleanRow $child.FullName 'Skipped' -Reason 'Source, dependency, data, build or release directory is protected.'))
                    } else { Read-SourceTree $child.FullName }
                }
            } catch {
                $rows.Add((New-CirnetCleanRow $path 'Failed' -Reason "Cannot inspect source anchor: $($_.Exception.Message)"))
            }
        }

        foreach ($name in @('.git', 'docs', 'assets', '.venv', 'venv', 'node_modules', '.runtime', '.audit-runtime',
            'dist', 'build', 'releases', 'captures', 'db')) {
            $path = Join-Path $root $name
            if (Test-Path -LiteralPath $path) {
                $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason 'Protected data/dependency/release path, or unproven build output; never recursively removed.'))
            }
        }
        $buildPath = Join-Path $root '.build'
        if (Test-Path -LiteralPath $buildPath) {
            $buildItem = Get-Item -LiteralPath $buildPath -Force -ErrorAction Stop
            if (($buildItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $buildItem.PSIsContainer) {
                $rows.Add((New-CirnetCleanRow $buildPath 'Skipped' -Reason 'Build path is a link or is not a directory.'))
            } else {
                foreach ($child in @(Get-ChildItem -LiteralPath $buildPath -Force -ErrorAction Stop)) {
                    if ($child.Name -ne 'metadata') {
                        $rows.Add((New-CirnetCleanRow $child.FullName 'Skipped' -Reason 'Dependency tooling or unproven build output is protected.'))
                    }
                }
            }
        }
        foreach ($name in @('scripts', 'tests', 'contracts', 'services/api')) {
            $path = Join-Path $root $name
            if (Test-Path -LiteralPath $path) { Read-SourceTree $path }
        }
        foreach ($cache in @(@('__pycache__', 'Bytecode'), @('.pytest_cache', 'Pytest'),
            @('.build/metadata/netcircuit_remote_dev.egg-info', 'Metadata'))) {
            $path = Join-Path $root $cache[0]
            if (Test-Path -LiteralPath $path) {
                try { [void](Test-CirnetCleanPath $path); Read-Cache $path $cache[1] }
                catch { $rows.Add((New-CirnetCleanRow $path 'Skipped' -Reason $_.Exception.Message)) }
            }
        }
    } catch {
        $rows.Add((New-CirnetCleanRow $RepositoryRoot 'Failed' -Reason $_.Exception.Message))
    }
    $uniqueRows = New-Object 'Collections.Generic.List[object]'
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($row in $rows) { if ($seen.Add($row.Path)) { $uniqueRows.Add($row) } }
    [pscustomobject]@{ Configuration = $configuration; Rows = $uniqueRows.ToArray(); Snapshots = $snapshots }
}

function Get-CirnetCleanPlan {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot, [string]$DevHome)
    $state = Get-CirnetCleanPlanState $RepositoryRoot $DevHome
    return $state.Rows
}

function Invoke-CirnetClean {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot, [string]$DevHome, [switch]$Preview)
    $results = New-Object 'Collections.Generic.List[object]'
    $mutex = $null
    [long]$bytes = 0
    [long]$files = 0
    try {
        $configuration = Get-CirnetCleanConfiguration $RepositoryRoot $DevHome
        if (-not $Preview) {
            $mutex = Enter-CirnetMaintenance -Configuration $configuration
            $activity = Get-CirnetLauncherActivity -Configuration $configuration
            if ($activity.Status -ne 'Stopped') {
                throw "Cleanup refused: launcher activity is $($activity.Status). $($activity.Detail)"
            }
            foreach ($port in @(50051, 8000, 5173)) {
                $status = Get-CirnetPortStatus -Port $port
                if ($status.Status -ne 'Available') {
                    throw "Cleanup refused: port $port is $($status.Status). $($status.Detail)"
                }
            }
        }
        $state = Get-CirnetCleanPlanState $RepositoryRoot $DevHome
        foreach ($row in $state.Rows) {
            if ($Preview -or $row.Status -ne 'Eligible') { $results.Add($row); continue }
            try {
                [void](Test-CirnetCleanPath $row.Path)
                # Refresh the index immediately before mutation as an additional
                # guard against source being staged after planning.
                $tracked = Get-CirnetCleanTrackedFiles $configuration.RepositoryRoot
                if ($tracked.Contains($row.Path)) {
                    $results.Add((New-CirnetCleanRow $row.Path 'Skipped' -Bytes $row.Bytes -Files 1 -Reason 'Git tracked files are protected.'))
                    continue
                }
                $removed = [Cirnet.Launcher.CleanNative]::Delete($row.Path, $state.Snapshots[$row.Path])
                $bytes += $removed
                $files++
                $results.Add((New-CirnetCleanRow $row.Path 'Deleted' -Bytes $removed -Files 1 -Reason 'Recognized generated cache file removed.'))
            } catch {
                $results.Add((New-CirnetCleanRow $row.Path 'Failed' -Bytes $row.Bytes -Files 1 -Reason "Cleanup file retained: $($_.Exception.Message)"))
            }
        }
    } catch {
        $results.Add((New-CirnetCleanRow $RepositoryRoot 'Failed' -Reason $_.Exception.Message))
    } finally {
        if ($null -ne $mutex) { Exit-CirnetMaintenance -Mutex $mutex }
    }
    [pscustomobject]@{
        Results = $results.ToArray()
        Deleted = @($results | Where-Object Status -eq 'Deleted').Count
        Skipped = @($results | Where-Object Status -eq 'Skipped').Count
        Failed = @($results | Where-Object Status -eq 'Failed').Count
        Bytes = $bytes; Files = $files; Preview = [bool]$Preview
    }
}

Export-ModuleMember -Function Get-CirnetCleanPlan, Invoke-CirnetClean
