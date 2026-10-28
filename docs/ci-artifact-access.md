# Release assets and CI access

All six `CIRNETLAB/CIRNET-*` repositories are public. Published release assets support
anonymous downloads through the exact numeric GitHub URLs in the release
manifest. Retain authenticated access for draft assets, CI and API rate limits.
Test the selected URLs with the actual intended consumer identity.
The organization rename retains account ID 333715068 and all six repository
IDs. Current API asset paths use `/repos/CIRNETLAB/CIRNET-<product>/releases/assets/<id>`
with the existing selected asset IDs/filenames/digests. Sixty existing CI URL
variables were rebound and read back under the new names; unrelated variables,
secrets, package versions and immutable artifact bytes were preserved. Hosted
authenticated 15-artifact download/install acceptance at 28221a5 is verified
below; compatible local native acceptance also passes as scoped below. The old-set hosted result is CANCELLED / NOT_PASS; hosted release acceptance
and final current-source handoff remain open.
Historical namespace links in published notes/provenance remain historical;
successful redirected downloads alone do not establish current CI compatibility.

Current workflows still bootstrap with `NETCIRCUIT_ARTIFACTS_READ_TOKEN`, and the
`system-artifact-access` job requires it. Public release availability does not
remove those configured CI checks.

Keep GitHub workflow permissions at `contents: read`. This controls the job's
`GITHUB_TOKEN`; it does not narrow a separate credential stored in an Actions
secret.

Use an expiring fine-grained personal access token with resource owner
`CIRNETLAB`, only these selected repositories, and `Contents: Read-only` plus
the automatic metadata-read permission:

- `CIRNET-Remote`
- `CIRNET-Contracts`
- `CIRNET-Interface`
- `CIRNET-Simulator`
- `CIRNET-Hardware`
- `CIRNET-FPGA`

Store it as `NETCIRCUIT_ARTIFACTS_READ_TOKEN` in each repository's Actions
secrets. Keep the credential used for local Git pushes and release publication
separate. Never put token values in a manifest, command argument, issue, chat,
diagnostic report or committed file. GitHub documents [fine-grained token
creation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
and the release-asset endpoint's [Contents-read permission](https://docs.github.com/en/rest/releases/assets#get-a-release-asset).

After provisioning or rotating the secret, run the exact artifact consumer gates
again. Verify authenticated downloads of the selected numeric asset URLs and
their SHA-256 values, then exact versions, installed origins and package checks.
Record the consumer identity and receipt status without retaining the token.
Draft release visibility must be tested separately with the replacement
credential; access using a broader publication credential does not establish
that the read-only consumer can download a private draft.

The Integration workflow has a `system-artifact-access` job and manual
`workflow_dispatch`. Once this workflow is present on the chosen revision, it can
be rerun after a secret rotation without changing that source commit. It creates
a fresh virtualenv, invokes the actual complete system installer, verifies all
15 selected archives and rollback bytes, checks installed origins/versions and
retains a sanitized receipt. Its `credentialScopeVerification` remains
`NOT_VERIFIED`: successful downloads do not establish the token's permissions.
The M6 provisioning confirmation is a user attestation, recorded separately in
the dated [verification report](verification/2026-10-27-multi-repo-migration-m6.md).
Anonymous download evidence establishes public asset availability only.
The committed workflow has local policy/behavioral evidence. Hosted acceptance
is recorded per source revision in the M6 verification report; a download receipt
does not replace confirmation of the provisioned token's repository/permission scope.

Renew the token before its expiration under the organization's policy and
replace the same secret in all six repositories. Authenticated CI must fail
closed on authentication errors or missing artifacts; no `latest`, sibling source or editable
package fallback is supported. Installation and parent-shell preparation are
in the [release runbook](../deployment/multi-repo-release.md).

## Current post-rename readback

Current canonical selection is
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
