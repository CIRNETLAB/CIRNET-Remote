# Repository work

- Start with the [current English documentation](docs/en/index.md) and the material relevant to the change. Use [docs/README.md](docs/README.md) for retained paths and historical sources. Verify statements against source, Contracts and tests.
- Follow the [documentation conventions](docs/en/contributing/writing-documentation.md) and update the corresponding English and Vietnamese pages together.
- Keep working plans and design drafts in the ignored `.superpowers/` directory or outside the checkout. Record accepted decisions and verified results in the relevant documentation pair.
- Follow [docs/VERIFICATION.md](docs/VERIFICATION.md) for every code change. Generated screenshots, video, traces, reports with embedded images and raw diagnostics must be created **outside all repository/worktree/Git directories from the start**, using the shared artifact allocator. Keep only Markdown verification evidence in this repository.
- Inspect temporary evidence before reporting results, then clean only this session's owned artifact directory. Never fall back to source directories when external output is denied.
- Preserve approved source assets, design references and test baselines. Do not delete or relocate existing Markdown or old evidence without the user's decision. Preserve historical measurements and hash/marker protected documents.
- Update affected canonical documentation and verification records. Do not stage/commit/push unless requested; check staged changes and ignored on-disk outputs as well as Git status.
