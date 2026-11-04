# Read-only diagnostics: no bootstrap, allocator, application import or service start.
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -ErrorAction Stop

function New-CirnetDoctorCheck {
    param([string]$Name, [bool]$Required, [string]$Status, [string]$Version = '',
        [string]$Path = '', [string]$Detail = '', [string]$Remediation = '')
    [pscustomobject]@{
        Name = $Name; Required = $Required; Status = $Status; Version = $Version
        Path = $Path; Detail = $Detail; Remediation = $Remediation
    }
}

function Find-CirnetDoctorCommand {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { return $command }
    }
    return $null
}

function ConvertTo-CirnetDoctorArgument {
    param([string]$Value)
    # CommandLineToArgvW quoting, including quotes and trailing backslashes.
    return '"' + ([regex]::Replace(([regex]::Replace($Value, '(\\*)"', '$1$1\"')), '(\\+)$', '$1$1')) + '"'
}

function Invoke-CirnetDoctorProcess {
    param([string]$FilePath, [string[]]$Arguments = @(), [int]$TimeoutMilliseconds = 4000)
    $process = [Diagnostics.Process]::new()
    try {
        $options = [Diagnostics.ProcessStartInfo]::new()
        $options.FileName = $FilePath
        $options.Arguments = (($Arguments | ForEach-Object { ConvertTo-CirnetDoctorArgument $_ }) -join ' ')
        $options.UseShellExecute = $false
        $options.CreateNoWindow = $true
        $options.RedirectStandardOutput = $true
        $options.RedirectStandardError = $true
        $options.EnvironmentVariables['PYTHONDONTWRITEBYTECODE'] = '1'
        $options.EnvironmentVariables['PIP_DISABLE_PIP_VERSION_CHECK'] = '1'
        $options.EnvironmentVariables['PIP_NO_INDEX'] = '1'
        $process.StartInfo = $options
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutMilliseconds)) {
            try { $process.Kill() } catch { }
            [void]$process.WaitForExit(1000)
            return [pscustomobject]@{ ExitCode = -1; Output = ''; TimedOut = $true; Error = 'Version probe timed out.' }
        }
        # Do not wait indefinitely for a descendant that inherited a pipe.
        if (-not $stdout.Wait(1000) -or -not $stderr.Wait(1000)) {
            return [pscustomobject]@{ ExitCode = -1; Output = ''; TimedOut = $true; Error = 'Version probe output timed out.' }
        }
        [pscustomobject]@{ ExitCode = $process.ExitCode; Output = ($stdout.Result + $stderr.Result).Trim(); TimedOut = $false; Error = '' }
    } catch {
        [pscustomobject]@{ ExitCode = -1; Output = ''; TimedOut = $false; Error = 'Could not execute the version probe.' }
    } finally { $process.Dispose() }
}

function Get-CirnetDoctorTool {
    param([string]$Name, [string[]]$Commands, [string[]]$Arguments = @('--version'),
        [bool]$Required = $true, [string]$Remediation, [string]$VersionPattern = '(\d+\.\d+(?:\.\d+)?)')
    $command = Find-CirnetDoctorCommand $Commands
    if (-not $command) { return New-CirnetDoctorCheck $Name $Required 'MISSING' '' '' 'Executable was not found on PATH.' $Remediation }
    $executable = $command.Source
    $probeArguments = $Arguments
    # Invoke npm's JavaScript CLI directly so cmd.exe cannot expand PATH spelling.
    if ([IO.Path]::GetExtension($executable) -eq '.cmd') {
        $cli = Join-Path (Split-Path -Parent $executable) 'node_modules\npm\bin\npm-cli.js'
        $node = Find-CirnetDoctorCommand @('node.exe')
        if (-not $node -or -not (Test-Path -LiteralPath $cli -PathType Leaf)) {
            return New-CirnetDoctorCheck $Name $Required 'NOT VERIFIED' '' $executable 'The npm CLI could not be located beside its command wrapper.' $Remediation
        }
        $probeArguments = @($cli) + $Arguments
        $executable = $node.Source
    }
    $probe = Invoke-CirnetDoctorProcess -FilePath $executable -Arguments $probeArguments
    if ($probe.ExitCode -ne 0 -or $probe.Output -notmatch $VersionPattern) {
        $detail = if ($probe.TimedOut) { 'The version probe timed out.' } else { 'The executable did not return a recognizable version.' }
        return New-CirnetDoctorCheck $Name $Required 'NOT VERIFIED' '' $command.Source $detail $Remediation
    }
    New-CirnetDoctorCheck $Name $Required 'INSTALLED' $Matches[1] $command.Source 'Executable version was checked.' ''
}

function Assert-CirnetDoctorOwnedPath {
    param([string]$Path, [string]$Root, [switch]$File, [switch]$Directory)
    if (-not $Path -or $Path -notmatch '^[A-Za-z]:[\\/]') { throw 'A cached path is not an absolute local drive path.' }
    # Reject spelling aliases before canonicalization (ADS, dot components, short names).
    if ($Path.Substring(2) -match ':|(^|[\\/])\.{1,2}([\\/]|$)|~\d|[. ]([\\/]|$)') { throw 'A cached path contains an alias or unsafe component.' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $boundary = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    if (-not $full.StartsWith($boundary + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'A cached path is outside the selected development directory or session.' }
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A cached path traverses a reparse point or symbolic link.' }
        }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    if ($File -and -not (Test-Path -LiteralPath $full -PathType Leaf)) { throw 'A required cached file is missing.' }
    if ($Directory -and -not (Test-Path -LiteralPath $full -PathType Container)) { throw 'A required cached directory is missing.' }
    return $full
}

function Read-CirnetDoctorJson {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Length -gt 10MB) { throw 'A cached JSON file exceeds the diagnostic size limit.' }
    Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
}

function Get-CirnetDoctorHash {
    param([string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}

function Test-CirnetDoctorReleaseCache {
    param($Configuration)
    $cacheFile = Join-Path $Configuration.DevHome 'launcher-state.json'
    if (-not (Test-Path -LiteralPath $cacheFile)) {
        return [pscustomobject]@{ Status='MISSING'; Version=''; Path=$cacheFile; Detail='No installed release cache was found.'; State=$null; Manifest=$null }
    }
    try {
        $null = Assert-CirnetDoctorOwnedPath $cacheFile $Configuration.DevHome -File
        $cache = Read-CirnetDoctorJson $cacheFile
        $lock = Join-Path $Configuration.RepositoryRoot 'integration\release-set.json'
        $manifest = Read-CirnetDoctorJson $lock
        if ($manifest.schemaVersion -ne 1 -or -not $manifest.releaseVersion -or -not $manifest.repositories) { throw 'The repository release manifest schema is invalid.' }
        $expectedHash = Get-CirnetDoctorHash $lock
        if ($cache.repo -ine $Configuration.RepositoryRoot -or ([string]$cache.manifestHash).Replace('-', '').ToLowerInvariant() -cne $expectedHash) { throw 'The cache belongs to another repository or release manifest.' }
        $environmentFile = Assert-CirnetDoctorOwnedPath $cache.environmentFile $Configuration.DevHome -File
        $state = Read-CirnetDoctorJson $environmentFile
        if ($state.schemaVersion -ne 1 -or $state.releaseVersion -cne $manifest.releaseVersion -or $state.environmentFile -ine $environmentFile) { throw 'The saved release environment schema or version is invalid.' }
        $python = Join-Path $Configuration.DevHome '.venv\Scripts\python.exe'
        if ($state.python -ine $python) { throw 'The saved interpreter is not the selected launcher virtual environment.' }
        $null = Assert-CirnetDoctorOwnedPath $python $Configuration.DevHome -File
        $venvConfig = Assert-CirnetDoctorOwnedPath (Join-Path $Configuration.DevHome '.venv\pyvenv.cfg') $Configuration.DevHome -File
        $venvContents = Get-Content -LiteralPath $venvConfig -Raw -ErrorAction Stop
        if ($venvContents -notmatch '(?m)^version\s*=\s*(\d+\.\d+(?:\.\d+)?)\s*$' -or [version]$Matches[1] -lt [version]'3.12') { throw 'The cached virtual environment does not declare a compatible Python 3.12+ version.' }
        $session = Assert-CirnetDoctorOwnedPath $state.environment.NETCIRCUIT_ARTIFACTS_SESSION $Configuration.DevHome -Directory
        $null = Assert-CirnetDoctorOwnedPath $environmentFile $session -File
        $markerFile = Assert-CirnetDoctorOwnedPath (Join-Path $session '.netcircuit-artifact-session.json') $session -File
        $marker = Read-CirnetDoctorJson $markerFile
        $context = $state.environment.NETCIRCUIT_ARTIFACTS_CONTEXT | ConvertFrom-Json -ErrorAction Stop
        if ($marker.version -ne 2 -or $marker.directory -ine $session -or $marker.context.version -ne 1 -or
            $marker.context.owner -ine ('git:' + $Configuration.RepositoryRoot) -or $context.version -ne 1 -or
            $context.owner -ine $marker.context.owner -or @($context.roots) -notcontains $Configuration.RepositoryRoot -or
            @($marker.context.roots) -notcontains $Configuration.RepositoryRoot) { throw 'The saved allocator session marker or context is invalid.' }
        $snapshot = Assert-CirnetDoctorOwnedPath $state.manifest $session -File
        if ($state.manifestSha256 -notmatch '^[a-fA-F0-9]{64}$' -or (Get-CirnetDoctorHash $snapshot) -cne $state.manifestSha256.ToLowerInvariant()) { throw 'The cached release snapshot SHA256 does not match its recorded digest.' }
        $savedManifest = Read-CirnetDoctorJson $snapshot
        if (($savedManifest | ConvertTo-Json -Depth 100 -Compress) -cne ($manifest | ConvertTo-Json -Depth 100 -Compress)) { throw 'The cached release snapshot differs from the selected release lock.' }
        foreach ($component in $manifest.repositories.PSObject.Properties) {
            foreach ($artifact in $component.Value.artifacts.PSObject.Properties) {
                $archive = Assert-CirnetDoctorOwnedPath ([string]$state.artifacts.($component.Name).($artifact.Name)) $session -File
                if ([IO.Path]::GetFileName($archive) -cne $artifact.Value.filename -or $artifact.Value.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'A cached artifact filename or pinned digest is invalid.' }
                $file = Get-Item -LiteralPath $archive -ErrorAction Stop
                if ($file.Length -gt 1GB -or ($artifact.Value.size -and $file.Length -ne $artifact.Value.size) -or
                    (Get-CirnetDoctorHash $archive) -cne $artifact.Value.sha256.ToLowerInvariant()) { throw "The cached $($component.Name) $($artifact.Name) artifact does not match its pinned SHA256 or size." }
            }
        }
        foreach ($componentName in @('Contracts','Simulator','Hardware','FPGA')) {
            $key = 'NETCIRCUIT_' + $componentName.ToUpperInvariant() + '_ARTIFACT_MANIFEST'
            $selectedPath = Assert-CirnetDoctorOwnedPath ([string]$state.environment.$key) $session -File
            $selected = Read-CirnetDoctorJson $selectedPath
            if ($selected.schemaVersion -ne 1) { throw 'A selected artifact manifest has an invalid schema.' }
            $kinds = if ($componentName -eq 'Contracts') { @('python','sdist','npm','dev','dev_npm') } elseif ($componentName -eq 'FPGA') { @('source') } else { @('python') }
            foreach ($kind in $kinds) {
                if ($selected.$kind.path -ine $state.artifacts.$componentName.$kind -or
                    $selected.$kind.sha256 -cne $manifest.repositories.$componentName.artifacts.$kind.sha256) { throw 'A selected artifact manifest differs from the pinned archive paths or digests.' }
            }
        }
        foreach ($key in @('NETCIRCUIT_INTERFACE_ROOT','NETCIRCUIT_INTERFACE_STATIC_ROOT','NETCIRCUIT_FPGA_ROOT')) {
            $null = Assert-CirnetDoctorOwnedPath ([string]$state.environment.$key) $session -Directory
        }
        $interface = $state.environment.NETCIRCUIT_INTERFACE_ROOT
        $identityPath = Assert-CirnetDoctorOwnedPath (Join-Path $interface 'interface-artifact.json') $session -File
        $identity = Read-CirnetDoctorJson $identityPath
        if ($identity.version -cne $manifest.repositories.Interface.version -or $identity.source.revision -cne $manifest.repositories.Interface.sourceRevision) { throw 'The cached Interface source identity differs from the release lock.' }
        $null = Assert-CirnetDoctorOwnedPath (Join-Path $interface 'node_modules\vite\bin\vite.js') $session -File
        $null = Assert-CirnetDoctorOwnedPath (Join-Path $interface 'node_modules\vite\package.json') $session -File
        $null = Assert-CirnetDoctorOwnedPath (Join-Path $interface 'package-lock.json') $session -File
        if ($state.processEnvironment.PYTHONDONTWRITEBYTECODE -cne '1') { throw 'The cached process environment does not suppress source bytecode.' }
        $expectedKeys = @('TMP','TEMP','TMPDIR','PIP_CACHE_DIR','npm_config_cache','PYTHONDONTWRITEBYTECODE')
        if (@($state.processEnvironment.PSObject.Properties).Count -ne $expectedKeys.Count) { throw 'The cached process environment has unexpected keys.' }
        foreach ($key in $expectedKeys | Where-Object { $_ -ne 'PYTHONDONTWRITEBYTECODE' }) {
            $null = Assert-CirnetDoctorOwnedPath ([string]$state.processEnvironment.$key) $session -Directory
        }
        [pscustomobject]@{ Status='INSTALLED'; Version=$manifest.releaseVersion; Path=$environmentFile; Detail='The saved release schema, owned paths, snapshot and pinned archive SHA256 values match. Cached Vite is present.'; State=$state; Manifest=$manifest }
    } catch {
        [pscustomobject]@{ Status='INCOMPATIBLE'; Version=''; Path=$cacheFile; Detail=$_.Exception.Message; State=$null; Manifest=$null }
    }
}

function Get-CirnetDoctorCachedPython {
    param($Configuration, $Cache)
    $python = Join-Path $Configuration.DevHome '.venv\Scripts\python.exe'
    $remediation = 'Run .\run-cirnet.bat start to bootstrap the pinned release.'
    if ($Cache.Status -ne 'INSTALLED') {
        return New-CirnetDoctorCheck 'Cached Python dependencies' $true 'NOT VERIFIED' '' $python 'Cached interpreter code was not executed because the release cache has not passed validation.' $remediation
    }
    try {
        $site = Assert-CirnetDoctorOwnedPath (Join-Path $Configuration.DevHome '.venv\Lib\site-packages') $Configuration.DevHome -Directory
        # -S prevents .pth/sitecustomize execution. Inspect metadata and pip's
        # requirement parser without importing application or service code.
        $code = @'
import csv, importlib.metadata as m, io, json, os, pathlib, sys
sys.path.append(sys.argv[1])
expected = json.loads(sys.argv[2])
versions = {name: m.version(name) for name in expected}
assert sys.version_info >= (3, 12), 'Cached Python must be 3.12 or newer.'
assert all(not version or versions[name] == version for name, version in expected.items()), 'Installed distribution versions differ from the selected release.'
# pip is already a required launcher dependency. Its vendored requirement parser
# evaluates Python/Windows markers and extras without invoking any pip command.
pending = [(name, frozenset()) for name in expected]
seen = set()
site = os.path.realpath(sys.argv[1])
def validate_files(distribution):
    # metadata.files filters missing files on newer Python. Parse the owned RECORD
    # directly so a deleted native extension cannot disappear from the inventory.
    record = distribution.read_text('RECORD')
    assert record, 'Installed wheel RECORD inventory is missing.'
    inventory = list(csv.reader(io.StringIO(record)))
    assert inventory, 'Installed wheel RECORD inventory is empty.'
    for row in inventory:
        assert len(row) >= 3 and row[0] and '\\' not in row[0], 'Installed wheel RECORD inventory is invalid.'
        entry = pathlib.PurePosixPath(row[0])
        assert not entry.is_absolute(), 'Installed wheel RECORD contains an absolute payload path.'
        if '..' in entry.parts or '__pycache__' in entry.parts or str(entry).endswith(('.pyc', '.pyo')):
            continue
        spelling = os.path.abspath(distribution.locate_file(entry))
        target = os.path.realpath(spelling)
        assert os.path.normcase(spelling) == os.path.normcase(target), 'An installed wheel payload traverses an alias.'
        assert os.path.commonpath((site, target)) == site and os.path.isfile(target), 'An installed wheel runtime payload is missing or escapes site-packages.'
validate_files(m.distribution('pip'))
from pip._vendor.packaging.requirements import Requirement
while pending:
    name, extras = pending.pop()
    key = (name.lower().replace('_', '-'), extras)
    if key in seen:
        continue
    seen.add(key)
    distribution = m.distribution(name)
    direct = distribution.read_text('direct_url.json')
    assert not direct or 'dir_info' not in json.loads(direct), 'Editable distributions are unsupported.'
    validate_files(distribution)
    for declaration in distribution.requires or ():
        requirement = Requirement(declaration)
        if requirement.marker and not any(requirement.marker.evaluate({'extra': extra}) for extra in (extras or {''})):
            continue
        version = m.version(requirement.name)
        assert not requirement.url and requirement.specifier.contains(version, prereleases=True), 'A declared Python dependency is missing or incompatible: ' + requirement.name
        pending.append((requirement.name, frozenset(requirement.extras)))
print(json.dumps({'python': sys.version.split()[0], 'packages': versions}))
'@
        $expected = [ordered]@{'netcircuit-api'=$Cache.Manifest.repositories.Remote.version; 'netcircuit-contracts'=$Cache.Manifest.repositories.Contracts.version;
            'netcircuit-simulator'=$Cache.Manifest.repositories.Simulator.version; 'netcircuit-hardware-service'=$Cache.Manifest.repositories.Hardware.version;
            'netcircuit-artifact-paths'='1.0.0a1'; 'uvicorn'=''; 'fastapi'=''; 'grpcio'=''; 'pip'=''}
        $probe = Invoke-CirnetDoctorProcess -FilePath $python -Arguments @('-I','-S','-B','-c',$code,$site,($expected | ConvertTo-Json -Compress)) -TimeoutMilliseconds 6000
        if ($probe.ExitCode -ne 0) { throw 'The cached interpreter or required distribution metadata did not pass the isolated read-only probe.' }
        $versions = $probe.Output | ConvertFrom-Json -ErrorAction Stop
        return New-CirnetDoctorCheck 'Cached Python dependencies' $true 'INSTALLED' $versions.python $python 'Python 3.12+, selected distribution versions, declared dependencies and Python module files were checked without application or service imports.' ''
    } catch {
        $repair = "Stop CIRNET, repair or recreate only '$($Configuration.DevHome)\.venv' with Python 3.12+, move launcher-state.json aside, then run .\run-cirnet.bat start. Keep databases and captures."
        return New-CirnetDoctorCheck 'Cached Python dependencies' $true 'INCOMPATIBLE' '' $python $_.Exception.Message $repair
    }
}

function Get-CirnetDoctorWebDependencies {
    param($Cache)
    $repair = 'Stop CIRNET, move launcher-state.json aside, then run .\run-cirnet.bat start to rebuild the pinned Web dependencies. Keep databases and captures.'
    if ($Cache.Status -ne 'INSTALLED') {
        return New-CirnetDoctorCheck 'Cached Web dependencies' $true 'NOT VERIFIED' '' '' 'The release cache must pass validation before Web dependencies can be inspected.' $repair
    }
    $interface = $Cache.State.environment.NETCIRCUIT_INTERFACE_ROOT
    $node = Find-CirnetDoctorCommand @('node.exe')
    if (-not $node) { return New-CirnetDoctorCheck 'Cached Web dependencies' $true 'NOT VERIFIED' '' $interface 'Node.js is required for the read-only lockfile inspection.' $repair }
    # Only Node built-ins run. No package entrypoint, native binary, npm command,
    # Vite configuration or application code is executed.
    $code = @'
const fs = require('node:fs'), path = require('node:path');
try {
  const root = path.resolve(process.argv[1]);
  const fold = value => process.platform === 'win32' ? value.toLowerCase() : value;
  function physical(target, file = true) {
    target = path.resolve(target);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('A Web dependency path escapes the selected Interface.');
    const real = fs.realpathSync(target);
    if (fold(real) !== fold(target)) throw Error('A Web dependency path traverses an alias.');
    for (let cursor = target; cursor !== root; cursor = path.dirname(cursor)) {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('A Web dependency path traverses a link.');
    }
    if (file ? !fs.statSync(target).isFile() : !fs.statSync(target).isDirectory()) throw Error('A required Web runtime payload is missing.');
    return target;
  }
  function json(target) {
    physical(target);
    if (fs.statSync(target).size > 10 * 1024 * 1024) throw Error('A Web metadata file exceeds the diagnostic size limit.');
    return JSON.parse(fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, ''));
  }
  const lock = json(path.join(root, 'package-lock.json'));
  if (![2,3].includes(lock.lockfileVersion) || !lock.packages || !lock.packages['']) throw Error('The Interface npm lockfile schema is invalid.');
  const installed = new Map();
  function locate(name, from = '') {
    if (!/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/.test(name)) throw Error('A Web dependency name is invalid.');
    for (let cursor = path.join(root, from); ; cursor = path.dirname(cursor)) {
      const key = path.relative(root, path.join(cursor, 'node_modules', name)).split(path.sep).join('/');
      if (Object.hasOwn(lock.packages, key)) return key;
      if (cursor === root) break;
    }
    throw Error('The npm lock is missing a required runtime dependency: ' + name);
  }
  function entry(directory, value) {
    if (typeof value !== 'string' || value.includes('*')) return;
    const target = path.resolve(directory, value);
    if (!target.startsWith(directory + path.sep)) throw Error('A Web package entrypoint escapes its package.');
    const candidates = [target, target + '.js', target + '.json', path.join(target, 'index.js')];
    const selected = candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!selected) throw Error('A Web package runtime entrypoint is missing: ' + path.relative(root, target));
    physical(selected);
  }
  function exportsEntries(directory, value) {
    if (typeof value === 'string') { if (/\.(?:[cm]?js|node|json)$/.test(value)) entry(directory, value); }
    else if (value && typeof value === 'object') for (const [condition, target] of Object.entries(value)) if (condition !== 'types') exportsEntries(directory, target);
  }
  function visit(key) {
    if (installed.has(key)) return installed.get(key);
    if (!key.startsWith('node_modules/') || key.includes('..') || key.includes('\\')) throw Error('The npm lock contains an unsafe runtime package path.');
    const selected = lock.packages[key], directory = path.join(root, key);
    const identity = json(path.join(directory, 'package.json'));
    if (!selected.version || identity.version !== selected.version) throw Error('An installed Web dependency differs from the npm lock: ' + key);
    installed.set(key, identity);
    for (const value of [identity.main, identity.module]) if (value) entry(directory, value);
    if (typeof identity.bin === 'string') entry(directory, identity.bin);
    else for (const value of Object.values(identity.bin || {})) entry(directory, value);
    exportsEntries(directory, identity.exports);
    for (const name of Object.keys(selected.dependencies || {})) visit(locate(name, key));
    for (const name of Object.keys(selected.peerDependencies || {})) if (!selected.peerDependenciesMeta?.[name]?.optional) visit(locate(name, key));
    // These optional npm packages are mandatory native providers for the selected
    // Windows bundler runtime; no executable or native library is loaded.
    if (identity.name === 'rollup') {
      const provider = '@rollup/rollup-' + process.platform + '-' + process.arch + '-msvc';
      const nativeKey = locate(provider, key);
      visit(nativeKey);
      physical(path.join(root, nativeKey, 'rollup.' + process.platform + '-' + process.arch + '-msvc.node'));
    }
    if (identity.name === 'esbuild') {
      const nativeKey = locate('@esbuild/' + process.platform + '-' + process.arch, key);
      visit(nativeKey);
      physical(path.join(root, nativeKey, 'esbuild.exe'));
    }
    return identity;
  }
  for (const name of Object.keys(lock.packages[''].dependencies || {})) visit(locate(name));
  for (const name of ['vite','@vitejs/plugin-vue']) visit(locate(name));
  console.log(JSON.stringify({ version: installed.get(locate('vite')).version, count: installed.size }));
} catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
'@
    $probe = Invoke-CirnetDoctorProcess -FilePath $node.Source -Arguments @('-e',$code,$interface) -TimeoutMilliseconds 6000
    try {
        $result = $probe.Output | ConvertFrom-Json -ErrorAction Stop
        if ($probe.ExitCode -ne 0 -or -not $result.version) {
            $detail = if ($result.error) { [string]$result.error } else { 'The bounded Web dependency inspection did not pass.' }
            return New-CirnetDoctorCheck 'Cached Web dependencies' $true 'INCOMPATIBLE' '' $interface $detail $repair
        }
        return New-CirnetDoctorCheck 'Cached Web dependencies' $true 'INSTALLED' $result.version $interface "Vite, its runtime dependency closure and Windows Rollup/esbuild native payloads match the npm lock ($($result.count) packages). No package code was loaded." ''
    } catch {
        return New-CirnetDoctorCheck 'Cached Web dependencies' $true 'NOT VERIFIED' '' $interface 'The bounded read-only Web dependency probe did not return a valid result.' $repair
    }
}

function Get-CirnetDoctorAllocatorCache {
    param($Configuration)
    $directory = Join-Path $Configuration.RepositoryRoot '.build\contracts-tools'
    $metadataPath = Join-Path $directory 'allocator.json'
    $resource = Join-Path $directory 'allocator.mjs'
    $repair = 'Stop CIRNET, then use the selected launcher .venv Python from the repository directory: python -B -c ''from scripts.bootstrap_contract_tools import materialize_allocator; materialize_allocator()''. Doctor does not run this repair.'
    if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or -not (Test-Path -LiteralPath $resource -PathType Leaf)) {
        return New-CirnetDoctorCheck 'DEV allocator cache' $true 'MISSING' '' $directory 'The pinned DEV allocator cache has not been materialized.' 'Run .\run-cirnet.bat start to restore the pinned DEV allocator cache.'
    }
    try {
        $null = Assert-CirnetDoctorOwnedPath $metadataPath $Configuration.RepositoryRoot -File
        $null = Assert-CirnetDoctorOwnedPath $resource $Configuration.RepositoryRoot -File
        $pinPath = Assert-CirnetDoctorOwnedPath (Join-Path $Configuration.RepositoryRoot 'integration\contracts-version.json') $Configuration.RepositoryRoot -File
        $pin = (Read-CirnetDoctorJson $pinPath).dev
        $metadata = Read-CirnetDoctorJson $metadataPath
        if ($pin.node_sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $metadata.name -cne $pin.name -or $metadata.version -cne $pin.version -or
            $metadata.resource -cne 'netcircuit_artifact_paths/artifact-paths.mjs' -or $metadata.sha256 -cne $pin.node_sha256 -or
            (Get-CirnetDoctorHash $resource) -cne $pin.node_sha256) { throw 'The DEV allocator cache metadata or resource SHA256 differs from the pinned tooling.' }
        return New-CirnetDoctorCheck 'DEV allocator cache' $true 'INSTALLED' $pin.version $resource 'Allocator identity and resource SHA256 match integration/contracts-version.json.' ''
    } catch {
        return New-CirnetDoctorCheck 'DEV allocator cache' $true 'INCOMPATIBLE' '' $directory $_.Exception.Message $repair
    }
}

function Get-CirnetDoctorMsvc {
    $remediation = 'Optional native builds: install Visual Studio Build Tools 2022 with the MSVC v143 C++ tools workload.'
    $vswhere = if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe' } else { '' }
    if (-not $vswhere -or -not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
        return New-CirnetDoctorCheck 'MSVC v143 (Visual Studio Build Tools)' $false 'MISSING' '' $vswhere 'vswhere.exe was not found.' $remediation
    }
    $probe = Invoke-CirnetDoctorProcess $vswhere @('-latest','-products','Microsoft.VisualStudio.Product.BuildTools','-version','[17.0,18.0)','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath')
    if ($probe.ExitCode -ne 0 -or -not $probe.Output) {
        return New-CirnetDoctorCheck 'MSVC v143 (Visual Studio Build Tools)' $false 'MISSING' '' $vswhere 'vswhere did not find the required Build Tools product and C++ component.' $remediation
    }
    try {
        $tools = Join-Path $probe.Output 'VC\Tools\MSVC'
        $selected = Get-ChildItem -LiteralPath $tools -Directory -ErrorAction Stop |
            Where-Object { $_.Name -match '^14\.(3\d|4\d)\.' } | Sort-Object Name -Descending | Select-Object -First 1
        $compiler = if ($selected) { Join-Path $selected.FullName 'bin\Hostx64\x64\cl.exe' } else { '' }
        if (-not $compiler -or -not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The v143 x64 compiler is missing.' }
        New-CirnetDoctorCheck 'MSVC v143 (Visual Studio Build Tools)' $false 'INSTALLED' $selected.Name $compiler 'Visual Studio Build Tools 2022 and its v143 x64 compiler were located through vswhere.' ''
    } catch {
        New-CirnetDoctorCheck 'MSVC v143 (Visual Studio Build Tools)' $false 'INCOMPATIBLE' '' $probe.Output 'The discovered Build Tools installation does not contain the v143 x64 compiler.' $remediation
    }
}

function Get-CirnetEnvironmentReport {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$RepositoryRoot, [string]$DevHome)
    $configuration = if ($DevHome) { Get-CirnetRuntimeConfiguration -RepositoryRoot $RepositoryRoot -DevHome $DevHome }
        else { Get-CirnetRuntimeConfiguration -RepositoryRoot $RepositoryRoot }
    $checks = [Collections.Generic.List[object]]::new()
    $checks.Add((Get-CirnetDoctorTool 'Git' @('git.exe') -Remediation 'Install Git for Windows and add git.exe to PATH.'))
    $psStatus = if ($PSVersionTable.PSVersion -ge [version]'5.1') { 'INSTALLED' } else { 'INCOMPATIBLE' }
    $checks.Add((New-CirnetDoctorCheck 'PowerShell' $true $psStatus $PSVersionTable.PSVersion.ToString() ([Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) 'The current PowerShell host was checked.' 'Use Windows PowerShell 5.1 or newer.'))
    $python = Get-CirnetDoctorTool 'Python' @('python.exe') -Remediation 'Install Python 3.12 or newer and add python.exe to PATH.'
    if ($python.Status -eq 'INSTALLED' -and [version]$python.Version -lt [version]'3.12') {
        $python.Status = 'INCOMPATIBLE'; $python.Detail = 'Python 3.12 or newer is required.'; $python.Remediation = 'Install Python 3.12 or newer and add python.exe to PATH.'
    }
    $checks.Add($python)
    foreach ($feature in @('pip','venv')) {
        $status = 'NOT VERIFIED'; $version = ''; $detail = 'A compatible base Python is required before this feature can be checked.'
        if ($python.Status -eq 'INSTALLED') {
            $arguments = if ($feature -eq 'pip') { @('-I','-B','-m','pip','--version') } else { @('-I','-B','-c','import venv; print("OK")') }
            $probe = Invoke-CirnetDoctorProcess -FilePath $python.Path -Arguments $arguments
            if ($probe.ExitCode -eq 0) {
                $status='INSTALLED'; $detail='The Python feature is available without installation or network access.'
                if ($feature -eq 'pip' -and $probe.Output -match 'pip\s+(\S+)') { $version=$Matches[1] } else { $version=$python.Version }
            } else { $status='MISSING'; $detail='The Python feature could not be loaded.' }
        }
        $checks.Add((New-CirnetDoctorCheck ('Python ' + $feature) $true $status $version $python.Path $detail ('Repair the Python installation to include ' + $feature + '; doctor does not install packages.')))
    }
    $node = Get-CirnetDoctorTool 'Node.js' @('node.exe') -Remediation 'Install Node.js 22 LTS and add node.exe to PATH.'
    if ($node.Status -eq 'INSTALLED' -and ([version]$node.Version).Major -ne 22) {
        $node.Status='INCOMPATIBLE'; $node.Detail='The supported Node.js major version is 22.'; $node.Remediation='Install Node.js 22 LTS and select it on PATH.'
    }
    $checks.Add($node)
    $checks.Add((Get-CirnetDoctorTool 'npm' @('npm.cmd','npm.exe') -Remediation 'Install npm with Node.js 22 and add npm to PATH.'))
    $bootstrapMissing = @($checks | Where-Object { $_.Required -and $_.Status -ne 'INSTALLED' })
    $remediation = 'Run .\run-cirnet.bat start to bootstrap the pinned release.'
    $venvPython = Join-Path $configuration.DevHome '.venv\Scripts\python.exe'
    try {
        if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
            $checks.Add((New-CirnetDoctorCheck 'Launcher virtual environment' $true 'MISSING' '' $venvPython 'The external launcher virtual environment has not been created.' $remediation))
        } else {
            $null = Assert-CirnetDoctorOwnedPath $venvPython $configuration.DevHome -File
            $cfg = Assert-CirnetDoctorOwnedPath (Join-Path $configuration.DevHome '.venv\pyvenv.cfg') $configuration.DevHome -File
            $contents = Get-Content -LiteralPath $cfg -Raw -ErrorAction Stop
            if ($contents -notmatch '(?m)^version\s*=\s*(\d+\.\d+(?:\.\d+)?)\s*$') { throw 'The launcher virtual environment configuration does not declare a Python version.' }
            $venvVersion = $Matches[1]
            if ([version]$venvVersion -lt [version]'3.12') { throw 'The launcher virtual environment requires Python 3.12 or newer.' }
            $checks.Add((New-CirnetDoctorCheck 'Launcher virtual environment' $true 'INSTALLED' $venvVersion $venvPython 'The external virtual environment files are present; code execution waits for release cache validation.' ''))
        }
    } catch {
        $repair = "Stop CIRNET, recreate only '$($configuration.DevHome)\.venv' with Python 3.12+, move launcher-state.json aside, then run .\run-cirnet.bat start. Keep databases and captures."
        $checks.Add((New-CirnetDoctorCheck 'Launcher virtual environment' $true 'INCOMPATIBLE' '' $venvPython $_.Exception.Message $repair))
    }
    $cache = Test-CirnetDoctorReleaseCache $configuration
    $cacheRemediation = if ($cache.Status -eq 'INSTALLED') { '' } elseif ($cache.Status -eq 'INCOMPATIBLE') {
        'Stop CIRNET, move launcher-state.json aside, then run .\run-cirnet.bat start to rebuild the pinned setup. Keep databases and captures.'
    } else { $remediation }
    $checks.Add((New-CirnetDoctorCheck 'Pinned release cache' $true $cache.Status $cache.Version $cache.Path $cache.Detail $cacheRemediation))
    $checks.Add((Get-CirnetDoctorCachedPython $configuration $cache))
    $checks.Add((Get-CirnetDoctorWebDependencies $cache))
    $checks.Add((Get-CirnetDoctorAllocatorCache $configuration))
    $activity = Get-CirnetLauncherActivity -Configuration $configuration
    foreach ($port in @(50051,8000,5173)) {
        $probe = Get-CirnetPortStatus -Port $port
        $status='NOT VERIFIED'; $detail=$probe.Detail; $fix='Inspect local listeners, then retry doctor.'
        if ($probe.Status -eq 'Available') { $status='INSTALLED'; $fix='' }
        elseif ($probe.Status -eq 'InUse') {
            if ($activity.Status -eq 'Running') { $detail += ' A CIRNET launcher is active; listener ownership was not established.'; $fix='Run .\run-cirnet.bat stop, then retry doctor.' }
            else { $status='INCOMPATIBLE'; $fix="Stop the process using port $port, then retry doctor." }
        }
        $checks.Add((New-CirnetDoctorCheck ('Port ' + $port) $true $status '' ('127.0.0.1:' + $port) $detail $fix))
    }
    $checks.Add((Get-CirnetDoctorTool 'CMake' @('cmake.exe') -Required $false -Remediation 'Optional native builds: install CMake and add cmake.exe to PATH.'))
    $checks.Add((Get-CirnetDoctorTool 'Ninja' @('ninja.exe') -Required $false -Remediation 'Optional native builds: install Ninja and add ninja.exe to PATH.'))
    $checks.Add((Get-CirnetDoctorMsvc))
    $fpgaRemediation = 'Optional FPGA work: install the selected project toolchain and expose its executable on PATH.'
    foreach ($tool in @(@('Quartus','quartus_sh.exe','--version'),@('Icarus Verilog','iverilog.exe','-V'),@('Icarus runtime','vvp.exe','-V'),@('slang','slang.exe','--version'))) {
        $check = Get-CirnetDoctorTool -Name $tool[0] -Commands @($tool[1]) -Arguments @($tool[2]) -Required $false -Remediation $fpgaRemediation
        if ($check.Status -eq 'INSTALLED') { $check.Detail = 'Tool version and availability only; FPGA compilation, board access and firmware were not verified.' }
        $checks.Add($check)
    }
    # Vivado version launches may create journals; inspect file metadata only.
    $vivado = Find-CirnetDoctorCommand @('vivado.exe','vivado.bat')
    $vivadoStatus='MISSING'; $vivadoVersion=''; $vivadoPath=''; $vivadoDetail='Optional FPGA tool was not found on PATH.'
    if ($vivado) {
        $vivadoStatus='NOT VERIFIED'; $vivadoPath=$vivado.Source
        $vivadoDetail='Vivado is present; no process was launched, so no journal or log can be created. The tool version was not verified.'
        try {
            $vivadoVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($vivadoPath).ProductVersion
            if ($vivadoVersion) { $vivadoStatus='INSTALLED'; $vivadoDetail='Vivado file product version and availability only; FPGA compilation, board access and firmware were not verified.' }
        } catch { }
    }
    $checks.Add((New-CirnetDoctorCheck 'Vivado' $false $vivadoStatus $vivadoVersion $vivadoPath $vivadoDetail $fpgaRemediation))
    $checks.Add((New-CirnetDoctorCheck 'Physical FPGA / firmware' $false 'NOT VERIFIED' '' '' 'Tool availability does not verify a physical board, firmware, bitstream or synthesis result. Local simulation does not require FPGA tools.' 'Use the FPGA repository verification workflow for physical hardware and firmware.'))
    $missing = @($checks | Where-Object { $_.Required -and $_.Status -ne 'INSTALLED' })
    [pscustomobject]@{ Ready=($missing.Count -eq 0); BootstrapReady=($bootstrapMissing.Count -eq 0); Checks=$checks.ToArray(); MissingRequired=$missing }
}

Export-ModuleMember -Function Get-CirnetEnvironmentReport
