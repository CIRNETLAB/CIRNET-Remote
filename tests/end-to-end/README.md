# End-to-End Tests

The current real-browser suite lives in [CIRNET-Interface/e2e](https://github.com/CIRNETLAB/CIRNET-Interface/tree/a14d0950e71a997e2219a32f7268fd0e9d6502b3/e2e), with setup and exact commands in the [Interface README](https://github.com/CIRNETLAB/CIRNET-Interface/blob/a14d0950e71a997e2219a32f7268fd0e9d6502b3/README.md). Pinned Playwright/Chromium runs the Web/API/temporary SQLite/Hardware Service/virtual simulator pipeline. Node/SFC tests remain separate unit coverage. The [frozen monorepo suite](https://github.com/CIRNETLAB/CIRNET-Remote/tree/989954f95c1c6b1d224e31a53fb33f125f0a81a9/apps/web/e2e) preserves the historical implementation.

Implemented browser flows cover authenticated projects and save conflicts/reload/API restart, assignment publication and role isolation, lost Create acknowledgement without replaying Run, actual switches→AND→LED captures, retained history, instrument pre-run settings, imported GLB previews and native WebGL context recovery. The [release evidence](../../docs/verification/2026-10-16-w8-release.md) records the executed gate and its result; [browser CI](../../.github/workflows/browser-e2e.yml) runs the complete suite with focused tests forbidden.

New runs follow the [shared verification guide](../../docs/VERIFICATION.md): screenshots,
traces, image-bearing reports and raw harness diagnostics are created directly in an
external session directory. Product/model assets and approved test fixtures retain
their roles. A dated release report does not prove the current suite has just run.

Physical FPGA/Scope/Generator execution remains unavailable and unverified. Test doubles and explicitly synthetic codec fixtures establish software boundaries only; they are not runtime waveform fallback or hardware evidence.
