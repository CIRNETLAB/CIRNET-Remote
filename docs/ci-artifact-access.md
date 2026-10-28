# Private artifact access for CI

Keep GitHub workflow permissions at `contents: read`. This controls the job's
`GITHUB_TOKEN`; it does not narrow a separate credential stored in an Actions
secret. Remote consumes private artifacts from all six repositories, so a token
restricted to the caller repository is insufficient for the complete release set.

Use an expiring fine-grained personal access token with resource owner
`TINIHI-Labs`, only these selected repositories, and `Contents: Read-only` plus
the automatic metadata-read permission:

- `net-Circuit-Remote`
- `net-Circuit-Contracts`
- `net-Circuit-Interface`
- `net-Circuit-Simulator`
- `net-Circuit-Hardware`
- `net-Circuit-FPGA`

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

The working Integration workflow adds a `system-artifact-access` job and manual
`workflow_dispatch`. Once this workflow is present on the chosen revision, it can
be rerun after a secret rotation without changing that source commit. It creates
a fresh virtualenv, invokes the actual complete system installer, verifies all
15 selected archives and rollback bytes, checks installed origins/versions and
retains a sanitized receipt. The receipt explicitly leaves credential minimum
scope unverified: record the provisioned credential permissions separately.
The committed workflow has local policy/behavioral evidence. Hosted acceptance
is recorded per source revision in the M6 verification report; a download receipt
does not replace confirmation of the provisioned token's repository/permission scope.

Renew the token before its expiration under the organization's policy and
replace the same secret in all six repositories. A failed authentication or
missing artifact must fail closed; no `latest`, sibling source or editable
package fallback is supported. Installation and parent-shell preparation are
in the [release runbook](../deployment/multi-repo-release.md).
