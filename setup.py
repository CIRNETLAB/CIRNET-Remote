"""Keep generated contracts metadata and build files out of the source root.

Package metadata remains declared in pyproject.toml. Pip's setuptools backend
executes this hook for regular and editable installs, including fresh checkouts.
"""
from pathlib import Path
import subprocess
import sys

from setuptools import setup
from setuptools.command.build_py import build_py


class BuildContracts(build_py):
    """Clean wheel/sdist builds generate local RPC bindings from canonical proto."""
    def run(self):
        super().run()
        subprocess.run([sys.executable, 'scripts/generate_hardware_rpc.py', '--output',
                        str(Path(self.build_lib) / 'contracts/generated')], check=True)


metadata_dir = Path(".build") / "metadata"
metadata_dir.mkdir(parents=True, exist_ok=True)

setup(cmdclass={'build_py': BuildContracts}, options={
    "egg_info": {"egg_base": str(metadata_dir)},
    "build": {"build_base": ".build"},
})
