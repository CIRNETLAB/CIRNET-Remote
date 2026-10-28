# Release assets and CI access

All six `CIRNETLAB/CIRNET-*` repositories are public. Published release assets support
anonymous downloads through the exact numeric GitHub URLs in the release
manifest. Retain authenticated access for draft assets, CI and API rate limits.
Test the selected URLs with the actual intended consumer identity.
The organization rename retains account ID 333715068 and all six repository
IDs. Current API asset paths use `/repos/CIRNETLAB/CIRNET-<product>/releases/assets/<id>`
with the existing selected asset IDs/filenames/digests. Sixty existing CI URL
variables were rebound and read back under the new names; unrelated variables,
secrets, package versions and immutable artifact bytes were preserved. A new
hosted run at the final source commit is still required for CI acceptance.
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
