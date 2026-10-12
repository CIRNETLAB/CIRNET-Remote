#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
REQUIRED = ["CONTEXT.md", "ARCHITECTURE.md", "ROADMAP.md", "DEV_LOG.md", "CIRCUIT_SPEC.md", "CHANGELOG.md", "MIGRATION_LAB_FIRST.md", "PHYSICAL_LAB_SAFETY.md"]
MARKERS = {
    "CONTEXT.md": ["EP4CE6E22C8N", "EP4CE10E22C8N", "Web-first", "Frontend must never", "Mini PC", "Lab-First", "Safety-gated", "AssignmentDefinition", "LabEndpoint", "SafetyVerificationResult", "TopologyVerificationResult", "FunctionalVerificationResult", "ExecutionDecision", "HardwareStation", "PostgreSQL"],
    "ARCHITECTURE.md": ["Lab-First v3.1", "SAFETY != CORRECTNESS", "Lab Execution Compiler", "InstrumentationExecutionPlan"],
    "DEV_LOG.md": ["current_phase:", "next_task:", "## AI Handoff"],
}

errors = []
for name in REQUIRED:
    if not (DOCS / name).is_file():
        errors.append(f"missing docs/{name}")
for name, markers in MARKERS.items():
    path = DOCS / name
    if path.is_file():
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                errors.append(f"docs/{name} missing marker: {marker}")
active = [ROOT / "README.md", *(DOCS / name for name in REQUIRED if name not in {"DEV_LOG.md", "CHANGELOG.md", "MIGRATION_LAB_FIRST.md"})]
for directory in ["deployment", "fpga", "contracts", "services", "simulator"]:
    active.extend((ROOT / directory).rglob("*.md"))
for path in active:
    if path.is_file():
        text = path.read_text(encoding="utf-8")
        for marker in ["Raspberry Pi 5", "Database baseline: **SQLite**", "approved architecture specification is in `docs/superpowers/specs/2026-10-08"]:
            if marker in text:
                errors.append(f"{path.relative_to(ROOT)} has stale active authority: {marker}")
if errors:
    for error in errors:
        print(f"context-check: ERROR: {error}")
    sys.exit(1)
print("context-check: PASS")
