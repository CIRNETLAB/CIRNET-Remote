"""Opt-in collection and outcome receipts for the advisory CI selector."""

import hashlib
from importlib.metadata import distributions
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sysconfig

import pytest

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def installed_distributions(**filters):
    # API test imports may put the build's source egg-info ahead of the wheel.
    locations = list(dict.fromkeys(sysconfig.get_path(key) for key in ('purelib', 'platlib')))
    return distributions(path=locations, **filters)


def installed_identity(name):
    products = list(installed_distributions(name=name))
    if len(products) != 1:
        raise ValueError('Expected one installed distribution for each verified wheel.')
    product = products[0]
    direct = json.loads(product.read_text('direct_url.json') or '{}')
    archive = direct.get('archive_info', {}).get('hashes', {}).get('sha256')
    if not isinstance(archive, str) or not re.fullmatch(r'[0-9a-f]{64}', archive):
        raise ValueError('The installed input lacks verified wheel provenance.')
    identity = {'version': product.version, 'archiveSha256': archive}
    if name == 'cirnet-api':
        # Local API builds can have different ZIP timestamps and installation paths.
        files = [file for file in product.files if file.hash and '..' not in file.parts
                 and not any(part.endswith('.dist-info') for part in file.parts)]
        if not files:
            raise ValueError('The installed API lacks a wheel payload inventory.')
        payload = ''.join(f'{sha256(product.locate_file(file))}  {file.as_posix()}\n' for file in sorted(files))
        identity = {'version': product.version, 'payloadSha256': hashlib.sha256(payload.encode()).hexdigest()}
    return identity


def installed_versions():
    return sorted((re.sub(r'[-_.]+', '-', product.metadata['Name']).lower(), product.version)
                  for product in installed_distributions())


def verified_inputs(root):
    integration = root / 'integration'
    manifest_path = integration / 'release-set.json'
    manifest = read_json(manifest_path)
    sdk = manifest['repositories']['Contracts']['artifacts']['npm']
    interface = Path(os.environ['CIRNET_INTERFACE_ROOT'])
    fpga = Path(os.environ['CIRNET_FPGA_ROOT'])
    fpga_manifest = Path(os.environ['CIRNET_FPGA_ARTIFACT_MANIFEST'])
    fpga_source = read_json(fpga_manifest)['source']
    sdk_digest = sha256(interface / '.artifacts' / sdk['filename'])
    if sdk_digest != sdk['sha256']:
        raise ValueError('The Interface SDK differs from the verified release selection.')
    commands = ('node', 'npm.cmd' if os.name == 'nt' else 'npm')
    versions = [subprocess.check_output([shutil.which(command) or command, '--version'],
                                        text=True, timeout=30).strip() for command in commands]
    packages = ('cirnet-api', 'cirnet-contracts', 'cirnet-simulator', 'cirnet-hardware-service', 'cirnet-artifact-paths')
    return {
        'locks': {path.relative_to(root).as_posix(): sha256(path) for path in (
            manifest_path, integration / 'ci-source-dependencies.json', integration / 'browser-interface-source.json',
            *sorted(integration.glob('*-version.json')), root / 'requirements-verification.txt')},
        'runtime': {'python': platform.python_version(), 'os': platform.system(), 'machine': platform.machine(),
                    'node': versions[0], 'npm': versions[1], 'pytest': pytest.__version__},
        'pythonWheels': {name: installed_identity(name) for name in packages},
        'pythonDependencies': installed_versions(),
        'interface': {'identitySha256': sha256(interface / 'interface-artifact.json'), 'sdkSha256': sdk_digest},
        'fpga': {'identitySha256': sha256(fpga / 'fpga-artifact.json'), 'archiveSha256': fpga_source['sha256']},
    }


def report_outcome(report):
    expected = getattr(report, 'wasxfail', None)
    if report.failed:
        return {'status': 'FAIL', 'phase': report.when}
    if report.skipped:
        reason = expected or (report.longrepr[2] if isinstance(report.longrepr, tuple) else '')
        return {'status': 'XFAIL' if expected is not None else 'SKIP', 'phase': report.when,
                'reasonSha256': hashlib.sha256(str(reason).encode()).hexdigest()}
    return {'status': 'XPASS' if expected is not None else 'PASS'}


class Observation:
    def __init__(self, kind):
        self.kind = kind
        self.decision = None
        self.collected = []
        self.executed = []
        self.phases = {}

    def select(self, config):
        from scripts.ci_test_selection import full_selection, resolve_event

        override = os.environ.get('CIRNET_CI_SELECTOR_FORCE_FULL', '').strip().casefold()
        if override not in ('', 'false'):
            reason = 'selector-force-full' if override == 'true' else 'selector-force-full-invalid'
            return full_selection({reason})

        path = os.environ.get('GITHUB_EVENT_PATH')
        event = os.environ.get('GITHUB_EVENT_NAME', 'workflow_dispatch')
        candidate = os.environ.get('GITHUB_SHA', '')
        try:
            payload = read_json(Path(path)) if path else {}
            return resolve_event(event, payload, candidate, config.rootpath)
        except (OSError, UnicodeError, ValueError, subprocess.SubprocessError):
            return full_selection({'Could not resolve a trustworthy event diff. Run the full Python suite.'})

    @pytest.hookimpl(trylast=True)
    def pytest_collection_modifyitems(self, config, items):
        self.collected = [item.nodeid for item in items]
        if self.kind == 'selected':
            from scripts.ci_test_selection import full_selection
            from scripts.compare_ci_selection import matches_target

            self.decision = self.select(config)
            if self.decision['mode'] == 'selected':
                targets = self.decision['targets']
                if all(any(matches_target(nodeid, target) for nodeid in self.collected) for target in targets):
                    selected, deselected = [], []
                    for item in items:
                        destination = selected if any(matches_target(item.nodeid, target) for target in targets) else deselected
                        destination.append(item)
                    config.hook.pytest_deselected(items=deselected)
                    items[:] = selected
                else:
                    self.decision = {**self.decision, **full_selection({
                        'At least one selected path collected no tests. Run the full Python suite.'})}
        self.executed = [item.nodeid for item in items]

    def pytest_runtest_logreport(self, report):
        self.phases.setdefault(report.nodeid, {})[report.when] = report_outcome(report)

    def outcome(self, nodeid):
        phases = self.phases.get(nodeid, {})
        for status in ('FAIL', 'XPASS', 'XFAIL', 'SKIP'):
            for row in phases.values():
                if row['status'] == status:
                    return row
        return {'status': 'PASS' if phases.keys() == {'setup', 'call', 'teardown'} else 'NOT_RUN'}

    def pytest_sessionfinish(self, session, exitstatus):
        # Receipt failures are advisory. The existing test exit status is authoritative.
        try:
            from scripts.artifact_paths import artifact_directory

            root = session.config.rootpath
            candidate = subprocess.check_output(['git', '--no-replace-objects', 'rev-parse', 'HEAD'],
                                                cwd=root, text=True, timeout=30).strip()
            subprocess.run(['git', '--no-replace-objects', 'diff', '--quiet', '--no-ext-diff', '--no-textconv', 'HEAD', '--'],
                           cwd=root, check=True, timeout=30)
            receipt = {'schema': 1, 'kind': self.kind, 'candidate': candidate, 'inputs': verified_inputs(root),
                       'decision': self.decision, 'collected': self.collected, 'exitCode': int(exitstatus),
                       'outcomes': {nodeid: self.outcome(nodeid) for nodeid in self.executed}}
            output = artifact_directory('ci-selection') / 'receipt.json'
            with output.open('x', encoding='utf-8') as handle:
                json.dump(receipt, handle, indent=2, sort_keys=True)
                handle.write('\n')
        except Exception as error:
            reporter = session.config.pluginmanager.getplugin('terminalreporter')
            if reporter is not None:
                reporter.write_line(f'CI selection receipt unavailable ({type(error).__name__}).')


def pytest_addoption(parser):
    parser.addoption('--cirnet-ci-observation', choices=('full', 'selected'))


def pytest_configure(config):
    kind = config.getoption('--cirnet-ci-observation')
    if kind:
        config.pluginmanager.register(Observation(kind), 'cirnet-ci-selection-observation')
