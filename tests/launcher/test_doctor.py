"""Read-only doctor behavior exercised by native Windows PowerShell 5.1."""
import json
import hashlib
import shutil
import subprocess
from pathlib import Path

import pytest

from tests.launcher.support import REPO, run_ps


MODULE = REPO / "scripts" / "launcher" / "Doctor.psm1"


def ps(value):
    return "'" + str(value).replace("'", "''") + "'"


def report(dev_home, setup="", repository=REPO):
    result = run_ps(
        f"$module = Import-Module {ps(MODULE)} -Force -PassThru; "
        + setup
        + f"Get-CirnetEnvironmentReport -RepositoryRoot {ps(repository)} "
        + f"-DevHome {ps(dev_home)} | ConvertTo-Json -Depth 20 -Compress"
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def checks(value):
    return {item["Name"]: item for item in value["Checks"]}


# Stubs live only in the imported module. Commands are never replaced on disk.
GOOD_TOOLS = r"""
& $module {
    $script:NativeProbe = ${function:Invoke-CirnetDoctorProcess}
    function script:Find-CirnetDoctorCommand { param($Names)
        [pscustomobject]@{ Source = ('C:\tools\' + ($Names[0] -replace '\.cmd$', '.exe')) }
    }
    function script:Invoke-CirnetDoctorProcess { param($FilePath, $Arguments, $TimeoutMilliseconds)
        if ($Arguments -contains '-e') {
            return & $script:NativeProbe -FilePath (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source -Arguments $Arguments -TimeoutMilliseconds $TimeoutMilliseconds
        }
        $output = switch -Regex ($FilePath) {
            'git' { 'git version 2.50.0'; break }
            'python' {
                if ($Arguments -contains '-S') { '{"python":"3.12.7","packages":{}}' }
                elseif ($Arguments -contains '--version') { 'Python 3.12.7' }
                elseif ($Arguments -contains 'pip') { 'pip 25.0 from C:\tools\pip (python 3.12)' }
                else { 'OK' }
                break
            }
            'node' { 'v22.19.0'; break }
            'npm' { '10.9.0'; break }
            default { '1.0.0' }
        }
        [pscustomobject]@{ ExitCode = 0; Output = $output; TimedOut = $false; Error = '' }
    }
    function script:Get-CirnetPortStatus { param($Port)
        [pscustomobject]@{ Port=$Port; Status='Available'; Detail='Port is available.' }
    }
    function script:Get-CirnetLauncherActivity { param($Configuration)
        [pscustomobject]@{ Status='Stopped'; Detail='No launcher is active.' }
    }
}
"""


def test_fresh_machine_distinguishes_bootstrap_from_installed_readiness(tmp_path):
    dev = tmp_path / "uncreated-dev"
    value = report(dev, GOOD_TOOLS)
    assert value["Ready"] is False
    assert value["BootstrapReady"] is True
    assert not dev.exists(), "Doctor must not create the development directory."
    by_name = checks(value)
    assert by_name["Launcher virtual environment"]["Status"] == "MISSING"
    assert by_name["Pinned release cache"]["Status"] == "MISSING"
    assert "start" in by_name["Pinned release cache"]["Remediation"]
    assert by_name["Physical FPGA / firmware"]["Status"] == "NOT VERIFIED"
    assert by_name["Icarus Verilog"]["Status"] == "INSTALLED"
    assert by_name["Icarus Verilog"]["Version"] == "1.0.0"
    for check in value["Checks"]:
        assert set(check) >= {"Name", "Required", "Status", "Version", "Path", "Detail", "Remediation"}
        assert check["Status"] in {"INSTALLED", "MISSING", "INCOMPATIBLE", "NOT VERIFIED"}
        assert isinstance(check["Required"], bool)


def test_missing_commands_are_reported_without_executing_them(tmp_path):
    setup = r"""
& $module {
    function script:Find-CirnetDoctorCommand { param($Names) return $null }
    function script:Invoke-CirnetDoctorProcess { param($FilePath)
        if ($FilePath -match '(git|python|node|npm)\.(exe|cmd)$') { throw 'A missing command was executed.' }
        [pscustomobject]@{ ExitCode=1; Output=''; TimedOut=$false; Error='' }
    }
}
"""
    value = report(tmp_path / "dev", setup)
    by_name = checks(value)
    for name in ("Git", "Python", "Node.js", "npm"):
        assert by_name[name]["Status"] == "MISSING"
        assert by_name[name]["Remediation"]
    assert not value["Ready"]
    assert not value["BootstrapReady"]


def test_python_minimum_and_node_major_are_enforced(tmp_path):
    setup = GOOD_TOOLS + r"""
& $module {
    function script:Invoke-CirnetDoctorProcess { param($FilePath, $Arguments, $TimeoutMilliseconds)
        $output = if ($FilePath -match 'python') { 'Python 3.11.9' }
                  elseif ($FilePath -match 'node') { 'v24.0.0' }
                  elseif ($FilePath -match 'git') { 'git version 2.50.0' }
                  else { '10.0.0' }
        [pscustomobject]@{ ExitCode=0; Output=$output; TimedOut=$false; Error='' }
    }
}
"""
    value = report(tmp_path / "dev", setup)
    assert checks(value)["Python"]["Status"] == "INCOMPATIBLE"
    assert checks(value)["Node.js"]["Status"] == "INCOMPATIBLE"
    assert not value["BootstrapReady"]


def test_unrelated_occupied_port_prevents_ready(tmp_path):
    setup = GOOD_TOOLS + r"""
& $module {
    function script:Get-CirnetPortStatus { param($Port)
        [pscustomobject]@{ Port=$Port; Status='InUse'; Detail='Unrelated listener.' }
    }
}
"""
    value = report(tmp_path / "dev", setup)
    for port in (50051, 8000, 5173):
        check = checks(value)[f"Port {port}"]
        assert check["Status"] == "INCOMPATIBLE"
        assert "Unrelated listener" in check["Detail"]


def test_cache_path_outside_dev_is_rejected_before_cached_python(tmp_path):
    dev = tmp_path / "dev"
    dev.mkdir()
    outside = tmp_path / "untrusted.json"
    outside.write_text("not JSON and must never be opened", encoding="utf-8")
    (dev / "launcher-state.json").write_text(
        json.dumps({"repo": str(REPO), "environmentFile": str(outside), "manifestHash": "0" * 64}),
        encoding="utf-8",
    )
    before = {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}
    value = report(dev, GOOD_TOOLS)
    assert checks(value)["Pinned release cache"]["Status"] == "INCOMPATIBLE"
    assert "Cached Python dependencies" in checks(value)
    assert checks(value)["Cached Python dependencies"]["Status"] != "INSTALLED"
    assert before == {path: path.read_bytes() for path in tmp_path.rglob("*") if path.is_file()}


def install_web_runtime(interface):
    packages = {
        "vite": {"version": "6.4.4", "main": "index.js", "dependencies": {"rollup": "4.0.0", "esbuild": "0.25.12"}},
        "@vitejs/plugin-vue": {"version": "5.2.1", "main": "index.js"},
        "rollup": {"version": "4.0.0", "main": "index.js"},
        "esbuild": {"version": "0.25.12", "main": "index.js"},
        "@rollup/rollup-win32-x64-msvc": {"version": "4.0.0", "main": "rollup.win32-x64-msvc.node"},
        "@esbuild/win32-x64": {"version": "0.25.12"},
    }
    lock_packages = {"": {"devDependencies": {"vite": "6.4.4", "@vitejs/plugin-vue": "5.2.1"}}}
    for name, identity in packages.items():
        directory = interface / "node_modules" / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "package.json").write_text(json.dumps({"name": name, **identity}), encoding="utf-8")
        if identity.get("main"):
            (directory / identity["main"]).write_bytes(b"dummy entry; must never be executed")
        lock_packages["node_modules/" + name] = identity
    binary = interface / "node_modules/@esbuild/win32-x64/esbuild.exe"
    binary.write_bytes(b"dummy native payload; must never be executed")
    (interface / "package-lock.json").write_text(json.dumps({"lockfileVersion": 3, "packages": lock_packages}), encoding="utf-8")
    return binary


def installed_cache(tmp_path):
    """Build a disposable release selection and matching files, never executable code."""
    repository = tmp_path / "repo"
    dev = tmp_path / "dev"
    session = dev / "session"
    installation = session / "release"
    installation.mkdir(parents=True)
    (repository / "integration").mkdir(parents=True)
    allocator = repository / ".build/contracts-tools"
    allocator.mkdir(parents=True)
    resource = allocator / "allocator.mjs"
    resource.write_bytes(b"owned allocator resource; never loaded")
    pin = {"dev": {"name": "netcircuit-artifact-paths", "version": "1.0.0a1", "node_sha256": hashlib.sha256(resource.read_bytes()).hexdigest()}}
    (repository / "integration/contracts-version.json").write_text(json.dumps(pin), encoding="utf-8")
    (allocator / "allocator.json").write_text(json.dumps({
        "name": pin["dev"]["name"], "version": pin["dev"]["version"], "sha256": pin["dev"]["node_sha256"],
        "resource": "netcircuit_artifact_paths/artifact-paths.mjs",
    }), encoding="utf-8")
    manifest = json.loads((REPO / "integration/release-set.json").read_text(encoding="utf-8"))
    artifacts = {}
    for component, product in manifest["repositories"].items():
        directory = installation / component
        directory.mkdir()
        artifacts[component] = {}
        for kind, artifact in product["artifacts"].items():
            payload = (component + ":" + kind).encode()
            archive = directory / artifact["filename"]
            archive.write_bytes(payload)
            artifact["sha256"] = hashlib.sha256(payload).hexdigest()
            artifact["size"] = len(payload)
            artifacts[component][kind] = str(archive)
    snapshot = installation / "release-set.json"
    lock = repository / "integration/release-set.json"
    for target in (snapshot, lock):
        target.write_text(json.dumps(manifest), encoding="utf-8")
    interpreter = dev / ".venv/Scripts/python.exe"
    interpreter.parent.mkdir(parents=True)
    interpreter.write_bytes(b"not executable: probe is stubbed")
    (dev / ".venv/Lib/site-packages").mkdir(parents=True)
    (dev / ".venv/pyvenv.cfg").write_text("version = 3.12.7\n", encoding="utf-8")
    context = {"version": 1, "owner": "git:" + str(repository), "roots": [str(repository)]}
    (session / ".netcircuit-artifact-session.json").write_text(
        json.dumps({"version": 2, "directory": str(session), "context": context}), encoding="utf-8"
    )
    environment = {"NETCIRCUIT_ARTIFACTS_SESSION": str(session), "NETCIRCUIT_ARTIFACTS_CONTEXT": json.dumps(context)}
    for component in ("CONTRACTS", "SIMULATOR", "HARDWARE", "FPGA"):
        selected = installation / (component.lower() + ".json")
        component_name = next(name for name in artifacts if name.upper() == component)
        kinds = ("python", "sdist", "npm", "dev", "dev_npm") if component == "CONTRACTS" else ("source",) if component == "FPGA" else ("python",)
        selected.write_text(json.dumps({"schemaVersion": 1, **{
            kind: {"path": artifacts[component_name][kind], "sha256": manifest["repositories"][component_name]["artifacts"][kind]["sha256"]}
            for kind in kinds
        }}), encoding="utf-8")
        environment[f"NETCIRCUIT_{component}_ARTIFACT_MANIFEST"] = str(selected)
    for key in ("NETCIRCUIT_INTERFACE_ROOT", "NETCIRCUIT_INTERFACE_STATIC_ROOT", "NETCIRCUIT_FPGA_ROOT"):
        directory = installation / key
        directory.mkdir()
        environment[key] = str(directory)
    interface = Path(environment["NETCIRCUIT_INTERFACE_ROOT"])
    (interface / "node_modules/vite/bin").mkdir(parents=True)
    (interface / "node_modules/vite/bin/vite.js").write_text("", encoding="utf-8")
    install_web_runtime(interface)
    (interface / "interface-artifact.json").write_text(json.dumps({
        "version": manifest["repositories"]["Interface"]["version"],
        "source": {"revision": manifest["repositories"]["Interface"]["sourceRevision"]},
    }), encoding="utf-8")
    process = {"PYTHONDONTWRITEBYTECODE": "1"}
    for key in ("TMP", "TEMP", "TMPDIR", "PIP_CACHE_DIR", "npm_config_cache"):
        directory = installation / key
        directory.mkdir()
        process[key] = str(directory)
    environment_file = session / "release-env.json"
    state = {
        "schemaVersion": 1, "releaseVersion": manifest["releaseVersion"], "python": str(interpreter),
        "environmentFile": str(environment_file), "manifest": str(snapshot),
        "manifestSha256": hashlib.sha256(snapshot.read_bytes()).hexdigest(),
        "environment": environment, "processEnvironment": process, "artifacts": artifacts,
    }
    environment_file.write_text(json.dumps(state), encoding="utf-8")
    (dev / "launcher-state.json").write_text(json.dumps({
        "repo": str(repository), "manifestHash": hashlib.sha256(lock.read_bytes()).hexdigest(),
        "environmentFile": str(environment_file),
    }), encoding="utf-8")
    return repository, dev, state


def test_complete_matching_cache_can_be_ready_without_optional_tools(tmp_path):
    repository, dev, state = installed_cache(tmp_path)
    setup = GOOD_TOOLS + r"""
& $module {
    function script:Get-CirnetDoctorMsvc { New-CirnetDoctorCheck 'MSVC v143 (Visual Studio Build Tools)' $false 'MISSING' }
}
"""
    value = report(dev, setup, repository)
    assert value["Ready"], value["MissingRequired"]
    assert value["MissingRequired"] == []
    assert checks(value)["Pinned release cache"]["Status"] == "INSTALLED"
    assert checks(value)["Cached Python dependencies"]["Status"] == "INSTALLED"
    assert checks(value)["MSVC v143 (Visual Studio Build Tools)"]["Status"] == "MISSING"


def test_windows_cache_repository_path_case_does_not_invalidate_identity(tmp_path):
    repository, dev, state = installed_cache(tmp_path)
    cache_path = dev / "launcher-state.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8"))
    cache["repo"] = str(repository).upper()
    cache_path.write_text(json.dumps(cache), encoding="utf-8")
    assert report(dev, GOOD_TOOLS, repository)["Ready"]


@pytest.mark.parametrize("corruption", ["archive", "schema", "snapshot", "interpreter", "session_marker", "selected_manifest"])
def test_cache_corruption_is_rejected_before_cached_code(tmp_path, corruption):
    repository, dev, state = installed_cache(tmp_path)
    if corruption == "archive":
        Path(state["artifacts"]["Remote"]["python"]).write_bytes(b"changed")
    elif corruption == "schema":
        state["schemaVersion"] = 999
    elif corruption == "snapshot":
        Path(state["manifest"]).write_text("{}", encoding="utf-8")
    elif corruption == "interpreter":
        state["python"] = str(tmp_path / "untrusted.exe")
    elif corruption == "session_marker":
        marker = Path(state["environment"]["NETCIRCUIT_ARTIFACTS_SESSION"]) / ".netcircuit-artifact-session.json"
        marker.write_text("{}", encoding="utf-8")
    elif corruption == "selected_manifest":
        Path(state["environment"]["NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST"]).write_text("{}", encoding="utf-8")
    Path(state["environmentFile"]).write_text(json.dumps(state), encoding="utf-8")
    setup = GOOD_TOOLS + r"""
& $module {
    $script:originalProbe = ${function:Invoke-CirnetDoctorProcess}
    function script:Invoke-CirnetDoctorProcess { param($FilePath, $Arguments, $TimeoutMilliseconds)
        if ($FilePath -match '\\.venv\\') { throw 'Unvalidated cached interpreter was executed.' }
        & $originalProbe @PSBoundParameters
    }
}
"""
    value = report(dev, setup, repository)
    assert not value["Ready"]
    assert checks(value)["Pinned release cache"]["Status"] == "INCOMPATIBLE"
    assert "move launcher-state.json aside" in checks(value)["Pinned release cache"]["Remediation"]
    assert "databases and captures" in checks(value)["Pinned release cache"]["Remediation"]
    assert checks(value)["Cached Python dependencies"]["Status"] == "NOT VERIFIED"


def test_incompatible_cached_python_has_data_preserving_repair_instructions(tmp_path):
    repository, dev, state = installed_cache(tmp_path)
    (dev / ".venv/pyvenv.cfg").write_text("version = 3.11.9\n", encoding="utf-8")
    value = report(dev, GOOD_TOOLS, repository)
    by_name = checks(value)
    assert by_name["Launcher virtual environment"]["Status"] == "INCOMPATIBLE"
    assert "recreate only" in by_name["Launcher virtual environment"]["Remediation"]
    assert "databases and captures" in by_name["Launcher virtual environment"]["Remediation"]
    assert by_name["Cached Python dependencies"]["Status"] == "NOT VERIFIED"


def test_native_report_does_not_mutate_process_environment_or_create_state(tmp_path):
    dev = tmp_path / "native-dev"
    result = run_ps(
        f"Import-Module {ps(MODULE)} -Force; "
        "$before = [Environment]::GetEnvironmentVariables('Process') | ConvertTo-Json -Compress; "
        f"$report = Get-CirnetEnvironmentReport -RepositoryRoot {ps(REPO)} -DevHome {ps(dev)}; "
        "$after = [Environment]::GetEnvironmentVariables('Process') | ConvertTo-Json -Compress; "
        "[pscustomobject]@{ Report=$report; SameEnvironment=($before -ceq $after) } | ConvertTo-Json -Depth 20 -Compress",
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    assert value["SameEnvironment"]
    assert not dev.exists()
    by_name = checks(value["Report"])
    assert by_name["PowerShell"]["Status"] == "INSTALLED"
    assert by_name["PowerShell"]["Version"].startswith("5.1")
    assert Path(by_name["PowerShell"]["Path"]).name.lower() == "powershell.exe"


def test_native_process_probe_has_a_real_timeout():
    result = run_ps(
        f"$module=Import-Module {ps(MODULE)} -Force -PassThru; "
        "& $module { $clock=[Diagnostics.Stopwatch]::StartNew(); "
        "$probe=Invoke-CirnetDoctorProcess -FilePath (Join-Path $PSHOME 'powershell.exe') "
        "-Arguments @('-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 20') "
        "-TimeoutMilliseconds 200; "
        "[pscustomobject]@{ Probe=$probe; Milliseconds=$clock.ElapsedMilliseconds } | ConvertTo-Json -Compress }",
        timeout=10,
    )
    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    assert value["Probe"]["TimedOut"]
    assert value["Milliseconds"] < 5000


def cached_metadata_report(dev, manifest):
    """Run the production metadata probe using a real Python and owned fake wheels."""
    executable = shutil.which("python.exe")
    if not executable:
        pytest.skip("The isolated metadata regression requires Python 3.12+.")
    version = subprocess.run([executable, "-I", "-S", "-B", "-c", "import sys; print(int(sys.version_info >= (3,12)))"], capture_output=True, text=True, timeout=10)
    if version.stdout.strip() != "1":
        pytest.skip("The isolated metadata regression requires Python 3.12+.")
    result = run_ps(
        f"$module=Import-Module {ps(MODULE)} -Force -PassThru; "
        "& $module { param($Dev,$Manifest,$RealPython) "
        "$script:ActualProbe=${function:Invoke-CirnetDoctorProcess}; "
        "$script:ProbePython=$RealPython; "
        "function script:Invoke-CirnetDoctorProcess { param($FilePath,$Arguments,$TimeoutMilliseconds) "
        "& $script:ActualProbe -FilePath $script:ProbePython -Arguments $Arguments -TimeoutMilliseconds $TimeoutMilliseconds }; "
        "$cache=[pscustomobject]@{ Status='INSTALLED'; Manifest=(Get-Content -LiteralPath $Manifest -Raw|ConvertFrom-Json) }; "
        "Get-CirnetDoctorCachedPython ([pscustomobject]@{DevHome=$Dev}) $cache | ConvertTo-Json -Compress "
        f"}} {ps(dev)} {ps(manifest)} {ps(executable)}",
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.mark.parametrize("missing", ["native", "inventory"])
def test_real_metadata_probe_rejects_missing_native_payload_and_record(tmp_path, missing):
    dev = tmp_path / "d"
    site = dev / ".venv/Lib/site-packages"
    site.mkdir(parents=True)
    names = {
        "netcircuit-api": "0.1.1", "netcircuit-contracts": "0.1.1", "netcircuit-simulator": "0.1.1",
        "netcircuit-hardware-service": "0.1.1", "netcircuit-artifact-paths": "1.0.0a1",
        "uvicorn": "0.54.0", "fastapi": "0.143.0", "grpcio": "1.84.0", "pip": "26.0",
    }
    for name, version in names.items():
        package = name.replace("-", "_")
        distribution = site / f"{package}-{version}.dist-info"
        distribution.mkdir()
        metadata = distribution / "METADATA"
        metadata.write_text(f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n", encoding="utf-8")
        module = site / package / "__init__.py"
        module.parent.mkdir()
        module.write_text("", encoding="utf-8")
        records = [str(module.relative_to(site)).replace("\\", "/"), str(metadata.relative_to(site)).replace("\\", "/")]
        if name == "pip":
            parser = site / "pip/_vendor/packaging/requirements.py"
            parser.parent.mkdir(parents=True)
            parser.write_text("class Requirement: pass\n", encoding="utf-8")
            records.append(str(parser.relative_to(site)).replace("\\", "/"))
        if name == "grpcio":
            native = site / "grpcio/cygrpc.pyd"
            native.write_bytes(b"owned dummy native payload; never loaded")
            records.append(str(native.relative_to(site)).replace("\\", "/"))
            native_record = distribution / "RECORD"
        (distribution / "RECORD").write_text("".join(path + ",,\n" for path in records), encoding="utf-8")
    manifest = REPO / "integration/release-set.json"
    assert cached_metadata_report(dev, manifest)["Status"] == "INSTALLED"
    (native if missing == "native" else native_record).unlink()
    result = cached_metadata_report(dev, manifest)
    assert result["Status"] == "INCOMPATIBLE", result


@pytest.mark.parametrize("missing", ["rollup", "esbuild_native"])
def test_missing_web_runtime_dependency_blocks_readiness(tmp_path, missing):
    repository, dev, state = installed_cache(tmp_path)
    interface = Path(state["environment"]["NETCIRCUIT_INTERFACE_ROOT"])
    # These fixtures are installed files; the diagnostic must inspect them without
    # loading their code or running npm/server commands.
    binary = interface / "node_modules/@esbuild/win32-x64/esbuild.exe"
    assert report(dev, GOOD_TOOLS, repository)["Ready"]
    if missing == "rollup":
        shutil.rmtree(interface / "node_modules/rollup")
    else:
        binary.unlink()
    value = report(dev, GOOD_TOOLS, repository)
    assert not value["Ready"], "Missing bundler runtime payload must block the installed-ready summary."


@pytest.mark.parametrize("state", ["missing", "corrupt"])
def test_required_allocator_cache_is_checked_without_restoring_it(tmp_path, state):
    repository, dev, saved = installed_cache(tmp_path)
    pin = json.loads((REPO / "integration/contracts-version.json").read_text(encoding="utf-8"))
    (repository / "integration/contracts-version.json").write_text(json.dumps(pin), encoding="utf-8")
    directory = repository / ".build/contracts-tools"
    shutil.rmtree(directory)
    if state == "corrupt":
        directory.mkdir(parents=True)
        (directory / "allocator.json").write_text(json.dumps({"name": pin["dev"]["name"], "version": pin["dev"]["version"], "sha256": pin["dev"]["node_sha256"]}), encoding="utf-8")
        (directory / "allocator.mjs").write_text("corrupted resource", encoding="utf-8")
    value = report(dev, GOOD_TOOLS, repository)
    check = checks(value)["DEV allocator cache"]
    assert check["Status"] == ("MISSING" if state == "missing" else "INCOMPATIBLE")
    assert not value["Ready"]
    assert "start" in check["Remediation"] if state == "missing" else "materialize_allocator" in check["Remediation"]
    assert not (repository / ".build/contracts-tools/allocator.mjs").exists() if state == "missing" else (repository / ".build/contracts-tools/allocator.mjs").read_text(encoding="utf-8") == "corrupted resource"
