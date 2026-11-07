from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

REQUIRED_DOCS = [
    "en/architecture/lab-first-v3-1.md", "en/api/circuit-spec-reference.md",
    "en/history/lab-first-roadmap.md", "en/history/changelog.md",
    "en/architecture/context-invariants.md", "en/history/development-log.md",
    "en/history/lab-first-migration-ledger.md", "en/architecture/physical-lab-safety-contract.md",
]


def test_required_project_docs_exist():
    missing = [name for name in REQUIRED_DOCS if not (DOCS / name).is_file()]
    assert not missing, f"Missing documentation: {missing}"


def test_context_locks_core_architecture():
    path = DOCS / "en/architecture/context-invariants.md"
    text = path.read_text(encoding="utf-8")
    required = [
        "EP4CE6E22C8N",
        "EP4CE10E22C8N",
        "Mini PC", "Lab-First", "Safety-gated", "PostgreSQL",
        "AssignmentDefinition", "LabEndpoint", "ExecutionDecision",
        "SafetyVerificationResult", "TopologyVerificationResult", "FunctionalVerificationResult",
        "Web-first",
        "Frontend must never",
        "raw FPGA",
    ]
    for marker in required:
        assert marker in text, f"{path.name} missing marker: {marker}"


def test_dev_log_exposes_current_phase_and_next_task():
    text = (DOCS / "en/history/development-log.md").read_text(encoding="utf-8")
    assert "current_phase:" in text
    assert "next_task:" in text
    assert "## AI Handoff" in text
