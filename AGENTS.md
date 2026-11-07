# Repository work

- Every AI agent must write each task's implementation plan in `.superpowers/plans/` and its matching spec, acceptance criteria and progress checklist in `.superpowers/specs/`.
- Keep plans and build checklists exclusively in those directories. Use `- [ ]` for open items and `- [x]` only after completion and verification.
- After verification, update the affected [English](docs/en/index.md) and [Vietnamese](docs/vi/index.md) documentation and the applicable [changelog](docs/changelogs/README.md).
- Verify claims against source, Contracts and tests. Preserve approved assets, baselines and protected evidence.
- Follow the [verification guide](docs/en/contributing/verification.md). Generate raw evidence with the shared allocator outside repository, worktree and Git directories. Inspect it and clean only the owned session.
- Review Git diff, status and ignored outputs. Stage, commit or push only on request.
