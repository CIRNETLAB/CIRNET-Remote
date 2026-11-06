"""Stage 4 paired browser compatibility with released and source Interface."""
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
from secrets import token_urlsafe
import shutil
import subprocess
from tarfile import open as open_tar
from time import monotonic, sleep
from uuid import uuid4

import httpx
import psutil

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import ORIGIN, stop_owned_backend
from scripts.install_release import _checked_tar
from tests.integration.native_hardware_gate_cases import harness, native_service
from tests.integration.native_remote_gate_cases import (
    REFERENCE_SHA256, SERVE_REFERENCE, WORKER_SHA256, _environment, _http_service, _select_reference,
)

STATIC_SHA256 = "f092cd7305ebe33d515d80642e422078b969540d276d0d09cda1266a87d11d74"
INTERFACE_SOURCE_REVISION = "66845b01f9b02b70e6ec28ececd163133cdcdfa2"
INTERFACE_SOURCE_SHA256 = "9a1eaaf7394d9afd4a72e275663a65d3ac89b3d5aea73b372d02bf4c84b78637"
NPM_CONTRACTS_SHA256 = "b963cf4990fee8b5a9294a6aaf85cfd803ed7724efc9ad2b3ee1ec302646b3c8"
NPM_DEV_SHA256 = "764fda1ffcb189af5c063653b8656fd3acdab1877f2f87b74182fff3269f9132"
CAPTURE_SHA256 = "a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010"
SEED = """
import os
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository
settings = Settings()
repo = Repository(settings.database_url)
try:
    AuthService(repo, settings).bootstrap_admin('e2e_admin',
        os.environ['CIRNET_E2E_ADMIN_PASSWORD'], 'Test Administrator')
finally:
    repo.close()
"""
SOURCES = Path(__file__).resolve().parent
HIDE = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def digest(path):
    with path.open("rb") as stream:
        import hashlib
        return hashlib.file_digest(stream, "sha256").hexdigest()


@contextmanager
def vite(mode, interface, static, backend, directory, environment, node):
    with (directory / f"{mode}-vite.log").open("wb") as log, subprocess.Popen(
        [str(node), str(SOURCES / "native_remote_browser_vite.mjs"), mode, str(interface), str(static), ORIGIN,
         backend, str(directory)], cwd=directory, env=environment, stdin=subprocess.PIPE,
        stdout=log, stderr=subprocess.STDOUT, creationflags=HIDE,
    ) as child:
        try:
            deadline = monotonic() + 30
            while child.poll() is None and monotonic() < deadline:
                if b"CIRNET_BROWSER_READY" in Path(log.name).read_bytes():
                    try:
                        if httpx.get(ORIGIN + "/api/health", timeout=1, trust_env=False).status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                sleep(.05)
            else:
                raise AssertionError(f"Interface Vite readiness failed. Inspect {log.name}.")
            yield
        finally:
            stop_owned_backend(child, psutil)


def run(command, directory, environment, log_name, timeout, *, cwd=None):
    with (directory / log_name).open("wb") as log, subprocess.Popen(
        command, cwd=cwd or directory, env=environment, stdin=subprocess.PIPE,
        stdout=log, stderr=subprocess.STDOUT, creationflags=HIDE,
    ) as child:
        try:
            assert child.wait(timeout=timeout) == 0, f"Inspect {log.name}"
        except subprocess.TimeoutExpired:
            stop_owned_backend(child, psutil, graceful_seconds=1)
            raise


def check_archive_members(archive, source, strip_prefix=None):
    count = 0
    for member in archive:
        if not member.isfile():
            continue
        parts = Path(member.name).parts
        if strip_prefix is not None:
            assert parts[0] == strip_prefix
            parts = parts[1:]
        target = source.joinpath(*parts)
        assert not target.is_symlink() and target.resolve(strict=True).is_relative_to(source)
        assert target.read_bytes() == archive.extractfile(member).read(), member.name
        count += 1
    assert count
    return count


def verify_tools(interface, browser, browser_cache, python, node):
    assert interface.is_relative_to(artifact_directory())
    assert browser.is_file() and browser.name == "chrome-headless-shell.exe"
    assert (browser.parents[1].name == "chromium_headless_shell-1248" and
            browser.is_relative_to(browser_cache))
    assert python.is_relative_to(artifact_directory())
    pw = json.loads((interface / "node_modules/@playwright/test/package.json").read_bytes())
    assert pw["version"] == "1.64.1"
    vite_package = json.loads((interface / "node_modules/vite/package.json").read_bytes())
    assert vite_package["version"] == "6.4.4"
    spec = interface / "e2e/lab-workflows.spec.ts"
    source_archive = Path(os.environ["CIRNET_STAGE4_INTERFACE_SOURCE_ARCHIVE"]).resolve(strict=True)
    assert source_archive.is_relative_to(artifact_directory())
    assert digest(source_archive) == INTERFACE_SOURCE_SHA256
    with open_tar(source_archive, "r:") as archive:
        source_members = check_archive_members(archive, interface)
    npm_members = {}
    for name, filename, expected in (
        ("contracts", "cirnet-contracts-0.1.2.tgz", NPM_CONTRACTS_SHA256),
        ("artifact-paths", "cirnet-artifact-paths-1.0.0-m1.0.tgz", NPM_DEV_SHA256),
    ):
        path = interface / ".artifacts" / filename
        assert digest(path) == expected
        with open_tar(path, "r:gz") as archive:
            package = interface / "node_modules/@cirnet" / name
            npm_members[name] = check_archive_members(archive, package, "package")
    requirements = Path(os.environ["CIRNET_STAGE4_PLAYWRIGHT_REQUIREMENTS"]).resolve(strict=True)
    assert requirements.is_relative_to(artifact_directory())
    return {"node": subprocess.check_output([str(node), "--version"], text=True, timeout=15).strip(),
            "node_playwright": pw["version"], "vite": vite_package["version"],
            "chromium_sha256": digest(browser), "interface_source_revision": INTERFACE_SOURCE_REVISION,
            "interface_source_sha256": INTERFACE_SOURCE_SHA256, "interface_source_members": source_members,
            "interface_lab_spec_sha256": digest(spec),
            "interface_package_lock_sha256": digest(interface / "package-lock.json"),
            "contracts_npm_sha256": NPM_CONTRACTS_SHA256, "allocator_npm_sha256": NPM_DEV_SHA256,
            "verified_npm_members": npm_members, "python_playwright_lock_sha256": digest(requirements)}


def reused_reference(path, tools, workload):
    receipt_path = Path(path).resolve(strict=True)
    assert receipt_path.is_relative_to(artifact_directory())
    assert receipt_path.name == "reference-calibration.json"
    receipt_hash = digest(receipt_path)
    assert receipt_hash == os.environ["CIRNET_STAGE4_BROWSER_REFERENCE_SHA256"]
    receipt = json.loads(receipt_path.read_bytes())
    assert receipt["status"] == "PASS" and receipt["scope"] == "reference-only harness calibration"
    assert receipt["reference_manifest_sha256"] == REFERENCE_SHA256
    assert receipt["interface_static_sha256"] == STATIC_SHA256
    assert receipt["tools"] == tools
    assert receipt["driver_sha256"] == digest(SOURCES / "native_remote_browser.py")
    assert digest(SOURCES / "native_remote_browser_vite.mjs") == os.environ["CIRNET_STAGE4_BROWSER_REFERENCE_VITE_SHA256"]
    assert receipt["existing_interface_tests"] == "2/2"
    lane = receipt_path.parent / "python"
    assert json.loads((lane / "workload.json").read_bytes()) == workload
    assert json.loads((lane / "python-browser.json").read_bytes()) == receipt["released_browser"]
    assert digest(lane / "capture.ncap") == CAPTURE_SHA256
    assert "2 passed" in (lane / "node-e2e.log").read_text(encoding="utf-8")
    assert digest(lane / "node-e2e.log") == os.environ["CIRNET_STAGE4_BROWSER_REFERENCE_NODE_LOG_SHA256"]
    return lane, receipt["released_browser"], {"receipt": str(receipt_path), "sha256": receipt_hash}


def test_stage4_interface_python_and_existing_e2e():
    root = artifact_directory(f"stage4-interface-e2e/paired-{uuid4().hex}")
    print(f"Stage 4 paired browser: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    native_hash = digest(native)
    assert native_hash == os.environ["CIRNET_STAGE4_BROWSER_CANDIDATE_SHA256"]
    interface = Path(os.environ["CIRNET_STAGE4_INTERFACE_SOURCE_ROOT"]).resolve(strict=True)
    playwright = Path(os.environ["CIRNET_STAGE4_PLAYWRIGHT_PYTHON"]).resolve(strict=True)
    browser = Path(os.environ["CIRNET_STAGE4_PLAYWRIGHT_CHROMIUM"]).resolve(strict=True)
    browser_cache = Path(os.environ["CIRNET_STAGE4_PLAYWRIGHT_CACHE"]).resolve(strict=True)
    node = Path(shutil.which("node")).resolve(strict=True)
    tools = verify_tools(interface, browser, browser_cache, playwright, node)

    static_bytes = Path(os.environ["CIRNET_STAGE4_INTERFACE_STATIC"]).read_bytes()
    assert len(static_bytes) == 2204606 and sha256(static_bytes).hexdigest() == STATIC_SHA256
    archive, members = _checked_tar(static_bytes)
    static = root / "interface"
    with archive:
        archive.extractall(static, members=members, filter="data")
    assert (static / "index.html").is_file()

    _, graph, configuration, vectors, expected = harness._workloads()[0]
    assert expected == CAPTURE_SHA256
    graph["metadata"]["name"] = "Stage 4 browser AND"
    physical = contracts / "contracts/circuit-schema/examples/physical-hc08-led.json"
    assert physical.is_file()
    workload = {"graph": graph, "configuration": configuration, "vectors": vectors,
                "physical": json.loads(physical.read_bytes())}
    seed_database = root / "seed.sqlite"
    password = token_urlsafe(24)
    run([str(python), "-I", "-B", "-c", SEED], root,
        {**_environment(root, seed_database), "CIRNET_E2E_ADMIN_PASSWORD": password}, "seed.log", 60)

    observations = {}
    lane_paths = {}
    reference_proof = None
    reference_only = os.environ.get("CIRNET_STAGE4_BROWSER_REFERENCE_ONLY") == "true"
    reference_path = os.environ.get("CIRNET_STAGE4_BROWSER_REFERENCE_RECEIPT")
    if reference_path:
        assert not reference_only
        lane_paths["python"], observations["python"], reference_proof = reused_reference(
            reference_path, tools, workload,
        )
        lanes = (("rust", True),)
        print(f"Stage 4 browser Python reference reused {reference_proof['sha256']}", flush=True)
    else:
        lanes = (("python", False),) if reference_only else (("python", False), ("rust", True))
    for label, is_native in lanes:
        lane = root / label
        lane.mkdir()
        lane_paths[label] = lane
        database = lane / "remote.sqlite"
        shutil.copyfile(seed_database, database)
        (lane / "workload.json").write_text(json.dumps(workload), encoding="utf-8")
        environment = {**_environment(lane, database), "CIRNET_REMOTE_READ_ONLY": "false",
            "CIRNET_CONTRACTS_ROOT": str(contracts), "CIRNET_SIM_CPP_WORKER": str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256, "CIRNET_SIMULATION_BACKEND": "cpp",
            "CIRNET_HARDWARE_PREVIEW": "true"}
        print(f"Stage 4 browser {label}: exact released Interface via Playwright Python", flush=True)
        with native_service(lane, environment, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            environment["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"] if is_native else [
                str(python), "-I", "-B", "-c", SERVE_REFERENCE,
            ]
            with _http_service(command, lane, environment) as client:
                backend = str(client.base_url).rstrip("/")
                browser_env = {**{key: value for key, value in os.environ.items()
                                  if not key.upper().startswith("VITE_")},
                    "CIRNET_E2E_ADMIN_PASSWORD": password,
                    "CIRNET_E2E_API_TARGET": backend, "CIRNET_E2E_DATA_DIR": str(lane),
                    "PLAYWRIGHT_BROWSERS_PATH": str(browser_cache),
                    "TMP": str(lane), "TEMP": str(lane), "TMPDIR": str(lane)}
                with vite("static", interface, static, backend, lane, browser_env, node):
                    run([str(playwright), "-I", "-B", str(SOURCES / "native_remote_browser.py"),
                         ORIGIN, str(browser), str(lane)], lane, browser_env, "python-browser.log", 100)
                print(f"Stage 4 browser {label}: existing Interface source E2E", flush=True)
                with vite("source", interface, static, backend, lane, browser_env, node):
                    node_session = Path(subprocess.check_output(
                        [str(node), str(interface / "scripts/artifact-paths.mjs"), "--directory", str(lane)],
                        cwd=interface, env=browser_env, text=True, timeout=15,
                    ).strip()).resolve(strict=True)
                    assert node_session.parent == lane and (node_session / ".cirnet-artifact-session.json").is_file()
                    node_env = {**browser_env, "CIRNET_ARTIFACTS_SESSION": str(node_session),
                                "NETCIRCUIT_ARTIFACTS_SESSION": str(node_session)}
                    run([str(node), str(interface / "node_modules/@playwright/test/cli.js"), "test",
                         "e2e/lab-workflows.spec.ts", "--grep",
                         "typed pre-run vectors|Stop during a real committed Create",
                         "--workers=1", "--retries=0", "--reporter=list"],
                        lane, node_env, "node-e2e.log", 130, cwd=interface)
                    assert "2 passed" in (lane / "node-e2e.log").read_text(encoding="utf-8")
        observations[label] = json.loads((lane / "python-browser.json").read_bytes())
        assert observations[label]["run"]["capture_sha256"] == CAPTURE_SHA256

    assert digest(native) == native_hash
    if reference_only:
        (root / "reference-calibration.json").write_text(json.dumps({
            "status": "PASS", "scope": "reference-only harness calibration",
            "reference_manifest_sha256": REFERENCE_SHA256, "tools": tools,
            "interface_static_sha256": STATIC_SHA256, "released_browser": observations["python"],
            "driver_sha256": digest(SOURCES / "native_remote_browser.py"), "existing_interface_tests": "2/2",
        }, indent=2) + "\n", encoding="utf-8")
        return
    matching = observations["python"] == observations["rust"] and (
        (lane_paths["python"] / "capture.ncap").read_bytes() == (lane_paths["rust"] / "capture.ncap").read_bytes())
    (root / "comparison.json").write_text(json.dumps({
        "status": "PASS" if matching else "FAIL", "candidate_sha256": native_hash,
        "reference_manifest_sha256": REFERENCE_SHA256, "interface_static_sha256": STATIC_SHA256,
        "hardware_sha256": digest(hardware), "worker_sha256": WORKER_SHA256,
        "harness_sha256": {file: digest(SOURCES / file) for file in
                           ("native_remote_browser.py", "native_remote_browser_vite.mjs", Path(__file__).name)},
        "tools": tools, "physical_fixture_sha256": digest(physical), "released_browser": observations,
        "existing_interface_tests": "2/2 on each Remote runtime",
        "reused_reference": reference_proof,
        "evidence_sha256": {label: {name: digest(lane_paths[label] / name) for name in
            ("python-browser.log", "node-e2e.log", "capture.ncap", "capture.png", "remote.log", "hardware.log")}
            for label in ("python", "rust")},
        "owned_service_teardown": "PASS", "loaded_stop": "NOT RUN",
    }, indent=2) + "\n", encoding="utf-8")
    assert matching, "Browser or exact NCAP mismatch; inspect retained comparison."
