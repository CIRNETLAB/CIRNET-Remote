---
project: CIRNET-Remote
current_phase: repository-cleanup
status: local-review
last_updated: 2026-11-04
next_task: review-source-cleanup
hardware_mode: simulation
fpga_development_started: true
---

# Development Log

The system selection recorded on 2026-11-04 was 0.1.2. The M6 ledger records the Ubuntu
browser acceptance, publication and later removal of the retired producer
implementation copies. [M6 ledger](verification/2026-10-27-multi-repo-migration-m6.md)

The source cleanup removes copies of Contracts wheel resources, duplicated
Interface icons and retired utilities. API tests read the same fixture bytes
from the selected wheel.
Historical reports and handoffs are available by Git revision. [Documentation index](README.md) · [Previous development log](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/DEV_LOG.md)

## AI Handoff

Use the [current English documentation](en/index.md) and the M6 ledger for dated
verification. Use the release manifest to select exact producer artifacts.
[Release selection](../integration/release-set.json) · [Verification guide](VERIFICATION.md)
