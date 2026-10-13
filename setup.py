"""Keep generated contracts metadata and build files out of the source root.

Package metadata remains declared in pyproject.toml. Pip's setuptools backend
executes this hook for regular and editable installs, including fresh checkouts.
"""
from pathlib import Path

from setuptools import setup


metadata_dir = Path(".build") / "metadata"
metadata_dir.mkdir(parents=True, exist_ok=True)

setup(options={
    "egg_info": {"egg_base": str(metadata_dir)},
    "build": {"build_base": ".build"},
})
