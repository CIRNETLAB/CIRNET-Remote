from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def run(*arguments):
    return subprocess.run([sys.executable, str(ROOT/'scripts/generate_contracts.py'), *map(str,arguments)],
                          cwd=ROOT, capture_output=True, text=True)


def artifacts(folder):
    return {p.relative_to(folder).as_posix():p.read_bytes() for p in folder.rglob('*') if p.is_file()}


def test_generation_is_byte_deterministic_and_public_only(tmp_path):
    for folder in ('one','two'):
        result = run('--output-root',tmp_path/folder)
        assert result.returncode == 0, result.stdout+result.stderr
    first = artifacts(tmp_path/'one')
    assert first == artifacts(tmp_path/'two')
    assert 'contracts/boundary/models.py' in first
    dto = first['apps/web/src/contracts/generated/dto.ts'].decode()
    assert 'export interface ContractMap' in dto
    assert 'InstrumentationExecutionPlan' not in dto
    assert 'interface CircuitGraph' in dto
    assert 'title: string' in dto


def test_check_never_repairs_drift(tmp_path):
    result = run('--output-root',tmp_path)
    assert result.returncode == 0, result.stderr
    path = tmp_path/'apps/web/src/contracts/generated/dto.ts'
    path.write_text('stale\n')
    result = run('--check','--output-root',tmp_path)
    assert result.returncode != 0
    assert 'stale' in (result.stdout+result.stderr).lower()
    assert path.read_text() == 'stale\n'


def test_supported_baseline_remains_byte_exact():
    import hashlib
    import json
    baseline=ROOT/'contracts/compatibility/2026-10-16'
    index=json.loads((baseline/'baseline.json').read_text())
    for path,digest in index['sha256'].items():
        assert hashlib.sha256((baseline/path.removeprefix('contracts/')).read_bytes()).hexdigest()==digest
        assert hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==digest


def test_publication_failure_rolls_back_prior_artifacts(tmp_path, monkeypatch):
    sys.path.insert(0,str(ROOT/'scripts'))
    from generate_contracts import publish_artifacts
    sources=tmp_path/'source'
    target=tmp_path/'target'
    sources.mkdir(); target.mkdir()
    for name in ('a','b'):
        (sources/name).write_text('new-'+name)
        (target/name).write_text('old-'+name)
    replace=Path.replace
    def fail_second(path,destination):
        if Path(destination).name=='b' and path.suffix=='.new':
            raise OSError('injected publication failure')
        return replace(path,destination)
    monkeypatch.setattr(Path,'replace',fail_second)
    import pytest
    with pytest.raises(OSError,match='injected'):
        publish_artifacts({Path(name):sources/name for name in ('a','b')},target)
    assert (target/'a').read_text()=='old-a'
    assert (target/'b').read_text()=='old-b'
