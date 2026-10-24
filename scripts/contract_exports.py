"""Read prebuilt projections from the installed artifact; never regenerate Remote."""
from pathlib import Path
from contracts.resources import generated_artifacts
try:
    from scripts.artifact_paths import validate_artifact_directory
except ModuleNotFoundError:
    from artifact_paths import validate_artifact_directory

ROOT = Path(__file__).resolve().parents[1]


def external_output(path):
    if path is None:
        raise ValueError('An explicit external output is required; Remote retains frozen migration references.')
    if not Path(path).is_absolute():
        raise ValueError('An explicit absolute external output is required.')
    return validate_artifact_directory(Path(path))


def checked_destination(root, relative):
    selected = Path(root).resolve()
    # Resolve the leaf as well as its ancestors before validating the directory.
    # The allocator accepts directories, so an existing regular file must never
    # be supplied as its Git-discovery starting point.
    destination = (selected / relative).resolve()
    if destination.is_dir():
        raise ValueError('An external output file cannot be an existing directory.')
    parent = validate_artifact_directory(destination.parent)
    destination = parent / destination.name
    if not destination.is_relative_to(selected):
        raise ValueError('Export destination must stay inside the selected external output root.')
    return destination


def export(*, check=False, output_root=None, select=lambda path: True):
    target = Path(output_root or ROOT).resolve() if check else external_output(output_root)
    values = {path: value for path, value in generated_artifacts().items() if select(path)}
    destinations = {relative: target / relative if check else checked_destination(target, relative)
                    for relative in values}
    stale = []
    for relative, value in values.items():
        output = destinations[relative]
        if check:
            if not output.is_file() or output.read_bytes().replace(b'\r\n', b'\n') != value.replace(b'\r\n', b'\n'):
                stale.append(relative)
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(value)
    if stale:
        raise ValueError('Stale retained projections differ from the selected artifact: ' + ', '.join(stale))
    return values
