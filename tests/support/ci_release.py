"""Shared assertions for consuming an immutable Interface release in Remote CI."""


def assert_interface_release_job(job):
    steps = job['steps']
    download = next((index for index, step in enumerate(steps)
                     if 'scripts.install_interface' in step.get('run', '')), None)
    assert download is not None, 'Interface must be downloaded as an explicit release artifact'
    if 'scripts.install_interface --manifest integration/release-set.json' in steps[download]['run']:
        assert not any(name in steps[download].get('env', {}) for name in
            ('NETCIRCUIT_INTERFACE_ARTIFACT_URL', 'NETCIRCUIT_INTERFACE_ARTIFACT_SHA256')), 'Manifest-bound selection must come from the committed lock.'
    else:
        for name in ('NETCIRCUIT_INTERFACE_ARTIFACT_URL', 'NETCIRCUIT_INTERFACE_ARTIFACT_SHA256'):
            assert steps[download].get('env', {}).get(name) == '${{ vars.' + name + ' }}', name
    assert steps[download]['env'].get('NETCIRCUIT_ARTIFACTS_TOKEN') == '${{ secrets.NETCIRCUIT_ARTIFACTS_READ_TOKEN }}'
    assert '--github-env "$GITHUB_ENV"' in steps[download]['run']
    bootstrap = next((index for index, step in enumerate(steps)
                      if 'bootstrap-contracts.mjs' in step.get('run', '')), None)
    assert bootstrap is not None and bootstrap > download, 'SDK bootstrap must follow verified Interface extraction'
    assert steps[bootstrap].get('env', {}).get('NETCIRCUIT_ARTIFACTS_TOKEN') == '${{ secrets.NETCIRCUIT_ARTIFACTS_READ_TOKEN }}'
    assert '$NETCIRCUIT_INTERFACE_ROOT/scripts/bootstrap-contracts.mjs' in steps[bootstrap]['run']
    installs = [index for index, step in enumerate(steps) if 'npm ci' in step.get('run', '')]
    assert installs and all(index > bootstrap for index in installs), 'Exact SDK bootstrap must precede clean npm installs'
    for index, step in enumerate(steps):
        command = step.get('run', '')
        if any(marker in command for marker in ('npm ci', 'npm test', 'npm run ', 'npx tsc')):
            assert index > bootstrap
            assert step.get('working-directory') == '${{ env.NETCIRCUIT_INTERFACE_ROOT }}', 'npm checks must execute the selected Interface artifact'
        assert step.get('working-directory') not in ('apps/web', 'services/hardware-service', 'simulator/circuit-simulator', 'fpga')
        for forbidden in ('cd apps/web', 'npm --prefix apps/web', '-e ./simulator', "-e './simulator", '-e ./services/hardware-service', "-e './services/hardware-service"):
            assert forbidden not in command, forbidden
        if step.get('uses', '').startswith('actions/setup-node@') and step.get('with', {}).get('cache') == 'npm':
            assert 'apps/web' not in step['with'].get('cache-dependency-path', ''), 'npm cache must not read the frozen Web lock'
