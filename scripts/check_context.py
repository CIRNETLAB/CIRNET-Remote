#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
CONTEXT = "en/architecture/context-invariants.md"
ARCHITECTURE = "en/architecture/lab-first-v3-1.md"
DEV_LOG = "en/history/development-log.md"
CONTEXT_DOCS = [
    CONTEXT, ARCHITECTURE, "en/history/lab-first-roadmap.md",
    "en/api/circuit-spec-reference.md", "en/architecture/physical-lab-safety-contract.md",
]
REQUIRED = [
    *CONTEXT_DOCS, DEV_LOG, "en/history/changelog.md", "en/history/lab-first-migration-ledger.md",
    "en/index.md", "vi/index.md", "changelogs/README.md", "changelogs/CHANGELOG_V0.md",
]
MARKERS = {
    CONTEXT: ["EP4CE6E22C8N", "EP4CE10E22C8N", "Web-first", "Frontend must never", "Mini PC", "Lab-First", "Safety-gated", "AssignmentDefinition", "LabEndpoint", "SafetyVerificationResult", "TopologyVerificationResult", "FunctionalVerificationResult", "ExecutionDecision", "HardwareStation", "PostgreSQL"],
    ARCHITECTURE: ["Lab-First v3.1", "SAFETY != CORRECTNESS", "Lab Execution Compiler", "InstrumentationExecutionPlan"],
    DEV_LOG: ["current_phase:", "next_task:", "## AI Handoff"],
}

errors = []
expected_directories = {"en", "vi", "changelogs"}
entries = list(DOCS.glob("*"))
if {entry.name for entry in entries if entry.is_dir()} != expected_directories or any(
    not entry.is_dir() for entry in entries
):
    errors.append("docs must contain exactly the en/, vi/ and changelogs/ directories")
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
active = [ROOT / "README.md", *(DOCS / name for name in CONTEXT_DOCS)]
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
