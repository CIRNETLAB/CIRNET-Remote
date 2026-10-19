# Repository work

- Read [docs/README.md](docs/README.md) and the documentation relevant to the change; verify statements against source, Contracts and tests.
- Follow [docs/VERIFICATION.md](docs/VERIFICATION.md) for every code change. Generated screenshots, video, traces, reports with embedded images and raw diagnostics must be created **outside all repository/worktree/Git directories from the start**, using the shared artifact allocator. Keep only Markdown verification evidence in this repository.
- Inspect temporary evidence before reporting results, then clean only this session's owned artifact directory. Never fall back to source directories when external output is denied.
- Preserve approved source assets, design references and test baselines. Do not delete or relocate existing Markdown or old evidence without the user's decision. Preserve historical measurements and hash/marker protected documents.
- Update affected canonical documentation and verification records. Do not stage/commit/push unless requested; check staged changes and ignored on-disk outputs as well as Git status.
