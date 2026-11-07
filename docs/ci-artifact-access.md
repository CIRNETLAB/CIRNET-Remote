# Historical release asset access records

For token scope, rotation and the current CI gate, use the access guide in
[English](en/operations/ci-artifact-access.md) or
[Vietnamese](vi/operations/ci-artifact-access.md). The
[release lock](../integration/release-set.json) identifies the selected bytes.

The following records apply to the post-rename checks at their recorded
revisions. See the [M6 verification record](verification/2026-10-27-multi-repo-migration-m6.md)
for the separate user attestation about credential provisioning.

The organization rename retains account ID 333715068 and all six repository
IDs. Canonical API asset paths use `/repos/cirnetlab/cirnet-<product>/releases/assets/<id>`.
The selected manifest retains its original paths, asset IDs, filenames and digests.
Sixty existing CI URL
variables were rebound and read back under the new names; unrelated variables,
secrets, package versions and immutable artifact bytes were preserved.

<a id="current-post-rename-readback"></a>
## Historical post-rename readback

The canonical selection at the time was
[`integration/release-set.json` at 28221a5](https://github.com/CIRNETLAB/CIRNET-Remote/blob/28221a5ca19d04225e9399895764a12149188681/integration/release-set.json),
exact Git LF SHA-256 `7b6e0ee9ba09d6b13d5f73cd0bf783f3f001422a424a84477622cfdb08232a2e`.
The Windows CRLF checkout SHA is
`5e6c396e1fe1b7cac102ce59045b6a5be877d92ec3fab09f89c9db10e91952fe`;
the selection is equivalent, without rewriting either source serialization.
The historical immutable system-manifest asset 684998628 retains its old
namespace/history and SHA `a2f9c5eb10ad8fc7ee41f26246d802bed782881e5b69b323b7a84e939a313e10`.

Hosted authenticated artifact installation at exact Remote master 28221a5
passes for all 15 current canonical selections, with installed origins and pins
verified; receipt `b8b14dfad9bdeec9cb834cf643c4a0e08de89a0ddbe6d1019122f7142c7ad330`.
The receipt still reports credentialScopeVerification NOT_VERIFIED; user
provisioning attestations and token permissions remain separate from transport
success. The separate anonymous fresh install/package proof is
`c38507bca5409379eb5ab6f1567f2b9e9230d37341f2cb5db9591365e622c765`.
Current CI uses canonical URLs directly; historical manifests/notes remain
provenance, not an ongoing redirect dependency.

Six immutable release titles/notes were updated only through approved name/body
metadata fields. Full original bodies and failed/incomplete native history remain
preserved; assets, digests, tag targets and policy are unchanged. Receipt
`7c044d3583ad89ec3157f08a01a6111d4141e343afa024be8439f9401b314208`.
[GitHub's immutable release policy](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
permits those title/notes edits. No new candidate is released or selected by that
metadata update. New API/Interface local browser validation retains the old
published Contracts SDK/sdist/DEV and other producer pins explicitly. Its
original full local native gate is now inspected: 57 PASS / zero FAIL / 58
collected, with the sole original historical optional NOT_RUN; no immutable
0.1.1 bytes were replaced. Durable verification receipt
`e304d9921863d6373c385f2a10c87316c5a97ffc1a9fa2a1e187ce7dbb9ba5ef`
binds API source28221a5 and Interface source461b087. The later Interface
docs-only master a7de79a is not relabelled as artifact build source. Hosted old-set run40748387829/job123028168080 at28221a5 is now CANCELLED /
NOT_PASS after5,441s: selected Interface7a/archivebd3, 55 of58 cases started,
ten numbered failure headers, no final JUnit and unknown PASS total. Inspection
receipt `3b00b73ee201a48ab7453cc7aff208d63948009b0f5bf41dbf151e1d34da6285`
resolves that observation, without changing the accepted local candidate result.
Hosted release acceptance is blocked; a user release/version decision before
publishing new bytes and final current-source/session handoff remain open.
Existing immutable assets/tags and their original build sources stay unchanged.

Original shared-session cleanup now passes with six source states preserved;
receipt `fcce9feef17bc4ea1a3d551eb52a934573941b9cc250978a643082a9220788c0`.
Final metadata-only CI/Git/tail verification does not change artifact build
provenance or turn the old hosted native cancellation into acceptance.
