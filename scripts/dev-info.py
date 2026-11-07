#!/usr/bin/env python3
from pathlib import Path
import platform
import sys

ROOT = Path(__file__).resolve().parents[1]
print("CIRNET Remote development info")
print(f"root: {ROOT}")
print(f"python: {sys.version.split()[0]}")
print(f"platform: {platform.platform()}")
print(f"context: {'present' if (ROOT/'docs/en/architecture/context-invariants.md').is_file() else 'missing'}")
