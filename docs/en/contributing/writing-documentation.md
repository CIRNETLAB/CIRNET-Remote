# Write and maintain CIRNET documentation

[Tiếng Việt](../../vi/contributing/writing-documentation.md) · [Documentation](../index.md)

Follow the applicable [repository instructions](../../../AGENTS.md). Use the
same relative path under `docs/en/` and `docs/vi/` and update both pages in the
same change. Keep the root `README.md` in English with links to both indexes.
Place system-level material in Remote and feature-specific material in the
repository that owns the code.
Other repositories can link to the owner with a short contextual summary.
The `docs/` directory contains `en/`, `vi/` and `changelogs/`. Keep durable
historical records under `history/` in their source language and list them in
both indexes. Use a fixed Git revision to cite superseded plans or specs.

## Documentation roles

| Location | Purpose |
| --- | --- |
| Root `README.md` | Introduce the repository and link the current indexes. |
| `docs/en/` and `docs/vi/` | Maintain the current English guidance and its Vietnamese counterpart. Codex starts from the English index. |
| [`docs/changelogs/`](../../changelogs/README.md) | Keep one `CHANGELOG_V<major>.md` per released major, with linked `vX.Y.Z` entries in descending order. |
| README beside source | Describe the local component or package and link its paired guides. |
| Verification, migration and archive records | Preserve the result, revision, artifact identity and limits of each recorded run. |

Choose one owner for each current procedure. Summaries elsewhere link to that
owner. Use [system architecture](../architecture/system.md) to find the
appropriate repository and the governing source.

Use one prose language per file. Keep API identifiers, CLI commands, paths,
environment variables, versions and code unchanged between languages. Preserve
requirements, examples, limits, warnings, and capability status. Use `guides/`,
`api/`, `architecture/`, `contributing/`, `operations/` and `history/` only
when they have content. Use `lowercase-with-dashes.md`, one H1, clear heading
levels and fenced examples with the language specified. Use descriptive link
text and link to the same language when the counterpart exists.

Create a plan and a matching spec for each AI task. Save the plan only under
`.superpowers/plans/`. Save the spec, acceptance criteria and progress checklist
only under `.superpowers/specs/`. These paths are ignored in this checkout.
Use `- [ ]` for open work and `- [x]` only after verifying completion. After
verification, update the relevant English and Vietnamese technical pages and
the applicable changelog. Architecture pages describe system behavior and
decisions. Dated verification records preserve evidence.

Give every release its SemVer heading, an evidenced date and a link in the
major file's contents. Classify verified changes as Added, Changed, Fixed or
Breaking Changes, omitting empty categories. Cite the release tag, commit or
source and identify the date basis. Record pending changes under Unreleased.

History indexes point to dated originals and state their language and scope.
Preserve fixed paths, hash/marker-protected inputs, baselines, and evidence.
Before moving or removing an ordinary document, review inbound Markdown, code,
tests, CI and build/package references. Obtain the requested decision and
update the references. A missing inbound link alone does not establish that
the document is safe to remove.

Before handing off, compare every changed pair and verify path case, heading
anchors, language-switch links, images and cross-repository targets. Run the
[documentation gates](verification.md#check-documentation-changes). Label
missing or partial counterparts explicitly. For structure and readable examples,
see the [Node.js documentation style guide](https://github.com/nodejs/node/blob/main/doc/README.md).
