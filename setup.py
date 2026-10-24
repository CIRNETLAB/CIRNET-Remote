"""Remote's empty integration metapackage; Contracts builds in its own repo."""
from pathlib import Path
from setuptools import setup

metadata = Path('.build/metadata')
metadata.mkdir(parents=True, exist_ok=True)
setup(options={'egg_info': {'egg_base': str(metadata)}, 'build': {'build_base': '.build'}})
