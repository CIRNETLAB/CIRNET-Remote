# CIRNET Remote release changelogs

Remote tracks system releases by major version. Each entry describes the
changes in the tagged Remote source and names the product versions selected by
its release manifest. The system version and the API package version can differ.
Use the [current release lock](../../integration/release-set.json) for the
selected artifacts and the [system architecture](../en/architecture/system.md)
for component ownership.

## Major version 0

| Version | Date | Date source |
| --- | --- | --- |
| [Unreleased](CHANGELOG_V0.md#unreleased) | — | Repository changes since `v0.1.4` |
| [v0.1.4](CHANGELOG_V0.md#v014) | 2026-11-05 | GitHub release |
| [v0.1.3](CHANGELOG_V0.md#v013) | 2026-11-04 | GitHub release |
| [v0.1.2](CHANGELOG_V0.md#v012) | 2026-11-03 | GitHub release |
| [v0.1.1](CHANGELOG_V0.md#v011) | 2026-10-28 | GitHub release |

Publication dates use the release's `published_at` timestamp in `+07:00`.
Each entry separately identifies the Git tag and its target. If publication
metadata is unavailable, label the date as the tagger date or, for a
lightweight tag, the target commit date.

Add user-visible changes under Unreleased in the active major file. When a
release is tagged, move its verified changes under the corresponding version
with links to the tag, manifest and relevant evidence. Start a new major file
when the first release of that major is tagged.

The 0.1.0 scaffold and the planned 1.0.0 thesis milestone belong to the
pre-release development record. The original log covers 8–21 October 2026.
[Original development changelog](https://github.com/cirnetlab/cirnet-remote/blob/ae51abaa8ebdfce5981f91c0c95eca1d522900ee/docs/en/history/changelog.md) · [Early version roadmap](../en/history/archive/legacy-v1/2026-10-08-cirnet-remote-architecture-design.md)
