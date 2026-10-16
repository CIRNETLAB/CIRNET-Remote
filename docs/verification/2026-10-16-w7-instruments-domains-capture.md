# W7 instruments, domains and capture evidence

Status: PASS. Integrated tests, build, generation, actual PostgreSQL and the full real browser gate have completed. Git checkpoint status is separate below.

## Implemented behavior

Requested capture/clock/generator/test-vector configuration is validated, detached and frozen before Create. Unsupported trigger/hardware clock paths fail explicitly. Live Generator commands have typed allocation/access queries and durable, owner-scoped operation identities. Requested, accepted and applied values remain separate, including an unknown acknowledgement that can only be queried or stopped; it is never replayed.

The canonical signal-domain catalog and opt-in namespace preserve existing graph versions, unknown metadata and absent domains. Typed dispatch uses the existing digital/DC compiler. Full analog and mixed execution report unavailable. Real REST → Hardware RPC → worker cases execute powered/unpowered graph 1.1 packages and the existing bounded DC path without retagging the design.

The canonical NCAP layout, generated constants and shared Python/browser corpus preserve v1 bytes and define v2 INT16/UINT16/FLOAT32 sampled evidence. Clock references and rational time, calibration/units, clipping, loss and invalid ranges remain explicit. Display envelopes retain raw measurements. Sampled transport requires an injected source; current runtime endpoints remain v1 and no analog capability is enabled.

Migration 0005 adds sealed capture lookup and retained generations. Database retirement precedes slow cleanup, failed cleanup remains pending, and retries are bounded. The maintenance CLI avoids Manager/hardware startup. Default limits are 256 MiB / 4,096 payloads per capture directory in one API writer process, with 30-day explicit maintenance retention. Zero disables expiration. Active and quarantined captures are excluded. Ownership and session/claim fences remain authoritative.

## Integrated verification

| Gate | Executed result |
| --- | --- |
| Full Python suite on frozen backend/contracts | 931 PASS / 1 Icarus SKIP, 282.63 s |
| Added scheduling/capture-budget regression and complete event suite | 17 PASS, 0.93 s |
| Full Web unit suite, including test and production typechecks | 1,043 PASS / 0 FAIL / 0 SKIP, 93.52 s |
| Production multipage build | PASS, 301 modules, Vite build 43.98 s; existing large-chunk advisory remains |
| AST architecture/import checks | PASS, 190 modules |
| Context and whitespace checks | PASS |
| Staged generated-artifact check | PASS, final check exit 0 |
| Full real Chromium suite | 12/12 PASS, 2.2 min, one worker, no filter/retry; runner and owned API/RPC shutdown exit 0 |
| Actual PostgreSQL migration/restore/concurrency suite | 14 PASS, 17.48 s |

## Focused evidence and review

- 54 root capture/config/storage tests PASS, including slow read/hash and slow deletion while an unrelated Stop returns, revoke during read, previous-generation deletion, pending cleanup and correct driver/disk error classification.
- 14 actual PostgreSQL tests PASS, including 0004 backup/restore → 0005 backfill, unchanged historical JSON and quarantined leases, session/claim row locks and retirement/reservation serialization.
- 18 focused catalog/maintenance/migration tests PASS, including disabled retention, bounded dry-run, active/quarantine exclusion and the real maintenance CLI with an unavailable hardware target.
- Domain/simulator/real RPC focused suite: 98 PASS. Shared domain browser cases: 4 PASS.
- Final sampled codec corpus: 80 shared cases, 105 owned Python and 92 owned Node tests PASS. Existing storage/RPC and legacy data-plane tests are included in the integrated suite.
- Typed instrument control contracts/service/HTTP and restart tests PASS. A new Manager opened from durable REQUESTED or unknown state never replays output; restart still performs safe release. Legacy response shape remains supported.
- Independent review corrections were reproduced before fixing: trailing-LF token acceptance, previous-command configuration used for a later lost ACK, mutable ACK aliases, ordinary snapshots/disconnect clearing an unknown operation key, invalid numeric text submitting old valid values, and finite extreme display scaling. Shared fixtures, pure controller, form, principal-scope and UI regressions cover the fixes. Final read-only review found no remaining Important issue.
- Staged generation ran after every canonical correction, including clock reference and strict token endings. Frozen legacy schema/proto bytes remain unchanged.

The first broad Python run exposed one historical quarantine fixture that tried to create a new lease on a terminal experiment. The new reservation fence correctly refuses this. The test now directly seeds the retained historical lease and still proves claim rejection and rollback. A later run overlapped an intentionally introduced newline regression with an already-cached registry; the final frozen run above is the acceptance evidence.

## Boundaries and limitations

No physical acquisition/driver/RTL/SPICE implementation is added. Synthetic sampled fixtures never become runtime hardware evidence. Existing real defaults remain unavailable. File quotas serialize writers within the supported one-process API architecture; they are not a distributed filesystem quota. Retention runs only when the operator invokes/schedules its bounded command. The final W8 operational documentation must describe that scheduling.

Git checkpoints for preceding phases were attempted but blocked by read-only linked-worktree metadata. W7 `git add -- .` was attempted after the acceptance gate and failed with exit128: `index.lock: Permission denied` at the linked-worktree Git directory. The conditional commit did not execute. No commit, push, merge, reset or deployment occurred.
