from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]


def test_context_and_circuit_spec_agree_on_lab_boundaries():
    context=(ROOT/'docs/CONTEXT.md').read_text(encoding='utf-8')
    spec=(ROOT/'docs/CIRCUIT_SPEC.md').read_text(encoding='utf-8')
    for marker in ['EP4CE6E22C8N','EP4CE10E22C8N','Lab-First','DetectedTopologyGraph', 'InstrumentationExecutionPlan']:
        assert marker in context
        assert marker in spec


def test_roadmap_defines_web_first_gate_before_ep4ce6():
    roadmap=(ROOT/'docs/ROADMAP.md').read_text(encoding='utf-8')
    assert roadmap.index('R6') < roadmap.index('R7')


def test_design_spec_and_plan_are_preserved():
    for name in ['2026-10-08-net-circuit-remote-architecture-design.md', '2026-10-08-initial-repository-scaffold.md']:
        text = (ROOT/'docs/archive/legacy-v1'/name).read_text(encoding='utf-8')
        assert 'SUPERSEDED' in text
        assert 'Current authority: docs/ARCHITECTURE.md' in text


def test_canonical_flow_preserves_safe_wrong_student_circuits():
    text = (ROOT/'docs/ARCHITECTURE.md').read_text(encoding='utf-8')
    for marker in ['Lab-First v3.1', 'SAFETY != CORRECTNESS', 'BLOCK_UNEXECUTABLE', 'RUN_GUARDED', 'Lab Execution Compiler', 'student wiring is physical truth']:
        assert marker in text
