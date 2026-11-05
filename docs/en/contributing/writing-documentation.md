# Write and maintain CIRNET documentation

[Tiếng Việt](../../vi/contributing/writing-documentation.md) · [Documentation](../index.md)

Follow the applicable [repository instructions](../../../AGENTS.md). Use the
same relative path under `docs/en/` and `docs/vi/` and update both pages in the
same change. Keep the root `README.md` in English with links to both indexes.
Place system-level material in Remote and feature-specific material in the
repository that owns the code.
Other repositories can link to the owner with a short contextual summary.

Use one prose language per file. Keep API identifiers, CLI commands, paths,
environment variables, versions and code unchanged between languages. Preserve
requirements, examples, limits, warnings, and capability status. Use `guides/`,
`api/`, `architecture/`, `contributing/`, `operations/` and `history/` only
when they have content. Use `lowercase-with-dashes.md`, one H1, clear heading
levels and fenced examples with the language specified. Use descriptive link
text and link to the same language when the counterpart exists.

Keep working plans and design drafts outside Git, in the ignored `.superpowers/`
directory or outside the checkout. After implementation, record accepted
decisions and verified results in the relevant English and Vietnamese pages.

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
