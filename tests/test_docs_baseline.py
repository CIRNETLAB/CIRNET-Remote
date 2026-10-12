from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

REQUIRED_DOCS = [
    "ARCHITECTURE.md", "CIRCUIT_SPEC.md", "ROADMAP.md", "CHANGELOG.md",
    "CONTEXT.md", "DEV_LOG.md", "MIGRATION_LAB_FIRST.md", "PHYSICAL_LAB_SAFETY.md",
]


def test_required_project_docs_exist():
    missing = [name for name in REQUIRED_DOCS if not (DOCS / name).is_file()]
    assert not missing, f"Missing documentation: {missing}"


def test_context_locks_core_architecture():
    text = (DOCS / "CONTEXT.md").read_text(encoding="utf-8")
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
        assert marker in text, f"CONTEXT.md missing marker: {marker}"


def test_dev_log_exposes_current_phase_and_next_task():
    text = (DOCS / "DEV_LOG.md").read_text(encoding="utf-8")
    assert "current_phase:" in text
    assert "next_task:" in text
    assert "## AI Handoff" in text
