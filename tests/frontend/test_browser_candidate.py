"""Keep candidate browser inputs separate from immutable releases."""

import json
from pathlib import Path
import subprocess

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]


def test_browser_workflow_selects_candidate_and_published_inputs_before_bootstrap():
    workflow = yaml.safe_load((ROOT / '.github/workflows/browser-e2e.yml').read_text(encoding='utf-8'))
    events = workflow.get('on', workflow.get(True))
    assert events['push']['branches'] == ['master']
    assert events['push']['tags'] == ['v*']
    selection = events['workflow_dispatch']['inputs']['interface_source']
    assert selection['options'] == ['published', 'candidate']
    assert selection['default'] == 'published'
    steps = workflow['jobs']['chromium']['steps']
    checkout = next(step for step in steps if step.get('uses', '').startswith('actions/checkout@'))
    assert checkout['with']['persist-credentials'] is False
    published = next(step for step in steps if 'scripts.install_interface' in step.get('run', ''))
    candidate = next(step for step in steps if 'scripts.select_browser_interface' in step.get('run', ''))
    published_bootstrap, candidate_bootstrap = [step for step in steps if 'bootstrap-contracts.mjs' in step.get('run', '')]
    assert published['if'] == "github.ref_type == 'tag' || inputs.interface_source == 'published'"
    assert candidate['if'] == "github.ref_type != 'tag' && inputs.interface_source != 'published'"
    assert '--manifest integration/release-set.json' in published['run']
    assert '--lock integration/browser-interface-source.json' in candidate['run']
    assert 'CIRNET_ARTIFACTS_TOKEN' not in candidate.get('env', {})
    assert published_bootstrap['if'] == published['if']
    assert candidate_bootstrap['if'] == candidate['if']
    assert 'CIRNET_ARTIFACTS_TOKEN' not in candidate_bootstrap.get('env', {})
    assert max(steps.index(candidate), steps.index(published)) < steps.index(published_bootstrap) < steps.index(candidate_bootstrap)


def test_candidate_exports_the_exact_commit_instead_of_the_current_tip(tmp_path):
    from scripts.select_browser_interface import export_candidate

    repo = tmp_path / 'producer'
    repo.mkdir()

    def git(*args):
        command = ['git', '-c', 'core.longpaths=true', '-C', str(repo), *args]
        return subprocess.check_output(command, text=True).strip()

    git('init', '-q')
    product = repo / 'package.json'
    product.write_text(json.dumps({'name': 'first'}), encoding='utf-8')
    git('add', 'package.json')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'first')
    selected = git('rev-parse', 'HEAD')
    product.write_text(json.dumps({'name': 'tip'}), encoding='utf-8')
    git('add', 'package.json')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'tip')

    output = tmp_path / 'candidate'
    output.mkdir()
    receipt = export_candidate(selected, output, repository=repo.as_uri())

    assert receipt['sourceRevision'] == selected != git('rev-parse', 'HEAD')
    assert receipt['sourceTree'] == git('rev-parse', f'{selected}^{{tree}}')
    assert json.loads((output / 'source/package.json').read_text(encoding='utf-8')) == {'name': 'first'}
    assert not (output / 'source/.git').exists()
    with pytest.raises(ValueError, match='commit SHA'):
        export_candidate('HEAD', output, repository=repo.as_uri())
