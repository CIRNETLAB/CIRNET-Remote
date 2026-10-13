"""The recovered historical artifact remains verifiable without Git/network access."""
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_archived_r0_r7_prompt_matches_the_proven_historical_blob():
    # Git blob 1019e14fd1a9c9489a5353d5a539059f144b792d, present at R7 842b3d1.
    path = ROOT / 'docs/archive/PROMPT_CODEX_net-Circuit-Remote_Lab-First_Refactor_R0-R7.md'
    assert path.is_file(), 'Historical migration prompt is missing from the reviewable archive'
    assert sha256(path.read_bytes()).hexdigest() == 'cce3f52cec112f5b9125d20bf48cfb68a38f290f1453714a491f7ebb0cdc4985'
