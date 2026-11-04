"""Bootstrap and saved release settings preserve the selected namespace ABI."""
import json
import os

import pytest

from scripts.environment import append_environment, export_environment, getenv


def test_environment_aliases_keep_canonical_empty_values_without_mutating_input(tmp_path):
    original = {'NETCIRCUIT_INTERFACE_ROOT': 'old', 'CIRNET_INTERFACE_ROOT': '', 'PATH': 'unchanged'}
    selected = export_environment(original)
    assert getenv('NETCIRCUIT_INTERFACE_ROOT', environ=original) == ''
    assert selected['CIRNET_INTERFACE_ROOT'] == selected['NETCIRCUIT_INTERFACE_ROOT'] == ''
    assert original['NETCIRCUIT_INTERFACE_ROOT'] == 'old'
    destination = tmp_path / 'github-env'
    append_environment({'CIRNET_INTERFACE_ROOT': 'product'}, destination)
    assert dict(line.split('=', 1) for line in destination.read_text().splitlines()) == {
        'CIRNET_INTERFACE_ROOT': 'product', 'NETCIRCUIT_INTERFACE_ROOT': 'product'}
    with pytest.raises(ValueError, match='single-line'):
        append_environment({'CIRNET_INTERFACE_ROOT': 'bad\nINJECTED=value'}, destination)


@pytest.mark.parametrize('namespace', ['current', 'legacy', 'both'])
def test_saved_release_selection_accepts_each_profile_without_mutating_process(tmp_path, namespace):
    from tests.contracts.test_system_release import saved_environment
    from scripts.check_release_rollback import load_environment
    state, path = saved_environment(tmp_path)
    selected = state['environment']
    if namespace == 'legacy':
        state['environment'] = {key.replace('CIRNET_', 'NETCIRCUIT_', 1): value for key, value in selected.items()}
    elif namespace == 'both':
        state['environment'] = export_environment(selected)
        state['environment']['NETCIRCUIT_INTERFACE_ROOT'] = 'stale-alias-must-not-win'
    path.write_text(json.dumps(state), encoding='utf-8')
    before = dict(os.environ)
    result = load_environment(path)
    assert result['environment']['CIRNET_INTERFACE_ROOT'] == selected['CIRNET_INTERFACE_ROOT']
    assert result['environment']['NETCIRCUIT_INTERFACE_ROOT'] == selected['CIRNET_INTERFACE_ROOT']
    assert dict(os.environ) == before
