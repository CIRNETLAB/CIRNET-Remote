from tests.support.release_inputs import device_resource, interface_root
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
WEB=interface_root()
# Two detailed authored instrument SVGs are intentionally kept as vectors.
# Keep a repository-wide cap that still catches accidental multi-MB assets.
MAX_COMMITTED_ICON_BYTES = 256_000

REQUIRED=[
 'package.json','tsconfig.json','vite.config.ts','index.html','src/main.ts','src/App.vue',
 'src/stores/station.ts','src/services/api.ts','src/services/websocket.ts',
 'src/components/HardwareStatus.vue',
 'src/types/circuit.ts','src/style.css','README.md'
]
REQUIRED += [
 f'src/stores/{name}.ts' for name in ['circuit', 'workspace', 'experiment', 'instrument', 'ui']
]
REQUIRED += [f'src/services/api/{name}.ts' for name in ['client', 'circuits', 'stations', 'experiments']]
REQUIRED += ['src/router/index.ts', 'src/services/websocket/client.ts', 'src/services/websocket/events.ts']
REQUIRED += [f'src/components/workbench/{name}.vue' for name in ['SingleWorkspaceShell', 'AppTitleBar', 'ComponentRibbon', 'ToolRail', 'CircuitWorkspace3D', 'SimulationStatusBar']]
REQUIRED += [f'src/components/windows/{name}.vue' for name in ['FloatingWindow', 'FloatingWindowManager', 'OscilloscopeWindow', 'GeneratorWindow', 'SignalMonitorWindow', 'ComponentInfoWindow', 'InspectorWindow', 'HexEditorWindow']]
REQUIRED += ['src/router/routes.ts', 'src/three/SceneManager.ts', 'src/services/files/circuitFile.ts']

def test_frontend_shell_files_exist():
    missing=[p for p in REQUIRED if not (WEB/p).is_file()]
    assert not missing, missing


def test_app_declares_project_title_and_hardware_status_supports_simulation():
    app=(WEB/'src/components/workbench/AppTitleBar.vue').read_text(encoding='utf-8')
    status=(WEB/'src/components/HardwareStatus.vue').read_text()
    store=(WEB/'src/stores/station.ts').read_text()
    assert 'aria-label="CIRNET Remote"' in app
    assert 'Simulation' in status
    assert "mode: 'simulation'" in store


def test_frontend_services_do_not_expose_physical_fpga_controls():
    text='\n'.join(path.read_text(encoding='utf-8').lower() for path in (WEB/'src').rglob('*') if path.is_file())
    for forbidden in ['/dev/spidev','fpga_register','register_map','raw_mux','mux_address']:
        assert forbidden not in text


def test_frontend_imports_stay_inside_the_application_boundary():
    import subprocess
    result = subprocess.run(['node', 'scripts/check-boundaries.mjs'], cwd=WEB,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr


def test_fetch_has_explicit_api_and_versioned_asset_boundaries():
    callers = []
    for path in (WEB/'src').rglob('*'):
        if path.suffix in {'.ts', '.vue'} and re.search(r'\bfetch\b', path.read_text(encoding='utf-8')):
            callers.append(path.relative_to(WEB).as_posix())
    # API/auth traffic has one client. Imported GLB bytes have a separate
    # bounded, integrity-checked asset adapter; renderer/core use ports.
    # The transitive AST gate additionally rejects bypasses through barrels.
    assert sorted(callers) == ['src/services/api/client.ts','src/services/assets/gltfAssets.ts']


def test_frontend_typescript_build_config_includes_node_and_modern_libs():
    import json
    package=json.loads((WEB/'package.json').read_text())
    tsconfig=json.loads((WEB/'tsconfig.json').read_text())
    dev=package.get('devDependencies', {})
    options=tsconfig.get('compilerOptions', {})
    libs={item.lower() for item in options.get('lib', [])}
    types={item.lower() for item in options.get('types', [])}
    assert '@types/node' in dev
    assert 'node' in types
    assert 'esnext' in libs or 'esnext.disposable' in libs


def test_single_shell_has_no_legacy_page_owner_or_navigation():
    app = (WEB/'src/App.vue').read_text(encoding='utf-8')
    assert 'SingleWorkspaceShell' in app
    assert 'RouterLink' not in app and 'RouterView' not in app
    assert not list((WEB/'src/pages').glob('*.vue'))


def test_frontend_icons_are_manifested_and_reasonably_sized():
    import json
    icon_dir = WEB/'src/assets/icons'
    manifest = json.loads((icon_dir/'manifest.json').read_text(encoding='utf-8'))

    # assets/icon .svg is archival storage only. CI validates the icon set that
    # the frontend actually imports and ships; it intentionally does not compare
    # those files with the archival copies or their hashes.
    svg_files = sorted(path.name for path in icon_dir.glob('*.svg'))
    manifest_files = [entry['file'] for entry in manifest]

    assert len(manifest_files) == len(set(manifest_files)), 'duplicate icon names in manifest'
    assert sorted(manifest_files) == svg_files

    total_bytes = 0
    for entry in manifest:
        icon_path = icon_dir/entry['file']
        icon = icon_path.read_bytes()
        assert icon.lstrip().startswith(b'<svg'), entry['file']
        assert len(icon) == entry['output_bytes'], entry['file']
        total_bytes += len(icon)

    assert total_bytes < MAX_COMMITTED_ICON_BYTES


def test_browser_device_metadata_matches_authoritative_device_library():
    import json
    snapshot = json.loads((WEB/'src/data/deviceMetadata.json').read_text(encoding='utf-8'))
    for relative in ['logic-ic/74hc08.json', 'breadboards/generic-full-size.json']:
        original = json.loads((device_resource('')/relative).read_text(encoding='utf-8'))
        assert snapshot[original['id']] == original
