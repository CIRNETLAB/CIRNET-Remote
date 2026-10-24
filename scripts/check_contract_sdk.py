"""Install the pinned npm tarball and compare its public shape/profile boundary.

Interface's parseLab semantic adaptations remain covered by Web tests until M2.
This gate never substitutes shape acceptance for those semantic assertions.
"""
import argparse
import hashlib
from importlib.resources import files
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import re
import uuid
try:
    from scripts.artifact_paths import artifact_directory
    from scripts.contracts_artifact import VERSION, installed_provenance
except ModuleNotFoundError:
    from artifact_paths import artifact_directory
    from contracts_artifact import VERSION, installed_provenance

ROOT = Path(__file__).resolve().parents[1]


def without_schema_annotations(value):
    if isinstance(value, list):
        return [without_schema_annotations(item) for item in value]
    if isinstance(value, dict):
        return {key: without_schema_annotations(item) for key, item in value.items()
                if not (key in {'description', '$comment'} and isinstance(item, str))}
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', default=os.environ.get('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST'))
    parser.add_argument('--reference-root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    if not args.manifest:
        parser.error('An explicit Contracts artifact manifest is required.')
    selected = json.loads(Path(args.manifest).read_text(encoding='utf-8'))['npm']
    archive = Path(selected['path'])
    if not archive.is_absolute() or hashlib.sha256(archive.read_bytes()).hexdigest() != selected['sha256'].lower():
        raise ValueError('npm artifact must have an absolute path and matching SHA256.')
    from contracts.registry import entries, structural_validator, schema_bundle
    records = {entry['id']: entry for entry in entries() if entry['kind'] == 'schema' and entry['visibility'] == 'public'}
    resource = files('contracts')
    public_corpora = {}
    baseline_cases = 0
    with tarfile.open(archive) as bundle:
        metadata = json.load(bundle.extractfile('package/package.json'))
        if metadata['name'] != '@tinihi-labs/contracts' or metadata['version'] != VERSION:
            raise ValueError('npm artifact identity does not match the selected release.')
        for member in bundle.getmembers():
            if member.isfile():
                if member.name not in {'package/package.json', 'package/README.md', 'package/LICENSE'} and not member.name.startswith('package/dist/'):
                    raise ValueError(f'Unexpected packed npm resource: {member.name}')
                if re.search(r'(catalog-source|compatibility|rpc_v2|\.proto$)', member.name):
                    raise ValueError(f'Internal resource leaked in npm tarball: {member.name}')
                content = bundle.extractfile(member).read()
                if member.name.endswith('.json'):
                    content = json.dumps(without_schema_annotations(json.loads(content))).encode()
                elif member.name.endswith('.js'):
                    content = re.sub(rb'(?:"\$comment"|\$comment|"description"|description)\s*:\s*"(?:[^"\\]|\\.)*"', b'', content)
                elif member.name.endswith('.d.ts'):
                    content = re.sub(rb'/\*.*?\*/', b'', content, flags=re.S)
                for private in (b'InstrumentationExecutionPlan', b'StationCapabilities', b'FpgaControlScaffold'):
                    if re.search(rb'(?<![A-Za-z0-9_])' + private + rb'(?![A-Za-z0-9_])', content):
                        raise ValueError(f'Private contract leaked in packed npm file: {member.name}')
        # Exact public schema closure preserves every real property/ref, even
        # properties literally named description. Annotation prose is harmless.
        for profile in ('structural', 'editor', 'transport'):
            packed = json.load(bundle.extractfile(f'package/dist/schemas/{profile}.json'))
            if packed != schema_bundle(public_only=True, profile=profile):
                raise ValueError(f'Packed SDK {profile} public schema closure differs from the installed artifact.')
        for original in resource.joinpath('fixtures').iterdir():
            if not original.name.endswith('.json'):
                continue
            canonical = json.loads(original.read_text(encoding='utf-8'))
            legacy = args.reference_root / 'contracts/fixtures' / original.name
            if not legacy.is_file() or json.loads(legacy.read_text(encoding='utf-8')) != canonical:
                raise ValueError(f'Shared fixture baseline changed or disappeared: {original.name}')
            public = json.loads(json.dumps(canonical))
            if isinstance(public, dict) and 'cases' in public:
                baseline_cases += len(public['cases'])
                public['cases'] = [case for case in public['cases']
                    if (case.get('contract') is None or case['contract'] in records) and not case.get('internal_only')]
                public_corpora[original.name] = public
            packed = json.load(bundle.extractfile('package/dist/fixtures/' + original.name))
            if packed != public:
                raise ValueError(f'SDK fixture cases differ from the full retained public corpus: {original.name}')
    installed_provenance()
    target = artifact_directory('sdk-consumer-' + uuid.uuid4().hex)
    (target / 'package.json').write_text('{"private":true,"type":"module"}\n', encoding='utf-8')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if npm is None:
        raise RuntimeError('npm is required for the installed SDK consumer gate.')
    subprocess.run([npm, 'install', '--offline', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund',
                    '--cache', str(target / 'npm-cache'), str(archive)], cwd=target, check=True)
    expected = []
    for filename, document in public_corpora.items():
        for case in document['cases']:
            names = [case['contract']] if case.get('contract') else (
                ['ExperimentHistoryPage', 'ExperimentActiveSnapshot'] if filename == 'history-conformance.json' else [])
            if not names:
                raise ValueError(f'Implicit corpus case has no explicit consumer mapping: {filename}:{case["id"]}')
            for name in names:
                entry = records[name]
                uri = entry['uri'] + ('#' + entry['pointer'] if entry['pointer'] else '')
                profile = case.get('profile', 'transport')
                accepted = structural_validator({'$ref': uri}, profile=profile).is_valid(case['value'])
                expected.append({**case, 'id': filename + ':' + name + ':' + case['id'],
                                 'contract': name, 'profile': profile, 'shapeAccepted': accepted})
    (target / 'cases.json').write_text(json.dumps(expected), encoding='utf-8')
    (target / 'probe.mjs').write_text("""
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as transport from '@tinihi-labs/contracts/validators';
import * as editor from '@tinihi-labs/contracts/validators.editor';
import * as structural from '@tinihi-labs/contracts/validators.structural';
import {publicContractNames,captureLayout} from '@tinihi-labs/contracts';
const profiles={transport,editor,structural};
for(const item of JSON.parse(readFileSync('cases.json','utf8'))) {
  const validator=profiles[item.profile][item.contract];
  assert.equal(typeof validator,'function',item.id);
  const before=JSON.stringify(item.value);
  assert.equal(validator(item.value),item.shapeAccepted,item.id);
  assert.equal(JSON.stringify(item.value),before,`input changed: ${item.id}`);
}
assert.ok(!publicContractNames.includes('InstrumentationExecutionPlan'));
assert.ok(!publicContractNames.includes('StationCapabilities'));
assert.deepEqual(captureLayout,JSON.parse(readFileSync('layout.json','utf8')));
console.log('Installed public npm profile/shape parity: PASS');
""", encoding='utf-8')
    (target / 'layout.json').write_text(resource.joinpath('capture/layout.json').read_text(encoding='utf-8'), encoding='utf-8')
    subprocess.run(['node', str(target / 'probe.mjs')], cwd=target, check=True)
    (target / 'types.ts').write_text("""
import type {ContractMap} from '@tinihi-labs/contracts/dto';
const graph: ContractMap['CircuitGraph']={schema_version:'1.0',circuit_id:'sdk',modules:[],connections:[]};
// @ts-expect-error private execution types never enter the public map
type PrivatePlan=ContractMap['InstrumentationExecutionPlan'];
// @ts-expect-error internal station routing never enters the public map
type PrivateStation=ContractMap['StationCapabilities'];
// @ts-expect-error package root must not expose private station DTOs
import type {StationCapabilities} from '@tinihi-labs/contracts';
void graph;
""", encoding='utf-8')
    compiler = ROOT / 'apps/web/node_modules/typescript/bin/tsc'
    subprocess.run(['node', str(compiler), '--noEmit', '--strict', '--target', 'ES2022',
                    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', str(target / 'types.ts')], cwd=target, check=True)
    print(f'Installed npm SDK conformance PASS: {baseline_cases} retained baseline cases; {len(expected)} public shape/profile checks including implicit history, and public/private type boundary.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
