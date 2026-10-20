"""The documentation gate must collect without an editable checkout install."""
import os
from pathlib import Path
import shlex
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_docs_workflow_collects_with_clean_python_startup(tmp_path):
    workflow = (ROOT / '.github/workflows/docs.yml').read_text(encoding='utf-8')
    command = next(
        line.split('- run:', 1)[1].strip()
        for line in workflow.splitlines()
        if '- run:' in line and 'tests/test_markdown_links.py' in line
    )
    arguments = shlex.split(command)
    if arguments[:3] == ['python', '-m', 'pytest']:
        invocation = [sys.executable, '-S', '-m', 'pytest']
        arguments = arguments[3:]
    else:
        assert arguments[0] == 'pytest', f'Unexpected documentation test command: {command}'
        # This is pytest's real console entry point. Its script directory, like
        # the installed bin/Scripts entry point, does not add the checkout root.
        invocation = [sys.executable, '-S', str(Path(pytest.__file__).with_name('__main__.py'))]
        arguments = arguments[1:]
    if '--basetemp' in arguments:
        index = arguments.index('--basetemp')
        del arguments[index:index + 2]
    environment = os.environ.copy()
    environment.update({
        # -S skips site initialization and editable-install .pth files. Only
        # pytest and its installed dependencies are available via PYTHONPATH.
        'PYTHONPATH': str(Path(pytest.__file__).resolve().parent.parent),
        'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1',
        'PYTHONDONTWRITEBYTECODE': '1',
    })
    result = subprocess.run(
        [*invocation, *arguments, '--collect-only', '-p', 'no:cacheprovider',
         '--basetemp', str(tmp_path / 'collection')],
        cwd=ROOT, env=environment, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'tests/test_markdown_links.py::test_' in result.stdout
